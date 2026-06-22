import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
	createDefaultVintageStoryShape,
	looksLikeVintageStoryShape,
	validateVintageStoryShape
} from '../js/formats/vintage_story_json.js';

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

for (const fixture of ['default_cube.json', 'nested_rotated_cube.json', 'preserved_unknown_fields.json', 'parent_geometry_child.json']) {
	const shape = await readFixture(fixture);
	assert.equal(looksLikeVintageStoryShape(shape), true, `${fixture} should look like a Vintage Story shape`);
	const validation = validateVintageStoryShape(shape);
	assert.equal(validation.ok, true, `${fixture} should validate: ${validation.errors.join(', ')}`);
}

assert.equal(looksLikeVintageStoryShape({meta: {format_version: '5.0'}, elements: []}), false);
assert.equal(validateVintageStoryShape({notAModel: true}).ok, false);
assert.equal(validateVintageStoryShape({elements: {bad: true}, textures: {texture: ''}}).ok, false);

console.log('Vintage Story JSON helper tests passed');
