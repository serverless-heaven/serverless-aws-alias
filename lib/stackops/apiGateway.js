'use strict';

/**
 * Handle APIG resources.
 * Keep all resources that are used somewhere and remove the ones that are not
 * referenced anymore.
 */

const _ = require('lodash');
const BbPromise = require('bluebird');

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
			const stageResource = {
				Type: 'AWS::ApiGateway::Stage',
				Properties: {
					StageName: this._alias,
					DeploymentId: {
						Ref: deploymentName
					},
					RestApiId: {
						'Fn::ImportValue': `${stackName}-ApiGatewayRestApi`
					},
					Variables: {
						SERVERLESS_ALIAS: this._alias,
						SERVERLESS_STAGE: this._stage
					}
				},
				DependsOn: [ deploymentName ]
			};
			aliasResources.push({ ApiGatewayStage: stageResource });

		}

		// Fetch lambda permissions, methods and resources. These have to be updated later to allow the aliased functions.
		const apiLambdaPermissions = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::Lambda::Permission' ]));
		const apiMethods = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Method' ]));
		//const apiResources = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Resource' ]));
		const aliases = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Alias' ]));
		const versions = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Version' ]));

		// Adjust method API and target function
		_.forOwn(apiMethods, (method, name) => {

			// Relink to function alias in case we have a lambda endpoint
			if (_.includes([ 'AWS', 'AWS_PROXY' ], _.get(method, 'Properties.Integration.Type'))) {
				// For methods it is a bit tricky to find the related function name. There is no direct link.
				const uriParts = method.Properties.Integration.Uri['Fn::Join'][1];
				const funcIndex = _.findIndex(uriParts, part => _.has(part, 'Fn::GetAtt'));

				uriParts.splice(funcIndex + 1, 0, `:${this._alias}`);
			}

			// Check for user resource overrides
			if (_.has(userResources.Resources, name)) {
				_.merge(method, userResources.Resources[name]);
				delete userResources.Resources[name];
			}

			stageStack.Resources[name] = method;
		});

		// Adjust permission to reference the function aliases
		_.forOwn(apiLambdaPermissions, (permission, name) => {
			const functionName = _.replace(name, /LambdaPermissionApiGateway$/, '');
			const versionName = _.find(_.keys(versions), version => _.startsWith(version, functionName));
			const aliasName = _.find(_.keys(aliases), alias => _.startsWith(alias, functionName));

			// Adjust references and alias permissions
			permission.Properties.FunctionName = { Ref: aliasName };
			permission.Properties.SourceArn = {
				'Fn::Join': [
					'',
					[
						'arn:aws:execute-api:',
						{ Ref: 'AWS::Region' },
						':',
						{ Ref: 'AWS::AccountId' },
						':',
						{ 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi` },
						'/*/*'
					]
				]
			};

			// Add dependency on function version
			permission.DependsOn = [ versionName, aliasName ];

			delete stageStack.Resources[name];
		});

		// Add all alias stack owned resources
		aliasResources.push(apiLambdaPermissions);

	}

	_.forEach(aliasResources, resource => _.assign(aliasStack.Resources, resource));

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
