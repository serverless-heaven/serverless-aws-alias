'use strict';
/**
 * Create the alias stack for the service.
 *
 * The alias stack contains the function definition and exposes the functions
 * as CF output variables that are referenced in the stage dependent CF stacks.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');

module.exports = {

	configureAliasStack() {

		const compiledTemplate = this._serverless.service.provider.compiledCloudFormationTemplate;

		// Export an Output variable that will be referenced by the alias stacks
		// so that we are able to list all dependent alias deployments easily.
		compiledTemplate.Outputs.ServerlessAliasReference = {
			Description: 'Alias stack reference',
			Value: 'REFERENCE',
			Export: {
				Name: `${this._provider.naming.getStackName()}-ServerlessAliasReference`
			}
		};

		this._aliasStackName = `${this._provider.naming.getStackName()}-${this._alias}`;

		/**
		 * Prepare the alias stack template.
		 */
		this._serverless.service.provider
			.compiledCloudFormationAliasTemplate = this._serverless.utils.readFileSync(
				path.join(__dirname, 'alias-cloudformation-template.json')
			);

		const aliasTemplate = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

		/**
		 * Set a proper stack decription
		 */
		aliasTemplate.Description = `Alias stack for ${this._stackName} (${this._alias})`;

		/**
		 * Add the alias name as output variable to the stack.
		 */
		aliasTemplate.Outputs.ServerlessAliasName = {
			Description: 'Alias the stack represents.',
			Value: `${this._alias}`
		};

		/**
		 * Create a log group to capture alias modification history.
		 */
		aliasTemplate.Resources.ServerlessAliasLogGroup = {
			Type: 'AWS::Logs::LogGroup',
			Properties: {
				LogGroupName: `/serverless/${this._provider.naming.getStackName()}-${this._alias}`,
				RetentionInDays: 7
			}
		};
		aliasTemplate.Outputs.ServerlessAliasLogGroup = {
			Description: 'Log group for alias.',
			Value: { Ref: 'ServerlessAliasLogGroup' },
			Export: {
				Name: `${this._aliasStackName}-LogGroup`
			}
		};

		this._serverless.service.provider.compiledCloudFormationAliasCreateTemplate = _.cloneDeep(aliasTemplate);

		return BbPromise.resolve();
	}

};
