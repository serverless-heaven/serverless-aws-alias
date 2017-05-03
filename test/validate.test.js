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

	it('should reference the deploy plugin', () => {
		return expect(awsAlias.validate()).to.eventually.be.fulfilled;
	});
});
