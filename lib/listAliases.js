'use strict';
/**
 * List all deployed aliases
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');

module.exports = {

	listDescribeStack(stackName) {

		return this._provider.request('CloudFormation',
			'describeStackResources',
			{ StackName: stackName },
			this._options.stage,
			this._options.region);
	},

	listAliases() {

		console.log(chalk.yellow('aliases:'));

		return BbPromise.join(
			BbPromise.bind(this).then(this.aliasStackLoadCurrentTemplate),
			BbPromise.bind(this).then(this.aliasStackLoadAliasTemplates)
		)
		.spread((currentTemplate, aliasStackTemplates) => {
			return BbPromise.mapSeries(aliasStackTemplates, aliasTemplate => {

				const aliasName = _.get(aliasTemplate, 'Outputs.ServerlessAliasName.Value');
				if (aliasName) {
					console.log(chalk.white(`  ${aliasName}`));

					if (this._options.verbose) {
						return this.listDescribeStack(`${this._provider.naming.getStackName()}-${aliasName}`)
						.then(resources => {
							const versions = _.filter(resources.StackResources, [ 'ResourceType', 'AWS::Lambda::Version' ]);

							console.log(chalk.white('    Functions:'));
							_.forEach(versions, version => {
								const functionName = /:function:(.*):/.exec(version.PhysicalResourceId)[1];
								const functionVersion = _.last(version.PhysicalResourceId.split(':'));

								console.log(chalk.yellow(`      ${functionName} -> ${functionVersion}`));
							});

							return BbPromise.resolve();
						});
					}
				}
			});
		});
	}

};
