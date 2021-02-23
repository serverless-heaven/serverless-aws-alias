'use strict';
/**
 * Unit tests for createAliasStack..
 */

const { getInstalledPathSync } = require('get-installed-path');
const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const _ = require('lodash');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
chai.use(require('chai-subset'));
const expect = chai.expect;

describe('removeAlias', () => {
	let serverless;
	let options;
	let awsAlias;
	// Sinon and stubs for SLS CF access
	let sandbox;
	let providerRequestStub;
	let monitorStackStub;
	let logStub;
	let slsStack1;
	let aliasStack1;
	let aliasStack2;

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
		serverless.service.provider.compiledCloudFormationAliasTemplate = {};
		awsAlias = new AWSAlias(serverless, options);
		providerRequestStub = sandbox.stub(awsAlias._provider, 'request');
		monitorStackStub = sandbox.stub(awsAlias, 'monitorStack');
		logStub = sandbox.stub(serverless.cli, 'log');

		slsStack1 = _.cloneDeep(require('./data/sls-stack-1.json'));
		aliasStack1 = _.cloneDeep(require('./data/alias-stack-1.json'));
		aliasStack2 = _.cloneDeep(require('./data/alias-stack-2.json'));

		logStub.returns();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#removeAlias()', () => {
		let aliasCreateStackChangesStub;
		let aliasRemoveAliasStackStub;
		let aliasApplyStackChangesStub;
		let pluginManagerSpawnStub;

		beforeEach(() => {
			aliasApplyStackChangesStub = sandbox.stub(awsAlias, 'aliasApplyStackChanges');
			aliasCreateStackChangesStub = sandbox.stub(awsAlias, 'aliasCreateStackChanges');
			aliasRemoveAliasStackStub = sandbox.stub(awsAlias, 'aliasRemoveAliasStack');
			pluginManagerSpawnStub = sandbox.stub(awsAlias._serverless.pluginManager, 'spawn');
		});

		it('should do nothing with noDeploy', () => {
			awsAlias._options = { noDeploy: true };

			return expect(awsAlias.removeAlias()).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(aliasApplyStackChangesStub).to.not.have.been.called,
				expect(aliasCreateStackChangesStub).to.not.have.been.called,
				expect(aliasRemoveAliasStackStub).to.not.have.been.called,
				expect(pluginManagerSpawnStub).to.not.have.been.called,
			]));
		});

		it('should error if an alias is deployed on stage removal', () => {
			awsAlias._options = { alias: 'myStage' };
			awsAlias._alias = 'master';
			slsStack1.Outputs.MasterAliasName = {
				Value: 'master'
			};

			expect(() => awsAlias.removeAlias(slsStack1, [ aliasStack1 ], aliasStack2)).to.throw(/myAlias/);
			return BbPromise.all([
				expect(aliasApplyStackChangesStub).to.not.have.been.called,
				expect(aliasCreateStackChangesStub).to.not.have.been.called,
				expect(aliasRemoveAliasStackStub).to.not.have.been.called,
				expect(pluginManagerSpawnStub).to.not.have.been.called,
			]);
		});

		it('should error if the master alias is not deployed on stage removal', () => {
			awsAlias._options = { alias: 'myStage' };
			awsAlias._alias = 'master';
			slsStack1.Outputs.MasterAliasName = {
				Value: 'master'
			};

			expect(() => awsAlias.removeAlias(slsStack1, [], {})).to.throw(/Internal error/);
			return BbPromise.all([
				expect(aliasApplyStackChangesStub).to.not.have.been.called,
				expect(aliasCreateStackChangesStub).to.not.have.been.called,
				expect(aliasRemoveAliasStackStub).to.not.have.been.called,
				expect(pluginManagerSpawnStub).to.not.have.been.called,
			]);
		});

		it('should remove alias and service stack on stage removal', () => {
			awsAlias._options = { alias: 'myStage' };
			awsAlias._alias = 'master';
			slsStack1.Outputs.MasterAliasName = {
				Value: 'master'
			};

			return expect(awsAlias.removeAlias(slsStack1, [], aliasStack2)).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(aliasApplyStackChangesStub).to.not.have.been.called,
				expect(aliasCreateStackChangesStub).to.not.have.been.called,
				expect(aliasRemoveAliasStackStub).to.have.been.calledOnce,
				expect(pluginManagerSpawnStub).to.have.been.calledWithExactly('remove'),
			]));
		});

		it('should remove alias stack', () => {
			slsStack1.Outputs.MasterAliasName = {
				Value: 'master'
			};
			aliasApplyStackChangesStub.returns([ slsStack1, [ aliasStack2 ], aliasStack1 ]);
			aliasCreateStackChangesStub.returns([ slsStack1, [ aliasStack2 ], aliasStack1 ]);
			aliasRemoveAliasStackStub.returns([ slsStack1, [ aliasStack2 ], aliasStack1 ]);

			return expect(awsAlias.removeAlias(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(aliasCreateStackChangesStub).to.have.been.calledOnce,
				expect(aliasRemoveAliasStackStub).to.have.been.calledOnce,
				expect(aliasApplyStackChangesStub).to.have.been.calledOnce,
				expect(pluginManagerSpawnStub).to.not.have.been.called,
			]));
		});
	});

	describe('#aliasRemoveAliasStack()', () => {
		it('should call CF to remove stack', () => {
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.aliasRemoveAliasStack(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,

			]));
		});

		it('should throw an error if the stack does not exist', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('stack does not exist')));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.aliasRemoveAliasStack(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.rejectedWith('is not deployed')
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
			]));
		});

		it('should propagate CF errors', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('CF Error')));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.aliasRemoveAliasStack(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.rejectedWith('CF Error')
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
			]));
		});
	});

	describe('#aliasApplyStackChanges()', () => {
		it('should call CF and update stage stack', () => {
			const requestResult = {
				status: 'ok'
			};
			providerRequestStub.returns(BbPromise.resolve(requestResult));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.aliasApplyStackChanges(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
				expect(providerRequestStub.getCall(0).args[0]).to.equal('CloudFormation'),
				expect(providerRequestStub.getCall(0).args[1]).to.equal('updateStack'),
				expect(providerRequestStub.getCall(0).args[2]).to.containSubset({ StackName: 'testService-myStage' }),
			]));
		});

		it('should resolve if no updates are applied', () => {
			providerRequestStub.rejects(new Error('No updates are to be performed.'));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.aliasApplyStackChanges(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.fulfilled
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
			]));
		});

		it('should propagate CF errors', () => {
			providerRequestStub.returns(BbPromise.reject(new Error('CF Error')));
			monitorStackStub.returns(BbPromise.resolve());

			return expect(awsAlias.aliasApplyStackChanges(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.rejectedWith('CF Error')
			.then(() => BbPromise.all([
				expect(providerRequestStub).to.have.been.calledOnce,
			]));
		});
	});

	it('should merge custom tags', () => {
		const requestResult = {
			status: 'ok'
		};
		providerRequestStub.returns(BbPromise.resolve(requestResult));
		monitorStackStub.returns(BbPromise.resolve());
		awsAlias._serverless.service.provider.stackTags = { tag1: '1', tag2: '2' };

		return expect(awsAlias.aliasApplyStackChanges(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.fulfilled
		.then(() => BbPromise.all([
			expect(providerRequestStub).to.have.been.calledOnce,
			expect(providerRequestStub.getCall(0).args[2]).to.containSubset({ Tags: [
				{
					Key: 'tag1',
					Value: '1'
				},
				{
					Key: 'tag2',
					Value: '2'
				}
			] }),
		]));
	});

	it('should use custom stack policy', () => {
		const requestResult = {
			status: 'ok'
		};
		providerRequestStub.returns(BbPromise.resolve(requestResult));
		monitorStackStub.returns(BbPromise.resolve());
		awsAlias._serverless.service.provider.stackPolicy = [{ title: 'myPolicy' }];

		return expect(awsAlias.aliasApplyStackChanges(slsStack1, [ aliasStack2 ], aliasStack1)).to.be.fulfilled
		.then(() => BbPromise.all([
			expect(providerRequestStub).to.have.been.calledOnce,
			expect(providerRequestStub.getCall(0).args[2]).to.containSubset({ StackPolicyBody: '{"Statement":[{"title":"myPolicy"}]}' }),
		]));
	});
});
