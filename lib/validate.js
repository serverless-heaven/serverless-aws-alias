'use strict';
/**
 * Perform validation.
 */

const BbPromise = require('bluebird');

module.exports = {

	validate() {

		// Parse and check plugin options
		if (this._options['alias-resources']) {
			this._aliasResources = true;
		}

		return BbPromise.resolve();

	}

};
