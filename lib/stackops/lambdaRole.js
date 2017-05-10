'use strict';
/**
 * Transform lambda role.
 * Merge alias and current stack policies, so that all alias policy statements
 * are present and active
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const utils = require('../utils');

module.exports = function(currentTemplate, aliasStackTemplates, currentAliasStackTemplate) {

	const stageStack = this._serverless.service.provider.compiledCloudFormationTemplate;
	const aliasStack = this._serverless.service.provider.compiledCloudFormationAliasTemplate;
	let stageRolePolicies = _.get(stageStack, 'Resources.IamRoleLambdaExecution.Properties.Policies', []);
	let currentRolePolicies = _.get(currentTemplate, 'Resources.IamRoleLambdaExecution.Properties.Policies', []);

	// Older serverless versions (<1.7.0) do not use a inline policy.
	if (_.isEmpty(currentRolePolicies) && _.has(currentTemplate, 'Resources.IamPolicyLambdaExecution')) {
		this._serverless.cli.log('WARNING: Project created with SLS < 1.7.0. Using resources from policy.');
		currentRolePolicies = [ _.get(currentTemplate, 'Resources.IamPolicyLambdaExecution.Properties') ];
	}
	if (_.isEmpty(stageRolePolicies) && _.has(stageStack, 'Resources.IamPolicyLambdaExecution')) {
		stageRolePolicies = [ _.get(stageStack, 'Resources.IamPolicyLambdaExecution.Properties') ];
	}

	// There can be a service role defined. In this case there is no embedded IAM role.
	if (_.has(this._serverless.service.provider, 'role')) {
		// Use the role if any of the aliases reference it
		if (!_.isEmpty(currentRolePolicies) &&
			_.some(aliasStackTemplates, template => !template.Outputs.AliasFlags.Value.hasRole)) {
			stageStack.Reosurces.IamRoleLambdaExecution = _.cloneDeep(currentTemplate.Resources.IamRoleLambdaExecution);
		}

		aliasStack.Outputs.AliasFlags.Value.hasRole = true;

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	}

	// For now we only merge the first policy document and exit if SLS changes this behavior.
	if (stageRolePolicies.length !== 1) {
		return BbPromise.reject(new Error('Policy count should be 1! Please report this error to the alias plugin owner.'));
	}

	const stageRolePolicyStatements = _.get(stageRolePolicies[0], 'PolicyDocument.Statement', []);
	const currentRolePolicyStatements = _.get(currentRolePolicies[0], 'PolicyDocument.Statement', []);

	_.forEach(currentRolePolicyStatements, statement => {
		// Check if there is already a statement with the same actions and effect.
		const sameStageStatement = _.find(stageRolePolicyStatements, value => value.Effect === statement.Effect &&
			value.Action.length === statement.Action.length &&
			_.every(value.Action, action => _.includes(statement.Action, action)));

		if (sameStageStatement) {
			// Merge the resources
			sameStageStatement.Resource = _.uniqWith(_.concat(sameStageStatement.Resource, statement.Resource), (a,b) => _.isEqual(a,b));
		} else {
			// Add the different statement
			stageRolePolicyStatements.push(statement);
		}
	});

	// Remove all resource references of removed resources
	const voidResourceRefs = utils.findReferences(stageRolePolicyStatements, this.removedResourceKeys);
	const voidResourcePtrs = _.compact(_.map(voidResourceRefs, ref => {
		const ptrs = /\[([0-9]+)\].Resource\[([0-9]+)\].*/.exec(ref);
		if (ptrs && ptrs.length === 3) {
			return { s: ptrs[1], r: ptrs[2] };
		}
		return null;
	}));
	_.forEach(voidResourcePtrs, ptr => {
		const statement = stageRolePolicyStatements[ptr.s];
		_.pullAt(statement.Resource, [ ptr.r ]);
		if (_.isEmpty(statement.Resource)) {
			_.pullAt(stageRolePolicyStatements, [ ptr.s ]);
		}
	});

	// Insert statement dependencies
	const dependencies = _.reject((() => {
		const result = [];
		const stack = [ _.first(stageRolePolicyStatements) ];
		while (!_.isEmpty(stack)) {
			const statement = stack.pop();

			_.forOwn(statement, (value, key) => {
				if (key === 'Ref') {
					result.push(value);
				} else if (key === 'Fn::GetAtt') {
					result.push(value[0]);
				} else if (_.isObject(value)) {
					stack.push(value);
				}
			});
		}
		return result;
	})(), dependency => _.has(stageStack.Resources, dependency));

	_.forEach(dependencies, dependency => {
		stageStack.Resources[dependency] = currentTemplate.Resources[dependency];
	});

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
