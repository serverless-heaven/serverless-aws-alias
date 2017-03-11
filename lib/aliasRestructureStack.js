'use strict';
/**
 * Rebuild the stack structure.
 * ===========================
 * This enables us to deploy different function/resource sets per alias, e.g.
 * if a developer wants to deploy his very own branch as an alias.
 * We also have to retrieve the currently deployed stack template to
 * check for functions that might have been deleted in all other alias
 * stacks, or ones that have been added in the current alias stack.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const utils = require('./utils');

/**
 * Merge template definitions that are still in use into the new template
 * @param stackName {String} Main stack name
 * @param newTemplate {Object} New main stack template
 * @param currentTemplate {Object} Currently deployed main stack template
 * @param aliasStackTemplates {Array<Object>} Currently deployed and references aliases
 */
function mergeAliases(stackName, newTemplate, currentTemplate, aliasStackTemplates) {

	// Get all referenced function logical resource ids
	const aliasedFunctions =
		_.flatMap(
			aliasStackTemplates,
			template => _.compact(_.map(
				template.Resources,
				(resource, name) => {
					if (resource.Type === 'AWS::Lambda::Alias') {
						return {
							name: _.replace(name, /Alias$/, 'LambdaFunction'),
							version: _.replace(_.get(resource, 'Properties.FunctionVersion.Fn::ImportValue'), `${stackName}-`, '')
						};
					}
					return null;
				}
			))
		);

	// Get currently deployed function definitions and versions and retain them in the stack update
	const usedFunctionElements = {
		Resources: _.map(aliasedFunctions, aliasedFunction => _.assign(
				{},
				_.pick(currentTemplate.Resources, [ aliasedFunction.name, aliasedFunction.version ])
			)),
		Outputs: _.map(aliasedFunctions, aliasedFunction => _.assign(
				{},
				_.pick(currentTemplate.Outputs, [ `${aliasedFunction.name}Arn`, aliasedFunction.version ])
			))
	};

	_.forEach(usedFunctionElements.Resources, resources => _.defaults(newTemplate.Resources, resources));
	_.forEach(usedFunctionElements.Outputs, outputs => _.defaults(newTemplate.Outputs, outputs));

}

module.exports = {

	aliasHandleFunctions(currentTemplate, aliasStackTemplates) {

		this.options.verbose && this._serverless.cli.log('Processing functions');

		const stackName = this._provider.naming.getStackName();
		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

		/**
		 * Add the stage stack reference to the alias stack.
		 * This makes sure that the stacks are linked together.
		 */
		aliasStack.Outputs.ServerlessAliasReference = {
			Description: 'Alias stack reference.',
			Value: {
				'Fn::ImportValue': `${this._provider.naming.getStackName()}-ServerlessAliasReference`
			}
		};


		const versions = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::Lambda::Version' ]));
		if (!_.isEmpty(versions)) {

			// The alias stack will be the owner of the versioned functions
			_.forOwn(versions, (version, versionName) => {

				const functionName = _.replace(_.get(version, 'Properties.FunctionName.Ref'), /LambdaFunction$/, '');

				// Remove the function version export
				delete stageStack.Outputs[`${functionName}LambdaFunctionQualifiedArn`];

				// Add function Arn export to stage stack
				stageStack.Outputs[`${functionName}LambdaFunctionArn`] = {
					Description: 'Function Arn',
					Value: { 'Fn::GetAtt': [ `${functionName}LambdaFunction`, 'Arn' ] },  // Ref: `${name}LambdaFunction` }
					Export: {
						Name: `${stackName}-${functionName}-LambdaFunctionArn`
					}
				};

				// Reference correct function name in version
				version.Properties.FunctionName = { 'Fn::ImportValue': `${stackName}-${functionName}-LambdaFunctionArn` };
				// With alias support we do not want to retain the versions
				version.DeletionPolicy = 'Delete';

				// Add alias to alias stack. Reference the version export in the stage stack
				// to prevent version deletion.
				const alias = {
					Type: 'AWS::Lambda::Alias',
					Properties: {
						Description: _.get(stageStack.Resources, `${functionName}LambdaFunction.Properties.Description`),
						FunctionName: {
							'Fn::ImportValue': `${stackName}-${functionName}-LambdaFunctionArn`
						},
						FunctionVersion: { 'Fn::GetAtt': [ versionName, 'Version' ] },
						Name: this._alias
					},
					DependsOn: [
						versionName
					]
				};

				aliasStack.Resources[`${functionName}Alias`] = alias;

				delete stageStack.Resources[versionName];
			});

			_.assign(aliasStack.Resources, versions);
		}

		// Merge function aliases and versions
		mergeAliases(stackName, stageStack, currentTemplate, aliasStackTemplates);

		// FIXME: Resource handling
		// mergeResources()

		// Promote the parsed templates to the promise chain.
		return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
	},

	aliasHandleApiGateway(currentTemplate, aliasStackTemplates) {

		const stackName = this._provider.naming.getStackName();
		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

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

			// Move the API deployment into the alias stack. The alias is the owner of the APIG stage.
			const deployment = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Deployment' ]));
			if (!_.isEmpty(deployment)) {
				const deploymentName = _.keys(deployment)[0];
				const obj = deployment[deploymentName];
				obj.Properties.StageName = this._alias;
				obj.Properties.RestApiId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi` };
				aliasResources.push(deployment);
				delete stageStack.Resources[deploymentName];
			}

			// Fetch lambda permissions, methods and resources. These have to be updated later to allow the aliased functions.
			const apiLambdaPermissions = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::Lambda::Permission' ]));
			const apiMethods = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Method' ]));
			const apiResources = _.assign({}, _.pickBy(stageStack.Resources, [ 'Type', 'AWS::ApiGateway::Resource' ]));
			const aliases = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Alias' ]));
			const versions = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Version' ]));

			// Adjust resources
			_.forOwn(apiResources, (resource, name) => {
				resource.Properties.RestApiId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi` };
				// Check parent id. If it references the API root, use the imported api root resource id.
				if (_.has(resource, 'Properties.ParentId.Fn::GetAtt') && resource.Properties.ParentId['Fn::GetAtt'][0] === 'ApiGatewayRestApi') {
					resource.Properties.ParentId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApiRootResource` };
				}

				delete stageStack.Resources[name];
			});

			// Adjust method API and target function
			_.forOwn(apiMethods, (method, name) => {

				// Relink to function alias in case we have a lambda endpoint
				if (_.includes([ 'AWS', 'AWS_PROXY' ], _.get(method, 'Properties.Integration.Type'))) {
					// For methods it is a bit tricky to find the related function name. There is no direct link.
					const uriParts = method.Properties.Integration.Uri['Fn::Join'][1];
					const funcIndex = _.findIndex(uriParts, part => _.has(part, 'Fn::GetAtt'));
					const functionName = uriParts[funcIndex]['Fn::GetAtt'][0].replace(/LambdaFunction$/, '');
					const aliasName = _.find(_.keys(aliases), alias => _.startsWith(alias, functionName));

					uriParts[funcIndex] = { Ref: aliasName };
				}

				method.Properties.RestApiId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi` };

				delete stageStack.Resources[name];
			});

			// Adjust permission to reference the function aliases
			_.forOwn(apiLambdaPermissions, (permission, name) => {
				const functionName = name.replace(/LambdaPermissionApiGateway$/, '');
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
			aliasResources.push(apiResources);
			aliasResources.push(apiMethods);
			aliasResources.push(apiLambdaPermissions);

		}

		_.forEach(aliasResources, resource => _.assign(aliasStack.Resources, resource));

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
	},

	aliasHandleUserResources(currentTemplate, aliasStackTemplates) {

		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;
		const userResources = _.get(this._serverless.service, 'resources', { Resources: {}, Outputs: {} });

		this.options.verbose && this._serverless.cli.log('Processing custom resources');

		// Retrieve all resources referenced from other aliases
		const aliasDependencies = _.reduce(aliasStackTemplates, (result, template) => {
			try {
				const resourceRefs = JSON.parse(_.get(template, 'Outputs.AliasResources.Value', "[]"));
				const outputRefs = JSON.parse(_.get(template, 'Outputs.AliasOutputs.Value', "[]"));
				const resources = _.assign({}, _.pick(_.get(currentTemplate, 'Resources'), resourceRefs, {}));
				const outputs = _.assign({}, _.pick(_.get(currentTemplate, 'Outputs'), outputRefs, {}));

				// Check if there are IAM policy references for the alias resources and integrate them into
				// the lambda policy.

				_.assign(result.Resources, resources);
				_.assign(result.Outputs, outputs);
				return result;
			} catch (e) {
				return result;
			}
		}, { Resources: {}, Outputs: {} });

		// Logical resource ids are unique per stage
		// Alias stacks reference the used resources through an Output reference
		// On deploy, the plugin checks if a resource is already deployed from a stack
		//   and does a validation of the resource properties
		// All used resources are copied from the current template

		// Extract the user resources that are not overrides of existing Serverless resources
		const currentResources =
			_.assign({},
				_.omitBy(_.get(userResources, 'Resources', {}), (value, name) => _.includes(_.keys(stageStack.Resources), name)));

		const currentOutputs = _.get(userResources, 'Outputs', {});

		// Add the alias resources as output to the alias stack
		aliasStack.Outputs.AliasResources = {
			Description: 'Custom resource references',
			Value: JSON.stringify(_.keys(currentResources))
		};

		// Add the outputs as output to the alias stack
		aliasStack.Outputs.AliasOutputs = {
			Description: 'Custom output references',
			Value: JSON.stringify(_.keys(currentOutputs))
		};

		// FIXME: Deployments to the master (stage) alias should be allowed to reconfigure
		//        resources and outputs. Otherwise a "merge" of feature branches into a
		//        release branch would not be possible as resources would be rendered
		//        immutable otherwise.

		// Check if the resource is already used anywhere else with a different definition
		_.forOwn(currentResources, (resource, name) => {
			if (_.has(aliasDependencies.Resources, name) && !_.isMatch(aliasDependencies.Resources[name], resource)) {

				// If we deploy the master alias, allow reconfiguration of resources
				if (this._alias === this._stage && resource.Type === aliasDependencies.Resources[name].Type) {
					this._serverless.cli.log(`Reconfigure resource ${name}. Remember to update it in other aliases too.`);
				} else {
					return BbPromise.reject(new Error(`Resource ${name} is already deployed in another alias with a different configuration. Either you change your resource to match the other definition, or you change the logical resource id to deploy your resource separately.`));
				}
			}
		});

		// Check if the output is already used anywhere else with a different definition
		_.forOwn(currentOutputs, (output, name) => {
			if (_.has(aliasDependencies.Outputs, name) && !_.isMatch(aliasDependencies.Outputs[name], output)) {
				if (this._alias === this._stage) {
					this._serverless.cli.log(`Reconfigure output ${name}. Remember to update it in other aliases too.`);
				} else {
					return BbPromise.reject(new Error(`Output ${name} is already deployed in another alias with a different configuration. Either you change your output to match the other definition, or you change the logical resource id to deploy your output separately.`));
				}
			}
		});

		// Merge used alias resources and outputs into the stage
		_.defaults(stageStack.Resources, aliasDependencies.Resources);
		_.defaults(stageStack.Outputs, aliasDependencies.Outputs);

		//console.log(JSON.stringify(aliasDependencies, null, 2));
		//throw new Error('iwzgeiug');

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
	},

	/**
	 * Merge alias and current stack policies, so that all alias policy statements
	 * are present and active
	 */
	aliasHandleLambdaRole(currentTemplate, aliasStackTemplates) {

		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		let stageRolePolicies = _.get(stageStack, 'Resources.IamRoleLambdaExecution.Properties.Policies', []);
		let currentRolePolicies = _.get(currentTemplate, 'Resources.IamRoleLambdaExecution.Properties.Policies', []);

		// Older serverless versions (<1.7.0) do not use a inline policy.
		if (_.isEmpty(currentRolePolicies.length) && _.has(currentTemplate, 'Resources.IamPolicyLambdaExecution')) {
			this._serverless.cli.log('WARNING: Project created with SLS < 1.7.0. Using resources from policy.');
			currentRolePolicies = [ _.get(currentTemplate, 'Resources.IamPolicyLambdaExecution.Properties') ];
		}
		if (_.isEmpty(stageRolePolicies.length) && _.has(stageStack, 'Resources.IamPolicyLambdaExecution')) {
			stageRolePolicies = [ _.get(stageStack, 'Resources.IamPolicyLambdaExecution.Properties') ];
		}

		// For now we only merge the first policy document and exit if SLS changes this behavior.
		if (stageRolePolicies.length !== 1 || currentRolePolicies.length !== 1) {
			return BbPromise.reject(new Error('Policy count should be 1! Please report this error to the alias plugin owner.'));
		}

		const stageRolePolicyStatements = _.get(stageRolePolicies[0], 'PolicyDocument.Statement', []);
		const currentRolePolicyStatements = _.get(currentRolePolicies[0], 'PolicyDocument.Statement', []);

		_.forEach(currentRolePolicyStatements, statement => {
			// Check if there is already a statement with the same actions and effect.
			const sameStageStatement = _.find(stageRolePolicyStatements, value => value.Effect === statement.Effect &&
				value.Action.length === statement.Action.length &&
				_.every(value.Action, action => _.includes(statement.Action, action)));

			if (sameStageStatement) {
				// Merge the resources
				sameStageStatement.Resource = _.unionWith(sameStageStatement.Resource, statement.Resource, (a,b) => _.isMatch(a,b));
			} else {
				// Add the different statement
				stageRolePolicyStatements.push(statement);
			}
		});

		// Insert statement dependencies
		const dependencies = _.reject((() => {
			const result = [];
			const stack = [ _.first(stageRolePolicyStatements) ];
			while (!_.isEmpty(stack)) {
				const statement = stack.pop();

				_.forOwn(statement, (value, key) => {
					if (key === 'Ref') {
						result.push(value);
					} else if (key === 'Fn::GetAtt') {
						result.push(value[0]);
					} else if (_.isObject(value)) {
						stack.push(value);
					}
				});
			}
			return result;
		})(), dependency => _.has(stageStack.Resources, dependency));

		_.forEach(dependencies, dependency => {
			stageStack.Resources[dependency] = currentTemplate.Resources[dependency];
		});

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
	},

	aliasHandleEvents(currentTemplate, aliasStackTemplates) {

		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

		const subscriptions = _.assign({}, _.pickBy(_.get(stageStack, 'Resources', {}), [ 'Type', 'AWS::Lambda::EventSourceMapping' ]));

		_.forOwn(subscriptions, (subscription, name) => {
			// Reference alias as FunctionName
			const functionNameRef = utils.findAllReferences(_.get(subscription, 'Properties.FunctionName'));
			const functionName = _.get(functionNameRef, '[0].ref', '').replace(/LambdaFunction$/, '');
			if (_.isEmpty(functionName)) {
				// FIXME: Can this happen at all?
				this._serverless.cli.log(`Strange thing: No function name defined for ${name}`);
				return;
			}

			subscription.Properties.FunctionName = { Ref: `${functionName}Alias` };
			subscription.DependsOn = [ `${functionName}Alias` ];

			// Remove mapping from stage stack
			delete stageStack.Resources[name];
		});

		// Move event subscriptions to alias stack
		_.defaults(aliasStack.Resources, subscriptions);

		// Forward inputs to the promise chain
		return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
	},

	aliasRestructureStack(currentTemplate, aliasStackTemplates) {

		this._serverless.cli.log('Preparing aliase ...');

		if (_.isEmpty(aliasStackTemplates) && this._stage !== this._alias) {
			throw new this._serverless.classes.Error(new Error('You have to deploy the master alias at least once with "serverless deploy"'));
		}

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]).bind(this)
		.spread(this.aliasHandleUserResources)
		.spread(this.aliasHandleLambdaRole)
		.spread(this.aliasHandleFunctions)
		.spread(this.aliasHandleApiGateway)
		.spread(this.aliasHandleEvents)
		.then(() => BbPromise.resolve());
	}

};
