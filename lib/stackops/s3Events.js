'use strict';

/**
 * Handle SNS Lambda subscriptions.
 */

const _ = require('lodash');
const BbPromise = require('bluebird');
const utils = require('../utils');

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {
	const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
	const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;

	this.options.verbose && this._serverless.cli.log('Processing S3 Bucket Lambda subscriptions');

	const aliasResources = [];

	const aliases = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Alias' ]));
	const versions = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Version' ]));

	// Add alias name to buckets to disambiguate behavior
	const allS3Buckets =
			_.assign({},
				_.pickBy(stageStack.Resources, [ 'Type', 'AWS::S3::Bucket' ]));

	// We will only alias S3 buckets with events for now. In general, it makes sense to alias
	// all buckets to have a clear distinction between alias deployments.
	const s3Buckets = {};

	_.forOwn(allS3Buckets, (bucket, name) => {
		bucket.DependsOn = bucket.DependsOn || [];
		// Remap lambda subscriptions
		const lambdaConfigurations = _.get(bucket, 'Properties.NotificationConfiguration.LambdaConfigurations', []);
		if (!_.isEmpty(lambdaConfigurations)) {
			_.forOwn(lambdaConfigurations, lambdaConfiguration => {
				const functionNameRef = utils.findAllReferences(_.get(lambdaConfiguration, 'Function'));
				const functionName = _.replace(_.get(functionNameRef, '[0].ref', ''), /LambdaFunction$/, '');
				const versionName = _.find(_.keys(versions), version => _.startsWith(version, functionName));
				const aliasName = _.find(_.keys(aliases), alias => _.startsWith(alias, functionName));

				lambdaConfiguration.Function = { Ref: aliasName };

				// Add dependency on function version
				bucket.DependsOn.push(versionName);
				bucket.DependsOn.push(aliasName);
			});

			bucket.Properties.BucketName = _.toLower(`${bucket.Properties.BucketName}-${this._alias}`);

			delete stageStack.Resources[name];
			_.set(s3Buckets, name, bucket);
		}
	});

	// Fetch lambda permissions. These have to be updated later to allow the aliased functions.
	const s3LambdaPermissions =
			_.assign({},
				_.pickBy(_.pickBy(stageStack.Resources, [ 'Type', 'AWS::Lambda::Permission' ]),
				[ 'Properties.Principal', 's3.amazonaws.com' ]));

	// Adjust permission to reference the function aliases
	_.forOwn(s3LambdaPermissions, (permission, name) => {
		const functionName = _.replace(name, /LambdaPermission.*$/, '');
		const versionName = _.find(_.keys(versions), version => _.startsWith(version, functionName));
		const aliasName = _.find(_.keys(aliases), alias => _.startsWith(alias, functionName));

		// Adjust references and alias permissions
		permission.Properties.FunctionName = { Ref: aliasName };
		const sourceArn = _.get(permission.Properties, 'SourceArn');
		if (_.isString(sourceArn)) {
			permission.Properties.SourceArn = `sourceArn-${this._alias}`;
		}
		else if (_.has(sourceArn, 'Fn::Join')) {
			const sourceArn = _.get(permission.Properties, 'SourceArn.Fn::Join[1]', []);
			sourceArn.push(`-${this._alias}`);
		}

		// Add dependency on function version
		permission.DependsOn = [ versionName, aliasName ];

		delete stageStack.Resources[name];
	});

	// Add all alias stack owned resources
	aliasResources.push(s3Buckets);
	aliasResources.push(s3LambdaPermissions);

	_.forEach(aliasResources, resource => _.assign(aliasStack.Resources, resource));

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
