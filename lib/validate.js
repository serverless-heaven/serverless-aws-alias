'use strict';
/**
 * Perform validation.
 */

const BbPromise = require('bluebird')
    , _ = require('lodash');

module.exports = {

	validate() {

		const plugins = this._serverless.pluginManager.getPlugins();
		const awsDeployPlugin = _.find(plugins, [ 'constructor.name', 'AwsDeploy' ]);

		this._serverless.cli.log('Using AwsAlias plugin');

		if (!awsDeployPlugin) {
			return BbPromise.reject(new Error('Dependency AwsDeploy not found.'));
		}

		// Parse and check plugin options
		if (this._options['alias-resources']) {
			this._aliasResources = true;
		}

		this._awsDeploy = awsDeployPlugin;
		return BbPromise.resolve();

	}

};
