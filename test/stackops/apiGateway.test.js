'use strict';
/**
 * Unit tests for SNS events.
 */

const getInstalledPath = require('get-installed-path');
const BbPromise = require('bluebird');
const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../../index');

const serverlessPath = getInstalledPath.sync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider/awsProvider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('API Gateway', () => {
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
		serverless.service.service = 'testService';
		serverless.setProvider('aws', new AwsProvider(serverless, options));
		serverless.cli = new serverless.classes.CLI(serverless);
		serverless.service.provider.compiledCloudFormationAliasTemplate = {};
		awsAlias = new AWSAlias(serverless, options);

		// Disable logging
		logStub = sandbox.stub(serverless.cli, 'log');
		logStub.returns();

		// Validate before each test to set the variables correctly.
		return awsAlias.validate();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#aliasHandleApiGateway()', () => {
		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = require('../data/sls-stack-1.json');
			serverless.service.provider.compiledCloudFormationAliasTemplate = require('../data/alias-stack-1.json');
			return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled;
		});

		describe('authorizer transform', () => {
			let stackTemplate;
			let aliasTemplate;

			beforeEach(() => {
				stackTemplate = _.cloneDeep(require('../data/auth-stack.json'));
				aliasTemplate = _.cloneDeep(require('../data/alias-stack-1.json'));
			});

			it('should handle only Lambda authorizers', () => {
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				const cogAuth = _.cloneDeep(template.Resources.CognitoTestApiGatewayAuthorizer);
				cogAuth.Properties.Name += "-myAlias";
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template).to.not.have.a.deep.property('Resources.TestauthApiGatewayAuthorizer'),
					expect(template).to.have.a.deep.property('Resources.TestauthApiGatewayAuthorizermyAlias')
						.that.has.a.deep.property("Properties.AuthorizerUri")
						.that.deep.equals({
							"Fn::Join": [
								"",
								[
									"arn:aws:apigateway:",
									{
										"Ref": "AWS::Region"
									},
									":lambda:path/2015-03-31/functions/",
									{
										"Fn::GetAtt": [
											"TestauthLambdaFunction",
											"Arn"
										]
									},
									":${stageVariables.SERVERLESS_ALIAS}",
									"/invocations"
								]
							]
						}),
					expect(template).to.have.a.deep.property('Resources.CognitoTestApiGatewayAuthorizermyAlias')
						.that.deep.equals(cogAuth)
				]));
			});

			it('should transform string dependencies and references to authorizers', () => {
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template)
						.to.have.a.deep.property("Resources.ApiGatewayMethodFunc1Get.Properties.AuthorizerId")
							.that.deep.equals({ Ref: "TestauthApiGatewayAuthorizermyAlias" }),
					expect(template)
						.to.have.a.deep.property("Resources.ApiGatewayMethodFunc1Get.DependsOn")
							.that.equals("TestauthApiGatewayAuthorizermyAlias")
				]));
			});

			it('should transform dependency arrays', () => {
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				const deps = [ "myDep1", "TestauthApiGatewayAuthorizer", "myDep2" ];
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				template.Resources.ApiGatewayMethodFunc1Get.DependsOn = deps;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template)
						.to.have.a.deep.property("Resources.ApiGatewayMethodFunc1Get.DependsOn")
							.that.deep.equals([ "myDep1", "myDep2", "TestauthApiGatewayAuthorizermyAlias" ])
				]));
			});

			it('should handle user resource overwrites', () => {
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				_.set(serverless, "service.resources", {
					Resources: {
						TestauthApiGatewayAuthorizer: {
							Properties: {
								AuthorizerResultTtlInSeconds: 100
							}
						}
					},
					Outputs: {}
				});
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template)
						.to.have.a.deep.property("Resources.TestauthApiGatewayAuthorizermyAlias.Properties.AuthorizerResultTtlInSeconds")
							.that.equals(100),
					expect(serverless).to.not.have.a.deep.property('service.resources.Resources.TestauthApiGatewayAuthorizer'),
				]));
			});

		});
	});
});
