'use strict';

const BbPromise = require('bluebird');

module.exports = {
	uploadAliasCloudFormationFile() {
		this.serverless.cli.log('Uploading CloudFormation alias file to S3...');

		const body = JSON.stringify(this.serverless.service.provider.compiledCloudFormationAliasTemplate);

		const fileName = 'compiled-cloudformation-template-alias.json';

		const params = {
			Bucket: this.bucketName,
			Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
			Body: body,
			ContentType: 'application/json',
		};

		return this.provider.request('S3',
			'putObject',
			params,
			this._options.stage,
			this._options.region);
	},

	uploadAliasArtifacts() {
		if (this.options.noDeploy) {
			return BbPromise.resolve();
		}

		return BbPromise.bind(this)
			.then(this.uploadAliasCloudFormationFile);
	},

};
