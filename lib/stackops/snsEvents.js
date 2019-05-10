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

	this.options.verbose && this._serverless.cli.log('Processing SNS Lambda subscriptions');

	const aliasResources = [];

	const aliases = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Alias' ]));
	const versions = _.assign({}, _.pickBy(aliasStack.Resources, [ 'Type', 'AWS::Lambda::Version' ]));

	// Add alias name to topics to disambiguate behavior
	const snsTopics =
			_.assign({},
				_.pickBy(stageStack.Resources, [ 'Type', 'AWS::SNS::Topic' ]));

	_.forOwn(snsTopics, (topic, name) => {
		topic.DependsOn = topic.DependsOn || [];
		// Remap lambda subscriptions
		const lambdaSubscriptions = _.pickBy(topic.Properties.Subscription, ['Protocol', 'lambda']);
		_.forOwn(lambdaSubscriptions, subscription => {
			const functionNameRef = utils.findAllReferences(_.get(subscription, 'Endpoint'));
			const functionName = _.replace(_.get(functionNameRef, '[0].ref', ''), /LambdaFunction$/, '');
			const versionName = utils.getFunctionVersionName(versions, functionName);
			const aliasName = utils.getAliasVersionName(aliases, functionName);

			subscription.Endpoint = { Ref: aliasName };

			// Add dependency on function version
			topic.DependsOn.push(versionName);
			topic.DependsOn.push(aliasName);
		});

		topic.Properties.TopicName = `${topic.Properties.TopicName}-${this._alias}`;

		delete stageStack.Resources[name];
	});

	const snsSubscriptions =
		_.assign({},
			_.pickBy(stageStack.Resources, [ 'Type', 'AWS::SNS::Subscription' ]));

	_.forOwn(snsSubscriptions, (subscription, name) => {

		const functionNameRef = utils.findAllReferences(_.get(subscription.Properties, 'Endpoint'));
		const functionName = _.replace(_.get(functionNameRef, '[0].ref', ''), /LambdaFunction$/, '');
		const versionName = utils.getFunctionVersionName(versions, functionName);
		const aliasName = utils.getAliasVersionName(aliases, functionName);

		subscription.Properties.Endpoint = { Ref: aliasName };
		subscription.DependsOn = [ versionName, aliasName ];

		delete stageStack.Resources[name];
	});

	// Fetch lambda permissions. These have to be updated later to allow the aliased functions.
	const snsLambdaPermissions =
			_.assign({},
				_.pickBy(_.pickBy(stageStack.Resources, [ 'Type', 'AWS::Lambda::Permission' ]),
					permission => utils.hasPermissionPrincipal(permission, 'sns')));

	// Adjust permission to reference the function aliases
	_.forOwn(snsLambdaPermissions, (permission, name) => {
		const functionName = _.replace(name, /LambdaPermission.*$/, '');
		const versionName = utils.getFunctionVersionName(versions, functionName);
		const aliasName = utils.getAliasVersionName(aliases, functionName);

		// Adjust references and alias permissions
		permission.Properties.FunctionName = { Ref: aliasName };
		const sourceArn = _.get(permission.Properties, 'SourceArn.Fn::Join[1]', []);
		sourceArn.push(`-${this._alias}`);

		// Add dependency on function version
		permission.DependsOn = [ versionName, aliasName ];

		delete stageStack.Resources[name];
	});

	// Add all alias stack owned resources
	aliasResources.push(snsTopics);
	aliasResources.push(snsSubscriptions);
	aliasResources.push(snsLambdaPermissions);

	_.forEach(aliasResources, resource => _.assign(aliasStack.Resources, resource));

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
