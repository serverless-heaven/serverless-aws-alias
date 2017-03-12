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
			},
			this._options.stage,
			this._options.region)
		.then(stage => {
			return this._provider.request('APIGateway',
				'getDeployment',
				{
					restApiId: apiId,
					deploymentId: stage.deploymentId
				},
				this._options.stage,
				this._options.region);
		})
		.catch(err => {
			if (/^Invalid stage/.test(err.message)) {
				return BbPromise.resolve(null);
			}
			return BbPromise.reject(err);
		});
	},

	listDescribeStack(stackName) {

		return this._provider.request('CloudFormation',
			'describeStackResources',
			{ StackName: stackName },
			this._options.stage,
			this._options.region);
	},

	listGetApiId(stackName) {

		return this._provider.request('CloudFormation',
			'describeStackResource',
			{
				LogicalResourceId: 'ApiGatewayRestApi',
				StackName: stackName
			},
			this._options.stage,
			this._options.region)
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
							this.listDescribeStack(`${this._provider.naming.getStackName()}-${aliasName}`),
							this.listDescribeApiStage(apiId, aliasName)
						)
						.spread((resources /*, apiStage */) => {
							const versions = _.filter(resources.StackResources, [ 'ResourceType', 'AWS::Lambda::Version' ]);

							console.log(chalk.white('    Functions:'));
							_.forEach(versions, version => {
								const functionName = /:function:(.*):/.exec(version.PhysicalResourceId)[1];
								const functionVersion = _.last(version.PhysicalResourceId.split(':'));

								console.log(chalk.yellow(`      ${functionName} -> ${functionVersion}`));

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
