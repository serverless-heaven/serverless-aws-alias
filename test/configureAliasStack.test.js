'use strict';
/**
 * Unit tests for configureAliasStack.
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

describe('configureAliasStack', () => {
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

	describe('#configureAliasStack()', () => {
		let readFileSyncStub;

		beforeEach(() => {
			readFileSyncStub = sandbox.stub(serverless.utils, 'readFileSync');
		});

		it('should set alias reference and properties to CF templates', () => {
			readFileSyncStub.returns(require('../lib/alias-cloudformation-template.json'));
			serverless.service.provider.compiledCloudFormationTemplate = require('./data/sls-stack-1.json');
			const cfTemplate = serverless.service.provider.compiledCloudFormationTemplate;

			return expect(awsAlias.validate()).to.be.fulfilled
			.then(() => expect(awsAlias.configureAliasStack()).to.be.fulfilled)
			.then(() => BbPromise.all([
				expect(cfTemplate).to.have.deep.property('Outputs.ServerlessAliasReference.Value', 'REFERENCE'),
				expect(cfTemplate).to.have.deep.property('Outputs.ServerlessAliasReference.Export.Name', 'testService-myStage-ServerlessAliasReference'),
				expect(serverless.service.provider.compiledCloudFormationAliasTemplate)
					.to.have.property('Description')
					.that.matches(/Alias stack for .* \(.*\)/),
				expect(serverless.service.provider.compiledCloudFormationAliasTemplate)
					.to.have.deep.property('Outputs.ServerlessAliasName.Value', 'myAlias'),
			]));
		});
	});
});
