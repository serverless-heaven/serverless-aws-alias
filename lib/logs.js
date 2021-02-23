'use strict';
/**
 * Log management.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const moment = require('moment');
const os = require('os');

function getApiLogGroupName(apiId, alias) {
	return `API-Gateway-Execution-Logs_${apiId}/${alias}`;
}

module.exports = {

	logsValidate() {
		this._lambdaName = this._serverless.service.getFunction(this.options.function).name;
		this._options.logGroupName = this._provider.naming.getLogGroupName(this._lambdaName);
		this._options.interval = this._options.interval || 1000;

		return BbPromise.resolve();
	},

	apiLogsValidate() {
		if (this.options.function) {
			return BbPromise.reject(new this.serverless.classes.Error('--function is not supported for API logs.'));
		}

		// Retrieve APIG id
		return this.aliasStacksDescribeResource('ApiGatewayRestApi')
		.then(resources => {
			if (_.isEmpty(resources.StackResources)) {
				return BbPromise.reject(new this.serverless.classes.Error('service does not contain any API'));
			}

			const apiResource = _.first(resources.StackResources);
			const apiId = apiResource.PhysicalResourceId;
			this._apiLogsLogGroup = getApiLogGroupName(apiId, this._alias);
			this._options.interval = this._options.interval || 1000;

			this.options.verbose && this.serverless.cli.log(`API id: ${apiId}`);
			this.options.verbose && this.serverless.cli.log(`Log group: ${this._apiLogsLogGroup}`);

			return BbPromise.resolve();
		});
	},

	logsGetLogStreams() {
		const params = {
			logGroupName: this._options.logGroupName,
			descending: true,
			limit: 50,
			orderBy: 'LastEventTime',
		};

		let aliasGetAliasFunctionVersion;
		// Check if --version is specified
		if (this._options.version) {
			aliasGetAliasFunctionVersion = BbPromise.resolve(this._options.version);
		} else {
			aliasGetAliasFunctionVersion = this.aliasGetAliasLatestFunctionVersionByFunctionName(this._alias, this._lambdaName);
		}
		// Get currently deployed function version for the alias to
		// setup the stream filter correctly
		return aliasGetAliasFunctionVersion
		.then(version => {
			if (!version) {
				return BbPromise.reject(new this.serverless.classes.Error('Function alias not found.'));
			}

			return this.provider
				.request('CloudWatchLogs',
					'describeLogStreams',
					params)
				.then(reply => {
					if (!reply || _.isEmpty(reply.logStreams)) {
						throw new this.serverless.classes
							.Error('No existing streams for the function alias');
					}
					const logStreamNames = _.map(
						_.filter(reply.logStreams, stream => _.includes(stream.logStreamName, `[${version}]`)),
						stream => stream.logStreamName);

					if (_.isEmpty(logStreamNames)) {
						return BbPromise.reject(new this.serverless.classes.Error('No existing streams for this function version. If you want to view logs of a specific function version, please use --version'));
					}
					return logStreamNames;
				});
		});
	},

	apiLogsGetLogStreams() {
		const params = {
			logGroupName: this._apiLogsLogGroup,
			descending: true,
			limit: 50,
			orderBy: 'LastEventTime',
		};

		return this.provider.request(
			'CloudWatchLogs',
			'describeLogStreams',
			params
		)
		.then(reply => {
			if (!reply || _.isEmpty(reply.logStreams)) {
				return BbPromise.reject(new this.serverless.classes.Error('No logs exist for the API'));
			}

			return _.map(reply.logStreams, stream => stream.logStreamName);
		});

	},

	apiLogsShowLogs(logStreamNames) {
		const formatApiLogEvent = event => {
			const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';
			const timestamp = chalk.green(moment(event.timestamp).format(dateFormat));

			const parsedMessage = /\((.*?)\) .*/.exec(event.message);
			const header = `${timestamp} ${chalk.yellow(parsedMessage[1])}${os.EOL}`;
			const message = chalk.gray(_.replace(event.message, /\(.*?\) /, ''));
			return `${header}${message}${os.EOL}`;
		};

		return this.logsShowLogs(logStreamNames, formatApiLogEvent, this.apiLogsGetLogStreams.bind(this));
	},

	functionLogsShowLogs(logStreamNames) {
		const formatLambdaLogEvent = event => {
			const msgParam = event.message;
			let msg = msgParam;
			const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

			if (_.startsWith(msg, 'REPORT')) {
				msg += os.EOL;
			}

			if (_.startsWith(msg, 'START') || _.startsWith(msg, 'END') || _.startsWith(msg, 'REPORT')) {
				return chalk.gray(msg);
			} else if (_.trim(msg) === 'Process exited before completing request') {
				return chalk.red(msg);
			}

			const splitted = _.split(msg, '\t');

			if (splitted.length < 3 || new Date(splitted[0]) === 'Invalid Date') {
				return msg;
			}
			const reqId = splitted[1];
			const time = chalk.green(moment(splitted[0]).format(dateFormat));
			const text = _.split(msg, `${reqId}\t`)[1];

			return `${time}\t${chalk.yellow(reqId)}\t${text}`;
		};

		return this.logsShowLogs(logStreamNames, formatLambdaLogEvent, this.logsGetLogStreams.bind(this));
	},

	logsShowLogs(logStreamNames, formatter, getLogStreams) {
		if (!logStreamNames || !logStreamNames.length) {
			if (this.options.tail) {
				return setTimeout((() => getLogStreams()
					.then(nextLogStreamNames => this.logsShowLogs(nextLogStreamNames, formatter, getLogStreams))),
				this.options.interval);
			}
		}

		const params = {
			logGroupName: this.options.logGroupName || this._apiLogsLogGroup,
			interleaved: true,
			logStreamNames,
			startTime: this.options.startTime,
		};

		if (this.options.filter) params.filterPattern = this.options.filter;
		if (this.options.nextToken) params.nextToken = this.options.nextToken;
		if (this.options.startTime) {
			const since = _.includes(['m', 'h', 'd'],
				this.options.startTime[this.options.startTime.length - 1]);
			if (since) {
				params.startTime = moment().subtract(
					_.replace(this.options.startTime, /\D/g, ''),
					_.replace(this.options.startTime, /\d/g, '')).valueOf();
			} else {
				params.startTime = moment.utc(this.options.startTime).valueOf();
			}
		}

		return this.provider
			.request('CloudWatchLogs',
				'filterLogEvents',
				params)
			.then(results => {
				if (results.events) {
					_.forEach(results.events, e => {
						process.stdout.write(formatter(e));
					});
				}

				if (results.nextToken) {
					this.options.nextToken = results.nextToken;
				} else {
					delete this.options.nextToken;
				}

				if (this.options.tail) {
					if (results.events && results.events.length) {
						this.options.startTime = _.last(results.events).timestamp + 1;
					}

					return setTimeout((() => getLogStreams()
							.then(nextLogStreamNames => this.logsShowLogs(nextLogStreamNames, formatter, getLogStreams))),
					this.options.interval);
				}

				return BbPromise.resolve();
			});
	},

};
