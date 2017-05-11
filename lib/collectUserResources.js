'use strict';
/**
 * Persist the user resources.
 * This is now necessary as the package command merges them already.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
	collectUserResources() {
		this._serverless.service.provider.aliasUserResources =
			_.cloneDeep(
				_.get(this._serverless.service, 'resources', { Resources: {}, Outputs: {} }));

		return BbPromise.resolve();
	}
};
