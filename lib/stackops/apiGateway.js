'use strict';

/**
 * Handle APIG resources.
 * Keep all resources that are used somewhere and remove the ones that are not
 * referenced anymore.
 */

const _ = require('lodash');
const BbPromise = require('bluebird');
const utils = require('../utils');

const stageMethodConfigMappings = {
	cacheDataEncrypted: { prop: 'CacheDataEncrypted', validate: _.isBoolean, default: false },
	cacheTtlInSeconds: { prop: 'CacheTtlInSeconds', validate: _.isInteger },
	cachingEnabled: { prop: 'CachingEnabled', validate: _.isBoolean, default: false },
	dataTraceEnabled: { prop: 'DataTraceEnabled', validate: _.isBoolean, default: false },
	loggingLevel: { prop: 'LoggingLevel', validate: value => _.includes([ 'OFF', 'INFO', 'ERROR' ], value), default: 'OFF' },
	metricsEnabled: { prop: 'MetricsEnabled', validate: _.isBoolean, default: false },
	throttlingBurstLimit: { prop: 'ThrottlingBurstLimit', validate: _.isInteger },
	throttlingRateLimit: { prop: 'ThrottlingRateLimit', validate: _.isNumber }
};

/**
 * Namespace for APIG processing internal functions
 */
const internal = {
	/**
	 * Creates a stage resource and configures it depending on the project settings.
	 * @this The current instance of the alias plugin
	 * @param restApiRef {String} Stack reference to rest API id
	 * @param deploymentName {String} Current deployment.
	 * @returns {Object} - AWS::ApiGateway::Stage
	 */
	createStageResource(restApiRef, deploymentName) {
		// Create stage resource
		const stageResource = {
			Type: 'AWS::ApiGateway::Stage',
			Properties: {
				StageName: _.replace(this._alias, /-/g, '_'),
				DeploymentId: {
					Ref: deploymentName
				},
				RestApiId: {
					'Fn::ImportValue': restApiRef
				},
				Variables: {
					SERVERLESS_ALIAS: this._alias,
					SERVERLESS_STAGE: this._stage
				}
			},
			DependsOn: [ deploymentName ]
		};

		// Set a reasonable description
		const serviceName = _.get(this.serverless.service.getServiceObject() || {}, 'name');
		stageResource.Properties.Description = `Alias stage '${this._alias}' for ${serviceName}`;

		// Configure stage (service level)
		const serviceLevelConfig = _.cloneDeep(_.get(this.serverless.service, 'provider.aliasStage', {}));
		if (serviceLevelConfig.cacheClusterEnabled === true) {
			stageResource.Properties.CacheClusterEnabled = true;
			if (_.has(serviceLevelConfig, 'cacheClusterSize')) {
				stageResource.Properties.CacheClusterSize = serviceLevelConfig.cacheClusterSize;
			}
		}
		delete serviceLevelConfig.cacheClusterEnabled;
		delete serviceLevelConfig.cacheClusterSize;

		// Configure methods/functions
		const methodSettings = [];
		const functions = this.serverless.service.getAllFunctions();
		_.forEach(functions, funcName => {
			const func = this.serverless.service.getFunction(funcName);
			const funcStageConfig = _.defaults({}, func.aliasStage, serviceLevelConfig);
			const funcHttpEvents = _.compact(_.map(this.serverless.service.getAllEventsInFunction(funcName), event => event.http));

			_.forEach(funcHttpEvents, httpEvent => {
				const eventStageConfig = _.defaults({}, httpEvent.aliasStage, funcStageConfig);
				if (!_.isEmpty(eventStageConfig)) {
					const methodType = _.toUpper(httpEvent.method);
					const methodSetting = {};
					const methods = methodType === 'ANY' ? [
						'DELETE',
						'GET',
						'HEAD',
						'OPTIONS',
						'PATCH',
						'POST',
						'PUT'
					]: [ methodType ];

					_.forOwn(eventStageConfig, (value, key) => {
						if (!_.has(stageMethodConfigMappings, key)) {
							throw new this.serverless.classes.Error(`Invalid stage config '${key}' at method '${methodType} /${httpEvent.path}'`);
						} else if (!stageMethodConfigMappings[key].validate(value)) {
							throw new this.serverless.classes.Error(`Invalid value for stage config '${key}: ${value}' at method '${methodType} /${httpEvent.path}'`);
						}
						if (!_.has(stageMethodConfigMappings[key], 'default') || stageMethodConfigMappings[key].default !== value) {
							methodSetting[stageMethodConfigMappings[key].prop] = value;
						}
					});
					if (!_.isEmpty(methodSetting)) {
						methodSetting.ResourcePath = '/' + _.replace('/' + _.trimStart(httpEvent.path, '/'), /\//g, '~1');
						_.forEach(methods, method => {
							methodSetting.HttpMethod = method;
							methodSettings.push(_.clone(methodSetting));
						});
					}
				}
			});
		});

		if (!_.isEmpty(methodSettings)) {
			stageResource.Properties.MethodSettings = methodSettings;
		}

		return stageResource;
	}
};

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
	const stackName = this._provider.naming.getStackName();
	const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
	const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;
	const userResources = _.get(this._serverless.service, 'resources', { Resources: {}, Outputs: {} });

	// Check if our current deployment includes an API deployment
	let exposeApi = _.includes(_.keys(stageStack.Resources), 'ApiGatewayRestApi');
	const aliasResources = [];

	if (!exposeApi) {
		// Check if we have any aliases deployed that reference the API.
		if (_.some(aliasStackTemplates, template => _.find(template.Resources, [ 'Type', 'AWS::ApiGateway::Deployment' ]))) {
			// Fetch the Api resource from the current stack
			stageStack.Resources.ApiGatewayRestApi = currentTemplate.Resources.ApiGatewayRestApi;
			exposeApi = true;
		}
	}

	if (exposeApi) {

		this.options.verbose && this._serverless.cli.log('Processing API');

		// Export the API for the alias stacks
		stageStack.Outputs.ApiGatewayRestApi = {
			Description: 'API Gateway API',
			Value: { Ref: 'ApiGatewayRestApi' },
			Export: {
				Name: `${stackName}-ApiGatewayRestApi`
			}
		};

		// Export the root resource for the API
		stageStack.Outputs.ApiGatewayRestApiRootResource = {
			Description: 'API Gateway API root resource',
			Value: { 'Fn::GetAtt': [ 'ApiGatewayRestApi', 'RootResourceId' ] },
			Export: {
				Name: `${stackName}-ApiGatewayRestApiRootResource`
			}
		};

		// FIXME: Upgrade warning. Should be removed after some time has passed.
		if (_.some(_.reduce(aliasStackTemplates, (result, template) => {
			_.merge(result, template.Resources);
			return result;
		}, {}), [ 'Type', 'AWS::ApiGateway::Method' ]) ||
			_.find(currentAliasStackTemplate.Resources, [ 'Type', 'AWS::ApiGateway::Method' ])) {
			throw new this._serverless.classes.Error('ALIAS PLUGIN ALPHA CHANGE: APIG deployment had to be changed. Please remove the alias stacks and the APIG stage for the alias in CF (AWS console) and redeploy. Sorry!');
		}

		// Move the API deployment into the alias stack. The alias is the owner of the APIG stage.
		const deployment = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Deployment' ]));
		if (!_.isEmpty(deployment)) {
			const deploymentName = _.keys(deployment)[0];
			const obj = deployment[deploymentName];

			delete obj.Properties.StageName;
			obj.Properties.RestApiId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi` };
			obj.DependsOn = [];

			aliasResources.push(deployment);
			delete stageStack.Resources[deploymentName];

			// Create stage resource
			this.options.verbose && this._serverless.cli.log('Configuring stage');
			const stageResource = internal.createStageResource.call(this, `${stackName}-ApiGatewayRestApi`, deploymentName);
			aliasResources.push({ ApiGatewayStage: stageResource });

			const baseMapping = _.assign({}, _.pickBy(stageStack.Resources, ['Type', 'AWS::ApiGateway::BasePathMapping']));
			if (!_.isEmpty(baseMapping)) {
				const baseMappingName = _.keys(baseMapping)[0];
				const obj = baseMapping[baseMappingName];

				obj.Properties.Stage = { Ref: 'ApiGatewayStage' };
				obj.Properties.RestApiId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi`};

				aliasResources.push(baseMapping);
				delete stageStack.Resources[baseMappingName];
			}
		}

		// Fetch lambda permissions, methods and resources. These have to be updated later to allow the aliased functions.
		const apiLambdaPermissions =
				_.assign({},
					_.pickBy(_.pickBy(stageStack.Resources, [ 'Type', 'AWS::Lambda::Permission' ]),
						permission => utils.hasPermissionPrincipal(permission, 'apigateway')));

		const apiMethods = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Method' ]));
		const authorizers = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Authorizer' ]));
		const aliases = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Alias' ]));
		const versions = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Version' ]));

		// Adjust method API and target function
		_.forOwn(apiMethods, (method, name) => {
			// Relink to function alias in case we have a lambda endpoint
			if (_.includes([ 'AWS', 'AWS_PROXY' ], _.get(method, 'Properties.Integration.Type'))) {
				// For methods it is a bit tricky to find the related function name. There is no direct link.
				const uriParts = method.Properties.Integration.Uri['Fn::Join'][1];
				const funcIndex = _.findIndex(uriParts, part => _.has(part, 'Fn::GetAtt'));

				// Use the SERVERLESS_ALIAS stage variable to determine the called function alias
				uriParts.splice(funcIndex + 1, 0, ':${stageVariables.SERVERLESS_ALIAS}');
			}

			// Check for user resource overrides
			if (_.has(userResources.Resources, name)) {
				_.merge(method, userResources.Resources[name]);
				delete userResources.Resources[name];
			}

			stageStack.Resources[name] = method;
		});

		// Audjust authorizer Uri and name (stage variables are not allowed in Uris here)
		const isExternalRefAuthorizerPredicate = part => _.startsWith(part, 'arn:aws:lambda') ||
			(_.has(part, 'Fn::Sub') && _.startsWith(part['Fn::Sub'], 'arn:aws:lambda'));
		_.forOwn(authorizers, (authorizer, name) => {
			const authorizerType = _.get(authorizer, 'Properties.Type');
			if (authorizerType === 'TOKEN' || authorizerType === 'REQUEST') {
				const uriParts = authorizer.Properties.AuthorizerUri['Fn::Join'][1];
				const isExternalRefAuthorizer = _.some(uriParts, isExternalRefAuthorizerPredicate);
				if (!isExternalRefAuthorizer) {
					const funcIndex = _.findIndex(uriParts, part => _.startsWith(part, '/invocations'));
					uriParts.splice(funcIndex , 0, ':${stageVariables.SERVERLESS_ALIAS}');
				}
			}

			authorizer.Properties.Name = `${authorizer.Properties.Name}-${this._alias}`;

			// Check for user resource overrides
			if (_.has(userResources.Resources, name)) {
				_.merge(authorizer, userResources.Resources[name]);
				delete userResources.Resources[name];
			}

			const aliasedName = `${name}${_.replace(this._alias, /-/g, 'Dash')}`;
			const authorizerRefs = utils.findReferences(stageStack.Resources, name);
			_.forEach(authorizerRefs, ref => {
				_.set(stageStack.Resources, ref, { Ref: aliasedName });
			});

			// Replace dependencies
			_.forOwn(stageStack.Resources, resource => {
				if (_.isString(resource.DependsOn) && resource.DependsOn === name) {
					resource.DependsOn = aliasedName;
				} else if (_.isArray(resource.DependsOn) && _.includes(resource.DependsOn, name)) {
					resource.DependsOn = _.without(resource.DependsOn, name);
					resource.DependsOn.push(aliasedName);
				}
			});

			// Rename authorizer to be unique per alias
			stageStack.Resources[aliasedName] = authorizer;
			delete stageStack.Resources[name];
		});

		// Adjust permission to reference the function aliases
		_.forOwn(apiLambdaPermissions, (permission, name) => {
			const functionName = _.replace(name, /LambdaPermissionApiGateway$/, '');

			const versionName = utils.getFunctionVersionName(versions, functionName);
			const aliasName = utils.getAliasVersionName(aliases, functionName);
			const isExternalRef = isExternalRefAuthorizerPredicate(permission.Properties.FunctionName);

			// Adjust references and alias permissions
			if (!isExternalRef) {
				permission.Properties.FunctionName = { Ref: aliasName };
			}
			if (permission.Properties.SourceArn) {
				// Authorizers do not set the SourceArn property
				permission.Properties.SourceArn = {
					'Fn::Join': [
						'',
						[
							'arn:',
							{ Ref: 'AWS::Partition' },
							':execute-api:',
							{ Ref: 'AWS::Region' },
							':',
							{ Ref: 'AWS::AccountId' },
							':',
							{ 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi` },
							'/*/*'
						]
					]
				};
			}

			// Add dependency on function version
			if (!isExternalRef) {
				permission.DependsOn = [ versionName, aliasName ];
			} else {
				permission.DependsOn = _.compact([ versionName, aliasName ]);
			}

			delete stageStack.Resources[name];
		});

		// Add all alias stack owned resources
		aliasResources.push(apiLambdaPermissions);

	}

	_.forEach(aliasResources, resource => _.assign(aliasStack.Resources, resource));

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};

// Exports to make internal functions available for unit tests
module.exports.internal = internal;
