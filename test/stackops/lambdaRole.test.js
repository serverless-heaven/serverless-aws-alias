'use strict';
/**
 * Unit tests for lambda role transformations.
 */

const getInstalledPath = require('get-installed-path');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('lambdaRole', () => {
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

	describe('#aliasHandleLambdaRole()', () => {
		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = require('../data/sls-stack-1.json');
			return expect(awsAlias.aliasHandleLambdaRole({}, [], {})).to.be.fulfilled;
		});

	});
});
