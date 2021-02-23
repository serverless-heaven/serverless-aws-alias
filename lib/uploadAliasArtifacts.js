'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
	uploadAliasCloudFormationFile() {
		this.serverless.cli.log('Uploading CloudFormation alias file to S3...');

		const body = JSON.stringify(this.serverless.service.provider.compiledCloudFormationAliasTemplate);

		const fileName = 'compiled-cloudformation-template-alias.json';

		let params = {
			Bucket: this.bucketName,
			Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
			Body: body,
			ContentType: 'application/json',
		};

		const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
		if (deploymentBucketObject) {
			params = setServersideEncryptionOptions(params, deploymentBucketObject);
		}

		return this.provider.request('S3',
			'putObject',
			params);
	},

	uploadAliasArtifacts() {
		if (this.options.noDeploy) {
			return BbPromise.resolve();
		}

		return BbPromise.bind(this)
			.then(this.resolveDeferredOutputs)
			.then(this.uploadAliasCloudFormationFile);
	},

};

function setServersideEncryptionOptions(putParams, deploymentBucketOptions) {
	const encryptionFields = {
		'serverSideEncryption': 'ServerSideEncryption',
		'sseCustomerAlgorithm': 'SSECustomerAlgorithm',
		'sseCustomerKey': 'SSECustomerKey',
		'sseCustomerKeyMD5': 'SSECustomerKeyMD5',
		'sseKMSKeyId': 'SSEKMSKeyId',
	};

	const params = putParams;

	_.forOwn(encryptionFields, (value, field) => {
		if (deploymentBucketOptions[field]) {
			params[value] = deploymentBucketOptions[field];
		}
	});

	return params;
}
