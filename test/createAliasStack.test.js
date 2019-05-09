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

describe('createAliasStack', () => {
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
		awsAlias = new AWSAlias(serverless, options);
		providerRequestStub = sandbox.stub(awsAlias._provider, 'request');
		monitorStackStub = sandbox.stub(awsAlias, 'monitorStack');
		logStub = sandbox.stub(serverless.cli, 'log');

		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#createAlias()', () => {
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
				TemplateBody: '{}'
			};
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.createAlias()).to.be.fulfilled)
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
				TemplateBody: '{}'
			};
			providerRequestStub.returns(BbPromise.resolve("done"));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.stackTags = {
				tag1: 'application',
				tag2: 'component'
			};

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.createAlias()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'createStack', expectedCFData, 'myStage', 'us-east-1'),
			]));
		});

		it('should reject with CF error', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('CF failed')));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.createAlias()).to.be.rejectedWith('CF failed')
			.then(() => expect(providerRequestStub).to.have.been.calledOnce);
		});
	});

	describe('#createAliasStack()', () => {
		let writeAliasTemplateToDiskStub;
		let checkAliasStackStub;

		beforeEach(() => {
			writeAliasTemplateToDiskStub = sandbox.stub(awsAlias, 'writeAliasTemplateToDisk');
			checkAliasStackStub = sandbox.stub(awsAlias, 'checkAliasStack');
		});

		it('should fail with invalid service name', () => {
			writeAliasTemplateToDiskStub.returns(BbPromise.resolve());
			checkAliasStackStub.returns(BbPromise.resolve());

			serverless.service.service = 'testSer?vice';
			return expect(() => awsAlias.createAliasStack()).to.throw('is not valid');
		});

		it('should fail with invalid alias name', () => {
			writeAliasTemplateToDiskStub.returns(BbPromise.resolve());
			checkAliasStackStub.returns(BbPromise.resolve());

			awsAlias._alias = 'ali!as';
			return expect(() => awsAlias.createAliasStack()).to.throw('is not valid');
		});

		it('should fail with too long stack name', () => {
			writeAliasTemplateToDiskStub.returns(BbPromise.resolve());
			checkAliasStackStub.returns(BbPromise.resolve());

			awsAlias._alias = Array(513).join('x');
			return expect(() => awsAlias.createAliasStack()).to.throw('is not valid');
		});

		it('should save template and create stack', () => {
			writeAliasTemplateToDiskStub.returns(BbPromise.resolve());
			checkAliasStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.createAliasStack()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(writeAliasTemplateToDiskStub).to.have.been.calledOnce,
				expect(checkAliasStackStub).to.have.been.calledOnce,
				expect(writeAliasTemplateToDiskStub).to.have.been.calledBefore(checkAliasStackStub),
			]));
		});
	});

	describe('#checkAliasStack()', () => {
		let createAliasStub;

		beforeEach(() => {
			createAliasStub = sandbox.stub(awsAlias, 'createAlias');
		});

		it('should do nothing with --noDeploy', () => {
			providerRequestStub.returns(BbPromise.resolve());
			createAliasStub.returns(BbPromise.resolve());

			awsAlias._options.noDeploy = true;

			return expect(awsAlias.checkAliasStack()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.not.have.been.called,
				expect(createAliasStub).to.not.have.been.called,
			]));
		});

		it('Should call CF describeStackResources and resolve if stack exists', () => {
			const expectedCFData = { StackName: 'testService-dev-myAlias' };
			providerRequestStub.returns(BbPromise.resolve());
			monitorStackStub.returns(BbPromise.resolve());

			awsAlias._aliasStackName = 'testService-dev-myAlias';

			return expect(awsAlias.checkAliasStack()).to.eventually.equal('alreadyCreated')
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(createAliasStub).to.not.have.been.called,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('CloudFormation', 'describeStackResources', expectedCFData, 'myStage', 'us-east-1'),
			]));
		});

		it('Should create stack if it does not exist', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('stack does not exist')));
			monitorStackStub.returns(BbPromise.resolve());

			awsAlias._aliasStackName = 'testService-dev-myAlias';
			awsAlias._createLater = false;

			return expect(awsAlias.checkAliasStack()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(createAliasStub).to.have.been.calledOnce,
				expect(awsAlias._createLater).to.be.false
			]));
		});

		it('Should defer stack creation if a deployment bucket has been set', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('stack does not exist')));
			monitorStackStub.returns(BbPromise.resolve());

			serverless.service.provider.deploymentBucket = 'myBucket';
			awsAlias._aliasStackName = 'testService-dev-myAlias';
			awsAlias._createLater = false;

			return expect(awsAlias.checkAliasStack()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(createAliasStub).to.not.have.been.called,
				expect(awsAlias._createLater).to.be.true
			]));
		});

		it('should throw on unknown CF error', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('invalid CF operation')));
			createAliasStub.returns(BbPromise.resolve());

			return expect(awsAlias.checkAliasStack()).to.be.rejectedWith('invalid CF operation');
		});
	});

	describe('#writeAliasTemplateToDisk()', () => {
		let writeFileSyncStub;

		beforeEach(() => {
			writeFileSyncStub = sandbox.stub(serverless.utils, 'writeFileSync');
		});

		it('should do nothing if a deployment bucket has been set', () => {
			writeFileSyncStub.returns();

			serverless.service.provider.deploymentBucket = 'myBucket';
			serverless.config.servicePath = 'path-to-service';

			return expect(awsAlias.writeAliasTemplateToDisk()).to.be.fulfilled
			.then(() => expect(writeFileSyncStub).to.not.have.been.called);
		});

		it('should write the alias template', () => {
			const expectedPath = path.join('path-to-service', '.serverless', 'cloudformation-template-create-alias-stack.json');
			const template = { stack: 'mystacktemplate' };
			writeFileSyncStub.returns();

			serverless.config.servicePath = 'path-to-service';
			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = template;

			return expect(awsAlias.writeAliasTemplateToDisk()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(writeFileSyncStub).to.have.been.calledOnce,
				expect(writeFileSyncStub).to.have.been.calledWithExactly(expectedPath, template)
			]));
		});
	});
});
