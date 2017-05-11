'use strict';

/**
 * Handle user resources.
 * Keep all resources that are used somewhere and remove the ones that are not
 * referenced anymore.
 */

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

	const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
	const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;
	const userResources = _.get(this._serverless.service, 'provider.aliasUserResources', { Resources: {}, Outputs: {} });

	this.options.verbose && this._serverless.cli.log('Processing custom resources');

	// Retrieve all resources referenced from other aliases
	const aliasDependencies = _.reduce(aliasStackTemplates, (result, template) => {
		try {
			const resourceRefs = JSON.parse(_.get(template, 'Outputs.AliasResources.Value', "[]"));
			const outputRefs = JSON.parse(_.get(template, 'Outputs.AliasOutputs.Value', "[]"));
			const resources = _.assign({}, _.pick(_.get(currentTemplate, 'Resources'), resourceRefs, {}));
			const outputs = _.assign({}, _.pick(_.get(currentTemplate, 'Outputs'), outputRefs, {}));

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
	const currentResources = _.get(userResources, 'Resources', {});
	const currentOutputs = _.get(userResources, 'Outputs', {});

	const aliasResourceRefs = _.keys(aliasDependencies.Resources);
	//const aliasOutputRefs = _.keys(aliasDependencies.Outputs);
	const currentResourceRefs = _.keys(currentResources);
	//const currentOutputRefs = _.keys(currentOutputs);
	const oldResourceRefs = JSON.parse(_.get(currentAliasStackTemplate, 'Outputs.AliasResources.Value', "[]"));
	//const oldOutputRefs = JSON.parse(_.get(currentAliasStackTemplate, 'Outputs.AliasOutputs.Value', "[]"));

	// Removed resources are resources that are no longer referenced

	const removedResourceRefs = _.difference(_.difference(oldResourceRefs, currentResourceRefs), aliasResourceRefs);
	this.removedResourceKeys = removedResourceRefs;
	this._options.verbose && this._serverless.cli.log(`Removing resources: ${this.removedResourceKeys}`);

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

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);

};
