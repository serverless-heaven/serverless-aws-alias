'use strict';
/**
 * Transform CW events.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const utils = require('../utils');

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

	const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
	const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

	const cwEvents = _.assign({}, _.pickBy(_.get(stageStack, 'Resources', {}), [ 'Type', 'AWS::Events::Rule' ]));
	const cwEventLambdaPermissions =
			_.assign({},
				_.pickBy(_.pickBy(stageStack.Resources, [ 'Type', 'AWS::Lambda::Permission' ]),
					permission => utils.hasPermissionPrincipal(permission, 'events')));

	_.forOwn(cwEvents, (cwEvent, name) => {
		// Reference alias as FunctionName
		const targetRefs = utils.findAllReferences(_.get(cwEvent, 'Properties.Targets'));
		cwEvent.DependsOn = cwEvent.DependsOn || [];
		_.forEach(targetRefs, ref => {
			const functionName = _.replace(ref.ref, /LambdaFunction$/, '');
			_.set(cwEvent.Properties.Targets, ref.path, { Ref: `${functionName}Alias` });
			cwEvent.DependsOn.push(`${functionName}Alias`);
		});

		// Remove mapping from stage stack
		delete stageStack.Resources[name];
	});

	// Move event subscriptions to alias stack
	_.defaults(aliasStack.Resources, cwEvents);

	// Adjust permission to reference the function aliases
	_.forOwn(cwEventLambdaPermissions, (permission, name) => {
		const targetFunctionRef = utils.findAllReferences(_.get(permission, 'Properties.FunctionName'));
		const functionName = _.replace(targetFunctionRef[0].ref, /LambdaFunction$/, '');

		// Adjust references and alias permissions
		permission.Properties.FunctionName = { Ref: `${functionName}Alias` };

		// Add dependency on function alias
		permission.DependsOn = [ `${functionName}Alias` ];

		delete stageStack.Resources[name];
	});

	// Add all alias stack owned resources
	_.defaults(aliasStack.Resources, cwEventLambdaPermissions);

	// Forward inputs to the promise chain
	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
