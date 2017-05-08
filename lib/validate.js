'use strict';
/**
 * Perform validation.
 */

const BbPromise = require('bluebird');
const SemVer = require('semver');

module.exports = {

	validate() {

		// Check required serverless version
		if (SemVer.gt('1.12.0', this.serverless.getVersion())) {
			return BbPromise.reject(new this.serverless.classes.Error('Serverless verion must be >= 1.12.0'));
		}

		// Parse and check plugin options
		if (this._options['alias-resources']) {
			this._aliasResources = true;
		}

		return BbPromise.resolve();

	}

};
