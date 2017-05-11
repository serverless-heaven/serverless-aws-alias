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

module.exports = {

	aliasInit: init,
	aliasHandleFunctions: functions,
	aliasHandleApiGateway: apiGateway,
	aliasHandleUserResources: userResources,
	aliasHandleLambdaRole: lambdaRole,
	aliasHandleEvents: events,
	aliasHandleCWEvents: cwEvents,

	aliasFinalize(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
		const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

		aliasStack.Outputs.AliasFlags.Value = JSON.stringify(aliasStack.Outputs.AliasFlags.Value);

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	},

	aliasRestructureStack(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

		this._serverless.cli.log('Preparing alias ...');

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
		.spread(this.aliasHandleCWEvents)
		.spread(this.aliasFinalize)
		.then(() => BbPromise.resolve());
	}

};
