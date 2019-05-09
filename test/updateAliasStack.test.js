'use strict';
/**
 * Unit tests for createAliasStack..
 */

const { getInstalledPathSync } = require('get-installed-path');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('updateAliasStack', () => {
	let serverless;
	let options;
	let awsAlias;
	// Sinon and stubs for SLS CF access
	let sandbox;
	let providerRequestStub;
	let monitorStackStub;
	let logStub;

	before(() => {
		sandbox = sinon.createSandbox();
	});

	beforeEach(() => {
		serverless = new Serverless();
		options = {
			alias: 'myAlias',
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless.setProvider('aws', new AwsProvider(serverless, options));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'testService';
		serverless.service.provider.compiledCloudFormationAliasTemplate = {};
		serverless.service.package.artifactDirectoryName = 'myDirectory';
		awsAlias = new AWSAlias(serverless, options);
		providerRequestStub = sandbox.stub(awsAlias._provider, 'request');
		monitorStackStub = sandbox.stub(awsAlias, 'monitorStack');
		logStub = sandbox.stub(serverless.cli, 'log');
		awsAlias.bucketName = 'myBucket';

		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#createAliasFallback()', () => {
		it('Should call CF with correct default parameters', () => {
			const expectedCFData = {
				StackName: 'testService-myStage-myAlias',
				Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
				OnFailure: 'DELETE',
				Parameters: [],
				Tags: [
					{ Key: 'STAGE', Value: 'myStage' },
					{ Key: 'ALIAS', Value: 'myAlias' }
				],
				TemplateURL: 'https://s3.amazonaws.com/myBucket/myDirectory/compiled-cloudformation-template-alias.json',
			};
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.createAliasFallback()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(monitorStackStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'createStack', expectedCFData, 'myStage', 'us-east-1'),
				expect(monitorStackStub).to.have.been
					.calledWithExactly('create', requestResult)
			]));
		});

		it('should set stack tags', () => {
			const expectedCFData = {
				StackName: 'testService-myStage-myAlias',
				Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
				OnFailure: 'DELETE',
				Parameters: [],
				Tags: [
					{ Key: 'STAGE', Value: 'myStage' },
					{ Key: 'ALIAS', Value: 'myAlias' },
					{ Key: 'tag1', Value: 'application'},
					{ Key: 'tag2', Value: 'component' }
				],
				TemplateURL: 'https://s3.amazonaws.com/myBucket/myDirectory/compiled-cloudformation-template-alias.json',
			};
			providerRequestStub.returns(BbPromise.resolve("done"));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.stackTags = {
				tag1: 'application',
				tag2: 'component'
			};

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.createAliasFallback()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'createStack', expectedCFData, 'myStage', 'us-east-1'),
			]));
		});

		it('should use CFN role', () => {
			const expectedCFData = {
				StackName: 'testService-myStage-myAlias',
				Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
				OnFailure: 'DELETE',
				Parameters: [],
				Tags: [
					{ Key: 'STAGE', Value: 'myStage' },
					{ Key: 'ALIAS', Value: 'myAlias' },
				],
				RoleARN: 'myRole',
				TemplateURL: 'https://s3.amazonaws.com/myBucket/myDirectory/compiled-cloudformation-template-alias.json',
			};
			providerRequestStub.returns(BbPromise.resolve("done"));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.cfnRole = 'myRole';
			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.createAliasFallback()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'createStack', expectedCFData, 'myStage', 'us-east-1'),
			]));
		});

		it('should reject with CF error', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('CF failed')));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.createAliasFallback()).to.be.rejectedWith('CF failed')
			.then(() => expect(providerRequestStub).to.have.been.calledOnce);
		});
	});

	describe('#updateAlias()', () => {
		it('Should call CF with correct default parameters', () => {
			const expectedCFData = {
				StackName: 'testService-myStage-myAlias',
				Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
				Parameters: [],
				Tags: [
					{ Key: 'STAGE', Value: 'myStage' },
					{ Key: 'ALIAS', Value: 'myAlias' }
				],
				TemplateURL: 'https://s3.amazonaws.com/myBucket/myDirectory/compiled-cloudformation-template-alias.json',
			};
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.updateAlias()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(monitorStackStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'updateStack', expectedCFData, 'myStage', 'us-east-1'),
				expect(monitorStackStub).to.have.been
					.calledWithExactly('update', requestResult)
			]));
		});

		it('should set stack tags', () => {
			const expectedCFData = {
				StackName: 'testService-myStage-myAlias',
				Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
				Parameters: [],
				Tags: [
					{ Key: 'STAGE', Value: 'myStage' },
					{ Key: 'ALIAS', Value: 'myAlias' },
					{ Key: 'tag1', Value: 'application'},
					{ Key: 'tag2', Value: 'component' }
				],
				TemplateURL: 'https://s3.amazonaws.com/myBucket/myDirectory/compiled-cloudformation-template-alias.json',
			};
			providerRequestStub.returns(BbPromise.resolve("done"));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.stackTags = {
				tag1: 'application',
				tag2: 'component'
			};

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.updateAlias()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'updateStack', expectedCFData, 'myStage', 'us-east-1'),
			]));
		});

		it('should use CFN role', () => {
			const expectedCFData = {
				StackName: 'testService-myStage-myAlias',
				Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
				Parameters: [],
				Tags: [
					{ Key: 'STAGE', Value: 'myStage' },
					{ Key: 'ALIAS', Value: 'myAlias' },
				],
				RoleARN: 'myRole',
				TemplateURL: 'https://s3.amazonaws.com/myBucket/myDirectory/compiled-cloudformation-template-alias.json',
			};
			providerRequestStub.returns(BbPromise.resolve("done"));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.cfnRole = 'myRole';
			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.updateAlias()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'updateStack', expectedCFData, 'myStage', 'us-east-1'),
			]));
		});

		it('should reject with CF error', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('CF failed')));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.updateAlias()).to.be.rejectedWith('CF failed')
			.then(() => expect(providerRequestStub).to.have.been.calledOnce);
		});

		it('should resolve in case no updates are performed', () => {
			providerRequestStub.returns(BbPromise.resolve("done"));
			monitorStackStub.rejects(new Error('No updates are to be performed.'));
			return expect(awsAlias.updateAlias()).to.be.fulfilled
			.then(() => expect(providerRequestStub).to.have.been.calledOnce);
		});
	});

	describe('#updateAliasStack()', () => {
		let writeAliasUpdateTemplateToDiskStub;
		let createAliasFallbackStub;
		let updateAliasStub;

		beforeEach(() => {
			writeAliasUpdateTemplateToDiskStub = sandbox.stub(awsAlias, 'writeAliasUpdateTemplateToDisk');
			createAliasFallbackStub = sandbox.stub(awsAlias, 'createAliasFallback');
			updateAliasStub = sandbox.stub(awsAlias, 'updateAlias');

			writeAliasUpdateTemplateToDiskStub.returns(BbPromise.resolve());
			createAliasFallbackStub.returns(BbPromise.resolve());
			updateAliasStub.returns(BbPromise.resolve());
		});

		it('should write template and update stack', () => {
			return expect(awsAlias.updateAliasStack()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(writeAliasUpdateTemplateToDiskStub).to.have.been.calledOnce,
				expect(updateAliasStub).to.have.been.calledOnce,
			]));
		});

		it('should create alias if createLater has been set', () => {
			awsAlias._createLater = true;

			return expect(awsAlias.updateAliasStack()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(writeAliasUpdateTemplateToDiskStub).to.have.been.calledOnce,
				expect(createAliasFallbackStub).to.have.been.calledOnce,
				expect(updateAliasStub).to.not.have.been.called,
			]));
		});

		it('should resolve with noDeploy', () => {
			awsAlias._options.noDeploy = true;

			return expect(awsAlias.updateAliasStack()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(writeAliasUpdateTemplateToDiskStub).to.have.been.calledOnce,
				expect(createAliasFallbackStub).to.not.have.been.called,
				expect(updateAliasStub).to.not.have.been.called,
			]));
		});
	});

	describe('#writeAliasUpdateTemplateToDisk()', () => {
		let writeFileSyncStub;

		beforeEach(() => {
			writeFileSyncStub = sandbox.stub(serverless.utils, 'writeFileSync');
		});

		it('should write the alias template', () => {
			const expectedPath = path.join('path-to-service', '.serverless', 'cloudformation-template-update-alias-stack.json');
			const template = {};
			writeFileSyncStub.returns();

			serverless.config.servicePath = 'path-to-service';
			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = template;

			return expect(awsAlias.writeAliasUpdateTemplateToDisk()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(writeFileSyncStub).to.have.been.calledOnce,
				expect(writeFileSyncStub).to.have.been.calledWithExactly(expectedPath, template)
			]));
		});
	});
});
