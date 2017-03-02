/**
 * Helper to retrieve and manage stack and alias information.
 */

const BbPromise = require('bluebird');

module.exports = {

	/**
	 * Load the currently deployed CloudFormation template.
	 */
	aliasStackLoadCurrentTemplate() {

		const stackName = this._provider.naming.getStackName();

		const params = {
			StackName: stackName,
			TemplateStage: 'Processed'
		};

		return this._provider.request('CloudFormation',
			'getTemplate',
			params,
			this._options.stage,
			this._options.region)
		.then(cfData => {
			try {
				return BbPromise.resolve(JSON.parse(cfData.TemplateBody));
			} catch (e) {
				return BbPromise.reject(new Error('Received malformed response from CloudFormation'));
			}
		})
		.catch(err => {
			return BbPromise.reject(new Error(`Unable to retrieve current stack information: ${err.statusCode}`));
		});

	},

	/**
	 * Load all deployed alias stack templates.
	 */
	aliasStackLoadAliasTemplates() {

		const params = {
			ExportName: `${this._provider.naming.getStackName()}-ServerlessAliasReference`
		};

		return this._provider.request('CloudFormation',
			'listImports',
			params,
			this._options.stage,
			this._options.region)
		.then(cfData => BbPromise.resolve(cfData.Imports))
		.mapSeries(stack => {

			const importParams = {
				StackName: stack,
				TemplateStage: 'Original'		// We need the original references to look up the version resources.
			};

			return this._provider.request('CloudFormation',
				'getTemplate',
				importParams,
				this._options.stage,
				this._options.region)
			.then(cfData => {
				return BbPromise.resolve(JSON.parse(cfData.TemplateBody));
			})
			.catch(err => {
				return BbPromise.reject(new Error(`Unable to retrieve current stack information: ${err.statusCode}`));
			});
		})
		.catch(err => {
			if (err.statusCode === 400) {
				// The export is not yet there. Can happen on the very first alias stack deployment.
				return BbPromise.resolve([]);
			}

			return BbPromise.reject(err);
		});

	},

};
