'use strict';
/**
 * Unit tests for utils.
 */
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
						"path": "other",
						"ref": "Ref#4"
					},
					{
						"path": "items[1].otherTestItem.prop2",
						"ref": "Ref#3"
					},
					{
						"path": "items[1].otherTestItem.prop1.arrayTest[0]",
						"ref": "Ref#2"
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
						"path": "other",
						"ref": "Ref#4"
					},
					{
						"path": "items[1].otherTestItem.prop2",
						"ref": "Ref#3"
					},
					{
						"path": "items[1].otherTestItem.prop1.arrayTest[0]",
						"ref": "Ref#2"
					},
					{
						"path": "items[0].testItem",
						"ref": "Ref"
					}
				]);
		});
	});
});
