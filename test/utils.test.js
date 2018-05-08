'use strict';
/**
 * Unit tests for utils.
 */
const _ = require('lodash');
const chai = require('chai');
const Utils = require('../lib/utils');

chai.use(require('chai-subset'));
const expect = chai.expect;

describe('Utils', function() {
	describe('#findReferences()', () => {
		it('should not fail without args', () => {
			expect(Utils.findReferences()).to.deep.equal([]);
		});

		it('should not fail on invalid root', () => {
			expect(Utils.findReferences(null)).to.deep.equal([]);
		});

		it('should not fail on invalid references', () => {
			const testRoot = {};
			expect(Utils.findReferences(testRoot)).to.deep.equal([]);
		});

		it('should return CF Refs', () => {
			const testRoot = {
				items: [
					{
						testItem: {
							name: 'Ref'
						}
					},
					{
						otherTestItem: {
							prop1: {
								arrayTest: [
									{
										Ref: 'Ref#2'
									}
								]
							},
							prop2: {
								Ref: 'Ref#3'
							}
						}
					}
				],
				other: {
					Ref: 'Ref#4'
				}
			};
			expect(Utils.findReferences(testRoot, [ 'Ref#2', 'Ref#3' ]))
				.to.deep.equal([ 'items[1].otherTestItem.prop2', 'items[1].otherTestItem.prop1.arrayTest[0]' ]);
		});

		it('should return CF GetAtts', () => {
			const testRoot = {
				items: [
					{
						testItem: {
							'Fn::GetAtt': [
								'Ref',
								'Prop'
							]
						}
					},
					{
						otherTestItem: {
							prop1: {
								arrayTest: [
									{
										'Fn::GetAtt': [
											'Ref#2',
											'Prop#2'
										]
									}
								]
							},
							prop2: {
								'Fn::GetAtt': [
									'Ref#3',
									'Prop#3'
								]
							}
						}
					}
				],
				other: {
					'Fn::GetAtt': [
						'Ref#4',
						'Prop#4'
					]
				}
			};
			expect(Utils.findReferences(testRoot, [ 'Ref#4', 'Ref#3' ]))
				.to.deep.equal([ 'other', 'items[1].otherTestItem.prop2' ]);
		});

		it('should succeed without given refs', () => {
			const testRoot = {
				items: [
					{
						testItem: {
							name: 'Ref'
						}
					},
					{
						otherTestItem: {
							prop1: {
								arrayTest: [
									{
										Ref: 'Ref#2'
									}
								]
							},
							prop2: {
								Ref: 'Ref#3'
							}
						}
					}
				],
				other: {
					Ref: 'Ref#4'
				}
			};
			expect(Utils.findReferences(testRoot, []))
				.to.deep.equal([]);
		});
	});

	describe('#findAllReferences()', () => {
		it('should not fail without args', () => {
			expect(Utils.findAllReferences()).to.deep.equal([]);
		});

		it('should not fail on invalid root', () => {
			expect(Utils.findAllReferences(null)).to.deep.equal([]);
		});

		it('should find all CF refs', () => {
			const testRoot = {
				items: [
					{
						testItem: {
							name: 'Ref'
						}
					},
					{
						otherTestItem: {
							prop1: {
								arrayTest: [
									{
										Ref: 'Ref#2'
									}
								]
							},
							prop2: {
								Ref: 'Ref#3'
							}
						}
					}
				],
				other: {
					Ref: 'Ref#4'
				}
			};
			expect(Utils.findAllReferences(testRoot))
				.to.deep.equal([
					{
						'path': 'other',
						'ref': 'Ref#4'
					},
					{
						'path': 'items[1].otherTestItem.prop2',
						'ref': 'Ref#3'
					},
					{
						'path': 'items[1].otherTestItem.prop1.arrayTest[0]',
						'ref': 'Ref#2'
					}
				]);
		});

		it('should find all CF GetAtts', () => {
			const testRoot = {
				items: [
					{
						testItem: {
							'Fn::GetAtt': [
								'Ref',
								'Prop'
							]
						}
					},
					{
						otherTestItem: {
							prop1: {
								arrayTest: [
									{
										'Fn::GetAtt': [
											'Ref#2',
											'Prop#2'
										]
									}
								]
							},
							prop2: {
								'Fn::GetAtt': [
									'Ref#3',
									'Prop#3'
								]
							}
						}
					}
				],
				other: {
					'Fn::GetAtt': [
						'Ref#4',
						'Prop#4'
					]
				}
			};
			expect(Utils.findAllReferences(testRoot))
				.to.deep.equal([
					{
						'path': 'other',
						'ref': 'Ref#4'
					},
					{
						'path': 'items[1].otherTestItem.prop2',
						'ref': 'Ref#3'
					},
					{
						'path': 'items[1].otherTestItem.prop1.arrayTest[0]',
						'ref': 'Ref#2'
					},
					{
						'path': 'items[0].testItem',
						'ref': 'Ref'
					}
				]);
		});
	});

	describe('#normalizeAliasForLogicalId()', () => {
		it('should do nothing if alias is compliant or nil', () => {
			const values = [
				'aValidAlias',
				'myAlias0123',
				null,
				undefined
			];
			_.forEach(values, value => {
				expect(Utils.normalizeAliasForLogicalId(value)).to.equal(value);
			});
		});

		it('should throw on invalid characters', () => {
			const values = [
				'aValid$Alias',
				'my#Alias0123',
				'n*ull',
				'alias~233'
			];
			_.forEach(values, value => {
				expect(() => Utils.normalizeAliasForLogicalId(value))
					.to.throw(/^Unsupported character/);
			});
		});

		it('should replace all supported characters', () => {
			const values = {
				a_Valid_Alias: 'aUscoreValidUscoreAlias',
				'my-Alias0123': 'myDashAlias0123',
				'a+different_one': 'aPlusdifferentUscoreone',
			};
			_.forOwn(values, (value, alias) => {
				expect(Utils.normalizeAliasForLogicalId(alias)).to.equal(value);
			});
		});
	});

	describe('#hasPermissionPrincipal()', () => {
		it('should work with string principals', () => {
			const permission = {
				'Type': 'AWS::Lambda::Permission',
				'Properties': {
					'FunctionName': {
						'Fn::GetAtt': [
							'MyLambdaLambdaFunction',
							'Arn'
						]
					},
					'Action': 'lambda:InvokeFunction',
					'Principal': 'apigateway.amazonaws.com',
					'SourceArn': {
						'Fn::Join': [
							'',
							[
								'arn:',
								{
									'Ref': 'AWS::Partition'
								},
								':execute-api:',
								{
									'Ref': 'AWS::Region'
								},
								':',
								{
									'Ref': 'AWS::AccountId'
								},
								':',
								{
									'Ref': 'ApiGatewayRestApi'
								},
								'/*/*'
							]
						]
					}
				}
			};

			expect(Utils.hasPermissionPrincipal(permission, 'apigateway')).to.be.true;
		});

		it('should work with constructed principals', () => {
			const permission = {
				'Type': 'AWS::Lambda::Permission',
				'Properties': {
					'FunctionName': {
						'Fn::GetAtt': [
							'MyLambdaLambdaFunction',
							'Arn'
						]
					},
					'Action': 'lambda:InvokeFunction',
					'Principal': {
						'Fn::Join': [
							'',
							[
								'apigateway.',
								{
									'Ref': 'AWS::URLSuffix'
								}
							]
						]
					},
					'SourceArn': {
						'Fn::Join': [
							'',
							[
								'arn:',
								{
									'Ref': 'AWS::Partition'
								},
								':execute-api:',
								{
									'Ref': 'AWS::Region'
								},
								':',
								{
									'Ref': 'AWS::AccountId'
								},
								':',
								{
									'Ref': 'ApiGatewayRestApi'
								},
								'/*/*'
							]
						]
					}
				}
			};

			expect(Utils.hasPermissionPrincipal(permission, 'apigateway')).to.be.true;
		});

		it ('should return false if the service is not matched', () => {
			const permission = {
				'Type': 'AWS::Lambda::Permission',
				'Properties': {
					'FunctionName': {
						'Fn::GetAtt': [
							'MyLambdaLambdaFunction',
							'Arn'
						]
					},
					'Action': 'lambda:InvokeFunction',
					'Principal': {
						'Fn::Join': [
							'',
							[
								'apigateway.',
								{
									'Ref': 'AWS::URLSuffix'
								}
							]
						]
					},
					'SourceArn': {
						'Fn::Join': [
							'',
							[
								'arn:',
								{
									'Ref': 'AWS::Partition'
								},
								':execute-api:',
								{
									'Ref': 'AWS::Region'
								},
								':',
								{
									'Ref': 'AWS::AccountId'
								},
								':',
								{
									'Ref': 'ApiGatewayRestApi'
								},
								'/*/*'
							]
						]
					}
				}
			};

			expect(Utils.hasPermissionPrincipal(permission, 'events')).to.be.false;
		});
	});
});
