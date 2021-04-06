'use strict';
/**
 * Unit tests for plugin class.
 */

const BbPromise = require('bluebird');
const { getInstalledPathSync } = require('get-installed-path');
const chai = require('chai');
const sinon = require('sinon');
const AwsAlias = require('../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('AwsAlias', () => {
	let serverless;
	let options;
	let sandbox;

	before(() => {
		sandbox = sinon.createSandbox();
	});

	beforeEach(() => {
		options = {
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless = new Serverless(options);
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'myService';
		serverless.setProvider('aws', new AwsProvider(serverless, options));
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('constructor', () => {
		it('should initialize the plugin without options', () => {
			const awsAlias = new AwsAlias(serverless);

			expect(awsAlias).to.have.property('_serverless', serverless);
			expect(awsAlias).to.have.property('_options').to.deep.equal({});
		});

		it('should initialize the plugin with empty options', () => {
			const awsAlias = new AwsAlias(serverless, {});

			expect(awsAlias).to.have.property('_serverless', serverless);
			expect(awsAlias).to.have.property('_options').to.deep.equal({});
		});

		it('should initialize the plugin with options', () => {
			const awsAlias = new AwsAlias(serverless, options);

			expect(awsAlias).to.have.property('_serverless', serverless);
			expect(awsAlias).to.have.property('_options').to.deep.equal(options);
		});

		it('should add the logs api command', () => {
			const command = {
				options: {},
				commands: {},
			};
			const getCommandStub = sandbox.stub(serverless.pluginManager, 'getCommand');
			getCommandStub.returns(command);
			const awsAlias = new AwsAlias(serverless);
			expect(awsAlias).to.be.an('object');
			expect(command).to.have.nested.property('commands.api');
		});
	});

	it('should expose standard properties', () => {
		const awsAlias = new AwsAlias(serverless, options);

		awsAlias._stackName = 'myStack';

		expect(awsAlias).to.have.property('serverless', serverless);
		expect(awsAlias).to.have.property('options').to.deep.equal(options);
		expect(awsAlias).to.have.property('commands', awsAlias._commands);
		expect(awsAlias).to.have.property('hooks', awsAlias._hooks);
		expect(awsAlias).to.have.property('provider', awsAlias._provider);
		expect(awsAlias).to.have.property('stackName', 'myStack');
	});

	describe('hook', () => {
		let sandbox;
		let awsAlias;
		let validateStub;
		let configureAliasStackStub;
		let createAliasStackStub;
		let aliasStackLoadCurrentCFStackAndDependenciesStub;
		let aliasRestructureStackStub;
		let setBucketNameStub;
		let uploadAliasArtifactsStub;
		let updateAliasStackStub;
		let collectUserResourcesStub;
		let logsValidateStub;
		let logsGetLogStreamsStub;
		let logsShowLogsStub;
		let removeAliasStub;
		let listAliasesStub;
		let apiLogsValidateStub;
		let apiLogsGetLogStreamsStub;
		let apiLogsShowLogsStub;

		before(() => {
			sandbox = sinon.createSandbox();
			awsAlias = new AwsAlias(serverless, options);
		});

		beforeEach(() => {
			validateStub = sandbox.stub(awsAlias, 'validate');
			configureAliasStackStub = sandbox.stub(awsAlias, 'configureAliasStack');
			createAliasStackStub = sandbox.stub(awsAlias, 'createAliasStack');
			aliasStackLoadCurrentCFStackAndDependenciesStub = sandbox.stub(awsAlias, 'aliasStackLoadCurrentCFStackAndDependencies');
			aliasRestructureStackStub = sandbox.stub(awsAlias, 'aliasRestructureStack');
			setBucketNameStub = sandbox.stub(awsAlias, 'setBucketName');
			uploadAliasArtifactsStub = sandbox.stub(awsAlias, 'uploadAliasArtifacts');
			updateAliasStackStub = sandbox.stub(awsAlias, 'updateAliasStack');
			collectUserResourcesStub = sandbox.stub(awsAlias, 'collectUserResources');
			logsValidateStub = sandbox.stub(awsAlias, 'logsValidate');
			logsGetLogStreamsStub = sandbox.stub(awsAlias, 'logsGetLogStreams');
			logsShowLogsStub = sandbox.stub(awsAlias, 'logsShowLogs');
			removeAliasStub = sandbox.stub(awsAlias, 'removeAlias');
			listAliasesStub = sandbox.stub(awsAlias, 'listAliases');
			apiLogsValidateStub = sandbox.stub(awsAlias, 'apiLogsValidate');
			apiLogsGetLogStreamsStub = sandbox.stub(awsAlias, 'apiLogsGetLogStreams');
			apiLogsShowLogsStub = sandbox.stub(awsAlias, 'apiLogsShowLogs');
		});

		afterEach(() => {
			sandbox.restore();
		});

		it('before:package:initialize should resolve', () => {
			validateStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['before:package:initialize']()).to.eventually.be.fulfilled
			.then(() => expect(validateStub).to.be.calledOnce);
		});

		it('before:aws:package:finalize:mergeCustomProviderResources should resolve', () => {
			validateStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['before:aws:package:finalize:mergeCustomProviderResources']()).to.eventually.be.fulfilled
			.then(() => expect(collectUserResourcesStub).to.be.calledOnce);
		});

		it('before:deploy:deploy should resolve', () => {
			configureAliasStackStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['before:deploy:deploy']()).to.eventually.be.fulfilled
			.then(() => BbPromise.all([
				expect(validateStub).to.be.calledOnce,
				expect(configureAliasStackStub).to.be.calledOnce,
			]));
		});

		it('before:aws:deploy:deploy:createStack should resolve', () => {
			aliasStackLoadCurrentCFStackAndDependenciesStub.returns(BbPromise.resolve([]));
			aliasRestructureStackStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['before:aws:deploy:deploy:createStack']()).to.eventually.be.fulfilled
			.then(() => BbPromise.join(
				expect(aliasStackLoadCurrentCFStackAndDependenciesStub).to.be.calledOnce,
				expect(aliasRestructureStackStub).to.be.calledOnce
			));
		});

		it('after:aws:deploy:deploy:createStack should resolve', () => {
			createAliasStackStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['after:aws:deploy:deploy:createStack']()).to.eventually.be.fulfilled
			.then(() => expect(createAliasStackStub).to.be.calledOnce);
		});

		it('after:aws:deploy:deploy:uploadArtifacts should resolve', () => {
			return expect(awsAlias.hooks['after:aws:deploy:deploy:uploadArtifacts']()).to.eventually.be.fulfilled;
		});

		it('after:aws:deploy:deploy:updateStack should resolve', () => {
			setBucketNameStub.returns(BbPromise.resolve());
			uploadAliasArtifactsStub.returns(BbPromise.resolve());
			updateAliasStackStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['after:aws:deploy:deploy:updateStack']()).to.eventually.be.fulfilled
			.then(() => {
				expect(setBucketNameStub).to.be.calledOnce;
				expect(uploadAliasArtifactsStub).to.be.calledOnce;
				expect(updateAliasStackStub).to.be.calledOnce;
				return null;
			});
		});

		it('after:info:info should resolve', () => {
			validateStub.returns(BbPromise.resolve());
			listAliasesStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['after:info:info']()).to.eventually.be.fulfilled
			.then(() => BbPromise.join(
				expect(validateStub).to.be.calledOnce,
				expect(listAliasesStub).to.be.calledOnce
			));
		});

		it('logs:logs should resolve', () => {
			logsValidateStub.returns(BbPromise.resolve());
			logsGetLogStreamsStub.returns(BbPromise.resolve());
			logsShowLogsStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['logs:logs']()).to.eventually.be.fulfilled
			.then(() => BbPromise.join(
				expect(logsValidateStub).to.be.calledOnce,
				expect(logsGetLogStreamsStub).to.be.calledOnce,
				expect(logsShowLogsStub).to.be.calledOnce
			));
		});

		it('logs:api:logs should resolve', () => {
			apiLogsValidateStub.returns(BbPromise.resolve());
			apiLogsGetLogStreamsStub.returns(BbPromise.resolve());
			apiLogsShowLogsStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['logs:api:logs']()).to.eventually.be.fulfilled
			.then(() => BbPromise.join(
				expect(apiLogsValidateStub).to.be.calledOnce,
				expect(apiLogsGetLogStreamsStub).to.be.calledOnce,
				expect(apiLogsShowLogsStub).to.be.calledOnce
			));
		});

		describe('before:remove:remove', () => {
			it('should resolve', () => {
				awsAlias._validated = true;
				return expect(awsAlias.hooks['before:remove:remove']()).to.eventually.be.fulfilled;
			});

			it('should reject if alias validation did not run', () => {
				awsAlias._validated = false;
				return expect(awsAlias.hooks['before:remove:remove']()).to.be.rejectedWith(/Use "serverless alias remove/);
			});
		});

		it('alias:remove:remove should resolve', () => {
			validateStub.returns(BbPromise.resolve());
			aliasStackLoadCurrentCFStackAndDependenciesStub.returns(BbPromise.resolve([]));
			removeAliasStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['alias:remove:remove']()).to.eventually.be.fulfilled
			.then(() => BbPromise.join(
				expect(validateStub).to.be.calledOnce,
				expect(aliasStackLoadCurrentCFStackAndDependenciesStub).to.be.calledOnce,
				expect(removeAliasStub).to.be.calledOnce
			));
		});
	});
});
