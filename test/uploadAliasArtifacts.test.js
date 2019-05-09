'use strict';
/**
 * Unit tests for createAliasStack..
 */

const { getInstalledPathSync } = require('get-installed-path');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('uploadAliasArtifacts', () => {
	let serverless;
	let options;
	let awsAlias;
	// Sinon and stubs for SLS CF access
	let sandbox;
	let providerRequestStub;
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
		logStub = sandbox.stub(serverless.cli, 'log');
		awsAlias.bucketName = 'myBucket';

		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#uploadAliasCloudFormationFile()', () => {
		it('Should call S3 putObject with correct default parameters', () => {
			const expectedData = {
				Bucket: 'myBucket',
				Key: 'myDirectory/compiled-cloudformation-template-alias.json',
				Body: '{}',
				ContentType: 'application/json',
			};
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};

			return expect(awsAlias.uploadAliasCloudFormationFile()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('S3', 'putObject', expectedData, 'myStage', 'us-east-1'),
			]));
		});

		it('should use SSE configuration and set all supported keys', () => {
			const expectedData = {
				Bucket: 'myBucket',
				Key: 'myDirectory/compiled-cloudformation-template-alias.json',
				Body: '{}',
				ContentType: 'application/json',
				ServerSideEncryption: true,
				SSEKMSKeyId: 'keyID',
				SSECustomerAlgorithm: 'AES',
				SSECustomerKey: 'key',
				SSECustomerKeyMD5: 'md5',
			};
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};
			serverless.service.provider.deploymentBucketObject = {
				serverSideEncryption: true,
				sseKMSKeyId: 'keyID',
				sseCustomerAlgorithm: 'AES',
				sseCustomerKey: 'key',
				sseCustomerKeyMD5: 'md5',
			};

			return expect(awsAlias.uploadAliasCloudFormationFile()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('S3', 'putObject', expectedData, 'myStage', 'us-east-1'),
			]));
		});

		it('should use SSE configuration and ignore all unsupported keys', () => {
			const expectedData = {
				Bucket: 'myBucket',
				Key: 'myDirectory/compiled-cloudformation-template-alias.json',
				Body: '{}',
				ContentType: 'application/json',
				ServerSideEncryption: true,
				SSEKMSKeyId: 'keyID',
			};
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));

			serverless.service.provider.compiledCloudFormationAliasCreateTemplate = {};
			serverless.service.provider.deploymentBucketObject = {
				serverSideEncryption: true,
				sseKMSKeyId: 'keyID',
				sseCustomAlgorithm: 'AES',
				unknown: 'key',
				invalid: 'md5',
			};

			return expect(awsAlias.uploadAliasCloudFormationFile()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub).to.have.been
					.calledWithExactly('S3', 'putObject', expectedData, 'myStage', 'us-east-1'),
			]));
		});

		it('should reject with S3 error', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('Failed')));

			return expect(awsAlias.uploadAliasCloudFormationFile()).to.be.rejectedWith('Failed')
			.then(() => expect(providerRequestStub).to.have.been.calledOnce);
		});
	});

	describe('#uploadAliasArtifacts()', () => {
		let uploadAliasCloudFormationFileStub;

		beforeEach(() => {
			uploadAliasCloudFormationFileStub = sandbox.stub(awsAlias, 'uploadAliasCloudFormationFile');
			uploadAliasCloudFormationFileStub.returns(BbPromise.resolve());
		});

		it('should call uploadAliasCloudFormationFile', () => {
			return expect(awsAlias.uploadAliasArtifacts()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(uploadAliasCloudFormationFileStub).to.have.been.calledOnce,
			]));
		});

		it('should resolve with noDeploy', () => {
			awsAlias._options.noDeploy = true;

			return expect(awsAlias.uploadAliasArtifacts()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(uploadAliasCloudFormationFileStub).to.not.have.been.called,
			]));
		});
	});
});
