'use strict';
/**
 * Perform validation.
 */

const BbPromise = require('bluebird');
const SemVer = require('semver');

module.exports = {

	validate() {

		// Check required serverless version
		if (SemVer.gt('2.0.0', this.serverless.getVersion())) {
			return BbPromise.reject(new this.serverless.classes.Error('Serverless verion must be >= 2.0.0'));
		}

		// Set configuration
		this._stage = this._provider.getStage();
		this._masterAlias = this._options.masterAlias || this._stage;
		this._alias = this._options.alias || this._masterAlias;
		this._stackName = this._provider.naming.getStackName();
		this._retain = this._options.retain || false;

		// Make alias available as ${self:provider.alias}
		this._serverless.service.provider.alias = this._alias;

		// Set SERVERLESS_ALIAS environment variable to let other plugins access it during the build
		process.env.SERVERLESS_ALIAS = this._alias;

		// Parse and check plugin options
		if (this._options['alias-resources']) {
			this._aliasResources = true;
		}

		this._validated = true;

		return BbPromise.resolve();

	}

};
