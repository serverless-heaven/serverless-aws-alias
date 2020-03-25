/**
 * Helper to retrieve and manage stack and alias information.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

	/**
	 * Load the currently deployed CloudFormation template.
	 */
	aliasStackLoadCurrentTemplate() {

		const stackName = this._provider.naming.getStackName();

		const params = {
			StackName: stackName,
			TemplateStage: 'Processed'
		};

		return this._provider.request('CloudFormation',
			'getTemplate',
			params,
			this._options.stage,
			this._options.region)
		.then(cfData => {
			try {
				return BbPromise.resolve(JSON.parse(cfData.TemplateBody));
			} catch (e) {
				return BbPromise.reject(new Error('Received malformed response from CloudFormation'));
			}
		})
		.catch(() => {
			return BbPromise.resolve({ Resources: {}, Outputs: {} });
		});

	},

	aliasStackGetAliasStackNames() {

		const params = {
			ExportName: `${this._provider.naming.getStackName()}-ServerlessAliasReference`
		};

		return this._provider.request('CloudFormation',
			'listImports',
			params,
			this._options.stage,
			this._options.region)
		.then(cfData => BbPromise.resolve(cfData.Imports));

	},

	aliasStackLoadTemplate(stackName, processed) {

		const params = {
			StackName: stackName,
			TemplateStage: processed ? 'Processed' : 'Original'
		};

		return this._provider.request('CloudFormation',
			'getTemplate',
			params,
			this._options.stage,
			this._options.region)
		.then(cfData => {
			return BbPromise.resolve(JSON.parse(cfData.TemplateBody));
		})
		.catch(err => {
			return BbPromise.reject(new Error(`Unable to retrieve template for ${stackName}: ${err.statusCode}`));
		});

	},

	/**
	 * Load all deployed alias stack templates excluding the current alias.
	 */
	aliasStackLoadAliasTemplates() {

		return this.aliasStackGetAliasStackNames()		// eslint-disable-line lodash/prefer-lodash-method
		.mapSeries(stack => BbPromise.join(BbPromise.resolve(stack), this.aliasStackLoadTemplate(stack)))
		.map(stackInfo => ({ stack: stackInfo[0], template: stackInfo[1] }))
		.catch(err => {
			if (err.statusCode === 400
				|| (err.statusCode === undefined && err.providerError && err.providerError.statusCode === 400)
			) {
				// The export is not yet there. Can happen on the very first alias stack deployment.
				return BbPromise.resolve([]);
			}

			return BbPromise.reject(err);
		});

	},

	aliasStacksDescribeStage() {

		const stackName = this._provider.naming.getStackName();

		return this._provider.request('CloudFormation',
			'describeStackResources',
			{ StackName: stackName },
			this._options.stage,
			this._options.region);
	},

	aliasStacksDescribeResource(resourceId) {

		const stackName = this._provider.naming.getStackName();

		return this._provider.request('CloudFormation',
			'describeStackResources',
			{
				StackName: stackName,
				LogicalResourceId: resourceId
			},
			this._options.stage,
			this._options.region);
	},

	aliasStacksDescribeAliases() {
		const params = {
			ExportName: `${this._provider.naming.getStackName()}-ServerlessAliasReference`
		};

		return this._provider.request('CloudFormation',
			'listImports',
			params,
			this._options.stage,
			this._options.region)
		.then(cfData => BbPromise.resolve(cfData.Imports))
		.mapSeries(stack => {
			const describeParams = {
				StackName: stack
			};

			return this._provider.request('CloudFormation',
				'describeStackResources',
				describeParams,
				this._options.stage,
				this._options.region);
		});
	},

	aliasGetExports() {
		const fetchExports = (result, token) => {
			const params = {};
			if (token) {
				params.NextToken = token;
			}
			return this._provider.request('CloudFormation', 'listExports', params)
			.then(cfData => {
				const newResult = _.reduce(cfData.Exports, (__, cfExport) => {
					__[cfExport.Name] = cfExport.Value;
					return __;
				}, result);

				if (cfData.NextToken) {
					return fetchExports(newResult, cfData.NextToken);
				}

				return newResult;
			});
		};

		return fetchExports({});
	},

	aliasStackLoadCurrentCFStackAndDependencies() {
		return BbPromise.join(
			BbPromise.bind(this).then(this.aliasStackLoadCurrentTemplate),
			BbPromise.bind(this).then(this.aliasStackLoadAliasTemplates)
		)
		.spread((currentTemplate, aliasStackTemplates) => {
			const removed = _.filter(aliasStackTemplates, ['stack', `${this._provider.naming.getStackName()}-${this._alias}`]);
			const filteredAliasStackTemplates = _.reject(aliasStackTemplates, ['stack', `${this._provider.naming.getStackName()}-${this._alias}`]);

			const currentAliasStackTemplate = _.get(_.first(removed), 'template', {});
			const deployedAliasStackTemplates = _.map(filteredAliasStackTemplates, template => template.template);

			this._serverless.service.provider.deployedCloudFormationTemplate = currentTemplate;
			this._serverless.service.provider.deployedCloudFormationAliasTemplate = currentAliasStackTemplate;
			this._serverless.service.provider.deployedAliasTemplates = filteredAliasStackTemplates;
			return BbPromise.resolve([ currentTemplate, deployedAliasStackTemplates, currentAliasStackTemplate ]);
		});
	},

	aliasDescribeAliasStack(aliasName) {
		const stackName = `${this._provider.naming.getStackName()}-${aliasName}`;
		return this._provider.request('CloudFormation',
			'describeStackResources',
			{ StackName: stackName },
			this._options.stage,
			this._options.region);
	},

	aliasGetAliasFunctionVersions(aliasName) {
		return this.aliasDescribeAliasStack(aliasName)
		.then(resources => {
			const versions = _.filter(resources.StackResources, [ 'ResourceType', 'AWS::Lambda::Version' ]);
			return _.map(versions, version => ({
				functionName: /:function:(.*):/.exec(version.PhysicalResourceId)[1],
				functionVersion: _.last(_.split(version.PhysicalResourceId, ':'))
			}));
		});
	},

	aliasGetAliasLatestFunctionVersionByFunctionName(aliasName, functionName) {
		return this._provider.request('Lambda',
			'getAlias',
			{ FunctionName: functionName, Name: aliasName },
			this._options.stage,
			this._options.region)
			.then(result => _.get(result, 'FunctionVersion', null));
	},

};
