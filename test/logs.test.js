'use strict';

const getInstalledPath = require('get-installed-path');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('logs', () => {
	let serverless;
	let options;
	let awsAlias;
	// Sinon and stubs for SLS CF access
	let sandbox;
	let providerRequestStub;
	let logStub;
	let aliasGetAliasFunctionVersionsStub;

	before(() => {
		sandbox = sinon.sandbox.create();
	});

	beforeEach(() => {
		options = {
			alias: 'myAlias',
			stage: 'dev',
			region: 'us-east-1',
			function: 'first'
		};
		serverless = new Serverless(options);
		serverless.setProvider('aws', new AwsProvider(serverless, options));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'testService';
		serverless.service.provider.compiledCloudFormationAliasTemplate = {};
		awsAlias = new AWSAlias(serverless, options);
		providerRequestStub = sandbox.stub(awsAlias._provider, 'request');
		logStub = sandbox.stub(serverless.cli, 'log');
		aliasGetAliasFunctionVersionsStub = sandbox.stub(awsAlias, 'aliasGetAliasFunctionVersions');

		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#logsValidate()', () => {
		beforeEach(() => {
			serverless.config.servicePath = true;
			serverless.service.environment = {
				vars: {},
				stages: {
					dev: {
						vars: {},
						regions: {
							'us-east-1': {
								vars: {},
							},
						},
					},
				},
			};
			serverless.service.functions = {
				first: {
					handler: true,
					name: 'customName',
				},
			};
		});

		it('it should throw error if function is not provided', () => {
			serverless.service.functions = null;
			expect(() => awsAlias.logsValidate()).to.throw(Error);
		});

		it('it should set default options', () => {
			return expect(awsAlias.logsValidate()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(awsAlias.options.stage).to.deep.equal('dev'),
				expect(awsAlias.options.region).to.deep.equal('us-east-1'),
				expect(awsAlias.options.function).to.deep.equal('first'),
				expect(awsAlias.options.interval).to.be.equal(1000),
				expect(awsAlias.options.logGroupName).to.deep.equal(awsAlias.provider.naming
					.getLogGroupName('customName'))
			]));
		});
	});

	describe('#logsGetLogStreams()', () => {
		beforeEach(() => {
			awsAlias.serverless.service.service = 'new-service';
			awsAlias._options = {
				stage: 'dev',
				region: 'us-east-1',
				function: 'first',
				logGroupName: awsAlias.provider.naming.getLogGroupName('new-service-dev-first'),
			};
		});

		it('should get log streams', () => {
			const streamReply = {
				logStreams: [
					{
						logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
						creationTime: 1469687512311,
					},
					{
						logStreamName: '2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
						creationTime: 1469687512311,
					},
					{
						logStreamName: '2016/07/28/[20]83f5206ab2a8488290349b9c1fbfe2ba',
						creationTime: 1469687512311,
					},
					{
						logStreamName: '2016/07/28/[10]83f5206ab2a8488290349b9c1fbfe2ba',
						creationTime: 1469687512311,
					},
				],
			};
			providerRequestStub.resolves(streamReply);
			aliasGetAliasFunctionVersionsStub.returns(BbPromise.resolve([
				{
					functionName: 'func1',
					functionVersion: '20'
				}
			]));
			awsAlias._lambdaName = 'func1';

			return expect(awsAlias.logsGetLogStreams()).to.be.fulfilled
			.then(logStreamNames => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been.calledWithExactly(
					'CloudWatchLogs',
					'describeLogStreams',
					{
						logGroupName: awsAlias.provider.naming.getLogGroupName('new-service-dev-first'),
						descending: true,
						limit: 50,
						orderBy: 'LastEventTime',
					},
					awsAlias.options.stage,
					awsAlias.options.region
				),
				expect(logStreamNames).to.have.lengthOf(2),
				expect(logStreamNames[0])
					.to.be.equal('2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E'),
				expect(logStreamNames[1])
					.to.be.equal('2016/07/28/[20]83f5206ab2a8488290349b9c1fbfe2ba'),
			]));
		});

		it('should throw error if no log streams found', () => {
			providerRequestStub.resolves();
			aliasGetAliasFunctionVersionsStub.returns(BbPromise.resolve([]));

			return expect(awsAlias.logsGetLogStreams()).to.be.rejectedWith("");
		});
	});

	describe('#logsShowLogs()', () => {
		let clock;

		beforeEach(() => {
			// new Date() => return the fake Date 'Sat Sep 01 2016 00:00:00'
			clock = sinon.useFakeTimers(new Date(Date.UTC(2016, 9, 1)).getTime());
		});

		afterEach(() => {
			// new Date() => will return the real time again (now)
			clock.restore();
		});

		it('should call filterLogEvents API with correct params', () => {
			const replyMock = {
				events: [
					{
						logStreamName: '2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
						timestamp: 1469687512311,
						message: 'test',
					},
					{
						logStreamName: '2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
						timestamp: 1469687512311,
						message: 'test',
					},
				],
			};
			const logStreamNamesMock = [
				'2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
				'2016/07/28/[20]83f5206ab2a8488290349b9c1fbfe2ba',
			];
			providerRequestStub.resolves(replyMock);
			awsAlias.serverless.service.service = 'new-service';
			awsAlias._options = {
				stage: 'dev',
				region: 'us-east-1',
				function: 'first',
				logGroupName: awsAlias.provider.naming.getLogGroupName('new-service-dev-first'),
				startTime: '3h',
				filter: 'error',
				alias: 'myAlias',
			};

			return expect(awsAlias.logsShowLogs(logStreamNamesMock)).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been.calledWithExactly(
					'CloudWatchLogs',
					'filterLogEvents',
					{
						logGroupName: awsAlias.provider.naming.getLogGroupName('new-service-dev-first'),
						interleaved: true,
						logStreamNames: logStreamNamesMock,
						filterPattern: 'error',
						startTime: 1475269200000,
					},
					awsAlias.options.stage,
					awsAlias.options.region
				),
			]));
		});

		it('should call filterLogEvents API with standard start time', () => {
			const replyMock = {
				events: [
					{
						logStreamName: '2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
						timestamp: 1469687512311,
						message: 'test',
					},
					{
						logStreamName: '2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
						timestamp: 1469687512311,
						message: 'test',
					},
				],
			};
			const logStreamNamesMock = [
				'2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
				'2016/07/28/[20]83f5206ab2a8488290349b9c1fbfe2ba',
			];
			providerRequestStub.resolves(replyMock);
			awsAlias.serverless.service.service = 'new-service';
			awsAlias._options = {
				stage: 'dev',
				region: 'us-east-1',
				function: 'func1',
				logGroupName: awsAlias.provider.naming.getLogGroupName('new-service-dev-func1'),
				startTime: '2010-10-20',
				filter: 'error',
				alias: 'myAlias',
			};

			return expect(awsAlias.logsShowLogs(logStreamNamesMock)).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(providerRequestStub).to.have.been.calledOnce,
					expect(providerRequestStub).to.have.been.calledWithExactly(
						'CloudWatchLogs',
						'filterLogEvents',
						{
							logGroupName: awsAlias.provider.naming.getLogGroupName('new-service-dev-func1'),
							interleaved: true,
							logStreamNames: logStreamNamesMock,
							startTime: 1287532800000,
							filterPattern: 'error',
						},
						awsAlias.options.stage,
						awsAlias.options.region
					),
				]));
		});
	});
});
