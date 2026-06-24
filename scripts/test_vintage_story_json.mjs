import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {readFile} from 'node:fs/promises';
import * as PathModule from 'node:path';
import JSZip from 'jszip';
import {
	applyVintageStoryShapeToProject,
	compileVintageStoryShape,
	createDefaultVintageStoryShape,
	looksLikeVintageStoryShape,
	validateVintageStoryShape
} from '../js/formats/vintage_story_json.js';
import {
	applyVintageStoryDisplayTransformsToModel,
	collectVintageStoryDisplayTransformsFromModel,
	getVintageStoryDisplaySlotId
} from '../js/display_mode/vintage_story_display_transforms.js';
import { parseVintageStoryAssetText } from '../js/display_mode/vintage_story_asset_parser.js';
import {
	parseVintageStoryAssetDocument,
	serializeVintageStoryAssetDocument
} from '../js/vintagestory/vs_asset_document.js';
import {
	applyTransformEditToAssetObject,
	listVintageStoryAssetVariants,
	resolveAssetBasePath,
	resolveVintageStoryTextureAliases,
	resolveVintageStoryAssetVariant
} from '../js/vintagestory/vs_asset_resolver.js';
import {
	collectResolvedByTypeSources,
	resolveByTypeIntoObject,
	resolveByTypeMap
} from '../js/vintagestory/vs_variant_resolver.js';
import {
	applyInteractionBoxEditToAssetObject,
	interactionBoxFromModelBounds,
	makeFullBlockInteractionBox,
	makeInteractionBoxEditSource,
	validateVintageStoryInteractionBoxes
} from '../js/vintagestory/vs_interaction_boxes.js';
import {
	applyAttachmentEditToAssetObject,
	makeAttachmentEditSource,
	validateVintageStoryAttachment
} from '../js/vintagestory/vs_entity_attachments.js';
import {
	applyTextureOverrideToAssetObject,
	collectVintageStoryTextureEntries,
	copyTextureIntoWorkspace,
	makeTextureEditSource,
	textureAssetBaseFromFilePath,
	updateTextureEntryBase,
	validateVintageStoryTextureEntries
} from '../js/vintagestory/vs_texture_manager.js';
import {
	SAVE_AS_ASSET_ATTACHMENT_MODES,
	SAVE_AS_ASSET_BEHAVIOR_BOX_MODES,
	SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES,
	SAVE_AS_ASSET_INTERACTION_BOX_MODES,
	SAVE_AS_ASSET_LANG_MODES,
	SAVE_AS_ASSET_TEXTURE_MODES,
	SAVE_AS_ASSET_TRANSFORM_MODES,
	assetBaseFromFilePath,
	buildVintageStoryLangEntries,
	buildVintageStoryAssetObject,
	generateVintageStoryAssetPreview,
	parseAdvancedJsonArrayText,
	parseAdvancedJsonObjectText,
	parseAttachmentSlotsText,
	parseCreativeInventoryByTypeText,
	parseGenericByTypeText,
	parsePatternListText,
	parseShapeAlternatesText,
	getSaveAsAssetTransformOptions,
	getVerifiedSaveAsAssetAttributes,
	parseTextureDefaultsText,
	parseTexturesByTypeText,
	parseVariantGroupsText,
	serializeGeneratedVintageStoryAsset
} from '../js/vintagestory/vs_asset_generator.js';
import {
	buildVintageStoryWorkspace,
	getVintageStoryWorkspaceFromSettings,
	getVintageStoryLangPath
} from '../js/vintagestory/vs_asset_workspace.js';
import {
	applyVintageStoryPresetPatchToAsset,
	buildVintageStoryPresetAssetPatch,
	buildVintageStoryPresetFormPatch,
	getSaveAsAssetPresetOptions,
	getVintageStoryAssetPresets,
	previewVintageStoryPresetPatch
} from '../js/vintagestory/vs_asset_presets.js';
import {
	buildVintageStoryModInfo,
	copyVintageStoryPackageToModsFolder,
	createVintageStoryExportPlan,
	createVintageStoryExportPlanFromResolvedContext,
	defaultVintageStoryPackageName,
	executeVintageStoryExportPlan,
	formatVintageStoryExportReport,
	formatVintageStoryValidationReport,
	packageVintageStoryModWorkspace,
	parseVintageStoryDependencyText,
	validateVintageStoryModInfo,
	validateVintageStoryWorkspace
} from '../js/vintagestory/vs_mod_exporter.js';
import {
	clearVintageStoryDirtyFilesWrittenByReport,
	collectVintageStoryDirtyRecords,
	markVintageStoryExportPlanDirty,
	setVintageStoryDirty,
	VINTAGE_STORY_DIRTY_KINDS
} from '../js/vintagestory/vs_dirty_state.js';
import {
	parseVintageStoryBackupPath,
	restoreVintageStoryBackup,
	writeVintageStoryTextFile
} from '../js/vintagestory/vs_file_write_safety.js';
import {
	collectVintageStoryPreservedFields,
	collectVintageStoryTransformMaps,
	formatVintageStoryAdvancedJson,
	formatVintageStoryPreservedFields,
	getVintageStoryAdvancedAssetSections,
	getVintageStoryAdvancedSectionValue,
	makeVintageStoryAdvancedEditPreview,
	makeVintageStoryAdvancedRootEditPreview,
	makeVintageStoryJsonDiff
} from '../js/vintagestory/vs_advanced_json.js';
import {
	buildVintageStoryAssetExplorer,
	getVintageStoryAssetExplorerFindingGroups
} from '../js/vintagestory/vs_asset_explorer.js';
import {
	applyShapeAlternativesToAssetObject,
	cloneVintageStoryShapeAlternatives,
	makeShapeAlternativeFromBase,
	validateVintageStoryShapeAlternatives
} from '../js/vintagestory/vs_shape_alternatives.js';

const {join} = PathModule;
const fixtureRoot = join(process.cwd(), 'test', 'fixtures', 'vintage_story_json');
const assetFixtureRoot = join(process.cwd(), 'test', 'fixtures', 'vintage_story_assets');
const assetSuiteRoot = join(process.cwd(), 'test', 'fixtures', 'vintage_story_asset_suite');

function assertNoEmptyOrNullFields(value, path = 'root') {
	if (value === null) assert.fail(`${path} is null`);
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertNoEmptyOrNullFields(entry, `${path}[${index}]`));
		return;
	}
	if (value && typeof value === 'object') {
		for (let key of Object.keys(value)) {
			assert.notEqual(value[key], undefined, `${path}.${key} is undefined`);
			assertNoEmptyOrNullFields(value[key], `${path}.${key}`);
		}
	}
}

async function readFixture(name) {
	return JSON.parse(await readFile(join(fixtureRoot, name), 'utf8'));
}

async function readAssetSuiteJson(relative_path) {
	return JSON.parse(await readFile(join(assetSuiteRoot, relative_path), 'utf8'));
}

async function readAssetSuiteDocument(relative_path) {
	let absolute_path = join(assetSuiteRoot, relative_path);
	return parseVintageStoryAssetDocument(await readFile(absolute_path, 'utf8'), absolute_path);
}

function assetSuiteResolverOptions(source_file_path) {
	return {
		sourceFilePath: source_file_path,
		fs,
		PathModule,
		modAssetRoot: join(assetSuiteRoot, 'synthetic_mod')
	};
}

async function resolveAssetSuiteVariant(relative_path, variant_code) {
	let source_file_path = join(assetSuiteRoot, relative_path);
	let document = parseVintageStoryAssetDocument(await readFile(source_file_path, 'utf8'), source_file_path);
	let variants = listVintageStoryAssetVariants(document, 0);
	let variant = variants.allVariants.find(entry => entry.variantCode === variant_code)
		|| variants.includedVariants.find(entry => entry.variantCode === variant_code)
		|| variants.includedVariants[0];
	assert.ok(variant, `${relative_path} should have a variant to resolve`);
	return {
		document,
		variants,
		variant,
		resolved: resolveVintageStoryAssetVariant(document, 0, variant, assetSuiteResolverOptions(source_file_path))
	};
}

function stableClone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertDetailedDiagnostic(issue) {
	assert.ok(issue, 'diagnostic should exist');
	assert.equal(['info', 'warning', 'error'].includes(issue.severity), true);
	assert.equal(typeof issue.filePath, 'string');
	assert.notEqual(issue.filePath.length, 0);
	assert.equal(typeof issue.jsonPath, 'string');
	assert.notEqual(issue.jsonPath.length, 0);
	assert.equal(typeof issue.variantCode, 'string');
	assert.notEqual(issue.variantCode.length, 0);
	assert.equal(typeof issue.what, 'string');
	assert.notEqual(issue.what.length, 0);
	assert.equal(typeof issue.why, 'string');
	assert.notEqual(issue.why.length, 0);
	assert.equal(typeof issue.suggestedFix, 'string');
	assert.notEqual(issue.suggestedFix.length, 0);
	assert.equal(typeof issue.blocks, 'string');
	assert.notEqual(issue.blocks.length, 0);
}

function installVintageStoryShapeRoundTripMocks() {
	let textureIndex = 0;
	const faceDirections = ['north', 'east', 'south', 'west', 'up', 'down'];

	globalThis.Texture = class Texture {
		static all = [];
		constructor(data = {}) {
			this.uuid = data.uuid || `texture-${++textureIndex}`;
			this.name = data.name || '';
			this.id = data.id;
			this.path = data.path || '';
			this.uv_width = data.uv_width || 16;
			this.uv_height = data.uv_height || 16;
			this.vintage_story = stableClone(data.vintage_story || {});
		}
		add() {
			Texture.all.push(this);
			return this;
		}
		loadEmpty() {
			return this;
		}
		fromPath(path) {
			this.path = path;
			return this;
		}
	};

	globalThis.Cube = class Cube {
		constructor(data = {}) {
			this.name = data.name || 'Cube';
			this.from = stableClone(data.from || [0, 0, 0]);
			this.to = stableClone(data.to || [0, 0, 0]);
			this.origin = stableClone(data.origin || [0, 0, 0]);
			this.rotation = stableClone(data.rotation || [0, 0, 0]);
			this.shade = data.shade !== false;
			this.vintage_story = stableClone(data.vintage_story || {});
			this.vs_cullface_mode = data.vs_cullface_mode || 'preserve';
			this.vs_glow = typeof data.vs_glow === 'number' ? data.vs_glow : -1;
			this.vs_light_level = typeof data.vs_light_level === 'number' ? data.vs_light_level : -1;
			this.vs_render_pass = typeof data.vs_render_pass === 'number' ? data.vs_render_pass : -1;
			this.vs_wind_mode = data.vs_wind_mode || '';
			this.children = [];
			this.export = data.export !== false;
			this.faces = {};
			faceDirections.forEach(direction => {
				this.faces[direction] = {
					enabled: true,
					texture: false,
					uv: [0, 0, 0, 0],
					rotation: 0,
					vintage_story: {}
				};
			});
		}
		addTo(parent) {
			if (!parent || parent === 'root') {
				Outliner.root.push(this);
			} else {
				parent.children.push(this);
			}
			return this;
		}
		init() {
			return this;
		}
	};

	globalThis.Group = class Group {};
	globalThis.Outliner = {root: []};
	globalThis.Project = {
		texture_width: 16,
		texture_height: 16,
		vintage_story_data: {},
		display_settings: {},
		saved: false
	};
	globalThis.Canvas = {
		updateAllBones() {},
		updateAllPositions() {},
		updateAllFaces() {}
	};
	globalThis.Validator = {validate() {}};
	globalThis.Blockbench = {showMessageBox() {}, showQuickMessage() {}};

	return function resetVintageStoryRoundTripProject() {
		Texture.all.length = 0;
		Outliner.root.length = 0;
		Project.texture_width = 16;
		Project.texture_height = 16;
		Project.vintage_story_data = {};
		Project.display_settings = {};
		Project.saved = false;
	};
}

const resetVintageStoryRoundTripProject = installVintageStoryShapeRoundTripMocks();

function assertRoundTrippedShapePreserves(original, round_tripped, label) {
	assert.deepEqual(round_tripped.editor, original.editor, `${label}: editor metadata should survive`);
	assert.deepEqual(round_tripped.textures, original.textures, `${label}: texture aliases should survive`);
	assert.deepEqual(round_tripped.textureSizes, original.textureSizes, `${label}: texture sizes should survive`);
	assert.deepEqual(round_tripped.animations, original.animations, `${label}: animations should survive`);
	assert.deepEqual(round_tripped.vintageBenchUnknownRootFixture, original.vintageBenchUnknownRootFixture, `${label}: unknown root fields should survive`);
	assert.deepEqual(round_tripped.attributes, original.attributes, `${label}: unknown non-display attributes should survive`);
	assert.equal(round_tripped.elements.length, original.elements.length, `${label}: root element count should survive`);
	assert.deepEqual(round_tripped.elements[0].vintageBenchUnknownElementFixture, original.elements[0].vintageBenchUnknownElementFixture, `${label}: unknown element fields should survive`);
	assert.deepEqual(round_tripped.elements[0].attachmentpoints, original.elements[0].attachmentpoints, `${label}: attachmentpoints should survive`);
	assert.deepEqual(round_tripped.elements[0].faces.north.vintageBenchUnknownFaceFixture, original.elements[0].faces.north.vintageBenchUnknownFaceFixture, `${label}: unknown face fields should survive`);
	assert.deepEqual(round_tripped.elements[0].faces.north.glow, original.elements[0].faces.north.glow, `${label}: face metadata should survive`);
}

const defaultShape = createDefaultVintageStoryShape();
const jsonLikeAsset = parseVintageStoryAssetText(`{
	code: 'preview-test',
	shape: { base: "block/stone/forge/forge" },
	variantgroups: [
		{ code: "type", states: ["normal", "aged",] },
	],
	// Vintage Story assets commonly use JSON-like comments.
	textures: { stone: { base: "block/stone/rock/granite" }, },
	leadingDecimal: .25,
}`);
assert.equal(jsonLikeAsset.code, 'preview-test');
assert.equal(jsonLikeAsset.shape.base, 'block/stone/forge/forge');
assert.equal(jsonLikeAsset.variantgroups[0].states[1], 'aged');
assert.equal(jsonLikeAsset.leadingDecimal, 0.25);

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

const preservedShapeFixture = await readFixture('preserved_unknown_fields.json');
resetVintageStoryRoundTripProject();
applyVintageStoryShapeToProject(stableClone(preservedShapeFixture), join(fixtureRoot, 'preserved_unknown_fields.json'), {warnings: []});
assert.equal(Outliner.root[0].vs_render_pass, -1, 'imported renderPass should be exposed on the cube');
assert.equal(Outliner.root[0].vs_glow, 4, 'uniform imported glow should be exposed on the cube');
const preservedShapeSaved = JSON.parse(compileVintageStoryShape());
assert.equal(validateVintageStoryShape(preservedShapeSaved).ok, true);
assertRoundTrippedShapePreserves(preservedShapeFixture, preservedShapeSaved, 'preserved_unknown_fields.json');

const complexRoundTripShape = {
	editor: {allAngles: true, keepEditorExtra: true},
	textureWidth: 32,
	textureHeight: 16,
	textureSizes: {metal: [32, 16]},
	textures: {
		metal: {base: 'block/metal/iron', keepTextureExtra: true},
		wood: 'block/wood/debarked/oak'
	},
	attributes: {
		keepShapeAttribute: {nested: true}
	},
	vintageBenchUnknownRootFixture: {kept: true},
	animations: [
		{
			name: 'idle',
			code: 'idle',
			quantityframes: 10,
			keyframes: [
				{frame: 0, elements: {Root: {rotationX: 0}}}
			]
		}
	],
	elements: [
		{
			name: 'Root',
			from: [0, 0, 0],
			to: [4, 6, 8],
			shade: true,
			renderPass: 2,
			lightLevel: 8,
			rotationOrigin: [2, 3, 4],
			rotationX: 0,
			rotationY: 22.5,
			rotationZ: 0,
			stepParentName: 'MountPoint',
			scaleX: 1.25,
			vintageBenchUnknownElementFixture: 'root-kept',
			faces: {
				north: {
					texture: '#metal',
					uv: [1, 2, 9, 10],
					rotation: 0,
					enabled: true,
					glow: 3,
					windMode: 'WeakWind',
					cullface: 'north',
					vintageBenchUnknownFaceFixture: 'north-kept'
				},
				south: {
					texture: '#wood',
					uv: [0, 0, 4, 6],
					rotation: 90
				}
			},
			attachmentpoints: [
				{code: 'held', posX: 1, posY: 2, posZ: 3, rotationX: 0, rotationY: 180, rotationZ: 0}
			],
			children: [
				{
					name: 'Child',
					from: [1, 1, 1],
					to: [2, 2, 2],
					shade: false,
					rotationOrigin: [1.5, 1.5, 1.5],
					rotationX: 0,
					rotationY: 0,
					rotationZ: 0,
					faces: {
						up: {
							texture: '#wood',
							uv: [0, 0, 1, 1],
							enabled: false,
							vintageBenchUnknownFaceFixture: 'child-up-kept'
						}
					},
					vintageBenchUnknownElementFixture: 'child-kept'
				}
			]
		}
	]
};
resetVintageStoryRoundTripProject();
applyVintageStoryShapeToProject(stableClone(complexRoundTripShape), join(fixtureRoot, 'complex_round_trip.json'), {warnings: []});
const complexShapeSaved = JSON.parse(compileVintageStoryShape());
const complexShapeReopened = stableClone(complexShapeSaved);
assert.equal(validateVintageStoryShape(complexShapeReopened).ok, true);
assert.deepEqual(complexShapeReopened, complexRoundTripShape, 'complex shape import/save/reopen should preserve hierarchy, UVs, rotations, origins, textures, animations, attributes, and unknown fields');

const editableVintageStoryElementFieldsShape = {
	editor: {allAngles: true},
	textureWidth: 16,
	textureHeight: 16,
	textures: {texture: ''},
	elements: [
		{
			name: 'EditableMetadata',
			from: [0, 0, 0],
			to: [1, 1, 1],
			renderPass: 1,
			lightLevel: 4,
			faces: {
				north: {texture: '#texture', uv: [0, 0, 1, 1], glow: 5, windMode: 'WeakWind', cullface: 'north'},
				east: {texture: '#texture', uv: [0, 0, 1, 1], glow: 5, windMode: 'WeakWind', cullface: 'east'}
			},
			rotationOrigin: [0, 0, 0]
		}
	]
};
resetVintageStoryRoundTripProject();
applyVintageStoryShapeToProject(stableClone(editableVintageStoryElementFieldsShape), 'editable_vintage_story_element_fields.json', {warnings: []});
let editableCube = Outliner.root[0];
assert.equal(editableCube.vs_cullface_mode, 'self');
assert.equal(editableCube.vs_glow, 5);
assert.equal(editableCube.vs_light_level, 4);
assert.equal(editableCube.vs_render_pass, 1);
assert.equal(editableCube.vs_wind_mode, 'WeakWind');
editableCube.vs_cullface_mode = 'off';
editableCube.vs_glow = 12;
editableCube.vs_light_level = 10;
editableCube.vs_render_pass = 3;
editableCube.vs_wind_mode = 'NormalWind';
const editableFieldsSaved = JSON.parse(compileVintageStoryShape());
assert.equal(editableFieldsSaved.elements[0].renderPass, 3);
assert.equal(editableFieldsSaved.elements[0].lightLevel, 10);
assert.equal(editableFieldsSaved.elements[0].faces.north.glow, 12);
assert.equal(editableFieldsSaved.elements[0].faces.east.glow, 12);
assert.equal(editableFieldsSaved.elements[0].faces.north.windMode, 'NormalWind');
assert.equal(editableFieldsSaved.elements[0].faces.east.windMode, 'NormalWind');
assert.equal(Object.prototype.hasOwnProperty.call(editableFieldsSaved.elements[0].faces.north, 'cullface'), false);
assert.equal(Object.prototype.hasOwnProperty.call(editableFieldsSaved.elements[0].faces.east, 'cullface'), false);

const transformShape = await readFixture('display_transforms_all.json');
let transformWarnings = [];
let displaySlots = collectVintageStoryDisplayTransformsFromModel(transformShape, transformWarnings);
assert.equal(getVintageStoryDisplaySlotId('fpHandTransform'), 'fpHandTransform');
assert.equal(getVintageStoryDisplaySlotId('fpOffHandTransform'), 'fpHandTransform');
assert.deepEqual(displaySlots.guiTransform.translation, [1, 2, 3]);
assert.deepEqual(displaySlots.guiTransform.rotation, [10, 20, 30]);
assert.deepEqual(displaySlots.guiTransform.origin, [0.5, 0.5, 0.5]);
assert.deepEqual(displaySlots.guiTransform.scale, [1.25, 1.25, 1.25]);
assert.deepEqual(displaySlots.fpHandTransform.translation, [3, 4, 5]);
assert.deepEqual(displaySlots.fpHandTransform.origin, [0.25, 0.5, 0.75]);
assert.equal(displaySlots.fpHandTransform.scale[0], 1.4);
assert.equal(displaySlots.fpOffHandTransform, undefined);
assert.deepEqual(displaySlots.tpHandTransform.translation, [-1, 0, 2]);
assert.deepEqual(displaySlots.tpOffHandTransform.translation, [2, 0, -1]);
assert.equal(displaySlots.toolrackTransform.scale[0], 0.75);
assert.equal(displaySlots.onshelfTransform.translation[2], 0.75);
assert.equal(displaySlots.inFirePitPropsTransform.scale[0], 0.6);

let exportedTransforms = {attributes: {inFirePitProps: {burnTemperature: 800}}};
applyVintageStoryDisplayTransformsToModel(exportedTransforms, displaySlots);
assert.equal(exportedTransforms.guiTransform.scale, 1.25);
assert.deepEqual(exportedTransforms.guiTransform.origin, {x: 0.5, y: 0.5, z: 0.5});
assert.equal(exportedTransforms.fpHandTransform.scale, 1.4);
assert.equal(exportedTransforms.tpHandTransform.translation.x, -1);
assert.equal(exportedTransforms.tpOffHandTransform.translation.x, 2);
assert.equal(exportedTransforms.attributes.toolrackTransform.scale, 0.75);
assert.equal(exportedTransforms.attributes.onshelfTransform.rotation.y, 90);
assert.equal(exportedTransforms.attributes.inForgeTransform.origin.x, 0.25);
assert.equal(exportedTransforms.attributes.inFirePitProps.burnTemperature, 800);
assert.equal(exportedTransforms.attributes.inFirePitProps.transform.scale, 0.6);

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

const bladeAssetPath = join(assetFixtureRoot, 'mod', 'assets', 'test', 'itemtypes', 'tool', 'blade.json');
const bladeAssetText = await readFile(bladeAssetPath, 'utf8');
const bladeDocument = parseVintageStoryAssetDocument(bladeAssetText, bladeAssetPath);
assert.equal(bladeDocument.assetObjects.length, 1);
assert.equal(bladeDocument.assetObjects[0].object.code, 'blade');
const bladeAdvancedAsset = stableClone(bladeDocument.assetObjects[0].object);
bladeAdvancedAsset.attackpowerbytype = {'blade-falx-*': 3.75};
bladeAdvancedAsset.handbook = {groupBy: ['blade']};
bladeAdvancedAsset.customModField = {keep: true};
bladeAdvancedAsset.fpHandTransformByType = {'*': {translation: {x: 0, y: 1, z: 2}, scale: 1.1}};
bladeAdvancedAsset.toolrackTransformByType = {'*': {translation: {x: 2, y: 1, z: 0}, scale: 0.65}};
bladeAdvancedAsset.attributes.inFirePitPropsByType = {'*': {cookTime: 12, transform: {scale: 0.8}}};
const advancedSections = getVintageStoryAdvancedAssetSections(bladeAdvancedAsset);
assert.ok(advancedSections.some(section => section.id === 'root'), 'advanced root JSON editor section should exist');
assert.ok(advancedSections.some(section => section.id === 'attributes'), 'advanced attributes editor section should exist');
assert.ok(advancedSections.some(section => section.id === 'attributesByType'), 'advanced attributesByType editor section should exist');
assert.ok(advancedSections.some(section => section.id === 'behaviors'), 'advanced behaviors editor section should exist');
assert.ok(advancedSections.some(section => section.id === 'transformMaps'), 'advanced transform map editor section should exist');
assert.ok(advancedSections.some(section => section.id === 'behaviorProperties:0'), 'advanced behavior properties editor section should exist');
const preservedAdvancedFields = collectVintageStoryPreservedFields(bladeAdvancedAsset);
assert.ok(preservedAdvancedFields.some(field => field.jsonPath === 'root.attackpowerbytype'), 'known combat ByType fields should be visible as preserved');
assert.ok(preservedAdvancedFields.some(field => field.jsonPath === 'root.handbook'), 'known handbook fields should be visible as preserved');
assert.ok(preservedAdvancedFields.some(field => field.jsonPath === 'root.customModField'), 'custom root fields should be visible as preserved');
assert.ok(preservedAdvancedFields.some(field => field.jsonPath === 'root.attributesByType["blade-falx-*"]'), 'attributesByType entries should be visible as preserved');
assert.ok(preservedAdvancedFields.some(field => field.jsonPath === 'root.behaviors[0].properties.layout'), 'behavior properties should be visible as preserved');
assert.ok(formatVintageStoryPreservedFields(preservedAdvancedFields).includes('root.attackpowerbytype'));
const bladeAttributesByType = stableClone(getVintageStoryAdvancedSectionValue(bladeAdvancedAsset, 'attributesByType'));
bladeAttributesByType['blade-falx-copper'] = {
	ripHarvest: false,
	attachableToEntity: {
		categoryCode: 'weaponfalx-advanced',
		keepAdvancedField: {nested: true}
	}
};
const attributesByTypePreview = makeVintageStoryAdvancedEditPreview(
	bladeAdvancedAsset,
	'attributesByType',
	formatVintageStoryAdvancedJson(bladeAttributesByType)
);
assert.equal(attributesByTypePreview.errors.length, 0);
assert.equal(attributesByTypePreview.changed, true);
assert.equal(attributesByTypePreview.diff.includes('--- before'), true);
assert.equal(attributesByTypePreview.diff.includes('+++ after'), true);
assert.equal(attributesByTypePreview.afterAsset.attributesByType['blade-falx-*'].ripHarvest, true);
assert.equal(attributesByTypePreview.afterAsset.attributesByType['blade-falx-copper'].attachableToEntity.categoryCode, 'weaponfalx-advanced');
assert.deepEqual(attributesByTypePreview.afterAsset.behaviors, bladeAdvancedAsset.behaviors, 'attributesByType advanced edit should preserve unrelated behaviors');
const behaviorProperties = stableClone(getVintageStoryAdvancedSectionValue(bladeAdvancedAsset, 'behaviorProperties:0'));
behaviorProperties.selectionBox.y2 = 0.35;
behaviorProperties.customBehaviorData = {keep: 'yes'};
const behaviorPreview = makeVintageStoryAdvancedEditPreview(
	bladeAdvancedAsset,
	'behaviorProperties:0',
	formatVintageStoryAdvancedJson(behaviorProperties)
);
assert.equal(behaviorPreview.errors.length, 0);
assert.equal(behaviorPreview.afterAsset.behaviors[0].properties.selectionBox.y2, 0.35);
assert.equal(behaviorPreview.afterAsset.behaviors[0].properties.customBehaviorData.keep, 'yes');
assert.deepEqual(behaviorPreview.afterAsset.attributesByType, bladeAdvancedAsset.attributesByType, 'behavior property advanced edit should preserve attributesByType');
const transformMaps = collectVintageStoryTransformMaps(bladeAdvancedAsset);
assert.ok(transformMaps.guiTransformByType, 'root transform ByType map should be editable');
assert.ok(transformMaps.fpHandTransformByType, 'first-person transform ByType map should be editable');
assert.ok(transformMaps.toolrackTransformByType, 'root toolrack transform ByType map should be editable');
assert.ok(transformMaps['attributes.toolrackTransformByType'], 'attributes transform ByType map should be editable');
assert.ok(transformMaps['attributes.inFirePitPropsByType'], 'nested firepit transform ByType map should be editable');
transformMaps.guiTransformByType['blade-falx-copper'] = {
	translation: {x: 11, y: 12, z: 13},
	scale: 1.25
};
transformMaps.fpHandTransformByType['blade-falx-copper'] = {
	translation: {x: 1, y: 1, z: 1},
	scale: 1.35
};
transformMaps.toolrackTransformByType['blade-falx-copper'] = {
	translation: {x: 3, y: 3, z: 3},
	scale: 0.85
};
transformMaps['attributes.toolrackTransformByType']['blade-falx-copper'] = {
	translation: {x: 5, y: 5, z: 5},
	scale: 0.95
};
transformMaps['attributes.inFirePitPropsByType']['blade-falx-copper'] = {
	cookTime: 6,
	transform: {translation: {x: 6, y: 5, z: 4}, scale: 0.7}
};
const transformPreview = makeVintageStoryAdvancedEditPreview(
	bladeAdvancedAsset,
	'transformMaps',
	formatVintageStoryAdvancedJson(transformMaps)
);
assert.equal(transformPreview.errors.length, 0);
assert.equal(transformPreview.afterAsset.guiTransformByType['blade-falx-copper'].translation.x, 11);
assert.equal(transformPreview.afterAsset.fpHandTransformByType['blade-falx-copper'].scale, 1.35);
assert.equal(transformPreview.afterAsset.toolrackTransformByType['blade-falx-copper'].scale, 0.85);
assert.equal(transformPreview.afterAsset.attributes.toolrackTransformByType['blade-falx-copper'].scale, 0.95);
assert.equal(transformPreview.afterAsset.attributes.inFirePitPropsByType['blade-falx-copper'].transform.translation.x, 6);
assert.equal(transformPreview.afterAsset.attributes.inFirePitPropsByType['*'].cookTime, 12);
assert.deepEqual(transformPreview.afterAsset.attributesByType, bladeAdvancedAsset.attributesByType, 'transform map advanced edit should preserve non-transform attributesByType');
const rootEditedAdvancedAsset = stableClone(bladeAdvancedAsset);
rootEditedAdvancedAsset.customModField.extra = 'edited';
const rootPreview = makeVintageStoryAdvancedEditPreview(bladeAdvancedAsset, 'root', formatVintageStoryAdvancedJson(rootEditedAdvancedAsset));
assert.equal(rootPreview.errors.length, 0);
assert.equal(rootPreview.afterAsset.customModField.extra, 'edited');
assert.deepEqual(rootPreview.afterAsset.attributesByType['blade-falx-*'].attachableToEntity, bladeAdvancedAsset.attributesByType['blade-falx-*'].attachableToEntity);
const invalidAdvancedPreview = makeVintageStoryAdvancedEditPreview(bladeAdvancedAsset, 'attributes', '[]');
assert.equal(invalidAdvancedPreview.errors.some(error => error.includes('must be a JSON object')), true);
const modInfoAdvancedPreview = makeVintageStoryAdvancedRootEditPreview(
	{type: 'content', modid: 'test', name: 'Test', authors: ['P1nkOblivion'], version: '1.0.0', dependencies: {game: ''}, custom: {keep: true}},
	'{ type: "content", modid: "test", name: "Test", authors: ["P1nkOblivion"], version: "1.0.1", dependencies: { game: "" }, custom: { keep: true, edited: true } }',
	'modinfo.json'
);
assert.equal(modInfoAdvancedPreview.errors.length, 0);
assert.equal(modInfoAdvancedPreview.changed, true);
assert.equal(modInfoAdvancedPreview.afterRoot.version, '1.0.1');
assert.equal(modInfoAdvancedPreview.afterRoot.custom.edited, true);
assert.equal(makeVintageStoryJsonDiff('{"a":1}\n', '{"a":2}\n').includes('-{"a":1}'), true);

const multipleDocument = parseVintageStoryAssetDocument(
	await readFile(join(assetFixtureRoot, 'multiple_assets.json'), 'utf8'),
	join(assetFixtureRoot, 'multiple_assets.json')
);
assert.equal(multipleDocument.assetObjects.length, 2);
assert.equal(multipleDocument.assetObjects[1].object.code, 'second');

const assetSuiteManifest = await readAssetSuiteJson('manifest.json');
for (const [scenario, relative_paths] of Object.entries(assetSuiteManifest.fixtures)) {
	assert.ok(Array.isArray(relative_paths) && relative_paths.length, `${scenario} should list at least one fixture file`);
	for (const relative_path of relative_paths) {
		assert.equal(fs.existsSync(join(assetSuiteRoot, relative_path)), true, `${scenario} fixture should exist: ${relative_path}`);
	}
}
assert.equal(fs.existsSync(join(assetSuiteRoot, assetSuiteManifest.bossFight)), true, 'boss fight blade fixture should exist');
assert.equal(fs.existsSync(join(assetSuiteRoot, 'local_real', '.gitignore')), true, 'local real fixture folder should stay git-ignored');

for (const relative_path of [
	...assetSuiteManifest.fixtures.minimalShape,
	...assetSuiteManifest.fixtures.shapeWithCuboidChildren,
	...assetSuiteManifest.fixtures.shapeWithMultipleTextureAliases,
	...assetSuiteManifest.fixtures.unknownFieldsAtEveryLevel.filter(path => path.includes('/shapes/'))
]) {
	let shape = await readAssetSuiteJson(relative_path);
	assert.equal(looksLikeVintageStoryShape(shape), true, `${relative_path} should look like a Vintage Story shape`);
	let validation = validateVintageStoryShape(shape);
	assert.equal(validation.ok, true, `${relative_path} should validate: ${validation.errors.join(', ')}`);
}

const suiteSimpleItem = await readAssetSuiteDocument('synthetic_mod/assets/synthetic/itemtypes/simple_item.json');
assert.equal(suiteSimpleItem.assetObjects[0].object.code, 'simple-item');
const suiteSimpleBlock = await readAssetSuiteDocument('synthetic_mod/assets/synthetic/blocktypes/simple_block.json');
assert.equal(suiteSimpleBlock.assetObjects[0].object.code, 'simple-block');
assert.equal(suiteSimpleBlock.assetObjects[0].object.collisionbox.x2, 1);

const oneVariantDocument = await readAssetSuiteDocument('synthetic_mod/assets/synthetic/itemtypes/one_variant.json');
assert.deepEqual(listVintageStoryAssetVariants(oneVariantDocument, 0).includedVariants.map(variant => variant.variantCode), [
	'onevariant-red',
	'onevariant-blue',
	'onevariant-green'
]);
const multiVariantDocument = await readAssetSuiteDocument('synthetic_mod/assets/synthetic/itemtypes/multi_variant.json');
assert.deepEqual(listVintageStoryAssetVariants(multiVariantDocument, 0).includedVariants.map(variant => variant.variantCode), [
	'multivariant-red-small',
	'multivariant-blue-small',
	'multivariant-red-large',
	'multivariant-blue-large'
]);
const allowedSkipDocument = await readAssetSuiteDocument('synthetic_mod/assets/synthetic/itemtypes/allowed_skip.json');
const allowedSkipVariants = listVintageStoryAssetVariants(allowedSkipDocument, 0);
const allowedSkipByCode = new Map(allowedSkipVariants.allVariants.map(variant => [variant.variantCode, variant]));
assert.equal(allowedSkipByCode.get('allowedskip-alpha-copper').included, true);
assert.equal(allowedSkipByCode.get('allowedskip-alpha-iron').skipped, true);
assert.equal(allowedSkipByCode.get('allowedskip-beta-copper').disallowed, true);
assert.equal(allowedSkipByCode.get('allowedskip-beta-iron').included, true);

const resolverOrderAsset = {
	code: 'resolver-order',
	variantgroups: [
		{code: 'type', states: ['plain', 'fancy']},
		{code: 'metal', states: ['copper', 'iron']}
	],
	allowedVariants: ['resolver-order-plain-*', 'resolver-order-fancy-iron'],
	skipVariants: ['resolver-order-plain-copper'],
	shape: {base: 'item/variant/default'}
};
const resolverOrderDocument = {
	root: resolverOrderAsset,
	assetObjects: [{object: resolverOrderAsset}],
	filePath: join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'itemtypes', 'resolver_order.json')
};
const resolverOrderVariants = listVintageStoryAssetVariants(resolverOrderDocument, 0);
assert.deepEqual(resolverOrderVariants.allVariants.map(variant => variant.variantCode), [
	'resolver-order-plain-copper',
	'resolver-order-fancy-copper',
	'resolver-order-plain-iron',
	'resolver-order-fancy-iron'
]);
assert.deepEqual(resolverOrderVariants.includedVariants.map(variant => variant.variantCode), [
	'resolver-order-plain-iron',
	'resolver-order-fancy-iron'
]);
const resolverOrderByCode = new Map(resolverOrderVariants.allVariants.map(variant => [variant.variantCode, variant]));
assert.equal(resolverOrderByCode.get('resolver-order-plain-copper').skipped, true);
assert.equal(resolverOrderByCode.get('resolver-order-plain-copper').included, false);
assert.equal(resolverOrderByCode.get('resolver-order-fancy-copper').disallowed, true);
assert.equal(resolverOrderByCode.get('resolver-order-fancy-copper').included, false);

const priorityByTypeMap = {
	'*': 'fallback',
	'resolver-order-*': 'broad',
	'resolver-order-plain-*': 'specific',
	'resolver-order-plain-iron': 'exact'
};
assert.equal(resolveByTypeMap(priorityByTypeMap, 'resolver-order-plain-iron').matchedPattern, 'resolver-order-plain-iron');
assert.equal(resolveByTypeMap(priorityByTypeMap, 'resolver-order-plain-copper').matchedPattern, 'resolver-order-plain-*');
assert.equal(resolveByTypeMap(priorityByTypeMap, 'resolver-order-fancy-copper').matchedPattern, 'resolver-order-*');
assert.equal(resolveByTypeMap({'*': 'fallback'}, 'resolver-order-admin-gold').fallback, true);
for (let i = 0; i < 5; i++) {
	assert.equal(resolveByTypeMap({'a*c': 'first', 'ab*': 'second'}, 'abc').matchedPattern, 'a*c');
}

const resolverCoreAsset = {
	code: 'resolver-order',
	variantgroups: resolverOrderAsset.variantgroups,
	shapeByType: {
		'*': {base: 'item/variant/default'},
		'resolver-order-plain-*': {base: 'item/variant/blue'},
		'resolver-order-plain-iron': {base: 'item/variant/red'}
	},
	textures: {
		trim: {base: 'item/bytype/trim'}
	},
	texturesByType: {
		'*': {outside: {base: 'item/bytype/fallback'}},
		'resolver-order-*': {outside: {base: 'item/bytype/green'}},
		'resolver-order-plain-*': {outside: {base: 'item/bytype/blue'}}
	},
	creativeinventoryByType: {
		'*': {general: ['fallback']},
		'resolver-order-plain-*': {general: ['specific']}
	},
	attributes: {
		directOnly: true,
		nested: {base: true},
		inFirePitProps: {
			burnTemperature: 500,
			transform: {scale: 0.4, origin: {x: 0.1, y: 0.2, z: 0.3}}
		},
		inFirePitPropsByType: {
			'*': {burnTemperature: 700, transform: {scale: 0.6}},
			'resolver-order-plain-*': {transform: {translation: {x: 3, y: 2, z: 1}}}
		}
	},
	attributesByType: {
		'resolver-order-plain-*': {
			ripHarvest: true,
			nested: {fromByType: true},
			attachableToEntityByType: {
				'*': {categoryCode: 'fallback'},
				'resolver-order-plain-*': {categoryCode: 'plain'}
			}
		}
	},
	collisionboxByType: {
		'*': {x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1},
		'resolver-order-plain-*': {x1: 0, y1: 0, z1: 0, x2: 0.5, y2: 0.5, z2: 0.5}
	},
	selectionboxByType: {
		'*': {x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1},
		'resolver-order-plain-iron': {x1: 0.1, y1: 0, z1: 0.1, x2: 0.9, y2: 0.8, z2: 0.9}
	},
	guiTransformByType: {
		'*': {scale: 0.5},
		'resolver-order-plain-*': {scale: 1.25}
	},
	groundTransformByType: {
		'*': {translation: {x: 0, y: 1, z: 0}}
	},
	tpHandTransformByType: {
		'resolver-order-plain-*': {rotation: {x: 90, y: 0, z: 0}}
	},
	fpHandTransformByType: {
		'resolver-order-plain-*': {scale: 1.75}
	},
	toolrackTransformByType: {
		'*': {scale: 1.2}
	},
	attackpowerbytype: {
		'*': 1,
		'resolver-order-plain-*': 4
	},
	durabilitybytype: {
		'*': 10,
		'resolver-order-plain-iron': 50
	},
	tooltierbytype: {
		'*': 1,
		'resolver-order-plain-*': 2
	},
	customUnknownByType: {
		'*': {name: 'fallback'},
		'resolver-order-plain-*': {name: 'specific', path: '{type}/{metal}'}
	},
	nested: {
		customNestedByType: {
			'*': 'nested-fallback',
			'resolver-order-plain-*': 'nested-specific'
		}
	}
};
const resolverCoreRuntime = resolveByTypeIntoObject(resolverCoreAsset, 'resolver-order-plain-iron', {type: 'plain', metal: 'iron'});
assert.equal(resolverCoreRuntime.shape.base, 'item/variant/red');
assert.equal(resolverCoreRuntime.textures.outside.base, 'item/bytype/blue');
assert.equal(resolverCoreRuntime.textures.trim.base, 'item/bytype/trim');
assert.deepEqual(resolverCoreRuntime.creativeinventory.general, ['specific']);
assert.equal(resolverCoreRuntime.attributes.directOnly, true);
assert.equal(resolverCoreRuntime.attributes.ripHarvest, true);
assert.equal(resolverCoreRuntime.attributes.nested.base, true);
assert.equal(resolverCoreRuntime.attributes.nested.fromByType, true);
assert.equal(resolverCoreRuntime.collisionbox.x2, 0.5);
assert.equal(resolverCoreRuntime.selectionbox.x1, 0.1);
assert.equal(resolverCoreRuntime.guiTransform.scale, 1.25);
assert.equal(resolverCoreRuntime.groundTransform.translation.y, 1);
assert.equal(resolverCoreRuntime.tpHandTransform.rotation.x, 90);
assert.equal(resolverCoreRuntime.fpHandTransform.scale, 1.75);
assert.equal(resolverCoreRuntime.toolrackTransform.scale, 1.2);
assert.equal(resolverCoreRuntime.attributes.inFirePitProps.burnTemperature, 500);
assert.equal(resolverCoreRuntime.attributes.inFirePitProps.transform.translation.x, 3);
assert.equal(resolverCoreRuntime.attributes.inFirePitProps.transform.scale, 0.4);
assert.equal(resolverCoreRuntime.attackpower, 4);
assert.equal(resolverCoreRuntime.durability, 50);
assert.equal(resolverCoreRuntime.tooltier, 2);
assert.equal(resolverCoreRuntime.customUnknown.name, 'specific');
assert.equal(resolverCoreRuntime.customUnknown.path, 'plain/iron');
assert.equal(resolverCoreRuntime.nested.customNested, 'nested-specific');
assert.equal(resolverCoreRuntime.shapeByType, undefined);
assert.equal(resolverCoreRuntime.customUnknownByType, undefined);

const resolverCoreSources = collectResolvedByTypeSources(resolverCoreAsset, 'resolver-order-plain-iron');
const resolverCoreSourceByMap = new Map(resolverCoreSources.map(source => [source.sourceMapPath, source]));
assert.equal(resolverCoreSourceByMap.get('root.shapeByType').sourcePath, 'root.shapeByType["resolver-order-plain-iron"]');
assert.equal(resolverCoreSourceByMap.get('root.texturesByType').sourcePath, 'root.texturesByType["resolver-order-plain-*"]');
assert.equal(resolverCoreSourceByMap.get('root.creativeinventoryByType').targetPath, 'root.creativeinventory');
assert.equal(resolverCoreSourceByMap.get('root.attributesByType').targetPath, 'root.attributes');
assert.equal(resolverCoreSourceByMap.get('root.collisionboxByType').targetPath, 'root.collisionbox');
assert.equal(resolverCoreSourceByMap.get('root.selectionboxByType').targetPath, 'root.selectionbox');
assert.equal(resolverCoreSourceByMap.get('root.guiTransformByType').targetPath, 'root.guiTransform');
assert.equal(resolverCoreSourceByMap.get('root.groundTransformByType').targetPath, 'root.groundTransform');
assert.equal(resolverCoreSourceByMap.get('root.tpHandTransformByType').targetPath, 'root.tpHandTransform');
assert.equal(resolverCoreSourceByMap.get('root.fpHandTransformByType').targetPath, 'root.fpHandTransform');
assert.equal(resolverCoreSourceByMap.get('root.toolrackTransformByType').targetPath, 'root.toolrackTransform');
assert.equal(resolverCoreSourceByMap.get('root.attributes.inFirePitPropsByType').targetPath, 'root.attributes.inFirePitProps');
assert.equal(resolverCoreSourceByMap.get('root.attackpowerbytype').targetPath, 'root.attackpower');
assert.equal(resolverCoreSourceByMap.get('root.durabilitybytype').targetPath, 'root.durability');
assert.equal(resolverCoreSourceByMap.get('root.tooltierbytype').targetPath, 'root.tooltier');
assert.equal(resolverCoreSourceByMap.get('root.customUnknownByType').targetPath, 'root.customUnknown');
assert.equal(resolverCoreSourceByMap.get('root.nested.customNestedByType').targetPath, 'root.nested.customNested');
assert.equal(
	resolverCoreSourceByMap.get('root.attributesByType["resolver-order-plain-*"].attachableToEntityByType').sourcePath,
	'root.attributesByType["resolver-order-plain-*"].attachableToEntityByType["resolver-order-plain-*"]'
);

const resolverCoreFilePath = join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'itemtypes', 'resolver_core.json');
const resolverCoreDocument = {
	root: resolverCoreAsset,
	assetObjects: [{object: resolverCoreAsset}],
	filePath: resolverCoreFilePath
};
const resolverCoreVariant = listVintageStoryAssetVariants(resolverCoreDocument, 0)
	.allVariants.find(variant => variant.variantCode === 'resolver-order-plain-iron');
const resolverCoreResolved = resolveVintageStoryAssetVariant(resolverCoreDocument, 0, resolverCoreVariant, assetSuiteResolverOptions(resolverCoreFilePath));
assert.equal(resolverCoreResolved.byTypeSources.find(source => source.sourceMapPath === 'root.customUnknownByType').sourcePath, 'root.customUnknownByType["resolver-order-plain-*"]');
assert.equal(resolverCoreResolved.byTypeSources.find(source => source.sourceMapPath === 'root.attackpowerbytype').sourceIndex, 1);
assert.equal(resolverCoreResolved.transforms.fpHandTransform.sourcePath, 'root.fpHandTransformByType["resolver-order-plain-*"]');
assert.equal(resolverCoreResolved.transforms.fpHandTransform.value.scale, 1.75);
assert.equal(resolverCoreResolved.transforms.toolrackTransform.sourcePath, 'root.toolrackTransformByType["*"]');
assert.equal(resolverCoreResolved.transforms.toolrackTransform.value.scale, 1.2);
assert.equal(resolverCoreResolved.transforms.inFirePitPropsTransform.sourceMapPath, 'root.attributes.inFirePitPropsByType');
assert.equal(resolverCoreResolved.transforms.inFirePitPropsTransform.sourcePath, 'root.attributes.inFirePitPropsByType["resolver-order-plain-*"].transform');
assert.equal(resolverCoreResolved.transforms.inFirePitPropsTransform.value.translation.x, 3);
assert.equal(resolverCoreResolved.transforms.inFirePitPropsTransform.value.scale, 0.4);
const resolverFirepitEditAsset = stableClone(resolverCoreAsset);
assert.equal(applyTransformEditToAssetObject(resolverFirepitEditAsset, resolverCoreResolved.transforms.inFirePitPropsTransform, {
	translation: {x: 9, y: 8, z: 7},
	scale: 0.95
}), true);
assert.equal(resolverFirepitEditAsset.attributes.inFirePitPropsByType['resolver-order-plain-iron'].transform.scale, 0.95);
assert.equal(resolverFirepitEditAsset.attributes.inFirePitPropsByType['resolver-order-plain-*'].transform.translation.x, 3);
assert.equal(resolverFirepitEditAsset.attributes.inFirePitPropsByType['resolver-order-plain-iron'].burnTemperature, undefined);
const resolverFirepitSharedAsset = stableClone(resolverCoreAsset);
const resolverFirepitSharedSource = stableClone(resolverCoreResolved.transforms.inFirePitPropsTransform);
resolverFirepitSharedSource.editTargetKey = resolverFirepitSharedSource.matchedPattern;
assert.equal(applyTransformEditToAssetObject(resolverFirepitSharedAsset, resolverFirepitSharedSource, {scale: 0.55}), true);
assert.equal(resolverFirepitSharedAsset.attributes.inFirePitPropsByType['resolver-order-plain-*'].transform.scale, 0.55);
assert.equal(resolverFirepitSharedAsset.attributes.inFirePitPropsByType['resolver-order-plain-iron'], undefined);

const suiteShapeExact = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_shapes.json', 'bytype-shape-red');
assert.equal(suiteShapeExact.resolved.shape.matchedPattern, 'bytype-shape-red');
assert.equal(suiteShapeExact.resolved.shape.exact, true);
assert.equal(suiteShapeExact.resolved.shape.sourcePath, 'root.shapeByType["bytype-shape-red"]');
assert.equal(suiteShapeExact.resolved.shape.resolvedBase, 'item/variant/red');
const suiteShapeWildcard = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_shapes.json', 'bytype-shape-blue');
assert.equal(suiteShapeWildcard.resolved.shape.matchedPattern, 'bytype-shape-b*');
assert.equal(suiteShapeWildcard.resolved.shape.inherited, true);
assert.equal(suiteShapeWildcard.resolved.shape.resolvedBase, 'item/variant/blue');
const suiteShapeFallback = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_shapes.json', 'bytype-shape-green');
assert.equal(suiteShapeFallback.resolved.shape.matchedPattern, '*');
assert.equal(suiteShapeFallback.resolved.shape.fallback, true);
assert.equal(suiteShapeFallback.resolved.shape.resolvedBase, 'item/variant/default');

const shapeAlternateTemp = fs.mkdtempSync(PathModule.join(process.env.TEMP || process.cwd(), 'vintagebench-shape-alternates-'));
try {
	const alternateWorkspace = buildVintageStoryWorkspace({
		modRoot: join(shapeAlternateTemp, 'AltMod'),
		domain: 'altmod',
		PathModule
	});
	fs.mkdirSync(join(alternateWorkspace.folders.itemtypes), {recursive: true});
	fs.mkdirSync(join(alternateWorkspace.folders.shapes, 'item'), {recursive: true});
	const alternateAssetPath = join(alternateWorkspace.folders.itemtypes, 'alternate-item.json');
	fs.writeFileSync(alternateAssetPath, serializeGeneratedVintageStoryAsset({
		code: 'alternate-item',
		shape: {
			base: 'item/main',
			alternates: [
				{base: 'item/charge1'},
				{base: 'item/missingcharge'}
			]
		}
	}));
	fs.writeFileSync(join(alternateWorkspace.folders.shapes, 'item', 'main.json'), JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t'));
	const chargeShapePath = join(alternateWorkspace.folders.shapes, 'item', 'charge1.json');
	fs.writeFileSync(chargeShapePath, JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t'));
	const alternateDocument = parseVintageStoryAssetDocument(fs.readFileSync(alternateAssetPath, 'utf8'), alternateAssetPath);
	const alternateVariant = listVintageStoryAssetVariants(alternateDocument, 0).includedVariants[0];
	const alternateResolved = resolveVintageStoryAssetVariant(alternateDocument, 0, alternateVariant, {
		sourceFilePath: alternateAssetPath,
		fs,
		PathModule,
		modAssetRoot: alternateWorkspace.modRoot
	});
	assert.equal(alternateResolved.shape.alternates.length, 2);
	assert.equal(alternateResolved.shape.alternates[0].resolvedBase, 'item/charge1');
	assert.equal(alternateResolved.shape.alternates[0].resolvedShapeFilePath, chargeShapePath);
	assert.equal(alternateResolved.shape.alternates[1].missing, true);
	assert.equal(alternateResolved.warnings.some(warning => warning.includes('Missing alternate shape')), true);
	assert.equal(validateVintageStoryShapeAlternatives(alternateResolved.shape.alternates).some(warning => warning.includes('Missing alternate shape file')), true);
	const alternateEditAsset = stableClone(alternateDocument.assetObjects[0].object);
	const alternateList = cloneVintageStoryShapeAlternatives(alternateResolved.shape.alternates.slice(0, 1));
	alternateList.push(makeShapeAlternativeFromBase('item/charge2', alternateResolved.shape, {
		index: 1,
		resolvedShapeFilePath: join(alternateWorkspace.folders.shapes, 'item', 'charge2.json')
	}));
	assert.equal(applyShapeAlternativesToAssetObject(alternateEditAsset, alternateResolved.shape, alternateList), true);
	assert.equal(alternateEditAsset.shape.alternates[1].base, 'item/charge2');
	const inheritedShapeAsset = {
		code: 'alternate-bytype',
		variantgroups: [{code: 'color', states: ['red', 'blue']}],
		shapeByType: {
			'*': {base: 'item/main', rotateY: 90, alternates: [{base: 'item/charge1'}]}
		}
	};
	const inheritedSource = Object.assign({}, alternateResolved.shape, {
		sourceMapPath: 'root.shapeByType',
		sourcePath: 'root.shapeByType["*"]',
		matchedPattern: '*',
		selectedVariantKey: 'alternate-bytype-blue',
		isByType: true,
		exact: false,
		inherited: true,
		fallback: true,
		rawRef: {base: 'item/main', rotateY: 90, alternates: [{base: 'item/charge1'}]},
		resolvedBase: 'item/main'
	});
	const inheritedAlternate = makeShapeAlternativeFromBase('item/charge-blue', inheritedSource, {
		index: 1,
		resolvedShapeFilePath: join(alternateWorkspace.folders.shapes, 'item', 'charge-blue.json')
	});
	assert.equal(applyShapeAlternativesToAssetObject(inheritedShapeAsset, inheritedAlternate.sourcePointer, [inheritedAlternate]), true);
	assert.equal(inheritedShapeAsset.shapeByType['alternate-bytype-blue'].base, 'item/main');
	assert.equal(inheritedShapeAsset.shapeByType['alternate-bytype-blue'].rotateY, 90);
	assert.equal(inheritedShapeAsset.shapeByType['alternate-bytype-blue'].alternates[0].base, 'item/charge-blue');
	assert.equal(inheritedShapeAsset.shapeByType['*'].alternates[0].base, 'item/charge1');
	const alternateExportPlan = createVintageStoryExportPlanFromResolvedContext({
		workspace: alternateWorkspace,
		modInfo: {modid: 'altmod', name: 'Alt Mod', authors: 'P1nkOblivion', version: '1.0.0'},
		assetContext: {
			source_file_path: alternateAssetPath,
			source_kind: 'item',
			source_object_index: 0,
			current_shape_target: {
				kind: 'alternate_shape',
				shape_base: 'item/charge1',
				shape_path: chargeShapePath
			},
			shape: alternateResolved.shape,
			texture_sources: {aliases: {}}
		},
		shapeJson: {textureWidth: 16, textureHeight: 16, elements: []}
	}, {fs, PathModule});
	const alternateShapeEntry = alternateExportPlan.entries.find(entry => entry.kind === 'shape');
	assert.equal(alternateShapeEntry.targetPath, chargeShapePath);
} finally {
	fs.rmSync(shapeAlternateTemp, {recursive: true, force: true});
}

const suiteTextureExact = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_textures.json', 'bytype-texture-red');
assert.equal(suiteTextureExact.resolved.textures.aliases.outside.matchedPattern, 'bytype-texture-red');
assert.equal(suiteTextureExact.resolved.textures.aliases.outside.sourcePath, 'root.texturesByType["bytype-texture-red"].outside');
assert.equal(suiteTextureExact.resolved.textures.aliases.outside.resolvedBase, 'item/bytype/red');
assert.equal(suiteTextureExact.resolved.textures.aliases.outside.sourceKind, 'texturesByType');
assert.equal(suiteTextureExact.resolved.textures.aliases.trim.sourceMapPath, 'root.textures');
assert.equal(suiteTextureExact.resolved.textures.aliases.trim.sourcePath, 'root.textures.trim');
assert.equal(suiteTextureExact.resolved.textures.aliases.trim.sourceKind, 'textures');
const suiteTextureWildcard = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_textures.json', 'bytype-texture-blue');
assert.equal(suiteTextureWildcard.resolved.textures.aliases.outside.matchedPattern, 'bytype-texture-b*');
assert.equal(suiteTextureWildcard.resolved.textures.aliases.inside.resolvedBase, 'item/bytype/blue-inside');
const suiteTextureFallback = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_textures.json', 'bytype-texture-green');
assert.equal(suiteTextureFallback.resolved.textures.aliases.outside.matchedPattern, '*');
assert.equal(suiteTextureFallback.resolved.textures.aliases.outside.resolvedBase, 'item/bytype/fallback');
const suiteTextureEntries = collectVintageStoryTextureEntries({texture_sources: suiteTextureFallback.resolved.textures});
assert.equal(suiteTextureEntries.some(entry => entry.alias === 'outside' && entry.sourceKind === 'texturesByType'), true);
assert.equal(suiteTextureEntries.some(entry => entry.alias === 'trim' && entry.sourceKind === 'textures'), true);
const textureOverrideAsset = stableClone(suiteTextureFallback.document.assetObjects[0].object);
const textureOverrideEntry = updateTextureEntryBase(suiteTextureFallback.resolved.textures.aliases.outside, 'item/bytype/copied', join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'textures', 'item', 'bytype', 'copied.png'), 'override');
assert.equal(textureOverrideEntry.sourcePointer.editTargetKey, 'bytype-texture-green');
assert.equal(applyTextureOverrideToAssetObject(textureOverrideAsset, textureOverrideEntry.sourcePointer, textureOverrideEntry.rawRef), true);
assert.equal(textureOverrideAsset.texturesByType['bytype-texture-green'].outside.base, 'item/bytype/copied');
assert.equal(textureOverrideAsset.texturesByType['*'].outside.base, 'item/bytype/fallback');
const textureSharedAsset = stableClone(suiteTextureFallback.document.assetObjects[0].object);
const textureSharedSource = makeTextureEditSource(suiteTextureFallback.resolved.textures.aliases.outside, 'shared');
assert.equal(textureSharedSource.editTargetKey, '*');
assert.equal(applyTextureOverrideToAssetObject(textureSharedAsset, textureSharedSource, {base: 'item/bytype/shared'}), true);
assert.equal(textureSharedAsset.texturesByType['*'].outside.base, 'item/bytype/shared');
const textureSharedEntry = updateTextureEntryBase(suiteTextureFallback.resolved.textures.aliases.outside, 'item/bytype/shared-entry', '', 'shared');
assert.equal(textureSharedEntry.sourcePointer.editTargetKey, '*');
assert.equal(textureSharedEntry.exact, false);
const shapeAliasAsset = {};
const shapeAliasEntry = updateTextureEntryBase({
	alias: 'shapeonly',
	sourceKind: 'shape.textures',
	sourceMapPath: 'shape.textures',
	selectedVariantKey: 'shape-alias'
}, 'item/shapeonly/copied', join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'textures', 'item', 'shapeonly', 'copied.png'), 'override');
assert.equal(applyTextureOverrideToAssetObject(shapeAliasAsset, shapeAliasEntry.sourcePointer, shapeAliasEntry.rawRef), true);
assert.equal(shapeAliasAsset.textures.shapeonly, 'item/shapeonly/copied');
const missingAliasWarnings = [];
const missingAliasTextures = resolveVintageStoryTextureAliases(
	{code: 'missing-alias'},
	{
		textures: {},
		elements: [{faces: {north: {texture: '#missingalias'}}}]
	},
	{variantCode: 'missing-alias', codePath: 'missing-alias', states: {}, codeDomain: 'synthetic'},
	[join(assetSuiteRoot, 'synthetic_mod')],
	join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'itemtypes', 'missing_alias.json'),
	join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'shapes', 'item', 'missing_alias.json'),
	{fs, PathModule},
	missingAliasWarnings
);
assert.equal(missingAliasTextures.aliases.missingalias.sourceKind, 'missing');
assert.equal(missingAliasTextures.aliases.missingalias.missing, true);
assert.equal(missingAliasWarnings.some(message => message.includes('Missing texture alias')), true);
assert.equal(validateVintageStoryTextureEntries(collectVintageStoryTextureEntries(missingAliasTextures)).some(message => message.includes('Missing texture alias "missingalias"')), true);

const textureManagerTemp = fs.mkdtempSync(PathModule.join(process.env.TEMP || process.cwd(), 'vintagebench-textures-'));
try {
	const textureWorkspace = buildVintageStoryWorkspace({
		modRoot: join(textureManagerTemp, 'TextureMod'),
		domain: 'texturemod',
		PathModule
	});
	const sourceTexturePath = join(textureManagerTemp, 'source.png');
	fs.writeFileSync(sourceTexturePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	const textureAssetPath = join(textureWorkspace.folders.itemtypes, 'texture-test.json');
	const copyResult = copyTextureIntoWorkspace(
		{alias: 'outside'},
		sourceTexturePath,
		textureWorkspace,
		{fs, PathModule},
		{assetFilePath: textureAssetPath, assetContext: {asset_code: 'texture-test'}}
	);
	assert.equal(copyResult.copied, true);
	assert.equal(copyResult.duplicate, false);
	assert.equal(fs.existsSync(copyResult.targetPath), true);
	assert.equal(copyResult.assetBase, 'item/texture-test/outside');
	assert.equal(textureAssetBaseFromFilePath(copyResult.targetPath, textureAssetPath, textureWorkspace), copyResult.assetBase);
	const duplicateResult = copyTextureIntoWorkspace(
		{alias: 'outside'},
		sourceTexturePath,
		textureWorkspace,
		{fs, PathModule},
		{assetFilePath: textureAssetPath, assetContext: {asset_code: 'texture-test'}}
	);
	assert.equal(duplicateResult.copied, false);
	assert.equal(duplicateResult.duplicate, true);
	assert.equal(duplicateResult.assetBase, copyResult.assetBase);
} finally {
	fs.rmSync(textureManagerTemp, {recursive: true, force: true});
}

const assetExplorerTemp = fs.mkdtempSync(PathModule.join(process.env.TEMP || process.cwd(), 'vintagebench-explorer-'));
try {
	const explorerWorkspace = buildVintageStoryWorkspace({
		modRoot: join(assetExplorerTemp, 'ExplorerMod'),
		domain: 'explorer',
		PathModule
	});
	[
		explorerWorkspace.folders.itemtypes,
		explorerWorkspace.folders.blocktypes,
		join(explorerWorkspace.folders.shapes, 'item'),
		join(explorerWorkspace.folders.textures, 'item'),
		explorerWorkspace.folders.lang
	].forEach(path => fs.mkdirSync(path, {recursive: true}));
	fs.writeFileSync(join(explorerWorkspace.modRoot, 'modinfo.json'), JSON.stringify(buildVintageStoryModInfo({
		modid: 'explorer',
		name: 'Explorer Test',
		authors: 'P1nkOblivion',
		version: '1.0.0'
	}), null, '\t'));
	const explorerAssetPath = join(explorerWorkspace.folders.itemtypes, 'explorer-item.json');
	fs.writeFileSync(explorerAssetPath, serializeGeneratedVintageStoryAsset({
		code: 'explorer-item',
		shape: {base: 'item/used', alternates: [{base: 'item/alternate-used'}]},
		textures: {
			outside: {base: 'item/usedtex'},
			missing: {base: 'item/missingtex'}
		},
		attributes: {
			attachableToEntity: {
				categoryCode: 'toolholding',
				attachedShapeBySlotCode: {
					goodslot: {base: 'item/attached'},
					badslot: {base: 'item/missingattached'}
				}
			}
		}
	}));
	const explorerShape = {
		textureWidth: 16,
		textureHeight: 16,
		elements: [{
			name: 'Root',
			from: [0, 0, 0],
			to: [16, 16, 16],
			faces: {
				north: {texture: '#outside', uv: [0, 0, 16, 16]},
				south: {texture: '#missing', uv: [0, 0, 16, 16]}
			}
		}]
	};
	const usedShapePath = join(explorerWorkspace.folders.shapes, 'item', 'used.json');
	fs.writeFileSync(usedShapePath, JSON.stringify(explorerShape, null, '\t'));
	fs.writeFileSync(join(explorerWorkspace.folders.shapes, 'item', 'alternate-used.json'), JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t'));
	fs.writeFileSync(join(explorerWorkspace.folders.shapes, 'item', 'attached.json'), JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t'));
	fs.writeFileSync(join(explorerWorkspace.folders.shapes, 'item', 'unused.json'), JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t'));
	fs.writeFileSync(join(explorerWorkspace.folders.textures, 'item', 'usedtex.png'), Buffer.from([137, 80, 78, 71]));
	fs.writeFileSync(join(explorerWorkspace.folders.textures, 'item', 'unusedtex.png'), Buffer.from([137, 80, 78, 71, 1]));
	fs.writeFileSync(join(explorerWorkspace.folders.lang, 'en.json'), JSON.stringify({'item-explorer-item': 'Explorer Item'}, null, '\t'));
	const explorer = buildVintageStoryAssetExplorer(explorerWorkspace, {fs, PathModule}, {currentShapePath: usedShapePath});
	assert.equal(explorer.errors.length, 0);
	assert.equal(explorer.treeRows.some(row => row.kind === 'modinfo' && row.label === 'modinfo.json'), true);
	assert.equal(explorer.treeRows.some(row => row.kind === 'itemtype' && row.path === explorerAssetPath), true);
	assert.equal(explorer.findings.assetsReferencingCurrentShape.length, 1);
	assert.equal(explorer.findings.assetsReferencingCurrentShape[0].assetFilePath, explorerAssetPath);
	assert.equal(explorer.findings.missingTextures.some(finding => finding.alias === 'missing' && finding.base === 'item/missingtex'), true);
	assert.equal(explorer.findings.unusedShapes.some(finding => finding.base === 'item/unused'), true);
	assert.equal(explorer.findings.unusedShapes.some(finding => finding.base === 'item/used'), false);
	assert.equal(explorer.findings.unusedShapes.some(finding => finding.base === 'item/alternate-used'), false);
	assert.equal(explorer.findings.unusedShapes.some(finding => finding.base === 'item/attached'), false);
	assert.equal(explorer.findings.unusedTextures.some(finding => finding.base === 'item/unusedtex'), true);
	assert.equal(explorer.findings.unusedTextures.some(finding => finding.base === 'item/usedtex'), false);
	assert.equal(explorer.findings.brokenAttachedShapeRefs.some(finding => finding.slotCode === 'badslot' && finding.base === 'item/missingattached'), true);
	const explorerGroups = getVintageStoryAssetExplorerFindingGroups(explorer);
	assert.equal(explorerGroups.find(group => group.id === 'missingTextures').entries.length, explorer.findings.missingTextures.length);
} finally {
	fs.rmSync(assetExplorerTemp, {recursive: true, force: true});
}

const suiteTransformExact = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_transforms.json', 'bytype-transform-red');
assert.equal(suiteTransformExact.resolved.transforms.guiTransform.exact, true);
assert.equal(suiteTransformExact.resolved.transforms.guiTransform.value.translation.x, 1);
const suiteTransformWildcard = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_transforms.json', 'bytype-transform-blue');
assert.equal(suiteTransformWildcard.resolved.transforms.guiTransform.matchedPattern, 'bytype-transform-b*');
assert.equal(suiteTransformWildcard.resolved.transforms.guiTransform.sourcePath, 'root.guiTransformByType["bytype-transform-b*"]');
assert.equal(suiteTransformWildcard.resolved.transforms.guiTransform.value.translation.y, 2);
const suiteTransformFallback = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/bytype_transforms.json', 'bytype-transform-green');
assert.equal(suiteTransformFallback.resolved.transforms.guiTransform.fallback, true);
assert.equal(suiteTransformFallback.resolved.transforms.guiTransform.value.translation.z, 3);
assert.equal(suiteTransformFallback.resolved.transforms.fpHandTransform.sourcePath, 'root.fpHandTransformByType["*"]');
assert.equal(suiteTransformFallback.resolved.transforms.fpHandTransform.value.translation.x, 1);
assert.equal(suiteTransformFallback.resolved.transforms.toolrackTransform.sourcePath, 'root.toolrackTransformByType["*"]');
assert.equal(suiteTransformFallback.resolved.transforms.toolrackTransform.value.scale, 0.55);

const suiteAttributesTransform = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/attributes_transforms.json', 'attributes-transform-red');
assert.equal(suiteAttributesTransform.resolved.transforms.toolrackTransform.sourceMapPath, 'root.attributes.toolrackTransformByType');
assert.equal(suiteAttributesTransform.resolved.transforms.toolrackTransform.exact, true);
assert.equal(suiteAttributesTransform.resolved.transforms.inFirePitPropsTransform.sourcePath, 'root.attributes.inFirePitPropsByType["*"].transform');
assert.equal(suiteAttributesTransform.resolved.transforms.inFirePitPropsTransform.value.scale, 0.6);
const suiteAttributesTransformWildcard = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/attributes_transforms.json', 'attributes-transform-blue');
assert.equal(suiteAttributesTransformWildcard.resolved.transforms.onAntlerMountTransform.matchedPattern, 'attributes-transform-b*');
assert.equal(suiteAttributesTransformWildcard.resolved.transforms.groundStorageTransform.matchedPattern, '*');
assert.equal(suiteAttributesTransformWildcard.resolved.transforms.inFirePitPropsTransform.sourcePath, 'root.attributes.inFirePitPropsByType["attributes-transform-b*"].transform');
assert.equal(suiteAttributesTransformWildcard.resolved.transforms.inFirePitPropsTransform.value.translation.x, 4);

const suiteGroundBoxes = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/groundstorable_boxes.json', 'ground-boxes');
assert.equal(suiteGroundBoxes.resolved.interactionBoxes.some(box => box.family === 'behavior.selectionBox' && box.behaviorName === 'GroundStorable'), true);
assert.equal(suiteGroundBoxes.resolved.interactionBoxes.some(box => box.family === 'behavior.collisionBox' && box.value.x2 === 0.5), true);

const suiteAttachmentExact = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/attachments.json', 'attachable-weapon');
assert.equal(suiteAttachmentExact.resolved.attachments.exact, true);
assert.equal(suiteAttachmentExact.resolved.attachments.categoryCode, 'weapon1m');
assert.equal(suiteAttachmentExact.resolved.attachments.slots.length, 2);
assert.equal(suiteAttachmentExact.resolved.attachments.slots.find(slot => slot.slotCode === 'frontrightside').missing, false);
assert.equal(suiteAttachmentExact.resolved.attachments.value.keepAttachmentExtra.nested, true);
const suiteAttachmentFallback = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/attachments.json', 'attachable-tool');
assert.equal(suiteAttachmentFallback.resolved.attachments.fallback, true);
assert.equal(suiteAttachmentFallback.resolved.attachments.categoryCode, 'toolholding');

const creativeByTypeDocument = await readAssetSuiteDocument('synthetic_mod/assets/synthetic/itemtypes/creativeinventory_bytype.json');
assert.equal(creativeByTypeDocument.assetObjects[0].object.creativeinventoryByType['creative-bytype-red'].decorative[0], 'creative-bytype-red');

const unknownFieldDocument = await readAssetSuiteDocument('synthetic_mod/assets/synthetic/itemtypes/unknown_fields.json');
const unknownFieldAsset = unknownFieldDocument.assetObjects[0].object;
assert.equal(unknownFieldAsset.keepUnknownRoot.nested, true);
assert.equal(unknownFieldAsset.shape.keepShapeExtra, true);
assert.equal(unknownFieldAsset.textures.outside.keepTextureExtra, true);
assert.equal(unknownFieldAsset.attributes.keepUnknownAttribute.nested, true);
assert.equal(unknownFieldAsset.behaviors[0].keepUnknownBehaviorRoot, true);
assert.equal(unknownFieldAsset.behaviors[0].properties.keepUnknownBehaviorProperty, 'preserve');
assert.equal(parseVintageStoryAssetDocument(serializeVintageStoryAssetDocument(unknownFieldDocument), join(assetSuiteRoot, 'unknown_roundtrip.json')).assetObjects[0].object.keepUnknownRoot.nested, true);

const suiteMissingShape = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/missing_shape.json', 'missing-shape');
assert.equal(suiteMissingShape.resolved.shape.missing, true);
assert.ok(suiteMissingShape.resolved.warnings.some(warning => warning.includes('Missing shape')));
const suiteMissingTexture = await resolveAssetSuiteVariant('synthetic_mod/assets/synthetic/itemtypes/missing_texture.json', 'missing-texture');
assert.equal(suiteMissingTexture.resolved.textures.aliases.outside.missing, true);
assert.ok(suiteMissingTexture.resolved.warnings.some(warning => warning.includes('Missing texture')));

const absolutePathDocument = await readAssetSuiteDocument('negative/absolute_path_asset.json');
const absoluteTextureBase = absolutePathDocument.assetObjects[0].object.textures.texture.base;
const absolutePathGenerated = buildVintageStoryAssetObject({
	code: 'absolute-path-negative',
	shapeSavePath: join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'shapes', 'item', 'simple-item.json'),
	assetSavePath: join(assetSuiteRoot, 'synthetic_mod', 'assets', 'synthetic', 'itemtypes', 'absolute_path_negative.json'),
	textureMode: SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS,
	textureDefaults: {texture: absoluteTextureBase}
});
assert.equal(absolutePathGenerated.errors.some(error => error.includes('absolute filesystem path')), true);

const suitePackageWorkspace = buildVintageStoryWorkspace({
	modRoot: join(assetSuiteRoot, assetSuiteManifest.packageWorkspace),
	domain: 'synthetic',
	PathModule
});
const suitePackageWorkspaceValidation = validateVintageStoryWorkspace(suitePackageWorkspace, {fs, PathModule}, {skipTextures: false});
assert.equal(suitePackageWorkspaceValidation.errors.length, 0, suitePackageWorkspaceValidation.errors.join(', '));
assert.equal(suitePackageWorkspaceValidation.warnings.some(warning => warning.includes('absolute filesystem path')), false);

const variants = listVintageStoryAssetVariants(bladeDocument, 0);
const variantByCode = new Map(variants.allVariants.map(variant => [variant.variantCode, variant]));
assert.ok(variantByCode.has('blade-falx-copper'));
assert.equal(variantByCode.get('blade-falx-tinbronze').skipped, true);
assert.equal(variantByCode.get('blade-blackguard-copper').disallowed, true);
assert.equal(variantByCode.get('blade-blackguard-iron').included, true);
assert.equal(variantByCode.get('blade-claymore-ruined').included, true);
assert.equal(variantByCode.get('blade-scrap-scrap').included, true);

const resolverOptions = {
	sourceFilePath: bladeAssetPath,
	fs,
	PathModule,
	modAssetRoot: join(assetFixtureRoot, 'mod')
};

const falxCopper = resolveVintageStoryAssetVariant(bladeDocument, 0, variantByCode.get('blade-falx-copper'), resolverOptions);
assert.equal(falxCopper.shape.resolvedBase, 'item/tool/blade/falx');
assert.equal(falxCopper.shape.matchedPattern, '*');
assert.equal(falxCopper.shape.missing, false);
assert.equal(falxCopper.textures.aliases.falxblade.matchedPattern, 'blade-falx-copper');
assert.equal(falxCopper.textures.aliases.falxblade.resolvedBase, 'item/tool/blade/falx-copper');
assert.equal(falxCopper.textures.aliases.handle.resolvedBase, 'item/tool/blade/handle-copper');
assert.equal(falxCopper.textures.aliases.thongs.sourceMapPath, 'root.textures');
assert.equal(falxCopper.transforms.guiTransform.matchedPattern, '*');
assert.equal(falxCopper.transforms.guiTransform.inherited, true);
assert.equal(falxCopper.transforms.guiTransform.fallback, true);
assert.equal(falxCopper.transforms.guiTransform.value.translation.x, 1);
assert.equal(falxCopper.transforms.groundTransform.matchedPattern, 'blade-falx-*');
assert.equal(falxCopper.transforms.tpHandTransform.matchedPattern, '*');
assert.equal(falxCopper.transforms.fpHandTransform, undefined);
assert.equal(falxCopper.transforms.toolrackTransform.sourceMapPath, 'root.attributes.toolrackTransformByType');
assert.equal(falxCopper.transforms.groundStorageTransform.matchedPattern, '*');
assert.equal(falxCopper.interactionBoxes.some(box => box.family === 'behavior.selectionBox' && box.behaviorName === 'GroundStorable'), true);
assert.equal(falxCopper.interactionBoxes.some(box => box.family === 'behavior.collisionBox' && box.value.x2 === 0), true);
assert.ok(validateVintageStoryInteractionBoxes(falxCopper.interactionBoxes).some(warning => warning.includes('zero X size')));
assert.equal(falxCopper.attachments.categoryCode, 'weaponfalx');
assert.equal(falxCopper.attachments.matchedPattern, 'blade-falx-*');
assert.equal(falxCopper.attachments.inherited, true);
assert.equal(falxCopper.attachments.slots.length, 2);
assert.equal(falxCopper.attachments.slots.find(slot => slot.slotCode === 'frontrightside').resolvedShapeBase, 'item/wearable/hooved/elk/weaponr-falx');
assert.equal(falxCopper.attachments.slots.find(slot => slot.slotCode === 'frontrightside').missing, false);
assert.equal(falxCopper.attachments.value.keepAttachmentExtra.nested, true);
assert.equal(falxCopper.attachments.value.attachedShapeBySlotCode.frontrightside.keepSlotExtra, true);
assert.ok(validateVintageStoryAttachment(falxCopper.attachments, {variants: variants.allVariants}).some(warning => warning.includes('affects')));

const blackguardIron = resolveVintageStoryAssetVariant(bladeDocument, 0, variantByCode.get('blade-blackguard-iron'), resolverOptions);
assert.equal(blackguardIron.shape.matchedPattern, 'blade-blackguard-*');
assert.equal(blackguardIron.shape.resolvedBase, 'item/tool/blade/blackguard');
assert.equal(blackguardIron.transforms.toolrackTransform.exact, true);
assert.equal(blackguardIron.transforms.toolrackTransform.matchedPattern, 'blade-blackguard-iron');
assert.equal(blackguardIron.attachments.categoryCode, 'weapon1m');
assert.equal(blackguardIron.attachments.exact, true);

const claymoreRuined = resolveVintageStoryAssetVariant(bladeDocument, 0, variantByCode.get('blade-claymore-ruined'), resolverOptions);
assert.equal(claymoreRuined.shape.matchedPattern, 'blade-*-ruined');
assert.equal(claymoreRuined.shape.resolvedBase, 'item/tool/blade/ruined/claymore');
assert.equal(claymoreRuined.textures.aliases.falxblade.resolvedBase, 'item/tool/blade/ruined/claymore');
assert.equal(claymoreRuined.transforms.guiTransform.exact, true);
assert.equal(claymoreRuined.transforms.guiTransform.matchedPattern, 'blade-claymore-ruined');
assert.equal(claymoreRuined.transforms.onAntlerMountTransform.matchedPattern, 'blade-*-ruined');
assert.equal(claymoreRuined.attachments.categoryCode, 'toolholding');
assert.equal(claymoreRuined.attachments.fallback, true);
assert.equal(claymoreRuined.attachments.slots.length, 0);

const falxAdmin = resolveVintageStoryAssetVariant(bladeDocument, 0, variantByCode.get('blade-falx-admin'), resolverOptions);
assert.equal(falxAdmin.shape.missing, true);
assert.ok(falxAdmin.warnings.some(warning => warning.includes('Missing shape')));

const falxIron = resolveVintageStoryAssetVariant(bladeDocument, 0, variantByCode.get('blade-falx-iron'), resolverOptions);
assert.equal(falxIron.textures.aliases.falxblade.missing, true);
assert.ok(falxIron.warnings.some(warning => warning.includes('Missing texture')));

const falxIronWithoutTextures = resolveVintageStoryAssetVariant(bladeDocument, 0, variantByCode.get('blade-falx-iron'), Object.assign({}, resolverOptions, {
	skipTextures: true
}));
assert.equal(falxIronWithoutTextures.textures.skipped, true);
assert.deepEqual(falxIronWithoutTextures.textures.aliases, {});
assert.equal(falxIronWithoutTextures.warnings.some(warning => warning.includes('Missing texture')), false);

const assetForOverride = JSON.parse(JSON.stringify(bladeDocument.assetObjects[0].object));
const originalFallbackTransform = JSON.parse(JSON.stringify(assetForOverride.guiTransformByType['*']));
assert.equal(applyTransformEditToAssetObject(assetForOverride, falxCopper.transforms.guiTransform, {
	translation: {x: 99, y: 0, z: 0},
	scale: 2
}), true);
assert.deepEqual(assetForOverride.guiTransformByType['*'], originalFallbackTransform);
assert.equal(assetForOverride.guiTransformByType['blade-falx-copper'].translation.x, 99);
assert.equal(assetForOverride.guiTransformByType['blade-falx-copper'].scale, 2);

const assetForSharedEdit = JSON.parse(JSON.stringify(bladeDocument.assetObjects[0].object));
assert.equal(applyTransformEditToAssetObject(assetForSharedEdit, Object.assign({}, falxCopper.transforms.guiTransform, {
	editTargetKey: '*'
}), {
	translation: {x: 5, y: 5, z: 5},
	scale: 0.25
}), true);
assert.equal(assetForSharedEdit.guiTransformByType['*'].translation.x, 5);
assert.equal(assetForSharedEdit.guiTransformByType['blade-falx-copper'], undefined);

const assetForDelete = JSON.parse(JSON.stringify(assetForOverride));
assert.equal(applyTransformEditToAssetObject(assetForDelete, Object.assign({}, falxCopper.transforms.guiTransform, {
	deleteOverride: true,
	selectedVariantKey: 'blade-falx-copper'
}), {}), true);
assert.equal(assetForDelete.guiTransformByType['blade-falx-copper'], undefined);
assert.deepEqual(falxCopper.shapeJson.textures.falxblade, 'item/tool/blade/default-falx');

const attachmentOverrideAsset = JSON.parse(JSON.stringify(bladeDocument.assetObjects[0].object));
const originalFalxAttachment = JSON.parse(JSON.stringify(attachmentOverrideAsset.attributesByType['blade-falx-*'].attachableToEntity));
const editedAttachment = JSON.parse(JSON.stringify(falxCopper.attachments));
editedAttachment.categoryCode = 'weaponfalx-custom';
editedAttachment.slots[0].resolvedShapeBase = 'item/wearable/custom/weaponr-falx';
assert.equal(applyAttachmentEditToAssetObject(attachmentOverrideAsset, makeAttachmentEditSource(falxCopper.attachments, 'override'), editedAttachment), true);
assert.deepEqual(attachmentOverrideAsset.attributesByType['blade-falx-*'].attachableToEntity, originalFalxAttachment);
assert.equal(attachmentOverrideAsset.attributesByType['blade-falx-copper'].attachableToEntity.categoryCode, 'weaponfalx-custom');
assert.equal(attachmentOverrideAsset.attributesByType['blade-falx-copper'].attachableToEntity.attachedShapeBySlotCode.frontrightside.base, 'item/wearable/custom/weaponr-falx');

const attachmentSharedAsset = JSON.parse(JSON.stringify(bladeDocument.assetObjects[0].object));
const sharedAttachment = JSON.parse(JSON.stringify(falxCopper.attachments));
sharedAttachment.categoryCode = 'weaponfalx-shared';
assert.equal(applyAttachmentEditToAssetObject(attachmentSharedAsset, makeAttachmentEditSource(falxCopper.attachments, 'shared'), sharedAttachment), true);
assert.equal(attachmentSharedAsset.attributesByType['blade-falx-*'].attachableToEntity.categoryCode, 'weaponfalx-shared');
assert.equal(attachmentSharedAsset.attributesByType['blade-falx-copper'], undefined);

const attachmentDeleteAsset = JSON.parse(JSON.stringify(attachmentOverrideAsset));
assert.equal(applyAttachmentEditToAssetObject(attachmentDeleteAsset, Object.assign(makeAttachmentEditSource(falxCopper.attachments, 'override'), {
	deleteOverride: true
}), editedAttachment), true);
assert.equal(attachmentDeleteAsset.attributesByType['blade-falx-copper'].attachableToEntity, undefined);

const fullRoundTripAsset = stableClone(bladeDocument.assetObjects[0].object);
fullRoundTripAsset.creativeinventoryByType = {
	'*': {general: ['*']},
	'blade-falx-*': {weapons: ['blade-falx-*']}
};
fullRoundTripAsset.unknownRootRoundTrip = {keep: true};
fullRoundTripAsset.attributes.unknownAttributeRoundTrip = {keep: true};
fullRoundTripAsset.behaviors[0].properties.unknownBehaviorRoundTrip = {keep: true};
const originalFullRoundTripAsset = stableClone(fullRoundTripAsset);
assert.equal(applyTransformEditToAssetObject(fullRoundTripAsset, falxCopper.transforms.guiTransform, {
	translation: {x: 42, y: 2, z: 3},
	rotation: {x: 10, y: 20, z: 30},
	scale: 0.75
}), true);
const fullRoundTripSelectionBox = falxCopper.interactionBoxes.find(box => box.family === 'behavior.selectionBox' && box.behaviorName === 'GroundStorable');
assert.equal(applyInteractionBoxEditToAssetObject(fullRoundTripAsset, fullRoundTripSelectionBox.sourcePointer, {
	x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.2, z2: 1
}), true);
const fullRoundTripAttachment = stableClone(falxCopper.attachments);
fullRoundTripAttachment.categoryCode = 'weaponfalx-roundtrip';
fullRoundTripAttachment.slots[0].resolvedShapeBase = 'item/wearable/hooved/elk/weaponr-falx-roundtrip';
assert.equal(applyAttachmentEditToAssetObject(fullRoundTripAsset, makeAttachmentEditSource(falxCopper.attachments, 'override'), fullRoundTripAttachment), true);
const fullRoundTripSerialized = serializeVintageStoryAssetDocument({root: fullRoundTripAsset});
const fullRoundTripAssetPath = join(assetFixtureRoot, 'mod', 'assets', 'test', 'itemtypes', 'tool', 'roundtrip_blade.json');
const fullRoundTripDocument = parseVintageStoryAssetDocument(fullRoundTripSerialized, fullRoundTripAssetPath);
const fullRoundTripParsedAsset = fullRoundTripDocument.assetObjects[0].object;
assert.deepEqual(fullRoundTripParsedAsset.shapeByType, originalFullRoundTripAsset.shapeByType);
assert.deepEqual(fullRoundTripParsedAsset.texturesByType, originalFullRoundTripAsset.texturesByType);
assert.deepEqual(fullRoundTripParsedAsset.groundTransformByType, originalFullRoundTripAsset.groundTransformByType);
assert.deepEqual(fullRoundTripParsedAsset.tpHandTransformByType, originalFullRoundTripAsset.tpHandTransformByType);
assert.deepEqual(fullRoundTripParsedAsset.attributes.toolrackTransformByType, originalFullRoundTripAsset.attributes.toolrackTransformByType);
assert.deepEqual(fullRoundTripParsedAsset.attributes.groundStorageTransformByType, originalFullRoundTripAsset.attributes.groundStorageTransformByType);
assert.deepEqual(fullRoundTripParsedAsset.attributes.onAntlerMountTransformByType, originalFullRoundTripAsset.attributes.onAntlerMountTransformByType);
assert.deepEqual(fullRoundTripParsedAsset.creativeinventoryByType, originalFullRoundTripAsset.creativeinventoryByType);
assert.deepEqual(fullRoundTripParsedAsset.unknownRootRoundTrip, originalFullRoundTripAsset.unknownRootRoundTrip);
assert.deepEqual(fullRoundTripParsedAsset.attributes.unknownAttributeRoundTrip, originalFullRoundTripAsset.attributes.unknownAttributeRoundTrip);
assert.equal(fullRoundTripParsedAsset.attributesByType['blade-falx-*'].ripHarvest, true);
assert.deepEqual(fullRoundTripParsedAsset.attributesByType['blade-falx-*'].attachableToEntity, originalFullRoundTripAsset.attributesByType['blade-falx-*'].attachableToEntity);
assert.deepEqual(fullRoundTripParsedAsset.behaviors[0].properties.layout, originalFullRoundTripAsset.behaviors[0].properties.layout);
assert.deepEqual(fullRoundTripParsedAsset.behaviors[0].properties.unknownBehaviorRoundTrip, originalFullRoundTripAsset.behaviors[0].properties.unknownBehaviorRoundTrip);
assert.equal(fullRoundTripParsedAsset.behaviors[0].properties.selectionBox.y2, 0.2);
assert.deepEqual(fullRoundTripParsedAsset.behaviors[0].properties.collisionBox, originalFullRoundTripAsset.behaviors[0].properties.collisionBox);
assert.deepEqual(fullRoundTripParsedAsset.guiTransformByType['*'], originalFullRoundTripAsset.guiTransformByType['*']);
assert.equal(fullRoundTripParsedAsset.guiTransformByType['blade-falx-copper'].translation.x, 42);
assert.equal(fullRoundTripParsedAsset.attributesByType['blade-falx-copper'].attachableToEntity.categoryCode, 'weaponfalx-roundtrip');
assert.equal(fullRoundTripParsedAsset.attributesByType['blade-falx-copper'].attachableToEntity.keepAttachmentExtra.nested, true);
assert.equal(fullRoundTripParsedAsset.attributesByType['blade-falx-copper'].attachableToEntity.attachedShapeBySlotCode.frontrightside.base, 'item/wearable/hooved/elk/weaponr-falx-roundtrip');

const fullRoundTripVariants = listVintageStoryAssetVariants(fullRoundTripDocument, 0);
const fullRoundTripByCode = new Map(fullRoundTripVariants.allVariants.map(variant => [variant.variantCode, variant]));
const reopenedFalxCopper = resolveVintageStoryAssetVariant(fullRoundTripDocument, 0, fullRoundTripByCode.get('blade-falx-copper'), Object.assign({}, resolverOptions, {
	sourceFilePath: fullRoundTripAssetPath
}));
assert.equal(reopenedFalxCopper.shape.resolvedBase, falxCopper.shape.resolvedBase);
assert.equal(reopenedFalxCopper.textures.aliases.falxblade.resolvedBase, falxCopper.textures.aliases.falxblade.resolvedBase);
assert.equal(reopenedFalxCopper.transforms.guiTransform.exact, true);
assert.equal(reopenedFalxCopper.transforms.guiTransform.value.translation.x, 42);
assert.equal(reopenedFalxCopper.interactionBoxes.find(box => box.family === 'behavior.selectionBox').value.y2, 0.2);
assert.equal(reopenedFalxCopper.attachments.exact, true);
assert.equal(reopenedFalxCopper.attachments.categoryCode, 'weaponfalx-roundtrip');

const interactionAssetText = `{
	code: "box-test",
	variantgroups: [
		{ code: "state", states: ["red", "blue", "hidden"] },
	],
	skipVariants: ["box-test-hidden"],
	shape: { base: "block/test/box" },
	rotateY: 15,
	rotateYByType: {
		"box-test-red": 90,
		"*": 45,
	},
	collisionbox: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.5, z2: 1 },
	collisionboxes: [
		{ x1: 0.2, y1: 0, z1: 0.2, x2: 0.8, y2: 0.3, z2: 0.8 },
	],
	collisionboxesByType: {
		"box-test-blue": [
			{ x1: 0.3, y1: 0, z1: 0.3, x2: 0.7, y2: 0.2, z2: 0.7 },
			{ x1: 0.35, y1: 0.2, z1: 0.35, x2: 0.65, y2: 0.35, z2: 0.65 },
		],
	},
	selectionbox: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.6, z2: 1 },
	selectionboxByType: {
		"box-test-blue": { x1: 0.05, y1: 0, z1: 0.05, x2: 0.95, y2: 0.55, z2: 0.95 },
	},
	selectionboxes: [
		{ x1: 0.1, y1: 0, z1: 0.1, x2: 0.9, y2: 0.4, z2: 0.9 },
		{ x1: 0.25, y1: 0.4, z1: 0.25, x2: 0.75, y2: 0.8, z2: 0.75, rotateY: 90 },
	],
	selectionboxesByType: {
		"box-test-blue": [
			{ x1: 0.15, y1: 0, z1: 0.15, x2: 0.85, y2: 0.45, z2: 0.85 },
		],
	},
	collisionboxByType: {
		"box-test-blue": { x1: 0, y1: 0, z1: 0, x2: 0.5, y2: 0.25, z2: 0.5 },
		"*": { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.25, z2: 1 },
	},
	collisionSelectionBoxes: [
		{ x1: 0.05, y1: 0, z1: 0.05, x2: 0.95, y2: 0.15, z2: 0.95 },
	],
	collisionSelectionBoxesByType: {
		"box-test-blue": [
			{ x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.2, z2: 1 }
		]
	},
	behaviors: [
		{ name: "GroundStorable", properties: {
			selectionBox: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.1, z2: 1 },
			collisionBoxByType: {
				"*": { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }
			}
		} }
	],
	unknownKeep: { nested: true },
}`;
const interactionDocument = parseVintageStoryAssetDocument(interactionAssetText, join(assetFixtureRoot, 'interaction_boxes.json'));
const interactionVariants = listVintageStoryAssetVariants(interactionDocument, 0);
const interactionByCode = new Map(interactionVariants.allVariants.map(variant => [variant.variantCode, variant]));
const redBoxVariant = resolveVintageStoryAssetVariant(interactionDocument, 0, interactionByCode.get('box-test-red'), {
	sourceFilePath: join(assetFixtureRoot, 'interaction_boxes.json')
});
const blueBoxVariant = resolveVintageStoryAssetVariant(interactionDocument, 0, interactionByCode.get('box-test-blue'), {
	sourceFilePath: join(assetFixtureRoot, 'interaction_boxes.json')
});
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'collisionbox').matchedPattern, '*');
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'collisionbox').inherited, true);
assert.equal(blueBoxVariant.interactionBoxes.find(box => box.family === 'collisionbox').exact, true);
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'collisionbox').assetRotateY.value, 90);
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'collisionbox').assetRotateY.sourcePath, 'root.rotateYByType["box-test-red"]');
assert.equal(redBoxVariant.runtimeAssetObject.rotateY, 90);
assert.equal(blueBoxVariant.runtimeAssetObject.rotateY, 45);
assert.equal(redBoxVariant.interactionBoxes.filter(box => box.family === 'collisionboxes').length, 1);
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'collisionboxes').sourcePath, 'root.collisionboxes[0]');
assert.equal(blueBoxVariant.interactionBoxes.filter(box => box.family === 'collisionboxes').length, 2);
assert.equal(blueBoxVariant.interactionBoxes.find(box => box.family === 'collisionboxes').sourcePath, 'root.collisionboxesByType["box-test-blue"][0]');
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'selectionbox').sourcePath, 'root.selectionbox');
assert.equal(blueBoxVariant.interactionBoxes.find(box => box.family === 'selectionbox').sourcePath, 'root.selectionboxByType["box-test-blue"]');
assert.equal(redBoxVariant.interactionBoxes.filter(box => box.family === 'selectionboxes').length, 2);
assert.equal(blueBoxVariant.interactionBoxes.filter(box => box.family === 'selectionboxes').length, 1);
assert.equal(blueBoxVariant.interactionBoxes.find(box => box.family === 'selectionboxes').sourcePath, 'root.selectionboxesByType["box-test-blue"][0]');
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'collisionSelectionBoxes').sourcePath, 'root.collisionSelectionBoxes[0]');
assert.equal(blueBoxVariant.interactionBoxes.find(box => box.family === 'collisionSelectionBoxes').matchedPattern, 'box-test-blue');
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'behavior.selectionBox').behaviorName, 'GroundStorable');
assert.equal(redBoxVariant.interactionBoxes.find(box => box.family === 'behavior.collisionBox').isByType, true);

const nullCollisionDocument = parseVintageStoryAssetDocument(`{
	code: "null-collision",
	shape: { base: "block/test/box" },
	collisionbox: null,
	selectionbox: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1 }
}`, join(assetFixtureRoot, 'null_collision_box.json'));
const nullCollisionVariant = listVintageStoryAssetVariants(nullCollisionDocument, 0).includedVariants[0];
const nullCollisionResolved = resolveVintageStoryAssetVariant(nullCollisionDocument, 0, nullCollisionVariant, {
	sourceFilePath: join(assetFixtureRoot, 'null_collision_box.json')
});
assert.equal(nullCollisionResolved.interactionBoxes.find(box => box.family === 'collisionbox').value, null);
assert.ok(validateVintageStoryInteractionBoxes(nullCollisionResolved.interactionBoxes).some(warning => warning.includes('Collision is disabled')));

const missingGroundStorableBoxDocument = parseVintageStoryAssetDocument(`{
	code: "missing-ground-boxes",
	shape: { base: "block/test/box" },
	behaviors: [
		{ name: "GroundStorable", properties: { layout: "Quadrants" } }
	]
}`, join(assetFixtureRoot, 'missing_ground_boxes.json'));
const missingGroundStorableVariant = listVintageStoryAssetVariants(missingGroundStorableBoxDocument, 0).includedVariants[0];
const missingGroundStorableBoxes = resolveVintageStoryAssetVariant(missingGroundStorableBoxDocument, 0, missingGroundStorableVariant, {
	sourceFilePath: join(assetFixtureRoot, 'missing_ground_boxes.json')
});
assert.ok(missingGroundStorableBoxes.warnings.some(warning => warning.includes('has no selectionBox')));
assert.ok(missingGroundStorableBoxes.warnings.some(warning => warning.includes('has no collisionBox')));

const interactionOverrideAsset = JSON.parse(JSON.stringify(interactionDocument.assetObjects[0].object));
const inheritedCollision = redBoxVariant.interactionBoxes.find(box => box.family === 'collisionbox');
const originalFallbackBox = JSON.parse(JSON.stringify(interactionOverrideAsset.collisionboxByType['*']));
assert.equal(applyInteractionBoxEditToAssetObject(interactionOverrideAsset, makeInteractionBoxEditSource(inheritedCollision, 'override'), {
	x1: 0.2, y1: 0, z1: 0.2, x2: 0.8, y2: 0.3, z2: 0.8
}), true);
assert.deepEqual(interactionOverrideAsset.collisionboxByType['*'], originalFallbackBox);
assert.equal(interactionOverrideAsset.collisionboxByType['box-test-red'].x1, 0.2);
assert.equal(interactionOverrideAsset.unknownKeep.nested, true);

const interactionSharedAsset = JSON.parse(JSON.stringify(interactionDocument.assetObjects[0].object));
assert.equal(applyInteractionBoxEditToAssetObject(interactionSharedAsset, makeInteractionBoxEditSource(inheritedCollision, 'shared'), {
	x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.75, z2: 1
}), true);
assert.equal(interactionSharedAsset.collisionboxByType['*'].y2, 0.75);
assert.equal(interactionSharedAsset.collisionboxByType['box-test-red'], undefined);

const behaviorBoxAsset = JSON.parse(JSON.stringify(interactionDocument.assetObjects[0].object));
const behaviorSelection = redBoxVariant.interactionBoxes.find(box => box.family === 'behavior.selectionBox');
assert.equal(applyInteractionBoxEditToAssetObject(behaviorBoxAsset, behaviorSelection.sourcePointer, {
	x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.2, z2: 1
}), true);
assert.equal(behaviorBoxAsset.behaviors[0].properties.selectionBox.y2, 0.2);

const newArrayBoxAsset = {code: 'arraybox'};
assert.equal(applyInteractionBoxEditToAssetObject(newArrayBoxAsset, {
	ownerKind: 'root',
	ownerPath: [],
	family: 'collisionboxes',
	kind: 'collision',
	valueKind: 'array',
	fieldKey: 'collisionboxes',
	familyPath: ['collisionboxes'],
	isByType: false,
	arrayIndex: 0
}, {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.25, z2: 1}), true);
assert.equal(Array.isArray(newArrayBoxAsset.collisionboxes), true);
assert.equal(newArrayBoxAsset.collisionboxes[0].y2, 0.25);

const invalidBoxWarnings = validateVintageStoryInteractionBoxes([{
	label: 'Invalid',
	kind: 'collision',
	value: {x1: 1, y1: 0, z1: 0, x2: 0, y2: 0, z2: 1},
	isByType: true,
	matchedPattern: 'box-test-missing',
	sourceMapPath: 'root.collisionboxByType'
}], {variants: interactionVariants.allVariants});
assert.ok(invalidBoxWarnings.some(warning => warning.includes('x1 greater than x2')));
assert.ok(invalidBoxWarnings.some(warning => warning.includes('zero Y size')));
assert.ok(invalidBoxWarnings.some(warning => warning.includes('matches no generated variants')));
assert.ok(validateVintageStoryInteractionBoxes(blueBoxVariant.interactionBoxes, {variants: interactionVariants.allVariants}).some(warning => warning.includes('root.rotateYByType["*"] affects')));
assert.deepEqual(interactionBoxFromModelBounds({min: [0, 0, 0], max: [16, 8, 16]}), {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.5, z2: 1});

const saveAsAssetConfig = JSON.parse(await readFile(join(assetFixtureRoot, 'save_as_asset_flowerpot_config.json'), 'utf8'));
const generatedShapePath = join(assetFixtureRoot, 'mod', 'assets', 'test', 'shapes', 'block', 'clay', 'flowerpot.json');
const generatedAssetPath = join(assetFixtureRoot, 'mod', 'assets', 'test', 'blocktypes', 'clay', 'flowerpot.json');
const generatedLangPath = join(assetFixtureRoot, 'mod', 'assets', 'test', 'lang', 'en.json');
assert.equal(assetBaseFromFilePath(generatedShapePath, 'shapes', generatedAssetPath), 'block/clay/flowerpot');
assert.equal(
	assetBaseFromFilePath(
		join(assetFixtureRoot, 'mod', 'assets', 'library', 'shapes', 'block', 'shared', 'vase.json'),
		'shapes',
		generatedAssetPath
	),
	'library:block/shared/vase'
);
const workspace = buildVintageStoryWorkspace({
	modRoot: join(assetFixtureRoot, 'mod'),
	domain: 'test',
	PathModule
});
assert.equal(workspace.folders.shapes.endsWith(PathModule.join('assets', 'test', 'shapes')), true);
assert.equal(getVintageStoryLangPath(workspace, 'en', PathModule), generatedLangPath);
const normalizedLegacyWorkspace = getVintageStoryWorkspaceFromSettings({
	vintage_story_mod_assets_path: {value: join(assetFixtureRoot, 'mod', 'assets', 'test')}
}, PathModule);
assert.equal(normalizedLegacyWorkspace.modRoot.replace(/\\/g, '/'), join(assetFixtureRoot, 'mod').replace(/\\/g, '/'));
assert.equal(normalizedLegacyWorkspace.domain, 'test');
assert.equal(
	assetBaseFromFilePath(
		join(workspace.folders.textures, 'block', 'clay', 'redclay.png'),
		'textures',
		generatedAssetPath,
		workspace
	),
	'block/clay/redclay'
);

const parsedVariantGroups = parseVariantGroupsText('color: red, blue, fire\nsize: small, large');
assert.equal(parsedVariantGroups.errors.length, 0);
assert.equal(parsedVariantGroups.variantgroups.length, 2);
assert.equal(parseVariantGroupsText('color: red\ncolor: blue').errors.some(error => error.includes('duplicated')), true);
assert.deepEqual(parsePatternListText('*-copper\n*-iron, *-steel'), ['*-copper', '*-iron', '*-steel']);

const parsedTextureDefaults = parseTextureDefaultsText('outside = block/clay/redclay\ninside = block/clay/fireclay');
assert.deepEqual(parsedTextureDefaults.textures.outside, 'block/clay/redclay');
const parsedTexturesByType = parseTexturesByTypeText('* | outside | block/clay/{color}clay\nflowerpot-red | inside | block/clay/redclay');
assert.equal(parsedTexturesByType.entries[0].pattern, '*');
assert.equal(parsedTexturesByType.entries[0].alias, 'outside');
const parsedCreativeByType = parseCreativeInventoryByTypeText('* | general | *\nflowerpot-red | decorative | flowerpot-red');
assert.equal(parsedCreativeByType.entries[0].category, 'general');
const parsedGenericByType = parseGenericByTypeText('attackpowerbytype | *-copper | 3.75\nattributes.inFirePitPropsByType | *-raw | { transform: { scale: 0.9 } }');
assert.equal(parsedGenericByType.errors.length, 0);
assert.equal(parsedGenericByType.entries[0].value, 3.75);
assert.equal(parsedGenericByType.entries[1].value.transform.scale, 0.9);
assert.equal(parseAdvancedJsonObjectText('{ tool: "axe" }').value.tool, 'axe');
assert.equal(parseAdvancedJsonArrayText('[{ name: "GroundStorable" }]').value[0].name, 'GroundStorable');
assert.equal(parseShapeAlternatesText('item/tool/bow/simple-charge1.json').alternates[0].base, 'item/tool/bow/simple-charge1');
const parsedAttachmentSlots = parseAttachmentSlotsText('frontrightside | item/wearable/hooved/elk/weaponr-falx\nfrontleftside = item/wearable/hooved/elk/weaponl-falx');
assert.equal(parsedAttachmentSlots.errors.length, 0);
assert.equal(parsedAttachmentSlots.slots[0].slotCode, 'frontrightside');
assert.equal(parsedAttachmentSlots.slots[1].base, 'item/wearable/hooved/elk/weaponl-falx');

const generatedFlowerpot = buildVintageStoryAssetObject(Object.assign({}, saveAsAssetConfig, {
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath
}));
assert.equal(generatedFlowerpot.errors.length, 0);
assert.deepEqual(generatedFlowerpot.asset.variantgroups[0], {code: 'color', states: ['red', 'blue', 'fire']});
assert.deepEqual(generatedFlowerpot.asset.shape, {base: 'block/clay/flowerpot'});
assert.equal(generatedFlowerpot.asset.texturesByType['*'].outside.base, 'block/clay/{color}clay');
assert.equal(generatedFlowerpot.asset.maxStackSize, 64);
assert.deepEqual(generatedFlowerpot.asset.creativeinventory, {general: ['*']});
assert.equal(generatedFlowerpot.asset.attributes.shelvable, true);
assertNoEmptyOrNullFields(generatedFlowerpot.asset);

const generatedFullBlockBoxes = buildVintageStoryAssetObject({
	code: 'fullbox',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK
});
assert.equal(generatedFullBlockBoxes.errors.length, 0);
assert.deepEqual(generatedFullBlockBoxes.asset.collisionbox, makeFullBlockInteractionBox());
assert.deepEqual(generatedFullBlockBoxes.asset.selectionbox, makeFullBlockInteractionBox());

const generatedNoCollision = buildVintageStoryAssetObject({
	code: 'nocollision',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.NO_COLLISION
});
assert.equal(generatedNoCollision.errors.length, 0);
assert.equal(generatedNoCollision.asset.collisionbox, null);

const generatedShapeBoundsBoxes = buildVintageStoryAssetObject({
	code: 'boundsbox',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.SHAPE_BOUNDS,
	shapeBoundsBox: {x1: 0.25, y1: 0, z1: 0.25, x2: 0.75, y2: 0.5, z2: 0.75}
});
assert.equal(generatedShapeBoundsBoxes.errors.length, 0);
assert.equal(generatedShapeBoundsBoxes.asset.selectionbox.y2, 0.5);

const generatedCustomBoxes = buildVintageStoryAssetObject({
	code: 'custombox',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM,
	interactionBoxes: [{
		label: 'Custom Collision',
		kind: 'collision',
		value: {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.25, z2: 1},
		sourcePointer: {
			ownerKind: 'root',
			ownerPath: [],
			family: 'collisionbox',
			kind: 'collision',
			valueKind: 'single',
			fieldKey: 'collisionbox',
			familyPath: ['collisionbox'],
			isByType: false
		}
	}]
});
assert.equal(generatedCustomBoxes.errors.length, 0);
assert.equal(generatedCustomBoxes.asset.collisionbox.y2, 0.25);

function makeGroundStorageBoxSource(fieldKey, kind) {
	return {
		ownerKind: 'behavior',
		ownerPath: ['behaviors', -1, 'properties'],
		behaviorName: 'GroundStorable',
		missingBehavior: true,
		createMissingBehavior: true,
		family: `behavior.${fieldKey}`,
		kind,
		valueKind: 'single',
		fieldKey,
		familyPath: ['behaviors', -1, 'properties', fieldKey],
		isByType: false
	};
}

const generatedGroundStorableCustomBoxes = buildVintageStoryAssetObject({
	code: 'groundbox',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM,
	behaviorBoxMode: SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE,
	groundStorableLayout: 'WallHalves',
	groundStorableCtrlKey: true,
	interactionBoxes: [
		{
			label: 'Ground Storage Selection',
			kind: 'selection',
			value: {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.1, z2: 1},
			sourcePointer: makeGroundStorageBoxSource('selectionBox', 'selection')
		},
		{
			label: 'Ground Storage Collision',
			kind: 'collision',
			value: {x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0},
			sourcePointer: makeGroundStorageBoxSource('collisionBox', 'collision')
		}
	]
});
assert.equal(generatedGroundStorableCustomBoxes.errors.length, 0);
assert.equal(generatedGroundStorableCustomBoxes.asset.behaviors[0].name, 'GroundStorable');
assert.equal(generatedGroundStorableCustomBoxes.asset.behaviors[0].properties.layout, 'WallHalves');
assert.equal(generatedGroundStorableCustomBoxes.asset.behaviors[0].properties.ctrlKey, true);
assert.equal(generatedGroundStorableCustomBoxes.asset.behaviors[0].properties.selectionBox.y2, 0.1);
assert.equal(generatedGroundStorableCustomBoxes.asset.behaviors[0].properties.collisionBox.x2, 0);
assert.ok(generatedGroundStorableCustomBoxes.warnings.some(warning => warning.includes('created a GroundStorable behavior')));

const generatedExistingGroundStorableBoxes = buildVintageStoryAssetObject({
	code: 'existinggroundbox',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM,
	behaviors: [{name: 'GroundStorable', properties: {layout: 'SingleCenter', placeRemoveSound: 'sounds/player/build'}}],
	interactionBoxes: [{
		label: 'Ground Storage Collision',
		kind: 'collision',
		value: {x1: 0.1, y1: 0, z1: 0.1, x2: 0.9, y2: 0.25, z2: 0.9},
		sourcePointer: makeGroundStorageBoxSource('collisionBox', 'collision')
	}]
});
assert.equal(generatedExistingGroundStorableBoxes.errors.length, 0);
assert.equal(generatedExistingGroundStorableBoxes.asset.behaviors[0].properties.layout, 'SingleCenter');
assert.equal(generatedExistingGroundStorableBoxes.asset.behaviors[0].properties.placeRemoveSound, 'sounds/player/build');
assert.equal(generatedExistingGroundStorableBoxes.asset.behaviors[0].properties.collisionBox.y2, 0.25);

const generatedConflictingGroundStorableBox = buildVintageStoryAssetObject({
	code: 'conflictgroundbox',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM,
	behaviors: [{name: 'GroundStorable', properties: {
		layout: 'Quadrants',
		selectionBox: {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.9, z2: 1}
	}}],
	interactionBoxes: [{
		label: 'Ground Storage Selection',
		kind: 'selection',
		value: {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.1, z2: 1},
		sourcePointer: makeGroundStorageBoxSource('selectionBox', 'selection')
	}]
});
assert.equal(generatedConflictingGroundStorableBox.asset.behaviors[0].properties.selectionBox.y2, 0.9);
assert.ok(generatedConflictingGroundStorableBox.warnings.some(warning => warning.includes('already has selectionBox')));

const generatedExistingOnlyGroundStorableBox = buildVintageStoryAssetObject({
	code: 'existingonlygroundbox',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	interactionBoxMode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM,
	behaviorBoxMode: SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.EXISTING_ONLY,
	interactionBoxes: [{
		label: 'Ground Storage Selection',
		kind: 'selection',
		value: {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.1, z2: 1},
		sourcePointer: makeGroundStorageBoxSource('selectionBox', 'selection')
	}]
});
assert.equal(generatedExistingOnlyGroundStorableBox.asset.behaviors, undefined);
assert.ok(generatedExistingOnlyGroundStorableBox.warnings.some(warning => warning.includes('has no GroundStorable behavior')));

const generatedAttachmentAsset = buildVintageStoryAssetObject({
	code: 'attachable',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	variantgroups: [{code: 'color', states: ['red', 'blue']}],
	includeAttachableToEntity: true,
	attachmentMode: SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_FALLBACK,
	attachmentCategoryCode: 'toolholding',
	attachmentSlots: [
		{slotCode: 'frontrightside', base: 'item/wearable/hooved/elk/weaponr-falx'},
		{slotCode: 'frontleftside', base: 'item/wearable/hooved/elk/weaponl-falx'}
	]
});
assert.equal(generatedAttachmentAsset.errors.length, 0);
assert.equal(generatedAttachmentAsset.asset.attributesByType['*'].attachableToEntity.categoryCode, 'toolholding');
assert.equal(generatedAttachmentAsset.asset.attributesByType['*'].attachableToEntity.attachedShapeBySlotCode.frontrightside.base, 'item/wearable/hooved/elk/weaponr-falx');

const generatedExactAttachmentAsset = buildVintageStoryAssetObject({
	code: 'exactattach',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	variantgroups: [{code: 'color', states: ['red', 'blue']}],
	includeAttachableToEntity: true,
	attachmentMode: SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_EXACT,
	attachmentCategoryCode: 'toolholding'
});
assert.equal(generatedExactAttachmentAsset.errors.length, 0);
assert.equal(generatedExactAttachmentAsset.asset.attributesByType['exactattach-red'].attachableToEntity.categoryCode, 'toolholding');
assert.equal(generatedExactAttachmentAsset.asset.attributesByType['exactattach-blue'].attachableToEntity.categoryCode, 'toolholding');

const invalidAttachmentAsset = buildVintageStoryAssetObject({
	code: 'badattach',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	includeAttachableToEntity: true,
	attachmentMode: SAVE_AS_ASSET_ATTACHMENT_MODES.GLOBAL,
	attachmentCategoryCode: '',
	attachmentSlots: [{slotCode: 'bad', base: 'C:\\bad\\shape.json'}]
});
assert.equal(invalidAttachmentAsset.errors.some(error => error.includes('categoryCode')), true);
assert.equal(invalidAttachmentAsset.errors.some(error => error.includes('absolute filesystem path')), true);

const presetIds = getVintageStoryAssetPresets().map(preset => preset.id);
assert.deepEqual(presetIds, [
	'decorative_block',
	'decorative_item',
	'shelfable_item',
	'display_case_item',
	'tool_rack_item',
	'ground_storable_item',
	'antler_mount_item',
	'firepit_item',
	'simple_tool',
	'simple_weapon',
	'attachable_entity_item'
]);

const presetOptionsById = new Map(getSaveAsAssetPresetOptions().map(option => [option.id, option]));
[
	'decorative_block',
	'decorative_item',
	'shelfable_item',
	'display_case_item',
	'tool_rack_item',
	'ground_storable_item',
	'antler_mount_item',
	'firepit_item',
	'simple_tool',
	'simple_weapon',
	'attachable_entity_item'
].forEach(id => {
	assert.equal(presetOptionsById.get(id).verified, true);
	assert.equal(presetOptionsById.get(id).experimental, false);
});
assert.equal(presetOptionsById.get('tool_rack_item').label, 'Rackable / Tool Rack Item');

const decorativeBlockPatch = buildVintageStoryPresetFormPatch('decorative_block');
assert.equal(decorativeBlockPatch.asset_preset, 'decorative_block');
assert.equal(decorativeBlockPatch.interaction_box_mode, SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK);
const presetDecorativeBlock = buildVintageStoryAssetObject(Object.assign({
	code: 'preset-decorblock',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'decorative_block'
}));
assert.equal(presetDecorativeBlock.errors.length, 0);
assert.deepEqual(presetDecorativeBlock.asset.collisionbox, makeFullBlockInteractionBox());
assert.deepEqual(presetDecorativeBlock.asset.selectionbox, makeFullBlockInteractionBox());

const presetGroundStorable = buildVintageStoryAssetObject({
	code: 'preset-ground',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'ground_storable_item'
});
assert.equal(presetGroundStorable.errors.length, 0);
assert.equal(presetGroundStorable.asset.behaviors[0].name, 'GroundStorable');
assert.equal(presetGroundStorable.asset.behaviors[0].properties.selectionBox.y2, 0.1);
assert.equal(presetGroundStorable.asset.behaviors[0].properties.collisionBox.x2, 0);

const presetDisplaySlot = {
	translation: [1, 2, 3],
	rotation: [10, 20, 30],
	origin: [0.5, 0.25, 0.75],
	scale: [1.5, 1.5, 1.5],
	vintage_story: {
		was_present: true,
		had_fields: ['translation', 'rotation', 'origin', 'scale'],
		extra: {}
	}
};
const presetDecorativeItem = buildVintageStoryAssetObject({
	code: 'preset-decoritem',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'decorative_item',
	includeDisplayTransforms: true,
	displaySettings: {
		guiTransform: presetDisplaySlot,
		groundTransform: presetDisplaySlot,
		tpHandTransform: presetDisplaySlot
	}
});
assert.equal(presetDecorativeItem.errors.length, 0);
assert.equal(presetDecorativeItem.asset.guiTransform.scale, 1.5);
assert.equal(presetDecorativeItem.asset.groundTransform.scale, 1.5);
assert.equal(presetDecorativeItem.asset.tpHandTransform.scale, 1.5);

const presetShelfable = buildVintageStoryAssetObject({
	code: 'preset-shelf',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'shelfable_item',
	includeDisplayTransforms: true,
	displaySettings: {onshelfTransform: presetDisplaySlot}
});
assert.equal(presetShelfable.errors.length, 0);
assert.equal(presetShelfable.asset.attributes.shelvable, true);
assert.equal(presetShelfable.asset.attributes.displaycaseable, undefined);
assert.equal(presetShelfable.asset.attributes.onshelfTransform.scale, 1.5);
assert.equal(presetShelfable.asset.attributes.onDisplayTransform, undefined);

const presetDisplayCase = buildVintageStoryAssetObject({
	code: 'preset-displaycase',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'display_case_item',
	includeDisplayTransforms: true,
	displaySettings: {onDisplayTransform: presetDisplaySlot}
});
assert.equal(presetDisplayCase.errors.length, 0);
assert.equal(presetDisplayCase.asset.attributes.displaycaseable, true);
assert.equal(presetDisplayCase.asset.attributes.shelvable, undefined);
assert.equal(presetDisplayCase.asset.attributes.onDisplayTransform.scale, 1.5);
assert.equal(presetDisplayCase.asset.attributes.onshelfTransform, undefined);

const presetToolRack = buildVintageStoryAssetObject({
	code: 'preset-rack',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'tool_rack_item',
	includeDisplayTransforms: true,
	displaySettings: {toolrackTransform: presetDisplaySlot}
});
assert.equal(presetToolRack.errors.length, 0);
assert.equal(presetToolRack.asset.attributes.rackable, true);
assert.equal(presetToolRack.asset.attributes.toolrackTransform.scale, 1.5);

const presetAntlerMount = buildVintageStoryAssetObject({
	code: 'preset-antler',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'antler_mount_item',
	includeDisplayTransforms: true,
	displaySettings: {onAntlerMountTransform: presetDisplaySlot}
});
assert.equal(presetAntlerMount.errors.length, 0);
assert.equal(presetAntlerMount.asset.attributes.antlerMountable, true);
assert.equal(presetAntlerMount.asset.attributes.onAntlerMountTransform.scale, 1.5);

const presetFirepit = buildVintageStoryAssetObject({
	code: 'preset-firepit',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'firepit_item',
	includeDisplayTransforms: true,
	displaySettings: {inFirePitPropsTransform: presetDisplaySlot}
});
assert.equal(presetFirepit.errors.length, 0);
assert.equal(presetFirepit.asset.attributes.inFirePitProps.transform.scale, 1.5);
assert.deepEqual(Object.keys(presetFirepit.asset.attributes.inFirePitProps), ['transform']);
assert.equal(presetFirepit.asset.attributes.infirepitTransform, undefined);
assert.equal(presetFirepit.asset.attributes.inForgeTransform, undefined);

const attachableFormPatch = buildVintageStoryPresetFormPatch('attachable_entity_item', {}, {
	attachmentCategoryCode: 'weaponfalx',
	attachmentSlotsText: 'frontrightside | item/wearable/hooved/elk/weaponr-falx'
});
assert.equal(attachableFormPatch.include_attachable_to_entity, true);
assert.equal(attachableFormPatch.attachment_category_code, 'weaponfalx');
const presetAttachable = buildVintageStoryAssetObject(Object.assign({
	code: 'preset-attach',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	variantgroups: [{code: 'type', states: ['falx']}],
	assetPreset: 'attachable_entity_item',
	includeAttachableToEntity: true,
	attachmentMode: SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_FALLBACK,
	attachmentCategoryCode: 'weaponfalx',
	attachmentSlots: [{slotCode: 'frontrightside', base: 'item/wearable/hooved/elk/weaponr-falx'}]
}));
assert.equal(presetAttachable.errors.length, 0);
assert.equal(presetAttachable.asset.attributesByType['*'].attachableToEntity.categoryCode, 'weaponfalx');
assert.equal(presetAttachable.asset.attributesByType['*'].attachableToEntity.attachedShapeBySlotCode.frontrightside.base, 'item/wearable/hooved/elk/weaponr-falx');

const presetSimpleTool = buildVintageStoryAssetObject({
	code: 'preset-tool',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'simple_tool',
	toolType: 'axe',
	durabilityValue: 250
});
assert.equal(presetSimpleTool.asset.tool, 'axe');
assert.equal(presetSimpleTool.asset.durabilitybytype['*'], 250);

const presetSimpleWeapon = buildVintageStoryAssetObject({
	code: 'preset-weapon',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	assetPreset: 'simple_weapon',
	toolType: 'sword',
	durabilityValue: 500,
	attackPowerValue: 4.25,
	attackRangeValue: 2.75
});
assert.equal(presetSimpleWeapon.asset.tool, 'sword');
assert.equal(presetSimpleWeapon.asset.attackpowerbytype['*'], 4.25);
assert.equal(presetSimpleWeapon.asset.attackRangebytype['*'], 2.75);

const existingPresetAsset = {code: 'existing', attributes: {rackable: false}, unknownKeep: {nested: true}};
const rackPatch = buildVintageStoryPresetAssetPatch('tool_rack_item', {
	selectedVariantKey: 'existing-red',
	displaySettings: {toolrackTransform: presetDisplaySlot}
});
assert.equal(rackPatch.patch.attributes.toolrackTransformByType['existing-red'].scale, 1.5);
const rackPatchPreview = previewVintageStoryPresetPatch(existingPresetAsset, rackPatch.patch);
assert.equal(rackPatchPreview.conflicts.some(conflict => conflict.path === 'root.attributes.rackable'), true);
applyVintageStoryPresetPatchToAsset(existingPresetAsset, rackPatch.patch, {overwrite: false});
assert.equal(existingPresetAsset.attributes.rackable, false);
assert.equal(existingPresetAsset.attributes.toolrackTransformByType['existing-red'].scale, 1.5);
assert.equal(existingPresetAsset.unknownKeep.nested, true);
applyVintageStoryPresetPatchToAsset(existingPresetAsset, rackPatch.patch, {overwrite: true});
assert.equal(existingPresetAsset.attributes.rackable, true);

const firepitPatch = buildVintageStoryPresetAssetPatch('firepit_item', {
	selectedVariantKey: 'existing-red',
	displaySettings: {inFirePitPropsTransform: presetDisplaySlot}
});
assert.equal(firepitPatch.patch.attributes.inFirePitPropsByType['existing-red'].transform.scale, 1.5);
assert.equal(firepitPatch.patch.attributes.infirepitTransformByType, undefined);
assert.equal(firepitPatch.patch.attributes.inForgeTransformByType, undefined);

const existingBehaviorAsset = {
	code: 'existingbehavior',
	behaviors: [
		{name: 'AnimationAuthoritative', properties: {keep: true}},
		{name: 'GroundStorable', properties: {layout: 'Halves', keepExisting: true}}
	]
};
const groundBehaviorPatch = buildVintageStoryPresetAssetPatch('ground_storable_item', {});
const groundBehaviorPreview = previewVintageStoryPresetPatch(existingBehaviorAsset, groundBehaviorPatch.patch);
assert.equal(groundBehaviorPreview.conflicts.some(conflict => conflict.path === 'root.behaviors.GroundStorable.properties.layout'), true);
applyVintageStoryPresetPatchToAsset(existingBehaviorAsset, groundBehaviorPatch.patch, {overwrite: false});
assert.equal(existingBehaviorAsset.behaviors.length, 2);
assert.equal(existingBehaviorAsset.behaviors[0].name, 'AnimationAuthoritative');
assert.equal(existingBehaviorAsset.behaviors[1].properties.layout, 'Halves');
assert.equal(existingBehaviorAsset.behaviors[1].properties.selectionBox.y2, 0.1);
assert.equal(existingBehaviorAsset.behaviors[1].properties.keepExisting, true);
applyVintageStoryPresetPatchToAsset(existingBehaviorAsset, groundBehaviorPatch.patch, {overwrite: true});
assert.equal(existingBehaviorAsset.behaviors[1].properties.layout, 'Quadrants');

assert.ok(validateVintageStoryShape({
	textures: {},
	elements: [],
	collisionbox: {x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1}
}).warnings.some(warning => warning.includes('interaction box field')));

const nestedAttachmentDocument = parseVintageStoryAssetDocument(`{
	code: "attach-test",
	variantgroups: [
		{ code: "color", states: ["red", "blue"] },
	],
	shape: { base: "item/tool/blade/falx" },
	attributes: {
		attachableToEntity: {
			categoryCodeByType: {
				"attach-test-red": "redholding",
				"*": "toolholding"
			},
			attachedShapeBySlotCodeByType: {
				"attach-test-red": {
					"frontrightside": { base: "item/wearable/hooved/elk/weaponr-falx" }
				},
				"*": {
					"frontleftside": { base: "item/wearable/hooved/elk/missing-left" }
				}
			},
			extraKeep: true
		}
	}
}`, join(assetFixtureRoot, 'mod', 'assets', 'test', 'itemtypes', 'nested_attachments.json'));
const nestedAttachmentVariants = listVintageStoryAssetVariants(nestedAttachmentDocument, 0);
const nestedByCode = new Map(nestedAttachmentVariants.allVariants.map(variant => [variant.variantCode, variant]));
const nestedRed = resolveVintageStoryAssetVariant(nestedAttachmentDocument, 0, nestedByCode.get('attach-test-red'), resolverOptions);
assert.equal(nestedRed.attachments.categoryCode, 'redholding');
assert.equal(nestedRed.attachments.slots[0].resolvedShapeBase, 'item/wearable/hooved/elk/weaponr-falx');
assert.equal(nestedRed.attachments.value.extraKeep, true);
const nestedBlue = resolveVintageStoryAssetVariant(nestedAttachmentDocument, 0, nestedByCode.get('attach-test-blue'), resolverOptions);
assert.equal(nestedBlue.attachments.categoryCode, 'toolholding');
assert.equal(nestedBlue.attachments.slots[0].missing, true);
assert.ok(nestedBlue.warnings.some(warning => warning.includes('Missing attached shape')));

const generatedAdvancedAsset = buildVintageStoryAssetObject({
	assetType: 'block',
	domain: 'test',
	code: 'flowerpot',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	workspace,
	variantgroups: [{code: 'color', states: ['red', 'blue', 'fire']}],
	allowedVariants: ['flowerpot-red', 'flowerpot-blue'],
	skipVariants: ['flowerpot-blue'],
	shapeAlternates: [{base: 'block/clay/flowerpot/filled'}],
	creativeInventoryMode: SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES.BY_TYPE,
	creativeinventoryByTypeEntries: [
		{pattern: '*', category: 'general', variants: ['*']},
		{pattern: 'flowerpot-red', category: 'decorative', variants: ['flowerpot-red']}
	],
	byTypeEntries: [
		{path: 'durabilitybytype', pattern: 'flowerpot-red', value: 25},
		{path: 'durabilitybytype', pattern: 'flowerpot-blue', value: 20},
		{path: 'attributes.inFirePitPropsByType', pattern: '*-raw', value: {transform: {scale: 0.9}}}
	],
	className: 'Block',
	entityClassName: 'BlockEntityFlowerpot',
	rootExtras: {blockmaterial: 'Ceramic'},
	attributesExtras: {displayable: {shelf: {size: {width: 6, height: 7, length: 6}}}},
	behaviors: [{name: 'GroundStorable', properties: {layout: 'Quadrants'}}]
});
assert.equal(generatedAdvancedAsset.errors.length, 0);
assert.deepEqual(generatedAdvancedAsset.asset.allowedVariants, ['flowerpot-red', 'flowerpot-blue']);
assert.deepEqual(generatedAdvancedAsset.asset.skipVariants, ['flowerpot-blue']);
assert.equal(generatedAdvancedAsset.asset.shape.alternates[0].base, 'block/clay/flowerpot/filled');
assert.equal(generatedAdvancedAsset.asset.creativeinventoryByType['*'].general[0], '*');
assert.equal(generatedAdvancedAsset.asset.durabilitybytype['flowerpot-red'], 25);
assert.equal(generatedAdvancedAsset.asset.attributes.inFirePitPropsByType['*-raw'].transform.scale, 0.9);
assert.equal(generatedAdvancedAsset.asset.class, 'Block');
assert.equal(generatedAdvancedAsset.asset.entityclass, 'BlockEntityFlowerpot');
assert.equal(generatedAdvancedAsset.asset.attributes.displayable.shelf.size.width, 6);
assert.equal(generatedAdvancedAsset.asset.behaviors[0].name, 'GroundStorable');
assert.ok(generatedAdvancedAsset.warnings.some(warning => warning.includes('GroundStorable has no selectionBox')));
assert.ok(generatedAdvancedAsset.warnings.some(warning => warning.includes('skipped or disallowed variant')));
assert.ok(generatedAdvancedAsset.warnings.some(warning => warning.includes('does not match any generated variant')));

const generatedLangEntries = buildVintageStoryLangEntries({
	assetType: 'block',
	code: 'flowerpot',
	displayName: 'Flower Pot',
	generateLang: true,
	langMode: SAVE_AS_ASSET_LANG_MODES.VARIANTS
}, [
	{variantCode: 'flowerpot-red', states: {color: 'red'}},
	{variantCode: 'flowerpot-fire', states: {color: 'fire'}}
]);
assert.deepEqual(generatedLangEntries, {
	'block-flowerpot-red': 'Flower Pot Red',
	'block-flowerpot-fire': 'Flower Pot Fire'
});

const verifiedAttributeIds = getVerifiedSaveAsAssetAttributes().map(attribute => attribute.id);
assert.deepEqual(verifiedAttributeIds, [
	'shelvable',
	'rackable',
	'moldrackable',
	'displaycaseable',
	'bookshelveable',
	'scrollrackable',
	'antlerMountable',
	'omokpiece',
	'crockable'
]);
const generatedAllAttributes = buildVintageStoryAssetObject({
	code: 'attribute-test',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	attributes: {
		shelvable: 'Halves',
		rackable: true,
		moldrackable: true,
		displaycaseable: true,
		bookshelveable: true,
		scrollrackable: true,
		antlerMountable: true,
		omokpiece: true,
		crockable: true
	}
});
assert.equal(generatedAllAttributes.errors.length, 0);
assert.equal(generatedAllAttributes.asset.attributes.shelvable, 'Halves');
assert.equal(generatedAllAttributes.asset.attributes.bookshelveable, true);
assert.equal(generatedAllAttributes.asset.attributes.antlerMountable, true);
assert.equal(generatedAllAttributes.asset.attributes.crockable, true);

const generatedNoVariantItem = buildVintageStoryAssetObject({
	assetType: 'item',
	code: 'testitem',
	shapeSavePath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'shapes', 'item', 'tool', 'testitem.json'),
	assetSavePath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'itemtypes', 'tool', 'testitem.json'),
	textureMode: SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS,
	textureDefaults: {texture: 'item/tool/testitem'}
});
assert.equal(generatedNoVariantItem.errors.length, 0);
assert.deepEqual(generatedNoVariantItem.asset.shape, {base: 'item/tool/testitem'});
assert.equal(generatedNoVariantItem.asset.textures.texture.base, 'item/tool/testitem');

const displaySlot = {
	translation: [1, 2, 3],
	rotation: [10, 20, 30],
	origin: [0.5, 0.25, 0.75],
	scale: [1.5, 1.5, 1.5],
	vintage_story: {
		was_present: true,
		had_fields: ['translation', 'rotation', 'origin', 'scale'],
		extra: {}
	}
};
const saveAsAssetTransformIds = getSaveAsAssetTransformOptions().map(option => option.id);
assert.deepEqual(saveAsAssetTransformIds, [
	'tpHandTransform',
	'tpOffHandTransform',
	'fpHandTransform',
	'onTongTransform',
	'groundTransform',
	'groundStorageTransform',
	'onAntlerMountTransform',
	'toolrackTransform',
	'onmoldrackTransform',
	'onDisplayTransform',
	'onshelfTransform',
	'onscrollrackTransform',
	'guiTransform',
	'inTrapTransform',
	'inForgeTransform',
	'onOmokTransform',
	'infirepitTransform',
	'inFirePitPropsTransform'
]);
const generatedTransforms = buildVintageStoryAssetObject({
	code: 'transformtest',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	variantgroups: [{code: 'color', states: ['red', 'blue']}],
	includeDisplayTransforms: true,
	transformMode: SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_FALLBACK,
	displaySettings: {
		guiTransform: displaySlot,
		toolrackTransform: displaySlot
	}
});
assert.equal(generatedTransforms.errors.length, 0);
assert.equal(generatedTransforms.asset.guiTransformByType['*'].scale, 1.5);
assert.equal(generatedTransforms.asset.attributes.toolrackTransformByType['*'].origin.x, 0.5);
assert.equal(generatedTransforms.asset.fpHandTransform, undefined);

const transformSelection = {};
const allTransformDisplaySettings = {};
saveAsAssetTransformIds.forEach(id => {
	transformSelection[id] = true;
	allTransformDisplaySettings[id] = displaySlot;
});
const generatedAllTransforms = buildVintageStoryAssetObject({
	code: 'all-transformtest',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	includeDisplayTransforms: true,
	transformMode: SAVE_AS_ASSET_TRANSFORM_MODES.GLOBAL,
	transformSelection,
	displaySettings: allTransformDisplaySettings
});
assert.equal(generatedAllTransforms.errors.length, 0);
assert.equal(generatedAllTransforms.asset.tpHandTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.tpOffHandTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.fpHandTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.groundTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.guiTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.toolrackTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.onmoldrackTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.onDisplayTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.groundStorageTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.onshelfTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.onscrollrackTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.onAntlerMountTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.onTongTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.inTrapTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.inForgeTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.onOmokTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.infirepitTransform.scale, 1.5);
assert.equal(generatedAllTransforms.asset.attributes.inFirePitProps.transform.scale, 1.5);

const generatedSelectedTransforms = buildVintageStoryAssetObject({
	code: 'selected-transformtest',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	includeDisplayTransforms: true,
	transformMode: SAVE_AS_ASSET_TRANSFORM_MODES.GLOBAL,
	transformSelection: {
		guiTransform: true,
		toolrackTransform: false,
		groundStorageTransform: true
	},
	displaySettings: {
		guiTransform: displaySlot,
		toolrackTransform: displaySlot,
		groundStorageTransform: displaySlot
	}
});
assert.equal(generatedSelectedTransforms.errors.length, 0);
assert.equal(generatedSelectedTransforms.asset.guiTransform.scale, 1.5);
assert.equal(generatedSelectedTransforms.asset.attributes.groundStorageTransform.scale, 1.5);
assert.equal(generatedSelectedTransforms.asset.attributes.toolrackTransform, undefined);

const generatedExactTransforms = buildVintageStoryAssetObject({
	code: 'exacttest',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	variantgroups: [{code: 'color', states: ['red', 'blue']}],
	includeDisplayTransforms: true,
	transformMode: SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_EXACT,
	displaySettings: {guiTransform: displaySlot}
});
assert.equal(Object.keys(generatedExactTransforms.asset.guiTransformByType).length, 2);
assert.equal(generatedExactTransforms.asset.guiTransformByType['exacttest-red'].translation.x, 1);

const invalidAbsoluteTexture = buildVintageStoryAssetObject({
	code: 'badtexture',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	textureMode: SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS,
	textureDefaults: {texture: 'C:\\Users\\bad\\texture.png'}
});
assert.equal(invalidAbsoluteTexture.errors.some(error => error.includes('absolute filesystem path')), true);

const invalidBackslashTexture = buildVintageStoryAssetObject({
	code: 'badbackslash',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	textureMode: SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS,
	textureDefaults: {texture: 'block\\clay\\redclay'}
});
assert.equal(invalidBackslashTexture.errors.some(error => error.includes('Windows backslashes')), true);

const invalidTraversalTexture = buildVintageStoryAssetObject({
	code: 'badtraversaltexture',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	textureMode: SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS,
	textureDefaults: {texture: '../outside'}
});
assert.equal(invalidTraversalTexture.errors.some(error => error.includes('path traversal')), true);

const outsideShapePath = buildVintageStoryAssetObject({
	code: 'badshape',
	shapeSavePath: join(assetFixtureRoot, 'badshape.json'),
	assetSavePath: generatedAssetPath
});
assert.equal(outsideShapePath.errors.some(error => error.includes('Shape base path')), true);
assert.equal(outsideShapePath.warnings.some(warning => warning.includes('outside an assets')), true);

const outsideAssetPath = buildVintageStoryAssetObject({
	code: 'badassetpath',
	shapeSavePath: generatedShapePath,
	assetSavePath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'shapes', 'block', 'badassetpath.json')
});
assert.equal(outsideAssetPath.errors.some(error => error.includes('Block Asset Save Path')), true);

const itemAssetPathCheck = buildVintageStoryAssetObject({
	code: 'safeitem',
	assetType: 'item',
	shapeSavePath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'shapes', 'item', 'safeitem.json'),
	assetSavePath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'itemtypes', 'safeitem.json')
});
assert.equal(itemAssetPathCheck.errors.some(error => error.includes('Item Asset Save Path')), false);

const blockAssetPathCheck = buildVintageStoryAssetObject({
	code: 'safeblock',
	assetType: 'block',
	shapeSavePath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'shapes', 'block', 'safeblock.json'),
	assetSavePath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'blocktypes', 'safeblock.json')
});
assert.equal(blockAssetPathCheck.errors.some(error => error.includes('Block Asset Save Path')), false);

const outsideLangPath = buildVintageStoryAssetObject({
	code: 'badlang',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	generateLang: true,
	langPath: join(assetFixtureRoot, 'mod', 'assets', 'test', 'textures', 'en.json')
});
assert.equal(outsideLangPath.errors.some(error => error.includes('Lang File')), true);

const validLangPath = buildVintageStoryAssetObject({
	code: 'goodlang',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	generateLang: true,
	langPath: generatedLangPath
});
assert.equal(validLangPath.errors.some(error => error.includes('Lang File')), false);

const invalidShapeBaseTraversal = buildVintageStoryAssetObject({
	code: 'badshapebase',
	shapeBase: '../../escape',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath
});
assert.equal(invalidShapeBaseTraversal.errors.some(error => error.includes('path traversal')), true);
assert.equal(JSON.stringify(invalidShapeBaseTraversal.asset).includes('..'), false);

const invalidShapeBaseFilesystemPrefix = buildVintageStoryAssetObject({
	code: 'badshapeprefix',
	shapeBase: 'assets/test/shapes/block/badshapeprefix',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath
});
assert.equal(invalidShapeBaseFilesystemPrefix.errors.some(error => error.includes('asset base path')), true);

const invalidShapeAlternateTraversal = parseShapeAlternatesText('../bad-shape');
assert.equal(invalidShapeAlternateTraversal.errors.some(error => error.includes('path traversal')), true);

const invalidAttachmentSlotTraversal = parseAttachmentSlotsText('frontrightside | ../bad-shape');
assert.equal(invalidAttachmentSlotTraversal.errors.some(error => error.includes('path traversal')), true);

const invalidAttachmentSlotBackslash = parseAttachmentSlotsText('frontrightside | item\\wearable\\bad');
assert.equal(invalidAttachmentSlotBackslash.errors.some(error => error.includes('Windows backslashes')), true);

const advancedUnsafePathAsset = buildVintageStoryAssetObject({
	code: 'advancedunsafe',
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath,
	rootExtras: {serverOnlyPath: 'C:\\Users\\bad\\asset.json'},
	attributesExtras: {shapeBase: '../escape'}
});
assert.equal(advancedUnsafePathAsset.errors.some(error => error.includes('absolute filesystem path')), true);
assert.equal(advancedUnsafePathAsset.errors.some(error => error.includes('path traversal')), true);

const safeShapeResolution = resolveAssetBasePath(
	[join(assetSuiteRoot, 'synthetic_mod')],
	'synthetic',
	'shapes',
	'item/variant/default',
	['.json'],
	{fs, PathModule}
);
assert.equal(safeShapeResolution.resolvedFilePath.endsWith(PathModule.join('assets', 'synthetic', 'shapes', 'item', 'variant', 'default.json')), true);
assert.equal(safeShapeResolution.invalid, undefined);
const traversalShapeResolution = resolveAssetBasePath(
	[join(assetSuiteRoot, 'synthetic_mod')],
	'synthetic',
	'shapes',
	'../../outside',
	['.json'],
	{fs, PathModule}
);
assert.equal(traversalShapeResolution.invalid, true);
assert.equal(traversalShapeResolution.resolvedFilePath, '');
const safeTextureResolution = resolveAssetBasePath(
	[join(assetSuiteRoot, 'synthetic_mod')],
	'synthetic',
	'textures',
	'item/bytype/fallback',
	['.png'],
	{fs, PathModule}
);
assert.equal(safeTextureResolution.resolvedFilePath.endsWith(PathModule.join('assets', 'synthetic', 'textures', 'item', 'bytype', 'fallback.png')), true);

const generatedPreview = generateVintageStoryAssetPreview(Object.assign({}, saveAsAssetConfig, {
	shapeSavePath: generatedShapePath,
	assetSavePath: generatedAssetPath
}));
assert.deepEqual(generatedPreview.variants.map(variant => variant.variantCode), ['flowerpot-red', 'flowerpot-blue', 'flowerpot-fire']);
assert.equal(serializeGeneratedVintageStoryAsset(generatedFlowerpot.asset).includes('"texturesByType"'), true);

assert.deepEqual(parseVintageStoryDependencyText('game=\nattributerenderinglibrary=*'), {
	game: '',
	attributerenderinglibrary: '*'
});
const preservedModInfo = buildVintageStoryModInfo({
	type: 'content',
	modid: 'test',
	name: 'Test Mod',
	description: 'Generated test mod',
	authors: 'P1nkOblivion',
	version: '1.0.0',
	dependenciesText: 'game=',
	website: 'https://example.com'
}, {
	Modid: 'oldtest',
	side: 'universal',
	customKeep: {nested: true}
});
assert.equal(preservedModInfo.Modid, 'test');
assert.equal(preservedModInfo.side, 'universal');
assert.equal(preservedModInfo.customKeep.nested, true);
assert.deepEqual(preservedModInfo.authors, ['P1nkOblivion']);
assert.equal(defaultVintageStoryPackageName({modid: 'test', version: '1.0.0'}), 'test-1.0.0.zip');
assert.equal(validateVintageStoryModInfo(preservedModInfo, {domain: 'test'}).errors.length, 0);

const exportTemp = fs.mkdtempSync(PathModule.join(process.env.TEMP || process.cwd(), 'vintagebench-export-'));
try {
	const exportWorkspace = buildVintageStoryWorkspace({
		modRoot: join(exportTemp, 'ExampleMod'),
		domain: 'test',
		PathModule
	});
	const dirtyProject = {
		saved: false,
		save_path: join(exportWorkspace.folders.shapes, 'item', 'dirtymain.json'),
		export_path: join(exportWorkspace.folders.shapes, 'item', 'dirtymain.json'),
		vintage_story_data: {
			editing_target: {kind: 'main', shape_path: join(exportWorkspace.folders.shapes, 'item', 'dirtymain.json')},
			asset_context: {source_file_path: join(exportWorkspace.folders.itemtypes, 'dirtyasset.json')}
		},
		display_settings: {
			gui: {vintage_story: {asset_source: {dirty: true}}}
		}
	};
	assert.equal(collectVintageStoryDirtyRecords(dirtyProject).some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.MAIN_SHAPE), true);
	assert.equal(collectVintageStoryDirtyRecords(dirtyProject).some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.ASSET), true);
	dirtyProject.saved = true;
	markVintageStoryExportPlanDirty(dirtyProject, {
		workspace: exportWorkspace,
		entries: [
			{kind: 'modinfo', targetPath: join(exportWorkspace.modRoot, 'modinfo.json')},
			{kind: 'lang', targetPath: join(exportWorkspace.folders.lang, 'en.json')},
			{kind: 'itemtype', targetPath: join(exportWorkspace.folders.itemtypes, 'dirtyasset.json')}
		]
	});
	let dirtyAfterPlan = collectVintageStoryDirtyRecords(dirtyProject);
	assert.equal(dirtyAfterPlan.some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.MODINFO), true);
	assert.equal(dirtyAfterPlan.some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.LANG), true);
	assert.equal(dirtyAfterPlan.some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.EXPORT_PLAN), true);
	clearVintageStoryDirtyFilesWrittenByReport(dirtyProject, {
		written: [join(exportWorkspace.modRoot, 'modinfo.json')],
		copied: [],
		errors: ['lang failed']
	});
	let dirtyAfterPartialClear = collectVintageStoryDirtyRecords(dirtyProject);
	assert.equal(dirtyAfterPartialClear.some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.MODINFO), false);
	assert.equal(dirtyAfterPartialClear.some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.LANG), true);
	assert.equal(dirtyAfterPartialClear.some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.EXPORT_PLAN), true);
	setVintageStoryDirty(dirtyProject, VINTAGE_STORY_DIRTY_KINDS.ATTACHED_SHAPE, true, {
		filePath: join(exportWorkspace.folders.shapes, 'item', 'attached.json')
	});
	assert.equal(collectVintageStoryDirtyRecords(dirtyProject).some(record => record.kind === VINTAGE_STORY_DIRTY_KINDS.ATTACHED_SHAPE), true);

	const backupTarget = join(exportTemp, 'backup-test.json');
	fs.writeFileSync(backupTarget, '{"old":true}\n', 'utf8');
	const backupWrite = writeVintageStoryTextFile(backupTarget, '{"new":true}\n', {fs, PathModule}, {createBackups: true});
	assert.equal(fs.existsSync(backupWrite.backupPath), true);
	assert.equal(fs.readFileSync(backupWrite.backupPath, 'utf8'), '{"old":true}\n');
	assert.equal(fs.readFileSync(backupTarget, 'utf8'), '{"new":true}\n');
	const parsedBackup = parseVintageStoryBackupPath(backupWrite.backupPath);
	assert.equal(parsedBackup.targetPath, backupTarget);
	assert.equal(parsedBackup.timestamp.length, 14);
	const uniqueBackupTarget = join(exportTemp, 'backup-unique.json');
	fs.writeFileSync(uniqueBackupTarget, 'v1\n', 'utf8');
	const fixedBackupTime = new Date('2026-06-23T12:34:56Z');
	const firstUniqueBackup = writeVintageStoryTextFile(uniqueBackupTarget, 'v2\n', {fs, PathModule}, {createBackups: true, now: fixedBackupTime});
	const secondUniqueBackup = writeVintageStoryTextFile(uniqueBackupTarget, 'v3\n', {fs, PathModule}, {createBackups: true, now: fixedBackupTime});
	assert.notEqual(firstUniqueBackup.backupPath, secondUniqueBackup.backupPath);
	assert.equal(fs.existsSync(firstUniqueBackup.backupPath), true);
	assert.equal(fs.existsSync(secondUniqueBackup.backupPath), true);
	assert.equal(parseVintageStoryBackupPath(secondUniqueBackup.backupPath).sequence, 1);
	const restoreResult = restoreVintageStoryBackup(firstUniqueBackup.backupPath, {fs, PathModule}, {
		createBackups: true,
		now: new Date('2026-06-23T12:35:00Z')
	});
	assert.equal(restoreResult.targetPath, uniqueBackupTarget);
	assert.equal(fs.readFileSync(uniqueBackupTarget, 'utf8'), 'v1\n');
	assert.equal(fs.readFileSync(restoreResult.preRestoreBackupPath, 'utf8'), 'v3\n');
	const partialExportRoot = join(exportTemp, 'PartialExport');
	fs.mkdirSync(partialExportRoot, {recursive: true});
	const blockerPath = join(partialExportRoot, 'blocker');
	fs.writeFileSync(blockerPath, 'not a directory', 'utf8');
	const partialExportReport = executeVintageStoryExportPlan({
		errors: [],
		entries: [
			{kind: 'shape', action: 'write', targetPath: join(partialExportRoot, 'ok.json'), content: '{}\n'},
			{kind: 'shape', action: 'write', targetPath: join(blockerPath, 'fail.json'), content: '{}\n'}
		]
	}, {fs, PathModule}, {createBackups: false});
	assert.equal(partialExportReport.written.includes(join(partialExportRoot, 'ok.json')), true);
	assert.equal(partialExportReport.created.includes(join(partialExportRoot, 'ok.json')), true);
	assert.equal(partialExportReport.errors.length, 1);
	assert.equal(partialExportReport.failed.length, 1);
	assert.equal(partialExportReport.warnings.some(warning => warning.includes('Partial export completed')), true);
	assert.equal(partialExportReport.warnings.some(warning => warning.includes('rollback')), true);
	assert.equal(formatVintageStoryExportReport(partialExportReport).includes('failed:'), true);
	assert.equal(formatVintageStoryExportReport(partialExportReport).includes('created:'), true);

	const sourceTexture = join(exportTemp, 'source-textures', 'simpleitem.png');
	fs.mkdirSync(PathModule.dirname(sourceTexture), {recursive: true});
	fs.writeFileSync(sourceTexture, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const exportShape = {
		textureWidth: 16,
		textureHeight: 16,
		textures: {outside: {base: 'item/simpleitem'}},
		elements: []
	};
	const exportAsset = {
		code: 'simpleitem',
		shape: {base: 'item/simpleitem'},
		textures: {outside: {base: 'item/simpleitem'}},
		creativeinventory: {general: ['*']}
	};
	const exportPlan = createVintageStoryExportPlan({
		workspace: exportWorkspace,
		modInfo: {
			type: 'content',
			modid: 'test',
			name: 'Test Mod',
			description: 'Generated by tests',
			authors: 'P1nkOblivion',
			version: '1.0.0',
			dependenciesText: 'game='
		},
		assetObject: exportAsset,
		assetType: 'item',
		shapeJson: exportShape,
		shapeBase: 'item/simpleitem',
		textureSources: {
			aliases: {
				outside: {
					resolvedBase: 'item/simpleitem',
					resolvedFilePath: sourceTexture,
					missing: false
				}
			}
		},
		copyTextures: true,
		langEntries: {'item-simpleitem': 'Simple Item'}
	}, {fs, PathModule});
	assert.equal(exportPlan.errors.length, 0);
	const exportModInfoEntry = exportPlan.entries.find(entry => entry.kind === 'modinfo');
	const exportLangEntry = exportPlan.entries.find(entry => entry.kind === 'lang');
	assert.equal(!!exportModInfoEntry, true);
	assert.equal(exportModInfoEntry.targetPath, join(exportWorkspace.modRoot, 'modinfo.json'));
	assert.equal(parseVintageStoryAssetText(exportModInfoEntry.content).modid, 'test');
	assert.equal(exportPlan.entries.some(entry => entry.kind === 'itemtype'), true);
	assert.equal(exportPlan.entries.some(entry => entry.kind === 'shape'), true);
	assert.equal(exportPlan.entries.some(entry => entry.kind === 'texture'), true);
	assert.equal(!!exportLangEntry, true);
	assert.equal(exportLangEntry.targetPath, getVintageStoryLangPath(exportWorkspace, 'en', PathModule));
	const exportReport = executeVintageStoryExportPlan(exportPlan, {fs, PathModule}, {createBackups: false});
	assert.equal(exportReport.errors.length, 0);
	const exportedAssetPath = join(exportWorkspace.folders.itemtypes, 'simpleitem.json');
	const exportedShapePath = join(exportWorkspace.folders.shapes, 'item', 'simpleitem.json');
	const exportedTexturePath = join(exportWorkspace.folders.textures, 'item', 'simpleitem.png');
	const exportedLangPath = join(exportWorkspace.folders.lang, 'en.json');
	assert.equal(fs.existsSync(join(exportWorkspace.modRoot, 'modinfo.json')), true);
	assert.equal(fs.existsSync(exportedAssetPath), true);
	assert.equal(fs.existsSync(exportedShapePath), true);
	assert.equal(fs.existsSync(exportedTexturePath), true);
	assert.equal(fs.existsSync(exportedLangPath), true);
	assert.equal(JSON.stringify(parseVintageStoryAssetText(fs.readFileSync(exportedAssetPath, 'utf8'))).includes(exportTemp), false);
	assert.equal(parseVintageStoryAssetText(fs.readFileSync(exportedLangPath, 'utf8'))['item-simpleitem'], 'Simple Item');
	const workspaceValidation = validateVintageStoryWorkspace(exportWorkspace, {fs, PathModule}, {skipTextures: false});
	assert.equal(workspaceValidation.errors.length, 0);
	assert.equal(workspaceValidation.warnings.some(warning => warning.includes('absolute filesystem path')), false);
	const missingReferenceAssetPath = join(exportWorkspace.folders.itemtypes, 'missingref.json');
	fs.writeFileSync(missingReferenceAssetPath, serializeGeneratedVintageStoryAsset({
		code: 'missingref',
		shape: {base: 'item/missingref'}
	}), 'utf8');
	const packageBaggage = [
		['.git/config', '[core]\n'],
		['node_modules/example/index.js', 'module.exports = {};\n'],
		['temp/scratch.tmp', 'scratch\n'],
		['types/generated/vintagebench.d.ts', 'export type Generated = string;\n'],
		['.vscode/settings.json', '{}\n'],
		['draft.bbmodel', '{}\n'],
		['assets/other/itemtypes/leak.json', serializeGeneratedVintageStoryAsset({code: 'leak'})],
		['assets/test/textures/vintagebench/preview/reference.png', '\x89PNG'],
		['assets/test/shapes/vintagebench/preview/reference.json', JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t')]
	];
	packageBaggage.forEach(([relativePath, content]) => {
		let target = join(exportWorkspace.modRoot, ...relativePath.split('/'));
		fs.mkdirSync(PathModule.dirname(target), {recursive: true});
		fs.writeFileSync(target, content);
	});
	const packagePath = join(exportTemp, 'test-1.0.0.zip');
	const packageReport = await packageVintageStoryModWorkspace(exportWorkspace, packagePath, {fs, PathModule});
	assert.equal(packageReport.errors.length, 0);
	assert.equal(fs.existsSync(packagePath), true);
	assert.equal(packageReport.included.includes('modinfo.json'), true);
	assert.equal(packageReport.included.includes('assets/test/itemtypes/simpleitem.json'), true);
	assert.equal(packageReport.included.includes('assets/test/lang/en.json'), true);
	assert.equal(packageReport.included.includes('assets/test/textures/item/simpleitem.png'), true);
	assert.equal(packageReport.warnings.some(warning => warning.includes('Missing shape')), true);
	assert.equal(packageReport.diagnostics.every(issue => {
		assertDetailedDiagnostic(issue);
		return true;
	}), true);
	const missingShapeDiagnostic = packageReport.diagnostics.find(issue => issue.code === 'missing_shape');
	assertDetailedDiagnostic(missingShapeDiagnostic);
	assert.equal(missingShapeDiagnostic.variantCode, 'missingref');
	assert.equal(missingShapeDiagnostic.blocks, 'none');
	assert.equal(packageReport.diagnostics.some(issue => issue.code === 'package_excluded_internal_file' && issue.severity === 'info' && issue.filePath === '.git/config'), true);
	assert.equal(packageReport.diagnostics.some(issue => issue.code === 'package_excluded_internal_file' && issue.filePath.includes('vintagebench/preview')), true);
	assert.equal(packageReport.included.some(path => path.includes('node_modules')), false);
	assert.equal(packageReport.included.some(path => path.includes('vintagebench/preview')), false);
	assert.equal(packageReport.included.some(path => path.startsWith('assets/other/')), false);
	[
		'.git/config',
		'node_modules/example/index.js',
		'temp/scratch.tmp',
		'types/generated/vintagebench.d.ts',
		'.vscode/settings.json',
		'draft.bbmodel',
		'assets/other/itemtypes/leak.json',
		'assets/test/textures/vintagebench/preview/reference.png',
		'assets/test/shapes/vintagebench/preview/reference.json'
	].forEach(relativePath => assert.equal(packageReport.excluded.includes(relativePath), true, `${relativePath} should be excluded from package`));
	const archive = await JSZip.loadAsync(fs.readFileSync(packagePath));
	assert.ok(archive.file('modinfo.json'));
	assert.ok(archive.file('assets/test/itemtypes/simpleitem.json'));
	assert.ok(archive.file('assets/test/shapes/item/simpleitem.json'));
	assert.ok(archive.file('assets/test/textures/item/simpleitem.png'));
	assert.ok(archive.file('assets/test/lang/en.json'));
	assert.equal(!!archive.file('node_modules/example/index.js'), false);
	assert.equal(!!archive.file('assets/test/textures/vintagebench/preview/reference.png'), false);
	assert.equal(!!archive.file('assets/other/itemtypes/leak.json'), false);
	const modsFolder = join(exportTemp, 'Mods');
	const copyReport = copyVintageStoryPackageToModsFolder(packagePath, modsFolder, {fs, PathModule}, {overwrite: true});
	assert.equal(copyReport.errors.length, 0);
	assert.equal(fs.existsSync(join(modsFolder, 'test-1.0.0.zip')), true);
	const missingModInfoWorkspace = buildVintageStoryWorkspace({
		modRoot: join(exportTemp, 'MissingModInfo'),
		domain: 'missinginfo',
		PathModule
	});
	fs.mkdirSync(missingModInfoWorkspace.assetsRoot, {recursive: true});
	const missingModInfoValidation = validateVintageStoryWorkspace(missingModInfoWorkspace, {fs, PathModule});
	assert.equal(missingModInfoValidation.errors.some(error => error.includes('modinfo.json is missing')), true);
	const missingModInfoPackage = await packageVintageStoryModWorkspace(missingModInfoWorkspace, join(exportTemp, 'missinginfo.zip'), {fs, PathModule});
	assert.equal(missingModInfoPackage.errors.some(error => error.includes('modinfo.json is missing')), true);
	const missingAssetsWorkspace = buildVintageStoryWorkspace({
		modRoot: join(exportTemp, 'MissingAssets'),
		domain: 'missingassets',
		PathModule
	});
	fs.mkdirSync(missingAssetsWorkspace.modRoot, {recursive: true});
	fs.writeFileSync(join(missingAssetsWorkspace.modRoot, 'modinfo.json'), JSON.stringify(buildVintageStoryModInfo({modid: 'missingassets', name: 'Missing Assets'}), null, '\t'));
	const missingAssetsValidation = validateVintageStoryWorkspace(missingAssetsWorkspace, {fs, PathModule});
	assert.equal(missingAssetsValidation.errors.some(error => error.includes('assets/<domain> folder is missing')), true);
	const placementWorkspace = buildVintageStoryWorkspace({
		modRoot: join(exportTemp, 'PlacementMod'),
		domain: 'placement',
		PathModule
	});
	fs.mkdirSync(placementWorkspace.assetsRoot, {recursive: true});
	fs.mkdirSync(placementWorkspace.folders.itemtypes, {recursive: true});
	fs.mkdirSync(placementWorkspace.folders.shapes, {recursive: true});
	fs.mkdirSync(join(placementWorkspace.assetsRoot, 'misc'), {recursive: true});
	fs.writeFileSync(join(placementWorkspace.modRoot, 'modinfo.json'), JSON.stringify(buildVintageStoryModInfo({modid: 'placement', name: 'Placement Mod'}), null, '\t'));
	fs.writeFileSync(join(placementWorkspace.folders.shapes, 'wrongasset.json'), serializeGeneratedVintageStoryAsset({code: 'wrongasset'}));
	fs.writeFileSync(join(placementWorkspace.folders.itemtypes, 'wrongshape.json'), JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t'));
	fs.writeFileSync(join(placementWorkspace.assetsRoot, 'misc', 'wrongtexture.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const placementValidation = validateVintageStoryWorkspace(placementWorkspace, {fs, PathModule});
	assert.equal(placementValidation.errors.some(error => error.includes('item/block asset JSON must be under assets/<domain>/itemtypes or assets/<domain>/blocktypes')), true);
	assert.equal(placementValidation.errors.some(error => error.includes('shape JSON must be under assets/<domain>/shapes')), true);
	assert.equal(placementValidation.errors.some(error => error.includes('texture file must be under assets/<domain>/textures')), true);
	assert.equal(placementValidation.diagnostics.every(issue => {
		assertDetailedDiagnostic(issue);
		return true;
	}), true);
	assert.equal(placementValidation.diagnostics.some(issue => issue.code === 'asset_json_outside_item_block_folder' && issue.blocks.includes('package')), true);
	assert.equal(placementValidation.diagnostics.some(issue => issue.code === 'shape_json_outside_shapes_folder' && issue.blocks.includes('package')), true);
	assert.equal(placementValidation.diagnostics.some(issue => issue.code === 'texture_file_outside_textures_folder' && issue.blocks.includes('package')), true);
	const placementValidationText = formatVintageStoryValidationReport(placementValidation);
	assert.equal(placementValidationText.includes('Diagnostics:'), true);
	assert.equal(placementValidationText.includes('why:'), true);
	assert.equal(placementValidationText.includes('fix:'), true);
	assert.equal(placementValidationText.includes('blocks:'), true);
	const badPlan = createVintageStoryExportPlan({
		workspace: exportWorkspace,
		modInfo: {modid: 'test', name: 'Bad Test', authors: 'P1nkOblivion', version: '1.0.0', dependenciesText: 'game='},
		assetObject: {code: 'badasset', shape: {base: 'C:\\bad\\shape.json'}},
		assetType: 'item',
		shapeJson: exportShape,
		shapeBase: 'item/badasset'
	}, {fs, PathModule});
	assert.equal(badPlan.errors.some(error => error.includes('absolute filesystem path')), true);
	const badTraversalPlan = createVintageStoryExportPlan({
		workspace: exportWorkspace,
		modInfo: {modid: 'test', name: 'Bad Traversal', authors: 'P1nkOblivion', version: '1.0.0', dependenciesText: 'game='},
		assetObject: {code: 'badtraversal', shape: {base: '../escape'}},
		assetType: 'item',
		shapeJson: exportShape,
		shapeBase: '../escape'
	}, {fs, PathModule});
	assert.equal(badTraversalPlan.errors.some(error => error.includes('path traversal')), true);
	const badTexturePlan = createVintageStoryExportPlan({
		workspace: exportWorkspace,
		modInfo: {modid: 'test', name: 'Bad Texture', authors: 'P1nkOblivion', version: '1.0.0', dependenciesText: 'game='},
		assetObject: exportAsset,
		assetType: 'item',
		shapeJson: exportShape,
		shapeBase: 'item/badtexture',
		textureSources: {
			aliases: {
				outside: {
					resolvedBase: '../escape',
					resolvedFilePath: sourceTexture,
					missing: false
				}
			}
		},
		copyTextures: true
	}, {fs, PathModule});
	assert.equal(badTexturePlan.errors.some(error => error.includes('invalid texture base path')), true);
	const badLangPlan = createVintageStoryExportPlan({
		workspace: exportWorkspace,
		modInfo: {modid: 'test', name: 'Bad Lang', authors: 'P1nkOblivion', version: '1.0.0', dependenciesText: 'game='},
		assetObject: exportAsset,
		assetType: 'item',
		shapeJson: exportShape,
		shapeBase: 'item/badlang',
		langEntries: {'item-badlang': 'Bad Lang'},
		langPath: join(exportWorkspace.folders.textures, 'en.json')
	}, {fs, PathModule});
	assert.equal(badLangPlan.errors.some(error => error.includes('lang target must be under')), true);
	const gameRootPlan = createVintageStoryExportPlan({
		workspace: exportWorkspace,
		gameAssetRoot: exportWorkspace.modRoot,
		modInfo: {modid: 'test', name: 'Game Root', authors: 'P1nkOblivion', version: '1.0.0', dependenciesText: 'game='},
		assetObject: exportAsset,
		assetType: 'item',
		shapeJson: exportShape,
		shapeBase: 'item/gameroot'
	}, {fs, PathModule});
	assert.equal(gameRootPlan.errors.some(error => error.includes('game assets root')), true);
	const explicitGameRootPlan = createVintageStoryExportPlan({
		workspace: exportWorkspace,
		gameAssetRoot: exportWorkspace.modRoot,
		allowGameAssetWrites: true,
		modInfo: {modid: 'test', name: 'Game Root Allowed', authors: 'P1nkOblivion', version: '1.0.0', dependenciesText: 'game='},
		assetObject: exportAsset,
		assetType: 'item',
		shapeJson: exportShape,
		shapeBase: 'item/gamerootallowed'
	}, {fs, PathModule});
	assert.equal(explicitGameRootPlan.errors.some(error => error.includes('game assets root')), false);
	const unsafeWorkspaceAssetPath = join(exportWorkspace.folders.itemtypes, 'unsafe.json');
	fs.writeFileSync(unsafeWorkspaceAssetPath, serializeGeneratedVintageStoryAsset({
		code: 'unsafe',
		shape: {base: '../escape'},
		textures: {outside: {base: 'item\\unsafe'}}
	}), 'utf8');
	const unsafeWorkspaceValidation = validateVintageStoryWorkspace(exportWorkspace, {fs, PathModule}, {skipTextures: true});
	assert.equal(unsafeWorkspaceValidation.errors.some(error => error.includes('path traversal')), true);
	assert.equal(unsafeWorkspaceValidation.errors.some(error => error.includes('Windows backslash')), true);
	assert.equal(unsafeWorkspaceValidation.diagnostics.every(issue => {
		assertDetailedDiagnostic(issue);
		return true;
	}), true);
	assert.equal(unsafeWorkspaceValidation.diagnostics.some(issue => issue.code === 'unsafe_asset_json_path' && issue.severity === 'error' && issue.blocks.includes('export')), true);
	fs.rmSync(unsafeWorkspaceAssetPath, {force: true});
} finally {
	fs.rmSync(exportTemp, {recursive: true, force: true});
}

console.log('Vintage Story JSON and asset resolver tests passed');
