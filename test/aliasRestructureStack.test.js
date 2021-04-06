'use strict';
/**
 * Unit tests for stack restructuring
 */

const { getInstalledPathSync } = require('get-installed-path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('aliasRestructureStack', () => {
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
		serverless = new Serverless();
		options = {
			alias: 'myAlias',
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless.setProvider('aws', new AwsProvider(serverless, options));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'testService';
		serverless.service.provider.compiledCloudFormationAliasTemplate = {
			Resources: {},
			Outputs: {}
		};
		serverless.service.provider.compiledCloudFormationTemplate = _.cloneDeep(require('./data/sls-stack-1.json'));
		awsAlias = new AWSAlias(serverless, options);

		// Disable logging
		logStub = sandbox.stub(serverless.cli, 'log');
		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#addMasterAliasName', () => {
		it('should add the master alias name as output from command line option', () => {
			serverless.service.provider.compiledCloudFormationTemplate = _.cloneDeep({
				Resources: {},
				Outputs: {}
			});
			awsAlias._masterAlias = 'master'
			return expect(awsAlias.addMasterAliasName()).to.be.fulfilled
			.then(() =>
				expect(serverless.service.provider.compiledCloudFormationTemplate.Outputs.MasterAliasName.Value)
					.to.equal('master')
			);
		});

		it('should add the master alias name as output from existing stack', () => {
			const masterAliasStackOutput = {
				MasterAliasName: {
					Description: 'Master Alias name (serverless-aws-alias plugin)',
      				Value: 'master',
      				Export: {
						Name: 'sls-test-project-dev-master'
					}
				}
			};
			const currentTemplate = {
				Outputs: masterAliasStackOutput
			};
			serverless.service.provider.compiledCloudFormationTemplate = _.cloneDeep({
				Resources: {},
				Outputs: {}
			});
			return expect(awsAlias.addMasterAliasName(currentTemplate)).to.be.fulfilled
			.then(() =>
				expect(serverless.service.provider.compiledCloudFormationTemplate.Outputs.MasterAliasName.Value)
					.to.equal('master')
			);
		});
	});

	describe('#aliasFinalize()', () => {
		it('should stringify flags', () => {
			serverless.service.provider.compiledCloudFormationAliasTemplate = {
				Resources: {},
				Outputs: {
					AliasFlags: {
						Value: {
							flag1: true,
							flag2: 0
						}
					}
				}
			};

			return expect(awsAlias.aliasFinalize()).to.be.fulfilled
			.then(() =>
				expect(serverless.service.provider.compiledCloudFormationAliasTemplate.Outputs.AliasFlags.Value)
					.to.equal('{"flag1":true,"flag2":0}')
			);
		});
	});

	describe('#aliasRestructureStack()', () => {
		it('should abort if no master alias has been deployed', () => {
			awsAlias._alias = 'myAlias';
			return expect(() => awsAlias.aliasRestructureStack({}, [], {})).to.throw(serverless.classes.Error);
		});

		it('should propagate templates through all stack operations', () => {
			const addMasterAliasNameSpy = sandbox.spy(awsAlias, 'addMasterAliasName');
			const aliasInitSpy = sandbox.spy(awsAlias, 'aliasInit');
			const aliasHandleUserResourcesSpy = sandbox.spy(awsAlias, 'aliasHandleUserResources');
			const aliasHandleLambdaRoleSpy = sandbox.spy(awsAlias, 'aliasHandleLambdaRole');
			const aliasHandleFunctionsSpy = sandbox.spy(awsAlias, 'aliasHandleFunctions');
			const aliasHandleApiGatewaySpy = sandbox.spy(awsAlias, 'aliasHandleApiGateway');
			const aliasHandleEventsSpy = sandbox.spy(awsAlias, 'aliasHandleEvents');
			const aliasHandleCWEventsSpy = sandbox.spy(awsAlias, 'aliasHandleCWEvents');
			const aliasHandleSNSEventsSpy = sandbox.spy(awsAlias, 'aliasHandleSNSEvents');
			const aliasFinalizeSpy = sandbox.spy(awsAlias, 'aliasFinalize');

			const currentTemplate = _.cloneDeep(require('./data/sls-stack-2.json'));
			const aliasTemplate = _.cloneDeep(require('./data/alias-stack-1.json'));
			const currentAliasStackTemplate = {};

			return expect(awsAlias.aliasRestructureStack(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate))
				.to.be.fulfilled
			.then(() => BbPromise.all([
				expect(addMasterAliasNameSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasInitSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleUserResourcesSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleLambdaRoleSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleFunctionsSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleApiGatewaySpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleEventsSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleCWEventsSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleSNSEventsSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasFinalizeSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
			]));
		});
	});
});
