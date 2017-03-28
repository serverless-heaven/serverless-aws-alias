'use strict';

/**
 * Initialize and prepare stack restructuring
 */

const _ = require('lodash');
const BbPromise = require('bluebird');

const defaultAliasFlags = {
	hasRole: false
};

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
	const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

	// Prepare flags
	aliasStack.Outputs.AliasFlags = {
		Description: 'Alias flags.',
		Value: _.assign({}, defaultAliasFlags)
	};

	_.forEach(aliasStackTemplates, aliasTemplate => {
		const flags = _.get(aliasTemplate, 'Outputs.AliasFlags', '{}');
		try {
			_.set(aliasTemplate, 'Outputs.AliasFlags.Value', _.defaults(JSON.parse(flags), defaultAliasFlags));
		} catch (e) {
			// Not handled
		}
	});

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
