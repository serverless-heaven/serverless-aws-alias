'use strict';

/**
 * Serverless AWS alias plugin
 */

const BbPromise = require('bluebird')
		, _ = require('lodash')
    , Path = require('path')
		, validate = require('./lib/validate')
		, configureAliasStack = require('./lib/configureAliasStack')
		, createAliasStack = require('./lib/createAliasStack')
		, updateAliasStack = require('./lib/updateAliasStack')
		, aliasRestructureStack = require('./lib/aliasRestructureStack')
		, removeAliasStack = require('./lib/removeAliasStack')
		, uploadAliasArtifacts = require('./lib/uploadAliasArtifacts');

class AwsAlias {

	constructor(serverless, options) {
		this._serverless = serverless;
		this._options = options;
		this._provider = this._serverless.getProvider('aws');
		this._stage = this._options.stage || this._serverless.service.provider.stage;
		this._alias = this._options.alias || this._stage;
		this._stackName = this._provider.naming.getStackName();

		/**
		 * Load stack helpers from Serverless installation.
		 */
		const monitorStack = require(
		Path.join(this._serverless.config.serverlessPath,
			'plugins',
			'aws',
			'lib',
			'monitorStack')
		);
		const setBucketName = require(
		Path.join(this._serverless.config.serverlessPath,
			'plugins',
			'aws',
			'lib',
			'setBucketName')
		);

		_.assign(
			this,
			validate,
			configureAliasStack,
			createAliasStack,
			updateAliasStack,
			removeAliasStack,
			aliasRestructureStack,
			uploadAliasArtifacts,
			setBucketName,
			monitorStack
		);

		this._commands = {
			alias: {
				usage: 'Show deployed aliases',
				commands: {
					remove: {
						usage: 'Remove a deployed alias',
						lifecycleEvents: [
							'removeStack'
						],
						options: {
							alias: {
								usage: 'Name of the alias',
								shortcut: 'a',
								required: true
							}
						}
					}
				}
			}
		};

		/**
		 * Deploy lifecycleEvents:
				'cleanup',
				'initialize',
				'setupProviderConfiguration',
				'createDeploymentArtifacts',
				'compileFunctions',
				'compileEvents',
				'deploy',
		*/

		this._hooks = {
			'before:deploy:initialize': () => BbPromise.bind(this)
				.then(this.validate),
			// Create alias stack definition and modify base stack
			'after:deploy:initialize': () => BbPromise.bind(this)
				.then(this.configureAliasStack),
			// Setup provider configuration reuses some of the functions of the AwsDeploy plugin
			'after:deploy:setupProviderConfiguration': () => BbPromise.bind(this)
				.then(this.createAliasStack),
			'before:deploy:deploy': () => BbPromise.bind(this)
				.then(this.aliasRestructureStack),
			'after:deploy:deploy': () => BbPromise.bind(this)
				.then(this.setBucketName)
				.then(this.uploadAliasArtifacts)
				.then(this.updateAliasStack),
			'alias:remove:removeStack': () => BbPromise.bind(this)
				.then(this.removeAliasStack)
		};
	}

  /**
   * Expose the supported commands as read-only property.
   */
	get commands() {
		return this._commands;
	}

  /**
   * Expose the supported hooks as read-only property.
   */
	get hooks() {
		return this._hooks;
	}

	/**
   * Expose the options as read-only property.
   */
	get options() {
		return this._options;
	}

	/**
   * Expose the supported provider as read-only property.
   */
	get provider() {
		return this._provider;
	}

	/**
   * Expose the serverless object as read-only property.
   */
	get serverless() {
		return this._serverless;
	}

	/**
   * Expose the stack name as read-only property.
   */
	get stackName() {
		return this._stackName;
	}

	_cleanup() {
		this._serverless.cli.log('Cleanup !!!!');
	}

}

module.exports = AwsAlias;
