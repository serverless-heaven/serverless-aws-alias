'use strict';
/**
 * Unit tests for SNS events.
 */

const getInstalledPath = require('get-installed-path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('S3 Events', () => {
	let serverless;
	let options;
	let awsAlias;
	// Sinon and stubs for SLS CF access
	let sandbox;
	let logStub;

	before(() => {
		sandbox = sinon.sandbox.create();
	});

	beforeEach(() => {
		options = {
			alias: 'myAlias',
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless = new Serverless(options);
		serverless.setProvider('aws', new AwsProvider(serverless));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'testService';
		serverless.service.provider.compiledCloudFormationAliasTemplate = {};
		awsAlias = new AWSAlias(serverless, options);

		// Disable logging
		logStub = sandbox.stub(serverless.cli, 'log');
		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#aliasHandleS3Events()', () => {
		let stack1;
		let aliasStack1;
		let s3Stack1;

		beforeEach(() => {
			stack1 = _.cloneDeep(require('../data/sls-stack-1.json'));
			aliasStack1 = _.cloneDeep(require('../data/alias-stack-1.json'));
			s3Stack1 = _.cloneDeep(require('../data/s3-stack.json'));
		});

		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = stack1;
			serverless.service.provider.compiledCloudFormationAliasTemplate = aliasStack1;
			return expect(awsAlias.aliasHandleS3Events({}, [], {})).to.be.fulfilled;
		});

		it('should move resources to alias stack', () => {
			const s3Stack = serverless.service.provider.compiledCloudFormationTemplate = s3Stack1;
			const aliasStack = serverless.service.provider.compiledCloudFormationAliasTemplate = aliasStack1;
			return expect(awsAlias.aliasHandleS3Events({}, [], {})).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(s3Stack).to.not.have.deep.property('Resources.S3BucketBucket'),
				expect(s3Stack).to.not.have.deep.property('Resources.LoadLambdaPermissionTestS3'),
				expect(aliasStack).to.have.deep.property('Resources.S3BucketBucket'),
				expect(aliasStack).to.have.deep.property('Resources.LoadLambdaPermissionTestS3'),
			]));
		});

		it('should replace function with alias reference', () => {
			serverless.service.provider.compiledCloudFormationTemplate = s3Stack1;
			const aliasStack = serverless.service.provider.compiledCloudFormationAliasTemplate = aliasStack1;
			return expect(awsAlias.aliasHandleS3Events({}, [], {})).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(aliasStack).to.have.deep.property('Resources.S3BucketBucket')
				.that.has.deep.property('Properties.NotificationConfiguration.LambdaConfigurations[0].Function')
				.that.deep.equals({ Ref: 'LoadAlias' }),
			]));
		});
	});
});
