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
function mergeAliases(stackName, newTemplate, currentTemplate, aliasStackTemplates, currentAliasStackTemplate, removedResources) {

	const allAliasTemplates = _.concat(aliasStackTemplates, currentAliasStackTemplate);

	// Get all referenced function logical resource ids
	const aliasedFunctions =
		_.flatMap(
			allAliasTemplates,
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

	// Set references to obsoleted resources in fct env to "REMOVED" in case
	// the alias that is removed was the last deployment of the stage.
	// This will change the function definition, but that does not matter
	// as is is neither aliased nor versioned
	_.forEach(_.filter(newTemplate.Resources,  [ 'Type', 'AWS::Lambda::Function' ]), func => {
		const refs = utils.findReferences(func, removedResources);
		_.forEach(refs, ref => _.set(func, ref, "REMOVED"));
	});

}

module.exports = {

	aliasInit: require('./stackops/init'),

	aliasHandleFunctions(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

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
		mergeAliases(stackName, stageStack, currentTemplate, aliasStackTemplates, currentAliasStackTemplate, this.removedResourceKeys);

		// FIXME: Resource handling
		// mergeResources()

		// Promote the parsed templates to the promise chain.
		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	aliasHandleApiGateway(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

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

				// If the method is located on the root resource, set the parent correctly
				if (_.has(method, 'Properties.ResourceId.Fn::GetAtt') && method.Properties.ResourceId['Fn::GetAtt'][0] === 'ApiGatewayRestApi') {
					method.Properties.ResourceId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApiRootResource` };
				}

				method.Properties.RestApiId = { 'Fn::ImportValue': `${stackName}-ApiGatewayRestApi` };

				// Check for user resource overrides
				if (_.has(userResources.Resources, name)) {
					_.merge(method, userResources.Resources[name]);
					delete userResources.Resources[name];
				}

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

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	aliasHandleUserResources: require('./stackops/userResources'),

	/**
	 * Merge alias and current stack policies, so that all alias policy statements
	 * are present and active
	 */
	aliasHandleLambdaRole(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;
		let stageRolePolicies = _.get(stageStack, 'Resources.IamRoleLambdaExecution.Properties.Policies', []);
		let currentRolePolicies = _.get(currentTemplate, 'Resources.IamRoleLambdaExecution.Properties.Policies', []);

		// Older serverless versions (<1.7.0) do not use a inline policy.
		if (_.isEmpty(currentRolePolicies) && _.has(currentTemplate, 'Resources.IamPolicyLambdaExecution')) {
			this._serverless.cli.log('WARNING: Project created with SLS < 1.7.0. Using resources from policy.');
			currentRolePolicies = [ _.get(currentTemplate, 'Resources.IamPolicyLambdaExecution.Properties') ];
		}
		if (_.isEmpty(stageRolePolicies) && _.has(stageStack, 'Resources.IamPolicyLambdaExecution')) {
			stageRolePolicies = [ _.get(stageStack, 'Resources.IamPolicyLambdaExecution.Properties') ];
		}

		// There can be a service role defined. In this case there is no embedded IAM role.
		if (_.has(this._serverless.service.provider, 'role')) {
			// Use the role if any of the aliases reference it
			if (!_.isEmpty(currentRolePolicies) &&
				_.some(aliasStackTemplates, template => !template.Outputs.AliasFlags.Value.hasRole)) {
				stageStack.Reosurces.IamRoleLambdaExecution = _.cloneDeep(currentTemplate.Resources.IamRoleLambdaExecution);
			}

			aliasStack.Outputs.AliasFlags.Value.hasRole = true;

			return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
		}

		// For now we only merge the first policy document and exit if SLS changes this behavior.
		if (stageRolePolicies.length !== 1) {
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
				sameStageStatement.Resource = _.uniqWith(_.concat(sameStageStatement.Resource, statement.Resource), (a,b) => _.isEqual(a,b));
			} else {
				// Add the different statement
				stageRolePolicyStatements.push(statement);
			}
		});

		// Remove all resource references of removed resources
		const voidResourceRefs = utils.findReferences(stageRolePolicyStatements, this.removedResourceKeys);
		const voidResourcePtrs = _.compact(_.map(voidResourceRefs, ref => {
			const ptrs = /\[([0-9]+)\].Resource\[([0-9]+)\].*/.exec(ref);
			if (ptrs && ptrs.length === 3) {
				return { s: ptrs[1], r: ptrs[2] };
			}
			return null;
		}));
		_.forEach(voidResourcePtrs, ptr => {
			const statement = stageRolePolicyStatements[ptr.s];
			_.pullAt(statement.Resource, [ ptr.r ]);
			if (_.isEmpty(statement.Resource)) {
				_.pullAt(stageRolePolicyStatements, [ ptr.s ]);
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

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	aliasHandleEvents(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

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
		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	aliasFinalize(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

		aliasStack.Outputs.AliasFlags.Value = JSON.stringify(aliasStack.Outputs.AliasFlags.Value);

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	aliasRestructureStack(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

		this._serverless.cli.log('Preparing aliase ...');

		if (_.isEmpty(aliasStackTemplates) && this._stage !== this._alias) {
			throw new this._serverless.classes.Error(new Error('You have to deploy the master alias at least once with "serverless deploy"'));
		}

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]).bind(this)
		.spread(this.aliasInit)
		.spread(this.aliasHandleUserResources)
		.spread(this.aliasHandleLambdaRole)
		.spread(this.aliasHandleFunctions)
		.spread(this.aliasHandleApiGateway)
		.spread(this.aliasHandleEvents)
		.spread(this.aliasFinalize)
		.then(() => BbPromise.resolve());
	}

};
