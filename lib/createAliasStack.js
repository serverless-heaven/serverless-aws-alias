'use strict';
/**
 * Create the alias stack for the service.
 *
 * The alias stack contains the function definition and exposes the functions
 * as CF output variables that are referenced in the stage dependent CF stacks.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');

module.exports = {

	createAlias() {

		this._serverless.cli.log(`Creating Alias Stack '${this._alias}' ...`);
		const stackName = `${this._provider.naming.getStackName()}-${this._alias}`;
		let stackTags = { STAGE: this._options.stage, ALIAS: this._alias };

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
			TemplateBody: JSON.stringify(this._serverless.service.provider.compiledCloudFormationAliasCreateTemplate),
			Tags: _.map(_.keys(stackTags), key => ({ Key: key, Value: stackTags[key] }))
		};

		return this._provider.request(
			'CloudFormation',
			'createStack',
			params
		).then(cfData => this.monitorStack('create', cfData));

	},

	createAliasStack() {

		this._aliasStackName = `${this._provider.naming.getStackName()}-${this._alias}`;
		if (/^[^a-zA-Z].+|.*[^a-zA-Z0-9-].*/.test(this._aliasStackName) || this._aliasStackName.length > 128) {
			const errorMessage = [
				`The stack alias name "${this._aliasStackName}" is not valid. `,
				'A service name should only contain alphanumeric',
				' (case sensitive) and hyphens. It should start',
				' with an alphabetic character and shouldn\'t',
				' exceed 128 characters.',
			].join('');
			throw new this._serverless.classes.Error(errorMessage);
		}

		return BbPromise.bind(this)
		// always write the template to disk, whether we are deploying or not
		.then(this.writeAliasTemplateToDisk)
		.then(this.checkAliasStack);
	},

	checkAliasStack() {

		if (this._options.noDeploy) {
			return BbPromise.resolve();
		}

		return this._provider.request('CloudFormation',
			'describeStackResources',
			{ StackName: this._aliasStackName })
		.then(() => BbPromise.resolve('alreadyCreated'))
		.catch(e => {
			if (_.includes(e.message, 'does not exist')) {
				if (this._serverless.service.provider.deploymentBucket) {
					this._createLater = true;
					return BbPromise.resolve();
				}

				return BbPromise.bind(this)
				.then(this.createAlias);
			}

			return BbPromise.reject(e);
		});

	},

	writeAliasTemplateToDisk() {

		if (this._serverless.service.provider.deploymentBucket) {
			return BbPromise.resolve();
		}

		const cfTemplateFilePath = path.join(this._serverless.config.servicePath,
			'.serverless', 'cloudformation-template-create-alias-stack.json');

		this._serverless.utils.writeFileSync(cfTemplateFilePath,
			this._serverless.service.provider.compiledCloudFormationAliasCreateTemplate);

		return BbPromise.resolve();
	}

};
