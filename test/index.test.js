'use strict';
/**
 * Unit tests for plugin class.
 */

const getInstalledPath = require('get-installed-path');
const chai = require('chai');
const AwsAlias = require('../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

const expect = chai.expect;

describe('AwsAlias', () => {
	let serverless;
	let options;

	beforeEach(() => {
		serverless = new Serverless();
		options = {
			stage: 'myStage',
			region: 'us-east-1',
		};
		serverless.setProvider('aws', new AwsProvider(serverless));
	});

	describe('constructor', () => {
		it('should initialize the plugin without options', () => {
			const awsAlias = new AwsAlias(serverless, {});

			expect(awsAlias).to.have.property('_serverless', serverless);
			expect(awsAlias).to.have.property('_options').to.deep.equal({});
			expect(awsAlias).to.have.property('_stage', 'dev');
			expect(awsAlias).to.have.property('_alias', 'dev');
		});

		it('should initialize the plugin with options', () => {
			const awsAlias = new AwsAlias(serverless, options);

			expect(awsAlias).to.have.property('_serverless', serverless);
			expect(awsAlias).to.have.property('_options').to.deep.equal(options);
			expect(awsAlias).to.have.property('_stage', 'myStage');
			expect(awsAlias).to.have.property('_alias', 'myStage');
		});
	});
});
