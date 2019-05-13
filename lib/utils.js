'use strict';
/**
 * Utilities and helpers
 */

const _ = require('lodash');

class Utils {

	/**
	 * Find all given references in an object and return the paths to the
	 * enclosing object.
	 * @param root {Object} Start object
	 * @param references {Array<String>} References to search for
	 * @returns {Array<String>} Paths where the references are found
	 */
	static findReferences(root, references) {
		const resourcePaths = [];
		const stack = [ { parent: null, value: root, path:'' } ];

		while (!_.isEmpty(stack)) {
			const property = stack.pop();

			_.forOwn(property.value, (value, key) => {
				if (key === 'Ref' && _.includes(references, value) ||
						key === 'Fn::GetAtt' && _.includes(references, value[0])) {
					resourcePaths.push(property.path);
				} else if (_.isObject(value)) {
					key = _.isArray(property.value) ? `[${key}]` : (_.isEmpty(property.path) ? `${key}` : `.${key}`);
					stack.push({ parent: property, value, path: `${property.path}${key}` });
				}
			});
		}

		return resourcePaths;
	}

	/**
	 * Find AWS CF references in an object and return the referenced resources, including
	 * the referenced resource and the enclosing object of the reference.
	 * The referencing object can directly be retrieved with _.get(root, reference.path)
	 * @param root {Object} Start object
	 * @returns {Array<Object>} Found references as { ref: "", path: "" }
	 */
	static findAllReferences(root) {
		const resourceRefs = [];
		const stack = [ { parent: null, value: root, path: '' } ];

		while (!_.isEmpty(stack)) {
			const property = stack.pop();

			_.forOwn(property.value, (value, key) => {
				if (key === 'Ref') {
					resourceRefs.push({ ref: value, path: property.path });
				} else if (key === 'Fn::GetAtt') {
					resourceRefs.push({ ref: value[0], path: property.path });
				} else if (_.isObject(value)) {
					key = _.isArray(property.value) ? `[${key}]` : (_.isEmpty(property.path) ? `${key}` : `.${key}`);
					stack.push({ parent: property, value, path: `${property.path}${key}` });
				}
			});
		}

		return resourceRefs;
	}

	static normalizeAliasForLogicalId(alias) {
		// Only normalize if not alphanumeric
		if (_.isNil(alias) || /^[A-Za-z0-9]+$/.test(alias)) {
			return alias;
		}

		// Error on not supported characters
		if (!/^[A-Za-z0-9\-+_]+$/.test(alias)) {
			throw new Error("Unsupported character in alias. Must match [A-Za-z0-9\\-+_]+");
		}

		const replacements = [
			[ /-/g, 'Dash' ],
			[ /\+/g, 'Plus' ],
			[ /_/g, 'Uscore' ],
		];

		// Execute all replacements
		return _.reduce(replacements, (__, replacement) => {
			return _.replace(__, replacement[0], replacement[1]);
		}, alias);
	}

	/**
	 * Checks if a CF resource permission targets the given service as Principal.
	 * @param {Object} permission
	 * @param {string} service
	 */
	static hasPermissionPrincipal(permission, service) {
		const principal = _.get(permission, 'Properties.Principal');
		if (_.isString(principal)) {
			return _.startsWith(principal, service);
		} else if (_.isPlainObject(principal)) {
			const join = principal['Fn::Join'];
			if (join) {
				return _.some(join[1], joinPart => _.isString(joinPart) && _.startsWith(joinPart, service));
			}
		}
		return false;
	}

	/**
	 * @param {object} versions
	 * @param {string} functionName
	 * @returns {string}
	 */
	static getFunctionVersionName(versions, functionName) {
		return _.find(_.keys(versions), version => _.startsWith(version, `${functionName}LambdaVersion`));
	}

	/**
	 * @param {object} aliases
	 * @param {string} functionName
	 * @returns {string}
	 */
	static getAliasVersionName(aliases, functionName) {
		return _.find(_.keys(aliases), alias => _.startsWith(alias, `${functionName}Alias`));
	}
}

module.exports = Utils;
