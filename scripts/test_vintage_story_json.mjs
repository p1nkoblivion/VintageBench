import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
	createDefaultVintageStoryShape,
	looksLikeVintageStoryShape,
	validateVintageStoryShape
} from '../js/formats/vintage_story_json.js';
import {
	applyVintageStoryDisplayTransformsToModel,
	collectVintageStoryDisplayTransformsFromModel
} from '../js/display_mode/vintage_story_display_transforms.js';

const fixtureRoot = join(process.cwd(), 'test', 'fixtures', 'vintage_story_json');

async function readFixture(name) {
	return JSON.parse(await readFile(join(fixtureRoot, name), 'utf8'));
}

const defaultShape = createDefaultVintageStoryShape();
assert.equal(defaultShape.textureWidth, 16);
assert.equal(defaultShape.textureHeight, 16);
assert.deepEqual(defaultShape.textures, {texture: ''});
assert.equal(defaultShape.elements.length, 1);
assert.equal(Object.keys(defaultShape.elements[0].faces).length, 6);

for (const fixture of ['default_cube.json', 'nested_rotated_cube.json', 'preserved_unknown_fields.json', 'parent_geometry_child.json', 'display_transforms_all.json', 'display_transforms_unknown.json']) {
	const shape = await readFixture(fixture);
	assert.equal(looksLikeVintageStoryShape(shape), true, `${fixture} should look like a Vintage Story shape`);
	const validation = validateVintageStoryShape(shape);
	assert.equal(validation.ok, true, `${fixture} should validate: ${validation.errors.join(', ')}`);
}

const transformShape = await readFixture('display_transforms_all.json');
let transformWarnings = [];
let displaySlots = collectVintageStoryDisplayTransformsFromModel(transformShape, transformWarnings);
assert.deepEqual(displaySlots.guiTransform.translation, [1, 2, 3]);
assert.deepEqual(displaySlots.guiTransform.rotation, [10, 20, 30]);
assert.deepEqual(displaySlots.guiTransform.origin, [0.5, 0.5, 0.5]);
assert.deepEqual(displaySlots.guiTransform.scale, [1.25, 1.25, 1.25]);
assert.equal(displaySlots.toolrackTransform.scale[0], 0.75);
assert.equal(displaySlots.onshelfTransform.translation[2], 0.75);

let exportedTransforms = {attributes: {}};
applyVintageStoryDisplayTransformsToModel(exportedTransforms, displaySlots);
assert.equal(exportedTransforms.guiTransform.scale, 1.25);
assert.deepEqual(exportedTransforms.guiTransform.origin, {x: 0.5, y: 0.5, z: 0.5});
assert.equal(exportedTransforms.attributes.toolrackTransform.scale, 0.75);
assert.equal(exportedTransforms.attributes.onshelfTransform.rotation.y, 90);
assert.equal(exportedTransforms.attributes.inForgeTransform.origin.x, 0.25);

const unknownTransformShape = await readFixture('display_transforms_unknown.json');
let unknownWarnings = [];
let unknownSlots = collectVintageStoryDisplayTransformsFromModel(unknownTransformShape, unknownWarnings);
assert.equal(unknownSlots.guiTransform.scale[0], 1);
assert.equal(unknownSlots.guiTransform.vintage_story.extra.customGuiField, true);
assert.equal(unknownSlots.onscrollrackTransform.vintage_story.extra.customRackField, 'preserve');
assert.ok(unknownWarnings.some(warning => warning.includes('non-uniform scaleXyz')));

let exportedUnknownTransforms = {attributes: {unrelatedAttribute: {keep: true}}};
applyVintageStoryDisplayTransformsToModel(exportedUnknownTransforms, unknownSlots);
assert.equal(exportedUnknownTransforms.guiTransform.customGuiField, true);
assert.deepEqual(exportedUnknownTransforms.guiTransform.scaleXyz, {x: 1, y: 2, z: 1});
assert.equal(exportedUnknownTransforms.attributes.onscrollrackTransform.customRackField, 'preserve');
assert.equal(exportedUnknownTransforms.attributes.unrelatedAttribute.keep, true);

assert.equal(looksLikeVintageStoryShape({meta: {format_version: '5.0'}, elements: []}), false);
assert.equal(validateVintageStoryShape({notAModel: true}).ok, false);
assert.equal(validateVintageStoryShape({elements: {bad: true}, textures: {texture: ''}}).ok, false);

console.log('Vintage Story JSON helper tests passed');
