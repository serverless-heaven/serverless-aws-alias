'use strict';
/**
 * Unit tests for lambda role transformations.
 */

const getInstalledPath = require('get-installed-path');
const _ = require('lodash');
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
		serverless = new Serverless();
		serverless.setProvider('aws', new AwsProvider(serverless, options));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'testService';
		serverless.service.provider.compiledCloudFormationAliasTemplate = {};
		awsAlias = new AWSAlias(serverless, options);

		// Disable logging
		logStub = sandbox.stub(serverless.cli, 'log');
		logStub.returns();

		return awsAlias.validate();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#aliasHandleLambdaRole()', () => {
		let stack;

		beforeEach(() => {
			stack = _.clone(require('../data/sls-stack-1.json'));
		})

		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = stack;
			return expect(awsAlias.aliasHandleLambdaRole({}, [], {})).to.be.fulfilled;
		});

	});
});
