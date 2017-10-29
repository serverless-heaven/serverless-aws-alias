'use strict';
/**
 * Transform event source mappings,
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const utils = require('../utils');

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

	const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
	const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;
	const stackName = this._provider.naming.getStackName();

	const subscriptions = _.assign({}, _.pickBy(_.get(stageStack, 'Resources', {}), [ 'Type', 'AWS::Lambda::EventSourceMapping' ]));

	_.forOwn(subscriptions, (subscription, name) => {
		// Reference alias as FunctionName
		const functionNameRef = utils.findAllReferences(_.get(subscription, 'Properties.FunctionName'));
		const functionName = _.replace(_.get(functionNameRef, '[0].ref', ''), /LambdaFunction$/, '');
		if (_.isEmpty(functionName)) {
			// FIXME: Can this happen at all?
			this._serverless.cli.log(`Strange thing: No function name defined for ${name}`);
			return;
		}

		subscription.Properties.FunctionName = { Ref: `${functionName}Alias` };
		subscription.DependsOn = [ `${functionName}Alias` ];

		// Make sure that the referenced resource is exported by the stageStack.
		const resourceRef = utils.findAllReferences(_.get(subscription, 'Properties.EventSourceArn'));
		// Build the export name
		let resourceRefName = _.get(resourceRef, '[0].ref');
		if (_.has(subscription.Properties, 'EventSourceArn.Fn::GetAtt')) {
			const attribute = subscription.Properties.EventSourceArn['Fn::GetAtt'][1];
			resourceRefName += attribute;
		}
		// Add the ref output to the stack if not already done.
		stageStack.Outputs[resourceRefName] = {
			Description: 'Alias resource reference',
			Value: subscription.Properties.EventSourceArn,
			Export: {
				Name: `${stackName}-${resourceRefName}`
			}
		};
		// Add the outpur to the referenced alias outputs
		const aliasOutputs = JSON.parse(aliasStack.Outputs.AliasOutputs.Value);
		aliasOutputs.push(resourceRefName);
		aliasStack.Outputs.AliasOutputs.Value = JSON.stringify(aliasOutputs);
		// Replace the reference with the cross stack reference
		subscription.Properties.EventSourceArn = {
			'Fn::ImportValue': `${stackName}-${resourceRefName}`
		};

		// Remove mapping from stage stack
		delete stageStack.Resources[name];
	});

	// Move event subscriptions to alias stack
	_.defaults(aliasStack.Resources, subscriptions);

	// Forward inputs to the promise chain
	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
