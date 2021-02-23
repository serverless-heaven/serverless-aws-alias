'use strict';
/**
 * Unit tests for lambda role transformations.
 */

const { getInstalledPathSync } = require('get-installed-path');
const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider`);
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
		sandbox = sinon.createSandbox();
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
			stack = _.cloneDeep(require('../data/sls-stack-1.json'));
		});

		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = stack;
			return expect(awsAlias.aliasHandleLambdaRole({}, [], {})).to.be.fulfilled;
		});

		it('should remove old global IAM role when there are no references', () => {
			const currentTemplate = {
				Resources: {
					IamRoleLambdaExecution: {}
				},
				Outputs: {}
			};
			serverless.service.provider.compiledCloudFormationTemplate = stack;
			return expect(awsAlias.aliasHandleLambdaRole(currentTemplate, [], {})).to.be.fulfilled
			.then(() => expect(currentTemplate).to.not.have.a.property('IamRoleLambdaExecution'));
		});

		it('should retain existing alias roles', () => {
			const aliasTemplates = [{
				Resources: {},
				Outputs: {
					ServerlessAliasName: {
						Description: 'The current alias',
						Value: 'testAlias'
					}
				}
			}];
			const currentTemplate = {
				Resources: {
					IamRoleLambdaExecution: {},
					IamRoleLambdaExecutiontestAlias: {}
				},
				Outputs: {}
			};
			const stackTemplate = serverless.service.provider.compiledCloudFormationTemplate = stack;
			return expect(awsAlias.aliasHandleLambdaRole(currentTemplate, aliasTemplates, {})).to.be.fulfilled
			.then(() => expect(stackTemplate).to.have.a.nested.property('Resources.IamRoleLambdaExecutiontestAlias'));
		});

		it('should retain custom stack roles', () => {
			const aliasTemplates = [{
				Resources: {},
				Outputs: {
					ServerlessAliasName: {
						Description: 'The current alias',
						Value: 'testAlias'
					}
				}
			}];
			const currentTemplate = {
				Resources: {
					IamRoleLambdaExecution: {},
					IamRoleLambdaExecutiontestAlias: {}
				},
				Outputs: {}
			};

			const customRoleStack = _.cloneDeep(require('../data/sls-stack-3.json'));
			const stackTemplate = serverless.service.provider.compiledCloudFormationTemplate = customRoleStack;
			return expect(awsAlias.aliasHandleLambdaRole(currentTemplate, aliasTemplates, {})).to.be.fulfilled
				.then(() => expect(stackTemplate).to.have.a.nested.property('Resources.IamRoleLambdaExecutiontestAlias'));
		});
	});
});
