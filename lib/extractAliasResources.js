'use strict';
/**
 * Create the alias stack for the service.
 *
 * The alias stack contains the function definition and exposes the functions
 * as CF output variables that are referenced in the stage dependent CF stacks.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

	extractAliasResources() {

		/**
		 * Move all service resources to the alias stack
		 */
		if (this._serverless.service.aliasResources && !this._serverless.service.aliasResources.Resources) {
			this._serverless.service.aliasResources.Resources = {};
		}
		if (this._serverless.service.aliasResources && !this._serverless.service.aliasResources.Outputs) {
			this._serverless.service.aliasResources.Outputs = {};
		}

		// merge the alias resources
		_.merge(
			this._serverless.service.provider.compiledCloudFormationAliasTemplate,
      this._serverless.service.aliasResources
		);

		// If the user wishes to deploy the resources per alias then move the declared
		// service resources to aliasResources.
		// Otherwise deploy the resources to the main stack.
		if (this._aliasResources) {

			_.merge(
				this._serverless.service.provider.compiledCloudFormationAliasTemplate,
				this._serverless.service.resources
			);

			this._serverless.service.resources = {
				Resources: {},
				Outputs: {}
			};

		}

		/**
		 * Move all IAM role definitions that reference alias resources to the alias stack.
		 */
		 this._serverless.cli.log(JSON.stringify(this._serverless.service.provider.compiledCloudFormationTemplate, null, 2));

		//this._serverless.cli.log(JSON.stringify(this._serverless.service.aliasResources, null, 2));
		//this._serverless.cli.log(JSON.stringify(this._serverless.service.resources, null, 2));

		return BbPromise.resolve();

	}

};
