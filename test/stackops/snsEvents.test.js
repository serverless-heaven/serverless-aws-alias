'use strict';
/**
 * Unit tests for SNS events.
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

	describe('#aliasHandleSNSEvents()', () => {
		let stack1;
		let aliasStack1;
		let snsStack1;

		beforeEach(() => {
			stack1 = _.cloneDeep(require('../data/sls-stack-1.json'));
			aliasStack1 = _.cloneDeep(require('../data/alias-stack-1.json'));
			snsStack1 = _.cloneDeep(require('../data/sns-stack.json'));
		});

		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = stack1;
			serverless.service.provider.compiledCloudFormationAliasTemplate = aliasStack1;
			return expect(awsAlias.aliasHandleSNSEvents({}, [], {})).to.be.fulfilled;
		});

		it('should move resources to alias stack', () => {
			const snsStack = serverless.service.provider.compiledCloudFormationTemplate = snsStack1;
			const aliasStack = serverless.service.provider.compiledCloudFormationAliasTemplate = aliasStack1;
			return expect(awsAlias.aliasHandleSNSEvents({}, [], {})).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(snsStack).to.not.have.a.nested.property('Resources.SNSTopicSlstestprojecttopic'),
				expect(snsStack).to.not.have.a.nested.property('Resources.SNSTopicSubscriptionSlstestprojecttopic'),
				expect(snsStack).to.not.have.a.nested.property('Resources.Testfct1LambdaPermissionSlstestprojecttopicSNS'),
				expect(aliasStack).to.have.a.nested.property('Resources.SNSTopicSlstestprojecttopic'),
				expect(aliasStack).to.have.a.nested.property('Resources.SNSTopicSubscriptionSlstestprojecttopic'),
				expect(aliasStack).to.have.a.nested.property('Resources.Testfct1LambdaPermissionSlstestprojecttopicSNS'),
			]));
		});

		it('should replace function with alias reference', () => {
			serverless.service.provider.compiledCloudFormationTemplate = snsStack1;
			const aliasStack = serverless.service.provider.compiledCloudFormationAliasTemplate = aliasStack1;
			return expect(awsAlias.aliasHandleSNSEvents({}, [], {})).to.be.fulfilled
			.then(() => expect(aliasStack).to.have.a.nested.property('Resources.SNSTopicSlstestprojecttopic')
				.that.has.a.nested.property('Properties.Subscription[0].Endpoint')
				.that.deep.equals({ Ref: 'Testfct1Alias' })
			);
		});
	});
});
