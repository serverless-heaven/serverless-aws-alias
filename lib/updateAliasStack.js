'use strict';

const _ = require('lodash');
const path = require('path');
const BbPromise = require('bluebird');

const NO_UPDATE_MESSAGE = 'No updates are to be performed.';

module.exports = {

	createAliasFallback() {
		this._createLater = false;
		this._serverless.cli.log('Creating alias stack...');

		const stackName = `${this._provider.naming.getStackName()}-${this._alias}`;
		let stackTags = { STAGE: this._options.stage, ALIAS: this._alias };
		const templateUrl = `https://s3.amazonaws.com/${this.bucketName}/${this._serverless.service.package.artifactDirectoryName}/compiled-cloudformation-template-alias.json`;
		// Merge additional stack tags
		if (_.isObject(this._serverless.service.provider.stackTags)) {
			stackTags = _.extend(stackTags, this._serverless.service.provider.stackTags);
		}

		const params = {
			StackName: stackName,
			OnFailure: 'DELETE',
			Capabilities: [
				'CAPABILITY_IAM',
				'CAPABILITY_NAMED_IAM',
			],
			Parameters: [],
			TemplateURL: templateUrl,
			Tags: _.map(_.keys(stackTags), key => ({ Key: key, Value: stackTags[key] })),
		};

		if (this.serverless.service.provider.cfnRole) {
			params.RoleARN = this.serverless.service.provider.cfnRole;
		}

		return this._provider.request('CloudFormation',
			'createStack',
			params)
			.then((cfData) => this.monitorStack('create', cfData));
	},

	updateAlias() {
		const templateUrl = `https://s3.amazonaws.com/${this.bucketName}/${this._serverless.service.package.artifactDirectoryName}/compiled-cloudformation-template-alias.json`;

		this.serverless.cli.log('Updating alias stack...');
		const stackName = `${this._provider.naming.getStackName()}-${this._alias}`;
		let stackTags = { STAGE: this._options.stage, ALIAS: this._alias };

		// Merge additional stack tags
		if (_.isObject(this._serverless.service.provider.stackTags)) {
			stackTags = _.extend(stackTags, this.serverless.service.provider.stackTags);
		}

		const params = {
			StackName: stackName,
			Capabilities: [
				'CAPABILITY_IAM',
				'CAPABILITY_NAMED_IAM',
			],
			Parameters: [],
			TemplateURL: templateUrl,
			Tags: _.map(_.keys(stackTags), key => ({ Key: key, Value: stackTags[key] })),
		};

		if (this.serverless.service.provider.cfnRole) {
			params.RoleARN = this.serverless.service.provider.cfnRole;
		}

		// Policy must have at least one statement, otherwise no updates would be possible at all
		if (this._serverless.service.provider.stackPolicy &&
				this._serverless.service.provider.stackPolicy.length) {
			params.StackPolicyBody = JSON.stringify({
				Statement: this._serverless.service.provider.stackPolicy,
			});
		}

		return this._provider.request('CloudFormation',
			'updateStack',
			params)
			.then((cfData) => this.monitorStack('update', cfData))
			.catch((e) => {
				if (e.message === NO_UPDATE_MESSAGE) {
					return;
				}
				throw e;
			});
	},

	updateAliasStack() {

		// just write the template to disk if a deployment should not be performed
		return BbPromise.bind(this)
			.then(this.writeAliasUpdateTemplateToDisk)
			.then(() => {
				if (this.options.noDeploy) {
					return BbPromise.resolve();
				} else if (this._createLater) {
					return BbPromise.bind(this)
						.then(this.createAliasFallback);
				}
				return BbPromise.bind(this)
					.then(this.updateAlias);
			});
	},

	// helper methods
	writeAliasUpdateTemplateToDisk() {
		const updateOrCreate = this._createLater ? 'create' : 'update';
		const cfTemplateFilePath = path.join(this._serverless.config.servicePath,
			'.serverless', `cloudformation-template-${updateOrCreate}-alias-stack.json`);

		this._serverless.utils.writeFileSync(cfTemplateFilePath,
			this._serverless.service.provider.compiledCloudFormationAliasTemplate);

		return BbPromise.resolve();
	}

};
