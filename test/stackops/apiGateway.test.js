'use strict';
/**
 * Unit tests for API Gateway resources.
 */

const { getInstalledPathSync } = require('get-installed-path');
const BbPromise = require('bluebird');
const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const AWSAlias = require('../../index');

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const AwsProvider = require(`${serverlessPath}/lib/plugins/aws/provider`);
const Serverless = require(`${serverlessPath}/lib/Serverless`);

chai.use(require('chai-as-promised'));
chai.use(require('chai-subset'));
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
		sandbox = sinon.createSandbox();
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

	describe('#createStageResource()', () => {
		let createStageResource;

		beforeEach(() => {
			createStageResource = _.bind(require('../../lib/stackops/apiGateway').internal.createStageResource, awsAlias);
		});

		it('should not throw with simple service', () => {
			expect(() => createStageResource('apiRef', 'deployment')).to.not.throw;
		});

		it('should return a valid stage object', () => {
			const stage = createStageResource('apiRef', 'deployment');

			expect(stage).to.have.a.property('Type', 'AWS::ApiGateway::Stage');
			expect(stage).to.have.a.nested.property('Properties.StageName', 'myAlias');
			expect(stage).to.have.a.nested.property('Properties.DeploymentId').that.is.an('object').that.deep.equals({ Ref: 'deployment' });
			expect(stage).to.have.a.nested.property('Properties.RestApiId').that.is.an('object').that.deep.equals({ 'Fn::ImportValue': 'apiRef' });
			expect(stage).to.have.a.nested.property('Properties.Variables').that.is.an('object').that.containSubset({ SERVERLESS_ALIAS: 'myAlias' });
		});

		it('should set general stage configuration', () => {
			awsAlias.serverless.service.provider.aliasStage = {
				cacheClusterEnabled: true,
				cacheClusterSize: 2
			};

			const stage = createStageResource('apiRef', 'deployment');
			expect(stage).to.have.a.nested.property('Properties.CacheClusterEnabled', true);
			expect(stage).to.have.a.nested.property('Properties.CacheClusterSize', 2);
		});

		it('should omit cacheClusterSize if not given', () => {
			awsAlias.serverless.service.provider.aliasStage = {
				cacheClusterEnabled: true
			};

			const stage = createStageResource('apiRef', 'deployment');
			expect(stage).to.not.have.a.nested.property('Properties.CacheClusterSize');
		});

		it('should throw on invalid configuration keys', () => {
			const service = {
				service: 'testService',
				serviceObject: {
					name: 'testService'
				},
				provider: {
					name: 'aws',
					runtime: 'nodejs4.3',
					stage: 'myStage',
					alias: 'myAlias',
					region: 'us-east-1',
					aliasStage: {
						notSomethingUnderstood: 'INFO',
						cacheClusterSize: 2,
						metricsEnabled: true
					}
				},
				functions: {
					functionA: {
						handler: 'functionA.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcA'
								}
							},
						],
					}
				}
			};

			awsAlias.serverless.service = new awsAlias.serverless.classes.Service(awsAlias.serverless, service);

			expect(() => createStageResource('apiRef', 'deployment')).to.throw('Invalid stage config');
		});

		it('should throw on invalid configuration values', () => {
			const service = {
				service: 'testService',
				serviceObject: {
					name: 'testService'
				},
				provider: {
					name: 'aws',
					runtime: 'nodejs4.3',
					stage: 'myStage',
					alias: 'myAlias',
					region: 'us-east-1',
					aliasStage: {
						cacheClusterSize: 2,
						metricsEnabled: 'true'
					}
				},
				functions: {
					functionA: {
						handler: 'functionA.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcA'
								}
							},
						],
					}
				}
			};

			awsAlias.serverless.service = new awsAlias.serverless.classes.Service(awsAlias.serverless, service);

			expect(() => createStageResource('apiRef', 'deployment')).to.throw('Invalid value for');
		});

		it('should use service config', () => {
			const service = {
				service: 'testService',
				serviceObject: {
					name: 'testService'
				},
				provider: {
					name: 'aws',
					runtime: 'nodejs4.3',
					stage: 'myStage',
					alias: 'myAlias',
					region: 'us-east-1',
					aliasStage: {
						loggingLevel: 'INFO'
					}
				},
				functions: {
					functionA: {
						handler: 'functionA.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcA'
								}
							},
							{
								http: {
									method: 'POST',
									path: '/funcA/create'
								}
							}
						]
					},
					functionB: {
						handler: 'functionB.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcB'
								}
							},
							{
								http: {
									method: 'UPDATE',
									path: '/funcB/update'
								}
							}
						]
					},
					functionC: {
						handler: 'functionB.handler',
						events: [
							{
								http: {
									method: 'ANY',
									path: '/funcC'
								}
							},
						]
					},
				}
			};
			const expectedMethodSettings = [
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'GET',
					ResourcePath: '/~1funcA'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'POST',
					ResourcePath: '/~1funcA~1create'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'GET',
					ResourcePath: '/~1funcB'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'UPDATE',
					ResourcePath: '/~1funcB~1update'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'DELETE',
					ResourcePath: '/~1funcC'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'GET',
					ResourcePath: '/~1funcC'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'HEAD',
					ResourcePath: '/~1funcC'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'OPTIONS',
					ResourcePath: '/~1funcC'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'PATCH',
					ResourcePath: '/~1funcC'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'POST',
					ResourcePath: '/~1funcC'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'PUT',
					ResourcePath: '/~1funcC'
				},
			];

			awsAlias.serverless.service = new awsAlias.serverless.classes.Service(awsAlias.serverless, service);

			const stage = createStageResource('apiRef', 'deployment');
			expect(stage).to.have.a.nested.property('Properties.MethodSettings').that.deep.equals(expectedMethodSettings);
		});

		it('should prefer function config', () => {
			const service = {
				service: 'testService',
				serviceObject: {
					name: 'testService'
				},
				provider: {
					name: 'aws',
					runtime: 'nodejs4.3',
					stage: 'myStage',
					alias: 'myAlias',
					region: 'us-east-1',
					aliasStage: {
						loggingLevel: 'INFO'
					}
				},
				functions: {
					functionA: {
						handler: 'functionA.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcA'
								}
							},
							{
								http: {
									method: 'POST',
									path: '/funcA/create'
								}
							}
						]
					},
					functionB: {
						handler: 'functionB.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcB'
								}
							},
							{
								http: {
									method: 'UPDATE',
									path: '/funcB/update'
								}
							}
						],
						aliasStage: {
							loggingLevel: 'ERROR',
							metricsEnabled: true
						}
					},
				}
			};
			const expectedMethodSettings = [
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'GET',
					ResourcePath: '/~1funcA'
				},
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'POST',
					ResourcePath: '/~1funcA~1create'
				},
				{
					LoggingLevel: 'ERROR',
					MetricsEnabled: true,
					HttpMethod: 'GET',
					ResourcePath: '/~1funcB'
				},
				{
					LoggingLevel: 'ERROR',
					MetricsEnabled: true,
					HttpMethod: 'UPDATE',
					ResourcePath: '/~1funcB~1update'
				},
			];

			awsAlias.serverless.service = new awsAlias.serverless.classes.Service(awsAlias.serverless, service);

			const stage = createStageResource('apiRef', 'deployment');
			expect(stage).to.have.a.nested.property('Properties.MethodSettings').that.deep.equals(expectedMethodSettings);
		});

		it('should prefer event config', () => {
			const service = {
				service: 'testService',
				serviceObject: {
					name: 'testService'
				},
				provider: {
					name: 'aws',
					runtime: 'nodejs4.3',
					stage: 'myStage',
					alias: 'myAlias',
					region: 'us-east-1',
					aliasStage: {
						loggingLevel: 'INFO'
					}
				},
				functions: {
					functionA: {
						handler: 'functionA.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcA'
								}
							},
							{
								http: {
									method: 'POST',
									path: '/funcA/create',
									aliasStage: {
										metricsEnabled: true
									}
								}
							}
						]
					},
					functionB: {
						handler: 'functionB.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcB'
								}
							},
							{
								http: {
									method: 'UPDATE',
									path: '/funcB/update',
									aliasStage: {
										loggingLevel: 'INFO',
										cachingEnabled: true,
									}
								}
							}
						],
						aliasStage: {
							loggingLevel: 'ERROR',
							metricsEnabled: true,
						}
					},
				}
			};
			const expectedMethodSettings = [
				{
					LoggingLevel: 'INFO',
					HttpMethod: 'GET',
					ResourcePath: '/~1funcA'
				},
				{
					LoggingLevel: 'INFO',
					MetricsEnabled: true,
					HttpMethod: 'POST',
					ResourcePath: '/~1funcA~1create'
				},
				{
					LoggingLevel: 'ERROR',
					MetricsEnabled: true,
					HttpMethod: 'GET',
					ResourcePath: '/~1funcB'
				},
				{
					LoggingLevel: 'INFO',
					MetricsEnabled: true,
					CachingEnabled: true,
					HttpMethod: 'UPDATE',
					ResourcePath: '/~1funcB~1update'
				},
			];

			awsAlias.serverless.service = new awsAlias.serverless.classes.Service(awsAlias.serverless, service);

			const stage = createStageResource('apiRef', 'deployment');
			expect(stage).to.have.a.nested.property('Properties.MethodSettings').that.deep.equals(expectedMethodSettings);
		});

		it('should not set AWS default values', () => {
			const service = {
				service: 'testService',
				serviceObject: {
					name: 'testService'
				},
				provider: {
					name: 'aws',
					runtime: 'nodejs4.3',
					stage: 'myStage',
					alias: 'myAlias',
					region: 'us-east-1',
					aliasStage: {
						loggingLevel: 'INFO'
					}
				},
				functions: {
					functionB: {
						handler: 'functionB.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcB'
								}
							},
							{
								http: {
									method: 'UPDATE',
									path: '/funcB/update',
									aliasStage: {
										loggingLevel: 'ERROR',
									}
								}
							},
							{
								http: {
									method: 'PATCH',
									path: '/funcB/update',
									aliasStage: {
										loggingLevel: 'OFF',
										metricsEnabled: false
									}
								}
							}
						],
						aliasStage: {
							loggingLevel: 'OFF',
							metricsEnabled: true
						}
					},
				}
			};
			const expectedMethodSettings = [
				{
					MetricsEnabled: true,
					HttpMethod: 'GET',
					ResourcePath: '/~1funcB'
				},
				{
					LoggingLevel: 'ERROR',
					MetricsEnabled: true,
					HttpMethod: 'UPDATE',
					ResourcePath: '/~1funcB~1update'
				},
			];

			awsAlias.serverless.service = new awsAlias.serverless.classes.Service(awsAlias.serverless, service);

			const stage = createStageResource('apiRef', 'deployment');
			expect(stage).to.have.a.nested.property('Properties.MethodSettings').that.deep.equals(expectedMethodSettings);
		});

		it('should not set stage config without actual configuration', () => {
			const service = {
				service: 'testService',
				serviceObject: {
					name: 'testService'
				},
				provider: {
					name: 'aws',
					runtime: 'nodejs4.3',
					stage: 'myStage',
					alias: 'myAlias',
					region: 'us-east-1',
				},
				functions: {
					functionB: {
						handler: 'functionB.handler',
						events: [
							{
								http: {
									method: 'GET',
									path: '/funcB'
								}
							},
							{
								http: {
									method: 'UPDATE',
									path: '/funcB/update',
								}
							},
							{
								http: {
									method: 'PATCH',
									path: '/funcB/update',
								}
							}
						],
					},
				}
			};

			awsAlias.serverless.service = new awsAlias.serverless.classes.Service(awsAlias.serverless, service);

			const stage = createStageResource('apiRef', 'deployment');
			expect(stage).to.not.have.a.nested.property('Properties.MethodSettings');
		});
	});

	describe('#aliasHandleApiGateway()', () => {
		it('should succeed with standard template', () => {
			serverless.service.provider.compiledCloudFormationTemplate = require('../data/sls-stack-1.json');
			const compiledAliasTemplate = require('../data/alias-stack-1.json');
			serverless.service.provider.compiledCloudFormationAliasTemplate = compiledAliasTemplate;
			return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(compiledAliasTemplate)
						.to.have.a.nested.property('Resources.Testfct1LambdaPermissionApiGateway.Properties.FunctionName')
						.that.deep.equals({ Ref: 'Testfct1Alias' }),
					expect(compiledAliasTemplate)
						.to.have.a.nested.property('Resources.Testfct1WithSuffixLambdaPermissionApiGateway.Properties.FunctionName')
						.that.deep.equals({ Ref: 'Testfct1WithSuffixAlias' }),
				]));
		});

		describe('authorizer transform', () => {
			let stackTemplate;
			let aliasTemplate;

			beforeEach(() => {
				stackTemplate = _.cloneDeep(require('../data/auth-stack.json'));
				aliasTemplate = _.cloneDeep(require('../data/alias-stack-1.json'));
			});

			it('should handle only Lambda authorizers', () => {
				const authorizeUriTemplate = {
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
				};

				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				const cogAuth = _.cloneDeep(template.Resources.CognitoTestApiGatewayAuthorizer);
				cogAuth.Properties.Name += "-myAlias";
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template).to.not.have.a.nested.property('Resources.TestauthApiGatewayAuthorizer'),
					expect(template).to.not.have.a.nested.property('Resources.TestauthApiGatewayRequestAuthorizer'),
					expect(template).to.have.a.nested.property('Resources.TestauthApiGatewayAuthorizermyAlias')
						.that.has.a.nested.property("Properties.AuthorizerUri")
						.that.deep.equals(authorizeUriTemplate),
					expect(template).to.have.a.nested.property('Resources.TestauthApiGatewayRequestAuthorizermyAlias')
						.that.has.a.nested.property("Properties.AuthorizerUri")
						.that.deep.equals(authorizeUriTemplate),
					expect(template).to.have.a.nested.property('Resources.CognitoTestApiGatewayAuthorizermyAlias')
						.that.deep.equals(cogAuth)
				]));
			});

			it('should support externally referenced custom authorizers', () => {
				stackTemplate = _.cloneDeep(require('../data/auth-stack-2.json'));
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				const compiledAliasTemplate = serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template)
						.to.have.a.nested.property("Resources.ApiGatewayMethodFunc1Get.Properties.AuthorizerId")
							.that.deep.equals({ Ref: "TestauthApiGatewayAuthorizermyAlias" }),
					expect(template)
						.to.have.a.nested.property("Resources.ApiGatewayMethodFunc1Get.DependsOn")
							.that.equals("TestauthApiGatewayAuthorizermyAlias"),
					expect(template)
						.to.have.a.nested.property('Resources.TestauthApiGatewayAuthorizermyAlias.Properties.AuthorizerUri')
							.that.deep.equals({
								"Fn::Join": [
									"",
									[
										"arn:aws:apigateway:",
										{
											"Ref": "AWS::Region"
										},
										":lambda:path/2015-03-31/functions/",
										"arn:aws:lambda:us-east-1:",
										{
											"Ref": "AWS::AccountId"
										},
										":function:custom-auth",
										"/invocations"
									]
								]}),
					expect(compiledAliasTemplate)
						.to.have.a.nested.property('Resources.TestauthLambdaPermissionApiGateway.DependsOn')
							.that.is.empty
				]));
			});

			it('should support externally referenced custom authorizers with Pseudo Parameters', () => {
				stackTemplate = _.cloneDeep(require('../data/auth-stack-2.json'));
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template)
						.to.have.a.nested.property("Resources.ApiGatewayMethodFunc2Get.Properties.AuthorizerId")
							.that.deep.equals({ Ref: "PseudoParamCustomAuthApiGatewayAuthorizermyAlias" }),
					expect(template)
						.to.have.a.nested.property("Resources.ApiGatewayMethodFunc2Get.DependsOn")
							.that.equals("PseudoParamCustomAuthApiGatewayAuthorizermyAlias"),
					expect(template)
					.to.have.a.nested.property('Resources.PseudoParamCustomAuthApiGatewayAuthorizermyAlias.Properties.AuthorizerUri')
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
											"Fn::Sub": "arn:aws:lambda:us-east-1:${AWS::AccountId}:function:custom-auth"
										},
										"/invocations"
									]
								]}),
				]));

			});

			it('should move base mappings to alias stack', () => {
				stackTemplate = _.cloneDeep(require('../data/auth-stack-2.json'));
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(()=> BbPromise.all([
					expect(template)
						.to.not.have.a.nested.property('Resources.pathmapping'),
					expect(aliasTemplate)
						.to.have.a.nested.property('Resources.pathmapping')
							.that.deep.equals({
								Type: 'AWS::ApiGateway::BasePathMapping',
								Properties: {
									BasePath: '(none)',
									DomainName: 'example.com',
									RestApiId: { 'Fn::ImportValue': 'testService-myStage-ApiGatewayRestApi' },
									Stage: { Ref: 'ApiGatewayStage' }
								}
							})
				]));
			});

			it('should transform string dependencies and references to authorizers', () => {
				const template = serverless.service.provider.compiledCloudFormationTemplate = stackTemplate;
				serverless.service.provider.compiledCloudFormationAliasTemplate = aliasTemplate;
				return expect(awsAlias.aliasHandleApiGateway({}, [], {})).to.be.fulfilled
				.then(() => BbPromise.all([
					expect(template)
						.to.have.a.nested.property("Resources.ApiGatewayMethodFunc1Get.Properties.AuthorizerId")
							.that.deep.equals({ Ref: "TestauthApiGatewayAuthorizermyAlias" }),
					expect(template)
						.to.have.a.nested.property("Resources.ApiGatewayMethodFunc1Get.DependsOn")
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
						.to.have.a.nested.property("Resources.ApiGatewayMethodFunc1Get.DependsOn")
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
						.to.have.a.nested.property("Resources.TestauthApiGatewayAuthorizermyAlias.Properties.AuthorizerResultTtlInSeconds")
							.that.equals(100),
					expect(serverless).to.not.have.a.nested.property('service.resources.Resources.TestauthApiGatewayAuthorizer'),
				]));
			});
		});
	});
});
