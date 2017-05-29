'use strict';
/**
 * Unit tests for SNS events.
 */

const getInstalledPath = require('get-installed-path');
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

describe('SNS Events', () => {
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

	describe('#aliasHandleSNSEvents()', () => {
		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = require('../data/sls-stack-1.json');
			serverless.service.provider.compiledCloudFormationAliasTemplate = require('../data/alias-stack-1.json');
			return expect(awsAlias.aliasHandleSNSEvents({}, [], {})).to.be.fulfilled;
		});

		it('should move resources to alias stack', () => {
			const snsStack = serverless.service.provider.compiledCloudFormationTemplate = require('../data/sns-stack.json');
			const aliasStack = serverless.service.provider.compiledCloudFormationAliasTemplate = require('../data/alias-stack-1.json');
			return expect(awsAlias.aliasHandleSNSEvents({}, [], {})).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(snsStack).to.not.have.property('SNSTopicSlstestprojecttopic'),
				expect(snsStack).to.not.have.property('Testfct1LambdaPermissionSlstestprojecttopicSNS'),
				expect(aliasStack).to.not.have.property('SNSTopicSlstestprojecttopic'),
				expect(aliasStack).to.not.have.property('Testfct1LambdaPermissionSlstestprojecttopicSNS'),
			]));
		});

		it('should replace function with alias reference', () => {
			const aliasStack = serverless.service.provider.compiledCloudFormationAliasTemplate = require('../data/alias-stack-1.json');
			return expect(awsAlias.aliasHandleSNSEvents({}, [], {})).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(aliasStack).to.not.have.property('SNSTopicSlstestprojecttopic')
				.that.has.deep.property('Properties.Subscription[0].Endpoint')
				.that.deep.equals({ Ref: 'Testfct1Alias' }),
			]));
		});
	});
});
