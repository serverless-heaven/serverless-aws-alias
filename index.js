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
	, logs = require('./lib/logs')
	, collectUserResources = require('./lib/collectUserResources')
	, uploadAliasArtifacts = require('./lib/uploadAliasArtifacts')
	, updateFunctionAlias = require('./lib/updateFunctionAlias')
	, deferredOutputs = require('./lib/deferredOutputs');

class AwsAlias {

	constructor(serverless, options) {
		this._serverless = serverless;
		this._options = options || {};
		this._provider = this._serverless.getProvider('aws');

		/**
		 * Set preliminary stage and alias. This is needed to enable the injection
		 * of the stage into the system variables. The values are overwritten by
		 * validate with their actually evaluated and substituted values.
		 */
		this._stage = this._provider.getStage();
		this._alias = this._options.alias || this._stage;
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
			collectUserResources,
			configureAliasStack,
			createAliasStack,
			updateAliasStack,
			listAliases,
			logs,
			removeAlias,
			aliasRestructureStack,
			stackInformation,
			uploadAliasArtifacts,
			updateFunctionAlias,
			setBucketName,
			monitorStack,
			deferredOutputs
		);

		this._commands = {
			alias: {
				commands: {
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

		this._hooks = {
			'before:package:initialize': () => BbPromise.bind(this)
				.then(this.validate),

			'before:aws:package:finalize:mergeCustomProviderResources': () => BbPromise.bind(this)
				.then(this.collectUserResources),

			'before:deploy:deploy': () => BbPromise.bind(this)
				.then(this.validate)
				.then(this.configureAliasStack),

			'before:aws:deploy:deploy:createStack': () => BbPromise.bind(this)
				.then(this.aliasStackLoadCurrentCFStackAndDependencies)
				.spread(this.aliasRestructureStack),

			'after:aws:deploy:deploy:createStack': () => BbPromise.bind(this)
				.then(this.createAliasStack),

			'after:aws:deploy:deploy:uploadArtifacts': () => BbPromise.bind(this)
				.then(() => BbPromise.resolve()),

			'after:aws:deploy:deploy:updateStack': () => BbPromise.bind(this)
				.then(this.setBucketName)
				.then(this.uploadAliasArtifacts)
				.then(this.updateAliasStack),

			'before:deploy:function:initialize': () => BbPromise.bind(this)
				.then(this.validate)
				.then(() => {
					// Force forced deploy
					if (!this._options.force) {
						return BbPromise.reject(new this.serverless.classes.Error("You must deploy single functions using --force with the alias plugin."));
					}
					return BbPromise.resolve();
				}),

			'after:deploy:function:deploy': () => BbPromise.bind(this)
				.then(this.updateFunctionAlias),

			'after:info:info': () => BbPromise.bind(this)
				.then(this.validate)
				.then(this.listAliases),

			'before:remove:remove': () => {
				if (!this._validated) {
					return BbPromise.reject(new this._serverless.classes.Error(`Use "serverless alias remove --alias=${this._stage}" to remove the service.`));
				}
				return BbPromise.resolve();
			},

			// Override the logs command - must be, because the $LATEST filter
			// in the original logs command is not easy to change without hacks.
			'logs:logs': () => BbPromise.bind(this)
				.then(this.validate)
				.then(this.logsValidate)
				.then(this.logsGetLogStreams)
				.then(this.functionLogsShowLogs),

			'logs:api:logs': () => BbPromise.bind(this)
				.then(this.validate)
				.then(this.apiLogsValidate)
				.then(this.apiLogsGetLogStreams)
				.then(this.apiLogsShowLogs),

			'alias:remove:remove': () => BbPromise.bind(this)
				.then(this.validate)
				.then(this.aliasStackLoadCurrentCFStackAndDependencies)
				.spread(this.removeAlias)
		};

		// Patch hooks to override our event replacements
		const pluginManager = this.serverless.pluginManager;
		const logHooks = pluginManager.hooks['logs:logs'];
		_.pullAllWith(logHooks, [ 'AwsLogs' ], (a, b) => a.pluginName === b);

		// Extend the logs command if available
		try {
			const logCommand = pluginManager.getCommand([ 'logs' ]);
			logCommand.options.alias = {
				usage: 'Alias'
			};
			logCommand.options.version = {
				usage: 'Logs a specific version of the function'
			};
			logCommand.commands = _.assign({}, logCommand.commands, {
				api: {
					usage: 'Output the logs of a deployed APIG stage (alias)',
					lifecycleEvents: [
						'logs',
					],
					options: {
						alias: {
							usage: 'Alias'
						},
						stage: {
							usage: 'Stage of the service',
							shortcut: 's',
						},
						region: {
							usage: 'Region of the service',
							shortcut: 'r',
						},
						tail: {
							usage: 'Tail the log output',
							shortcut: 't',
						},
						startTime: {
							usage: 'Logs before this time will not be displayed',
						},
						filter: {
							usage: 'A filter pattern',
						},
						interval: {
							usage: 'Tail polling interval in milliseconds. Default: `1000`',
							shortcut: 'i',
						},
					},
					key: 'logs:api',
					pluginName: 'Logs',
					commands: {},
				}
			});
		} catch (e) {
			// Do nothing
		}
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
