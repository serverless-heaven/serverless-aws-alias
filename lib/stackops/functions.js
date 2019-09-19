'use strict';
/**
 * Transform frunctions and versions.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const utils = require('../utils');

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

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

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

	// Set SERVERLESS_ALIAS environment variable
	_.forOwn(stageStack.Resources, resource => {
		if (resource.Type === 'AWS::Lambda::Function') {
			_.set(resource, 'Properties.Environment.Variables.SERVERLESS_ALIAS', this._alias);
		}
	});

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

			// With alias support we do not want to retain the versions unless explicitly asked to do so
			version.DeletionPolicy = this._retain ? 'Retain' : 'Delete';

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
};
