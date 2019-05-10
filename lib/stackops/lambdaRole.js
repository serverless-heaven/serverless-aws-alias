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

	// There can be a service role defined. In this case there is no embedded IAM role.
	if (_.has(this._serverless.service.provider, 'role')) {
		// Use the role if any of the aliases reference it
		aliasStack.Outputs.AliasFlags.Value.hasRole = true;

		// Import all defined roles from the current template (without overwriting)
		const currentRoles = _.assign({}, _.pickBy(currentTemplate.Resources, (resource, name) => resource.Type === 'AWS::IAM::Role' && /^IamRoleLambdaExecution/.test(name)));
		_.defaults(stageStack.Resources, currentRoles);

		// Remove old role for this alias
		delete stageStack.Resources[`IamRoleLambdaExecution${this._alias}`];

		return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
	}

	// Role name allows [\w+=,.@-]+
	const normalizedAlias = utils.normalizeAliasForLogicalId(this._alias);
	const roleLogicalId = `IamRoleLambdaExecution${normalizedAlias}`;
	const role = stageStack.Resources.IamRoleLambdaExecution;

	// Set role name
	if (role.Properties.RoleName['Fn::Join']) {
		_.last(role.Properties.RoleName['Fn::Join']).push(this._alias);
	}

	stageStack.Resources[roleLogicalId] = stageStack.Resources.IamRoleLambdaExecution;
	delete stageStack.Resources.IamRoleLambdaExecution;

	// Replace references
	const functions = _.filter(stageStack.Resources, ['Type', 'AWS::Lambda::Function']);

	const functionsWithIamRoleReference = _.filter(functions, (func) => _.isEqual(
		func.Properties.Role,
		{'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn' ]}
	));

	_.forEach(functionsWithIamRoleReference, func => {
		func.Properties.Role = {
			'Fn::GetAtt': [
				roleLogicalId,
				'Arn'
			]
		};
		const dependencyIndex = _.indexOf(func.DependsOn, 'IamRoleLambdaExecution');
		func.DependsOn[dependencyIndex] = roleLogicalId;
	});

	if (_.has(currentTemplate, 'Resources.IamRoleLambdaExecution')) {
		if (!_.isEmpty(utils.findReferences(currentTemplate.Resources, 'IamRoleLambdaExecution'))) {
			stageStack.Resources.IamRoleLambdaExecution = currentTemplate.Resources.IamRoleLambdaExecution;
		}
		delete currentTemplate.Resources.IamRoleLambdaExecution;
	}

	// Retain the roles of all currently deployed aliases
	_.forEach(aliasStackTemplates, aliasTemplate => {
		const alias = _.get(aliasTemplate, 'Outputs.ServerlessAliasName.Value');
		const aliasNormalizedAlias = utils.normalizeAliasForLogicalId(alias);
		const aliasRoleLogicalId = `IamRoleLambdaExecution${aliasNormalizedAlias}`;
		const aliasRole = _.get(currentTemplate, `Resources.${aliasRoleLogicalId}`);
		if (alias && aliasRole) {
			stageStack.Resources[aliasRoleLogicalId] = aliasRole;
		}
	});

	return BbPromise.resolve([ currentTemplate, aliasStackTemplates, currentAliasStackTemplate ]);
};
