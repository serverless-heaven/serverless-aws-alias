'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

	updateFunctionAlias() {
		this._serverless.cli.log('Updating function alias...');

		const func = this.serverless.service.getFunction(this.options.function);

		// Publish the yet deployed $LATEST uploaded by Serverless and label it.

		return BbPromise.try(() => {
			// Get the hash of the deployed function package
			const params = {
				FunctionName: func.name,
				Qualifier: '$LATEST'
			};

			return this.provider.request(
				'Lambda',
				'getFunction',
				params,
				this.options.stage, this.options.region
			);
		})
		.then(result => {
			// Publish $LATEST
			const sha256 = result.Configuration.CodeSha256;
			const params = {
				FunctionName: func.name,
				CodeSha256: sha256,
				Description: 'Deployed manually'
			};
			return this.provider.request(
				'Lambda',
				'publishVersion',
				params,
				this.options.stage, this.options.region
			);
		})
		.then(result => {
			// Label it
			const version = result.Version;
			const params = {
				FunctionName: func.name,
				Name: this._alias,
				FunctionVersion: version,
				Description: 'Deployed manually'
			};
			return this.provider.request(
				'Lambda',
				'updateAlias',
				params,
				this.options.stage, this.options.region
			);
		})
		.then(result => {
			this.serverless.cli.log(_.join(
				[
					'Successfully updated alias: ',
					this.options.function,
					'@',
					this._alias,
					' -> ',
					result.FunctionVersion
				],
				''
			));
			return BbPromise.resolve();
		});
	}

};
