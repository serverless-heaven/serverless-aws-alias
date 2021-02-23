'use strict';
/**
 * List all deployed aliases
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');

/* eslint no-console: "off" */

module.exports = {

	listDescribeApiStage(apiId, stageName) {

		if (!apiId) {
			return BbPromise.resolve(null);
		}

		return this._provider.request('APIGateway',
			'getStage',
			{
				restApiId: apiId,
				stageName: stageName
			})
		.then(stage => {
			return this._provider.request('APIGateway',
				'getDeployment',
				{
					restApiId: apiId,
					deploymentId: stage.deploymentId
				});
		})
		.catch(err => {
			if (/^Invalid stage/.test(err.message)) {
				return BbPromise.resolve(null);
			}
			return BbPromise.reject(err);
		});
	},

	listGetApiId(stackName) {

		return this._provider.request('CloudFormation',
			'describeStackResource',
			{
				LogicalResourceId: 'ApiGatewayRestApi',
				StackName: stackName
			})
		.then(cfData => cfData.StackResourceDetail.PhysicalResourceId)
		.catch(() => BbPromise.resolve(null));
	},

	listAliases() {

		console.log(chalk.yellow('aliases:'));

		return BbPromise.join(
			BbPromise.bind(this).then(() => {
				return this.aliasStackGetAliasStackNames()
				.mapSeries(stack => this.aliasStackLoadTemplate(stack));
			}),
			this.listGetApiId(this._provider.naming.getStackName())
		)
		.spread((aliasStackTemplates, apiId) => {
			return BbPromise.mapSeries(aliasStackTemplates, aliasTemplate => {

				const aliasName = _.get(aliasTemplate, 'Outputs.ServerlessAliasName.Value');
				if (aliasName) {
					console.log(chalk.white(`  ${aliasName}`));

					if (this._options.verbose) {
						return BbPromise.join(
							this.aliasGetAliasFunctionVersions(aliasName),
							this.listDescribeApiStage(apiId, aliasName)
						)
						.spread((versions /*, apiStage */) => {
							console.log(chalk.white('    Functions:'));
							_.forEach(versions, version => {
								console.log(chalk.yellow(`      ${version.functionName} -> ${version.functionVersion}`));

								// Print deployed endpoints for the function
								// FIXME: Check why APIG getStage and getDeployment do not return the stage API layout.

							});

							return BbPromise.resolve();
						});
					}
				}
			});
		});
	}

};
