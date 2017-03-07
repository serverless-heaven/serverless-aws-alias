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
		, stackInformation = require('./lib/stackInformation')
		, listAliases = require('./lib/listAliases')
		, removeAlias = require('./lib/removeAlias')
		, uploadAliasArtifacts = require('./lib/uploadAliasArtifacts');

class AwsAlias {

	constructor(serverless, options) {
		this._serverless = serverless;
		this._options = options;
		this._provider = this._serverless.getProvider('aws');
		this._stage = this._options.stage || this._serverless.service.provider.stage;
		this._alias = this._options.alias || this._stage;
		this._stackName = this._provider.naming.getStackName();

		// Make alias available as ${self:provider.alias}
		this._serverless.service.provider.alias = this._alias;

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
			listAliases,
			removeAlias,
			aliasRestructureStack,
			stackInformation,
			uploadAliasArtifacts,
			setBucketName,
			monitorStack
		);

		this._commands = {
			alias: {
				commands: {
					deploy: {
						usage: 'Internal use only',
						lifecycleEvents: [
							'validate',
							'uploadArtifacts',
							'updateAliasStack',
							'done'
						]
					},
					remove: {
						usage: 'Remove a deployed alias',
						lifecycleEvents: [
							'remove'
						],
						options: {
							alias: {
								usage: 'Name of the alias',
								shortcut: 'a',
								required: true
							},
							verbose: {
								usage: 'Enable verbose output',
								shortcut: 'v',
								required: false
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
				.then(this.aliasStackLoadCurrentCFStackAndDependencies)
				.spread(this.aliasRestructureStack),

			'after:deploy:deploy': () => BbPromise.bind(this)
				.then(this.setBucketName)
				.then(() => {
					// Workaround for the missing functionality to hide commands
					this._triggeredFromHook = true;
					// Spawn alias:deploy lifecycle
					return this._serverless.pluginManager.run(['alias', 'deploy']);
				}),
			'alias:deploy:validate': () => {
				return this._triggeredFromHook ? BbPromise.resolve() : BbPromise.reject(new Error('Internal use only'));
			},
			'alias:deploy:uploadArtifacts': () => BbPromise.bind(this)
				.then(this.uploadAliasArtifacts),
			'alias:deploy:updateAliasStack': () => BbPromise.bind(this)
				.then(this.updateAliasStack),
			'alias:deploy:done': () => {
				this._serverless.cli.log(`Successfully deployed alias ${this._alias}`);
				return BbPromise.resolve();
			},
			'after:info:info': () => BbPromise.bind(this)
				.then(this.listAliases),

			'alias:remove:remove': () => BbPromise.bind(this)
				.then(this.validate)
				.then(this.aliasStackLoadCurrentCFStackAndDependencies)
				.spread(this.removeAlias)
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
