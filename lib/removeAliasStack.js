'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');

module.exports = {

	removeAliasStack() {

		if (this._stage && this._stage === this._alias) {
			const message = `Cannot delete the stage alias. Did you intend to remove the service instead?`;
			throw new this._serverless.classes.Error(new Error(message));
		}

		const stackName = `${this._provider.naming.getStackName()}-${this._alias}`;

		if (this._options.noDeploy) {
			return BbPromise.resolve();
		}

		return BbPromise.bind(this)
    .then(() => {
			return this._provider.request('CloudFormation',
        'describeStacks',
        { StackName: stackName },
        this._options.stage,
        this._options.region);
  	})
		.spread(cfData => {
			// Extract API Gateway deployment

			// Extract function aliases to be removed

		})
		.then(() => {
			return this._provider.request('CloudFormation',
        'deleteStack',
        { StackName: stackName },
        this._options.stage,
        this._options.region)
		})
		.then(cfData => this.monitorStack('removal', cfData))
    .catch((e) => {
      if (e.message.indexOf('does not exist') > -1) {
				const message = `Alias ${this._alias} is not deployed.`;
				throw new this._serverless.classes.Error(new Error(message));
      }

      throw new this._serverless.classes.Error(e);
    });

	}

};
