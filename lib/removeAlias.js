'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const utils = require('./utils');

const NO_UPDATE_MESSAGE = 'No updates are to be performed.';

module.exports = {

	aliasCreateStackChanges(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

		return BbPromise.try(() => {

			const usedFuncRefs = _.uniq(
				_.flatMap(aliasStackTemplates, template => {
					const funcRefs = _.map(
						_.assign({},
							_.pickBy(
								_.get(template, 'Resources', {}),
								[ 'Type', 'AWS::Lambda::Alias' ])),
						(value, key) => {
							return _.replace(key, /Alias$/, '');
						}
					);
					return funcRefs;
				})
			);

			const usedResources = _.flatMap(aliasStackTemplates, template => {
				return JSON.parse(_.get(template, 'Outputs.AliasResources.Value', "[]"));
			});

			const usedOutputs = _.flatMap(aliasStackTemplates, template => {
				return JSON.parse(_.get(template, 'Outputs.AliasOutputs.Value', "[]"));
			});

			const obsoleteFuncRefs = _.reject(_.map(
				_.assign({},
					_.pickBy(
						_.get(currentAliasStackTemplate, 'Resources', {}),
						[ 'Type', 'AWS::Lambda::Alias' ])),
				(value, key) => {
					return _.replace(key, /Alias$/, '');
				}), ref => _.includes(usedFuncRefs, ref));

			const obsoleteFuncResources = _.flatMap(obsoleteFuncRefs,
				name => ([ `${name}LambdaFunction`, `${name}LogGroup` ]));

			const obsoleteFuncOutputs = _.map(obsoleteFuncRefs,
				name => `${name}LambdaFunctionArn`);

			const obsoleteResources = _.reject(
				JSON.parse(_.get(currentAliasStackTemplate, 'Outputs.AliasResources.Value', "[]")),
				resource => _.includes(usedResources, resource));

			const obsoleteOutputs = _.reject(
				JSON.parse(_.get(currentAliasStackTemplate, 'Outputs.AliasOutputs.Value', "[]")),
				output => _.includes(usedOutputs, output));

			// Check for aliased authorizers thhat reference a removed function
			_.forEach(obsoleteFuncRefs, obsoleteFuncRef => {
				const authorizerName = `${obsoleteFuncRef}ApiGatewayAuthorizer${_.replace(this._alias, /-/g, 'Dash')}`;
				if (_.has(currentTemplate.Resources, authorizerName)) {
					// find obsolete references
					const authRefs = utils.findReferences(currentTemplate.Resources, authorizerName);
					_.forEach(authRefs, authRef => {
						if (_.endsWith(authRef, '.AuthorizerId')) {
							const parent = _.get(currentTemplate.Resources, _.replace(authRef, '.AuthorizerId', ''));
							delete parent.AuthorizerId;
							parent.AuthorizationType = "NONE";
						}
					});
					// find dependencies
					_.forOwn(currentTemplate.Resources, resource => {
						if (_.isArray(resource.DependsOn) && _.includes(resource.DependsOn, authorizerName)) {
							resource.DependsOn = _.without(resource.DependsOn, authorizerName);
						} else if (resource.DependsOn === authorizerName) {
							delete resource.DependsOn;
						}
					});
					// Add authorizer to obsolete resources
					obsoleteResources.push(authorizerName);
				}
			});

			// Remove all alias references that are not used in other stacks
			_.assign(currentTemplate, {
				Resources: _.assign({}, _.omit(currentTemplate.Resources, obsoleteFuncResources, obsoleteResources)),
				Outputs: _.assign({}, _.omit(currentTemplate.Outputs, obsoleteFuncOutputs, obsoleteOutputs))
			});

			if (this.options.verbose) {
				this._serverless.cli.log(`Remove unused resources:`);
				_.forEach(obsoleteResources, resource => this._serverless.cli.log(`  * ${resource}`));
			}

			this.options.verbose && this._serverless.cli.log(`Remove alias IAM policy`);
			// Remove the alias IAM policy if it is not referenced in the current stage stack
			// We cannot remove it otherwise, because the $LATEST function versions might still reference it.
			// Then it will be deleted on the next deployment or the stage removal, whatever happend first.
			const aliasPolicyName = `IamRoleLambdaExecution${this._alias}`;
			if (_.isEmpty(utils.findReferences(currentTemplate.Resources, aliasPolicyName))) {
				delete currentTemplate.Resources[`IamRoleLambdaExecution${this._alias}`];
			} else {
				this._serverless.cli.log(`IAM policy removal delayed - will be removed on next deployment`);
			}

			// Adjust IAM policies
			const obsoleteRefs = _.concat(obsoleteFuncResources, obsoleteResources);

			// Set references to obsoleted resources in fct env to "REMOVED" in case
			// the alias that is removed was the last deployment of the stage.
			// This will change the function definition, but that does not matter
			// as is is neither aliased nor versioned
			_.forEach(_.filter(currentTemplate.Resources, [ 'Type', 'AWS::Lambda::Function' ]), func => {
				const refs = utils.findReferences(func, obsoleteRefs);
				_.forEach(refs, ref => _.set(func, ref, "REMOVED"));
			});

			// Check if API is still referenced and remove it otherwise
			const usesApi = _.some(aliasStackTemplates, template => {
				return _.some(_.get(template, 'Resources', {}), [ 'Type', 'AWS::ApiGateway::Deployment' ]);
			});
			if (!usesApi) {
				this.options.verbose && this._serverless.cli.log(`Remove API`);

				delete currentTemplate.Resources.ApiGatewayRestApi;
				delete currentTemplate.Outputs.ApiGatewayRestApi;
				delete currentTemplate.Outputs.ApiGatewayRestApiRootResource;
				delete currentTemplate.Outputs.ServiceEndpoint;
			}

			return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
		});
	},

	aliasApplyStackChanges(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

		const stackName = this._provider.naming.getStackName();

		this.options.verbose && this._serverless.cli.log(`Apply changes for ${stackName}`);

		let stackTags = { STAGE: this._stage };

		// Merge additional stack tags
		if (_.isObject(this.serverless.service.provider.stackTags)) {
			stackTags = _.extend(stackTags, this.serverless.service.provider.stackTags);
		}

		const params = {
			StackName: stackName,
			Capabilities: [
				'CAPABILITY_IAM',
				'CAPABILITY_NAMED_IAM',
			],
			Parameters: [],
			TemplateBody: JSON.stringify(currentTemplate),
			Tags: _.map(_.keys(stackTags), key => ({ Key: key, Value: stackTags[key] })),
		};

		this.options.verbose && this._serverless.cli.log(`Checking stack policy`);

		// Policy must have at least one statement, otherwise no updates would be possible at all
		if (this.serverless.service.provider.stackPolicy &&
				this.serverless.service.provider.stackPolicy.length) {
			params.StackPolicyBody = JSON.stringify({
				Statement: this.serverless.service.provider.stackPolicy,
			});
		}

		return this._provider.request('CloudFormation',
			'updateStack',
			params,
			this.options.stage,
			this.options.region)
		.then(cfData => this.monitorStack('update', cfData))
		.then(() => BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]))
		.catch(err => {
			if (err.message === NO_UPDATE_MESSAGE) {
				return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
			}
			throw err;
		});

	},

	aliasRemoveAliasStack(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

		const stackName = `${this._provider.naming.getStackName()}-${this._alias}`;

		this.options.verbose && this._serverless.cli.log(`Removing CF stack ${stackName}`);

		return this._provider.request('CloudFormation',
			'deleteStack',
			{ StackName: stackName },
			this._options.stage,
			this._options.region)
		.then(cfData => {
			// monitorStack wants a StackId member
			cfData.StackId = stackName;
			return this.monitorStack('removal', cfData);
		})
		.then(() =>{
			return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
		})
		.catch(e => {
			if (_.includes(e.message, 'does not exist')) {
				const message = `Alias ${this._alias} is not deployed.`;
				throw new this._serverless.classes.Error(message);
			}

			throw e;
		});

	},

	removeAlias(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

		if (this._options.noDeploy) {
			this._serverless.cli.log('noDeploy option active - will do nothing');
			return BbPromise.resolve();
		}

		this._masterAlias = currentTemplate.Outputs.MasterAliasName.Value;
		if (this._stage && this._masterAlias === this._alias) {
			// Removal of the master alias is requested -> check if any other aliases are still deployed.
			const aliases = _.map(aliasStackTemplates, aliasTemplate => _.get(aliasTemplate, 'Outputs.ServerlessAliasName.Value'));
			if (!_.isEmpty(aliases)) {
				throw new this._serverless.classes.Error(`Remove the other deployed aliases before removing the service: ${_.without(aliases, this._masterAlias)}`);
			}
			if (_.isEmpty(currentAliasStackTemplate)) {
				throw new this._serverless.classes.Error(`Internal error: Stack for master alias ${this._masterAlias} is not deployed. Try to solve the problem by manual interaction with the AWS console.`);
			}

			// We're ready for removal
			this._serverless.cli.log(`Removing master alias and stage ${this._masterAlias} ...`);

			return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]).bind(this)
			.spread(this.aliasRemoveAliasStack)
			.then(() => this._serverless.pluginManager.spawn('remove'));
		}

		this._serverless.cli.log(`Removing alias ${this._masterAlias} ...`);

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]).bind(this)
		.spread(this.aliasCreateStackChanges)
		.spread(this.aliasRemoveAliasStack)
		.spread(this.aliasApplyStackChanges)
		.then(() => BbPromise.resolve());

	}

};
