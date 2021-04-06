'use strict';

/**
 * Handle deferred output resolution.
 * Some references to outputs of the base stack cannot be done
 * by Fn::ImportValue because they will change from deployment to deployment.
 * So we resolve them after the base stack has been deployed and set their
 * values accordingly.
 */

const _ = require('lodash');
const BbPromise = require('bluebird');

const deferredOutputs = {};

module.exports = {

	/**
	 * Register a deferred output
	 * @param {string} sourceOutput
	 * @param {Object} targetObject
	 * @param {string} targetPropertyName
	 */
	addDeferredOutput(sourceOutput, targetObject, targetPropertyName) {
		this.options.verbose && this.serverless.cli.log(`Register deferred output ${sourceOutput} -> ${targetPropertyName}`);

		deferredOutputs[sourceOutput] = deferredOutputs[sourceOutput] || [];
		deferredOutputs[sourceOutput].push({
			target: targetObject,
			property: targetPropertyName
		});
	},

	resolveDeferredOutputs() {
		this.options.verbose && this.serverless.cli.log('Resolving deferred outputs');

		if (_.isEmpty(deferredOutputs)) {
			return BbPromise.resolve();
		}

		return this.aliasGetExports()
		.then(cfExports => {
			_.forOwn(deferredOutputs, (references, output) => {
				if (_.has(cfExports, output)) {
					const value = cfExports[output];
					this.options.verbose && this.serverless.cli.log(`  ${output} -> ${value}`);
					_.forEach(references, reference => {
						_.set(reference.target, reference.property, value);
					});
				}
				else {
					this.serverless.cli.log(`ERROR: Output ${output} not found.`);
				}
			});
			return null;
		});
	}

};
