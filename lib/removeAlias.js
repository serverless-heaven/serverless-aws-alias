'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const utils = require('./utils');

const NO_UPDATE_MESSAGE = 'No updates are to be performed.';

module.exports = {

	aliasGetAliasStackTemplate() {

		const stackName = `${this._provider.naming.getStackName()}-${this._alias}`;

		// Get current aliasTemplate
		const params = {
			StackName: stackName,
			TemplateStage: 'Processed'
		};

		return this._provider.request('CloudFormation',
			'getTemplate',
			params,
			this._options.stage,
			this._options.region)
		.then(cfData => {
			try {
				return BbPromise.resolve(JSON.parse(cfData.TemplateBody));
			} catch (e) {
				return BbPromise.reject(new Error('Received malformed response from CloudFormation'));
			}
		})
		.catch(err => {
			if (_.includes(err.message, 'does not exist')) {
				const message = `Alias ${this._alias} is not deployed.`;
				throw new this._serverless.classes.Error(new Error(message));
			}

			throw new this._serverless.classes.Error(err);
		});

	},

	aliasCreateStackChanges(currentTemplate, aliasStackTemplates) {

		return this.aliasGetAliasStackTemplate()
		.then(aliasTemplate => {

			const usedFuncRefs = _.uniq(
				_.flatMap(aliasStackTemplates, template => {
					const funcRefs = _.map(
					_.assign({},
						_.pickBy(
							_.get(template, 'Resources', {}),
							[ 'Type', 'AWS::Lambda::Alias' ])),
					(value, key) => {
						return key.replace(/Alias$/, '');
					});

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
						_.get(aliasTemplate, 'Resources', {}),
						[ 'Type', 'AWS::Lambda::Alias' ])),
				(value, key) => {
					return key.replace(/Alias$/, '');
				}), ref => _.includes(usedFuncRefs, ref));

			const obsoleteFuncResources = _.flatMap(obsoleteFuncRefs,
				name => ([ `${name}LambdaFunction`, `${name}LogGroup` ]));

			const obsoleteFuncOutputs = _.map(obsoleteFuncRefs,
				name => `${name}LambdaFunctionArn`);

			const obsoleteResources = _.reject(
				JSON.parse(_.get(aliasTemplate, 'Outputs.AliasResources.Value', "[]")),
				resource => _.includes(usedResources, resource));

			const obsoleteOutputs = _.reject(
				JSON.parse(_.get(aliasTemplate, 'Outputs.AliasOutputs.Value', "[]")),
				output => _.includes(usedOutputs, output));

			// Remove all alias references that are not used in other stacks
			_.assign(currentTemplate, {
				Resources: _.assign({}, _.omit(currentTemplate.Resources, obsoleteFuncResources, obsoleteResources)),
				Outputs: _.assign({}, _.omit(currentTemplate.Outputs, obsoleteFuncOutputs, obsoleteOutputs))
			});

			if (this.options.verbose) {
				this._serverless.cli.log(`Remove unused resources:`);
				_.forEach(obsoleteResources, resource => this._serverless.cli.log(`  * ${resource}`));
				this.options.verbose && this._serverless.cli.log(`Adjust IAM policies`);
			}

			// Adjust IAM policies
			const currentRolePolicies = _.get(currentTemplate, 'Resources.IamRoleLambdaExecution.Properties.Policies', []);
			const currentRolePolicyStatements = _.get(currentRolePolicies[0], 'PolicyDocument.Statement', []);

			const obsoleteRefs = _.concat(obsoleteFuncResources, obsoleteResources);

			// Remove all obsolete resource references from the IAM policy statements
			const statementResources = utils.findReferences(currentRolePolicyStatements, obsoleteRefs);
			_.forEach(statementResources, resourcePath => {
				const indices = /.*?\[([0-9]+)\].*?\[([0-9]+)\]/.exec(resourcePath);
				if (indices) {
					const statementIndex = indices[1];
					const resourceIndex = indices[2];

					_.pullAt(currentRolePolicyStatements[statementIndex].Resource, resourceIndex);
					_.pull(currentRolePolicyStatements[statementIndex], statement => _.isEmpty(statement.Resource));
				}
			});

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

			return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
		});
	},

	aliasApplyStackChanges(currentTemplate, aliasStackTemplates) {

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

    // Policy must have at least one statement, otherwise no updates would be possible at all
		if (this.serverless.service.provider.stackPolicy &&
				this.serverless.service.provider.stackPolicy.length) {
			params.StackPolicyBody = JSON.stringify({
				Statement: this.serverless.service.provider.stackPolicy,
			});
		}

		return this.provider.request('CloudFormation',
      'updateStack',
      params,
      this.options.stage,
      this.options.region)
    .then(cfData => this.monitorStack('update', cfData))
		.then(() => BbPromise.resolve([ currentTemplate, aliasStackTemplates ]))
    .catch(e => {
			if (e.message === NO_UPDATE_MESSAGE) {
				return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
			}
			throw new this._serverless.classes.Error(e);
		});

	},

	aliasRemoveAliasStack(currentTemplate, aliasStackTemplates) {

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
			return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]);
		})
    .catch(e => {
			if (_.includes(e.message, 'does not exist')) {
				const message = `Alias ${this._alias} is not deployed.`;
				throw new this._serverless.classes.Error(new Error(message));
			}

			throw new this._serverless.classes.Error(e);
		});

	},

	removeAlias(currentTemplate, aliasStackTemplates) {

		if (this._stage && this._stage === this._alias) {
			const message = `Cannot delete the stage alias. Did you intend to remove the service instead?`;
			throw new this._serverless.classes.Error(new Error(message));
		}

		if (this._options.noDeploy) {
			return BbPromise.resolve();
		}

		this._serverless.cli.log(`Removing alias ${this._alias} ...`);

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates ]).bind(this)
		.spread(this.aliasCreateStackChanges)
		.spread(this.aliasRemoveAliasStack)
		.spread(this.aliasApplyStackChanges)
		.then(() => BbPromise.resolve());

	}

};
