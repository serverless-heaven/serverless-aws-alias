'use strict';
/**
 * Unit tests for validate.
 */

const getInstalledPath = require('get-installed-path');
const chai = require('chai');
const AWSAlias = require('../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
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
		serverless.setProvider('aws', new AwsProvider(serverless));
		serverless.cli = new serverless.classes.CLI(serverless);
		awsAlias = new AWSAlias(serverless, options);
	});

	it('should fail with old Serverless version', () => {
		serverless.version = '1.6.0';
		return expect(awsAlias.validate()).to.be.rejectedWith('must be >= 1.12.0');
	});

	it('should succeed with Serverless version 1.12.0', () => {
		serverless.version = '1.12.0';
		return expect(awsAlias.validate()).to.eventually.be.fulfilled;
	});

	it('should succeed with Serverless version 1.13.0', () => {
		serverless.version = '1.13.0';
		return expect(awsAlias.validate()).to.eventually.be.fulfilled;
	});

	it('should succeed', () => {
		return expect(awsAlias.validate()).to.eventually.be.fulfilled;
	});
});
