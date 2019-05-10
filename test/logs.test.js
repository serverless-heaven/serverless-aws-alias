'use strict';

const { getInstalledPathSync } = require('get-installed-path');
const BbPromise = require('bluebird');
const moment = require('moment');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
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
	let aliasGetAliasLatestFunctionVersionByFunctionNameStub;
	let aliasStacksDescribeResourceStub;

	before(() => {
		sandbox = sinon.createSandbox();
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
		aliasGetAliasLatestFunctionVersionByFunctionNameStub = sandbox.stub(awsAlias, 'aliasGetAliasLatestFunctionVersionByFunctionName');
		aliasStacksDescribeResourceStub = sandbox.stub(awsAlias, 'aliasStacksDescribeResource');

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

		it('should throw error if function is not provided', () => {
			serverless.service.functions = null;
			expect(() => awsAlias.logsValidate()).to.throw(Error);
		});

		it('should set default options', () => {
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

	describe('#apiLogsValidate()', () => {
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

		it('should throw error if function is provided', () => {
			options.function = 'first';
			expect(awsAlias.apiLogsValidate()).to.be.rejectedWith(/--function is not supported/);
		});

		it('should set log group', () => {
			aliasStacksDescribeResourceStub.returns(BbPromise.resolve({
				StackResources: [
					{
						LogicalResourceId: 'ApiGatewayRestApi',
						PhysicalResourceId: 'ApiId'
					}
				]
			}));
			delete options.function;
			return expect(awsAlias.apiLogsValidate()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(awsAlias._apiLogsLogGroup).to.equal('API-Gateway-Execution-Logs_ApiId/myAlias'),
				expect(awsAlias.options.interval).to.be.equal(1000),
			]));
		});

		it('should reject if no api is defined', () => {
			aliasStacksDescribeResourceStub.returns(BbPromise.resolve({
				StackResources: []
			}));
			delete options.function;
			return expect(awsAlias.apiLogsValidate()).to.be.rejectedWith(/does not contain any/);
		});

		it('should forward CF errors', () => {
			aliasStacksDescribeResourceStub.returns(BbPromise.reject(new Error('Failed')));
			delete options.function;
			return expect(awsAlias.apiLogsValidate()).to.be.rejectedWith(/Failed/);
		});

		it('should log in verbose mode', () => {
			aliasStacksDescribeResourceStub.returns(BbPromise.resolve({
				StackResources: [
					{
						LogicalResourceId: 'ApiGatewayRestApi',
						PhysicalResourceId: 'ApiId'
					}
				]
			}));
			options.verbose = true;
			delete options.function;
			return expect(awsAlias.apiLogsValidate()).to.be.fulfilled
			.then(() => expect(logStub).to.have.been.called);
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
			aliasGetAliasLatestFunctionVersionByFunctionNameStub.returns(BbPromise.resolve('20'));
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
			aliasGetAliasLatestFunctionVersionByFunctionNameStub.returns(BbPromise.resolve(null));

			return expect(awsAlias.logsGetLogStreams()).to.be.rejectedWith("");
		});
	});

	describe('#apiLogsGetLogStreams()', () => {
		beforeEach(() => {
			awsAlias.serverless.service.service = 'new-service';
			awsAlias._apiLogsLogGroup = 'API-Gateway-Execution-Logs_ApiId/myAlias';
			options = {
				stage: 'dev',
				region: 'us-east-1',
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

			return expect(awsAlias.apiLogsGetLogStreams()).to.be.fulfilled
			.then(logStreamNames => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been.calledWithExactly(
					'CloudWatchLogs',
					'describeLogStreams',
					{
						logGroupName: awsAlias._apiLogsLogGroup,
						descending: true,
						limit: 50,
						orderBy: 'LastEventTime',
					},
					awsAlias.options.stage,
					awsAlias.options.region
				),
				expect(logStreamNames).to.have.lengthOf(4),
			]));
		});

		it('should throw error if no log streams found', () => {
			providerRequestStub.resolves();

			return expect(awsAlias.apiLogsGetLogStreams()).to.be.rejectedWith(/No logs exist/);
		});
	});

	describe('#functionLogsShowLogs()', () => {
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
						message: '',
					},
					{
						logStreamName: '2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
						timestamp: 1469687512311,
						message: '',
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

			return expect(awsAlias.functionLogsShowLogs(logStreamNamesMock)).to.be.fulfilled
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
						message: '',
					},
					{
						logStreamName: '2016/07/28/[20]BE6A2C395AA244C8B7069D8C48B03B9E',
						timestamp: 1469687512311,
						message: '',
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

			return expect(awsAlias.functionLogsShowLogs(logStreamNamesMock)).to.be.fulfilled
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

	describe('#apiLogsShowLogs()', () => {
		let logsShowLogsStub;

		beforeEach(() => {
			logsShowLogsStub = sandbox.stub(awsAlias, 'logsShowLogs');
		});

		it('should call logsShowLogs properly', () => {
			const streamNames = [
				'2016/07/28/E6A2C395AA244C8B7069D8C48B03B9E',
				'2016/07/28/83f5206ab2a8488290349b9c1fbfe2ba',
			];
			logsShowLogsStub.returns(BbPromise.resolve());
			return expect(awsAlias.apiLogsShowLogs(streamNames)).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(logsShowLogsStub).to.have.been.calledOnce,
				expect(logsShowLogsStub).to.have.been.calledWith(streamNames)
			]));
		});

		it('should set a formatter', () => {
			const streamNames = [
				'2016/07/28/E6A2C395AA244C8B7069D8C48B03B9E',
				'2016/07/28/83f5206ab2a8488290349b9c1fbfe2ba',
			];
			logsShowLogsStub.returns(BbPromise.resolve());
			return expect(awsAlias.apiLogsShowLogs(streamNames)).to.be.fulfilled
			.then(() => {
				const formatter = logsShowLogsStub.getCall(0).args[1];
				return expect(formatter).to.be.a('function');
			});
		});

		describe('formatter', () => {
			let formatter;

			beforeEach(() => {
				const streamNames = [
					'2016/07/28/E6A2C395AA244C8B7069D8C48B03B9E',
					'2016/07/28/83f5206ab2a8488290349b9c1fbfe2ba',
				];
				logsShowLogsStub.returns(BbPromise.resolve());
				return awsAlias.apiLogsShowLogs(streamNames)
				.then(() => {
					formatter = logsShowLogsStub.getCall(0).args[1];
					return BbPromise.resolve();
				});
			});

			it('should format an event', () => {
				const testEvent = {
					timestamp: moment('2017-07-09').valueOf(),
					message: '(message-id) This is a test message'
				};
				expect(formatter(testEvent)).to.be.a('string')
					.that.contains('This is a test message');
				expect(formatter(testEvent)).to.be.a('string')
					.that.contains('2017-07-09 00:00:00.000 (+');
			});
		});
	});

});
