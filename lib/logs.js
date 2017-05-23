'use strict';
/**
 * Log management.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const moment = require('moment');
const os = require('os');

module.exports = {
	logsValidate() {
		// validate function exists in service
		this._lambdaName = this._serverless.service.getFunction(this.options.function).name;

		this._options.interval = this._options.interval || 1000;
		this._options.logGroupName = this._provider.naming.getLogGroupName(this._lambdaName);

		return BbPromise.resolve();
	},

	logsGetLogStreams() {
		const params = {
			logGroupName: this._options.logGroupName,
			descending: true,
			limit: 50,
			orderBy: 'LastEventTime',
		};

		// Get currently deployed function version for the alias to
		// setup the stream filter correctly
		return this.aliasGetAliasFunctionVersions(this._alias)
		.then(versions => {
			return _.map(
				_.filter(versions, [ 'functionName', this._lambdaName ]),
				version => version.functionVersion);
		})
		.then(version => {
			return this.provider
				.request('CloudWatchLogs',
					'describeLogStreams',
					params,
					this.options.stage,
					this.options.region)
				.then(reply => {
					if (!reply || reply.logStreams.length === 0) {
						throw new this.serverless.classes
							.Error('No existing streams for the function alias');
					}

					return _.chain(reply.logStreams)
						.filter(stream => _.includes(stream.logStreamName, `[${version}]`))
						.map('logStreamName')
						.value();
				});
		});

	},

	logsShowLogs(logStreamNames) {
		if (!logStreamNames || !logStreamNames.length) {
			if (this.options.tail) {
				return setTimeout((() => this.getLogStreams()
					.then(nextLogStreamNames => this.showLogs(nextLogStreamNames))),
					this.options.interval);
			}
		}

		const formatLambdaLogEvent = (msgParam) => {
			let msg = msgParam;
			const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

			if (msg.startsWith('REPORT')) {
				msg += os.EOL;
			}

			if (msg.startsWith('START') || msg.startsWith('END') || msg.startsWith('REPORT')) {
				return chalk.gray(msg);
			} else if (msg.trim() === 'Process exited before completing request') {
				return chalk.red(msg);
			}

			const splitted = msg.split('\t');

			if (splitted.length < 3 || new Date(splitted[0]) === 'Invalid Date') {
				return msg;
			}
			const reqId = splitted[1];
			const time = chalk.green(moment(splitted[0]).format(dateFormat));
			const text = msg.split(`${reqId}\t`)[1];

			return `${time}\t${chalk.yellow(reqId)}\t${text}`;
		};

		const params = {
			logGroupName: this.options.logGroupName,
			interleaved: true,
			logStreamNames,
			startTime: this.options.startTime,
		};

		if (this.options.filter) params.filterPattern = this.options.filter;
		if (this.options.nextToken) params.nextToken = this.options.nextToken;
		if (this.options.startTime) {
			const since = (['m', 'h', 'd']
				.indexOf(this.options.startTime[this.options.startTime.length - 1]) !== -1);
			if (since) {
				params.startTime = moment().subtract(this.options
					.startTime.replace(/\D/g, ''), this.options
					.startTime.replace(/\d/g, '')).valueOf();
			} else {
				params.startTime = moment.utc(this.options.startTime).valueOf();
			}
		}

		return this.provider
			.request('CloudWatchLogs',
				'filterLogEvents',
				params,
				this.options.stage,
				this.options.region)
			.then(results => {
				if (results.events) {
					results.events.forEach(e => {
						process.stdout.write(formatLambdaLogEvent(e.message));
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

					return setTimeout((() => this.getLogStreams()
							.then(nextLogStreamNames => this.showLogs(nextLogStreamNames))),
						this.options.interval);
				}

				return BbPromise.resolve();
			});
	},

};
