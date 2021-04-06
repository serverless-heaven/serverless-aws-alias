'use strict';
/**
 * Unit tests for initialization.
 */

const { getInstalledPathSync } = require('get-installed-path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('SNS Events', () => {
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

	describe('#aliasInit()', () => {
		it('should set alias flags', () => {
			serverless.service.provider.compiledCloudFormationTemplate = _.cloneDeep(require('../data/sls-stack-1.json'));
			const aliasStack = serverless.service.provider.compiledCloudFormationAliasTemplate = _.cloneDeep(require('../data/alias-stack-1.json'));
			return expect(awsAlias.aliasInit({}, [], {})).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(aliasStack).to.have.property('Outputs')
					.that.has.property('AliasFlags')
					.that.deep.equals({
						Description: 'Alias flags.',
						Value: { hasRole: false }
					})
			]));
		});
	});
});
