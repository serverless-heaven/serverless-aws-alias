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

const init = require('./stackops/init');
const functions = require('./stackops/functions');
const apiGateway = require('./stackops/apiGateway');
const userResources = require('./stackops/userResources');
const lambdaRole = require('./stackops/lambdaRole');
const events = require('./stackops/events');
const cwEvents = require('./stackops/cwEvents');
const snsEvents = require('./stackops/snsEvents');

module.exports = {

	aliasInit(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return init.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasHandleFunctions(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return functions.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasHandleApiGateway(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return apiGateway.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasHandleUserResources(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return userResources.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasHandleLambdaRole(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return lambdaRole.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasHandleEvents(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return events.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasHandleCWEvents(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return cwEvents.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasHandleSNSEvents(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		return snsEvents.call(this, currentTemplate, aliasStackTemplates, currentAliasStackTemplate);
	},

	aliasFinalize(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

		aliasStack.Outputs.AliasFlags.Value = JSON.stringify(aliasStack.Outputs.AliasFlags.Value);

		// Check for missing dependencies and integrate them too
		_.forEach(_.filter(stageStack.Resources, resource => !_.isEmpty(resource.DependsOn)), parent => {
			_.forEach(parent.DependsOn, child => {
				if (!_.has(stageStack.Resources, child) && _.has(currentTemplate.Resources, child)) {
					stageStack.Resources[child] = currentTemplate.Resources[child];
				}
			});
		});

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	addMasterAliasName(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
		if (stageStack && !stageStack.Outputs.MasterAliasName) {
			const masterAlias = this._masterAlias || currentTemplate.Outputs.MasterAliasName.Value;
			stageStack.Outputs.MasterAliasName = {
				Description: 'Master Alias name (serverless-aws-alias plugin)',
				Value: masterAlias,
				Export: {
					Name: `${this._provider.naming.getStackName()}-MasterAliasName`
				}
			};
		}
		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	aliasRestructureStack(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		this._serverless.cli.log('Preparing alias ...');

		if (_.isEmpty(aliasStackTemplates) && this._masterAlias !== this._alias) {
			throw new this._serverless.classes.Error(new Error('You have to deploy the master alias at least once with "serverless deploy [--masterAlias]"'));
		}

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]).bind(this)
		.spread(this.addMasterAliasName)
		.spread(this.aliasInit)
		.spread(this.aliasHandleUserResources)
		.spread(this.aliasHandleLambdaRole)
		.spread(this.aliasHandleFunctions)
		.spread(this.aliasHandleApiGateway)
		.spread(this.aliasHandleEvents)
		.spread(this.aliasHandleCWEvents)
		.spread(this.aliasHandleSNSEvents)
		.spread(this.aliasFinalize)
		.then(() => BbPromise.resolve());
	}

};
