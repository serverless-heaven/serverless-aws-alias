'use strict';
/**
 * Unit tests for validate.
 */

const { getInstalledPathSync } = require('get-installed-path');
const BbPromise = require('bluebird');
const chai = require('chai');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
const expect = chai.expect;

describe('#validate()', () => {
	let serverless;
	let options;
	let awsAlias;

	beforeEach(() => {
		serverless = new Serverless();
		options = {
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless.service.service = 'myService';
		serverless.setProvider('aws', new AwsProvider(serverless, options));
		serverless.cli = new serverless.classes.CLI(serverless);
		awsAlias = new AWSAlias(serverless, options);
	});

	it('should fail with old Serverless version', () => {
		serverless.version = '1.6.0';
		return expect(awsAlias.validate()).to.be.rejectedWith('must be >= 2.0.0');
	});

	it('should succeed with Serverless version 2.0.0', () => {
		serverless.version = '2.0.0';
		return expect(awsAlias.validate()).to.eventually.be.fulfilled;
	});

	it('should succeed with Serverless version 2.25.2', () => {
		serverless.version = '2.25.2';
		return expect(awsAlias.validate()).to.eventually.be.fulfilled;
	});

	it('should initialize the plugin with options', () => {
		return expect(awsAlias.validate()).to.eventually.be.fulfilled
		.then(() => BbPromise.all([
			expect(awsAlias).to.have.property('_stage', 'myStage'),
			expect(awsAlias).to.have.property('_alias', 'myStage'),
			expect(awsAlias).to.have.property('_stackName', 'myService-myStage'),
		]));
	});

	it('should set SERVERLESS_ALIAS', () => {
		return expect(awsAlias.validate()).to.eventually.be.fulfilled
		.then(() => expect(process.env.SERVERLESS_ALIAS).to.equal('myStage'));
	});

	it('should succeed', () => {
		return expect(awsAlias.validate()).to.eventually.be.fulfilled;
	});
});
