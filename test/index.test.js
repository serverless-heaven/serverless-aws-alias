'use strict';
/**
 * Unit tests for plugin class.
 */

const BbPromise = require('bluebird');
const getInstalledPath = require('get-installed-path');
const chai = require('chai');
const sinon = require('sinon');
const AwsAlias = require('../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('AwsAlias', () => {
	let serverless;
	let options;

	beforeEach(() => {
		serverless = new Serverless();
		options = {
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless.service.service = 'myService';
		serverless.setProvider('aws', new AwsProvider(serverless, options));
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

		before(() => {
			sandbox = sinon.sandbox.create();
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
			setBucketNameStub.returns(BbPromise.resolve());
			uploadAliasArtifactsStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['after:aws:deploy:deploy:uploadArtifacts']()).to.eventually.be.fulfilled
			.then(() => BbPromise.join(
				expect(setBucketNameStub).to.be.calledOnce,
				expect(uploadAliasArtifactsStub).to.be.calledOnce
			));
		});

		it('after:aws:deploy:deploy:updateStack should resolve', () => {
			updateAliasStackStub.returns(BbPromise.resolve());
			return expect(awsAlias.hooks['after:aws:deploy:deploy:updateStack']()).to.eventually.be.fulfilled
			.then(() => expect(updateAliasStackStub).to.be.calledOnce);
		});

	});
});
