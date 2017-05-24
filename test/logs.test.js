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
	//let providerRequestStub;
	let logStub;

	before(() => {
		sandbox = sinon.sandbox.create();
	});

	beforeEach(() => {
		serverless = new Serverless();
		options = {
			alias: 'myAlias',
			stage: 'dev',
			region: 'us-east-1',
			function: 'first'
		};
		serverless.setProvider('aws', new AwsProvider(serverless));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'testService';
		serverless.service.provider.compiledCloudFormationAliasTemplate = {};
		awsAlias = new AWSAlias(serverless, options);
		//providerRequestStub = sandbox.stub(awsAlias._provider, 'request');
		logStub = sandbox.stub(serverless.cli, 'log');

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

		/** TODO: Use fake alias log stream responses here!
		it('should get log streams with correct params', () => {
			const replyMock = {
				logStreams: [
					{
						logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
						creationTime: 1469687512311,
					},
					{
						logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
						creationTime: 1469687512311,
					},
				],
			};
			providerRequestStub.resolves(replyMock);

			return expect(awsAlias.logsGetLogStreams()).to.be.fulfilled
			.then(logStreamNames => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledTwice,
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
				expect(logStreamNames[0])
					.to.be.equal('2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba'),
				expect(logStreamNames[1])
					.to.be.equal('2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba'),
			]));
		});

		it('should throw error if no log streams found', () => {
			providerRequestStub.resolves();
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
						logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
						timestamp: 1469687512311,
						message: 'test',
					},
					{
						logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
						timestamp: 1469687512311,
						message: 'test',
					},
				],
			};
			const logStreamNamesMock = [
				'2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
				'2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
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
						logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
						timestamp: 1469687512311,
						message: 'test',
					},
					{
						logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
						timestamp: 1469687512311,
						message: 'test',
					},
				],
			};
			const logStreamNamesMock = [
				'2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
				'2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
			];
			const filterLogEventsStub = sinon.stub(awsLogs.provider, 'request').resolves(replyMock);
			awsLogs.serverless.service.service = 'new-service';
			awsLogs.options = {
				stage: 'dev',
				region: 'us-east-1',
				function: 'first',
				logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
				startTime: '2010-10-20',
				filter: 'error',
			};

			return awsLogs.showLogs(logStreamNamesMock)
				.then(() => {
					expect(filterLogEventsStub.calledOnce).to.be.equal(true);
					expect(filterLogEventsStub.calledWithExactly(
						'CloudWatchLogs',
						'filterLogEvents',
						{
							logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
							interleaved: true,
							logStreamNames: logStreamNamesMock,
							startTime: 1287532800000, // '2010-10-20'
							filterPattern: 'error',
						},
						awsLogs.options.stage,
						awsLogs.options.region
					)).to.be.equal(true);

					awsLogs.provider.request.restore();
				});
		});
		*/
	});
});
