'use strict';
/**
 * Unit tests for stack restructuring
 */

const getInstalledPath = require('get-installed-path');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
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
		sandbox = sinon.sandbox.create();
	});

	beforeEach(() => {
		serverless = new Serverless();
		options = {
			alias: 'myAlias',
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless.setProvider('aws', new AwsProvider(serverless));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.service = 'testService';
		serverless.service.provider.compiledCloudFormationAliasTemplate = {
			Resources: {},
			Outputs: {}
		};
		serverless.service.provider.compiledCloudFormationTemplate = require('./data/sls-stack-1.json');
		awsAlias = new AWSAlias(serverless, options);

		// Disable logging
		logStub = sandbox.stub(serverless.cli, 'log');
		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#aliasRestructureStack()', () => {
		it('should abort if no master alias has been deployed', () => {
			awsAlias._alias = 'myAlias';
			return expect(() => awsAlias.aliasRestructureStack({}, [], {})).to.throw(serverless.classes.Error);
		});

		it('should propagate templates through all stack operations', () => {
			const aliasInitSpy = sandbox.spy(awsAlias, 'aliasInit');
			const aliasHandleUserResourcesSpy = sandbox.spy(awsAlias, 'aliasHandleUserResources');
			const aliasHandleLambdaRoleSpy = sandbox.spy(awsAlias, 'aliasHandleLambdaRole');
			const aliasHandleFunctionsSpy = sandbox.spy(awsAlias, 'aliasHandleFunctions');
			const aliasHandleApiGatewaySpy = sandbox.spy(awsAlias, 'aliasHandleApiGateway');
			const aliasHandleEventsSpy = sandbox.spy(awsAlias, 'aliasHandleEvents');
			const aliasHandleCWEventsSpy = sandbox.spy(awsAlias, 'aliasHandleCWEvents');
			const aliasFinalizeSpy = sandbox.spy(awsAlias, 'aliasFinalize');

			const currentTemplate = require('./data/sls-stack-2.json');
			const aliasTemplate = require('./data/alias-stack-1.json');
			const currentAliasStackTemplate = {};

			return expect(awsAlias.aliasRestructureStack(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate))
				.to.be.fulfilled
			.then(() => BbPromise.all([
				expect(aliasInitSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleUserResourcesSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleLambdaRoleSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleFunctionsSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleApiGatewaySpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleEventsSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasHandleCWEventsSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
				expect(aliasFinalizeSpy).to.have.been.calledWithExactly(currentTemplate, [ aliasTemplate ], currentAliasStackTemplate),
			]));
		});
	});
});
