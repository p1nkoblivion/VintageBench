import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {
	applyTransformEditToAssetObject,
	listVintageStoryAssetVariants,
	resolveVintageStoryAssetVariant
} from '../js/vintagestory/vs_asset_resolver.js';
import {
	buildVintageStoryAssetObject
} from '../js/vintagestory/vs_asset_generator.js';
import {
	parseVintageStoryAssetDocument,
	parseVintageStoryAssetText,
	serializeVintageStoryAssetDocument
} from '../js/vintagestory/vs_asset_document.js';
import {
	buildVintageStoryWorkspace
} from '../js/vintagestory/vs_asset_workspace.js';
import {
	createVintageStoryExportPlan,
	executeVintageStoryExportPlan,
	formatVintageStoryExportReport,
	packageVintageStoryModWorkspace,
	validateVintageStoryWorkspace
} from '../js/vintagestory/vs_mod_exporter.js';
import {
	collectUnsafeAssetJsonStrings
} from '../js/vintagestory/vs_asset_path_safety.js';
import {
	getVintageStoryAssetPresets
} from '../js/vintagestory/vs_asset_presets.js';

const root = process.cwd();
const fixtureRoot = path.join(root, 'test', 'fixtures', 'vintage_story_assets');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vintagebench-release-gate-'));
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function read(relPath) {
	return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function writeSourceTexture(relativePath) {
	let target = path.join(tempRoot, 'source-textures', ...relativePath.split('/')) + '.png';
	fs.mkdirSync(path.dirname(target), {recursive: true});
	fs.writeFileSync(target, pngBytes);
	return target;
}

function makeShape(alias, base) {
	return {
		textureWidth: 16,
		textureHeight: 16,
		textures: {[alias]: base},
		elements: [{
			name: 'body',
			from: [0, 0, 0],
			to: [16, 16, 16],
			faces: {
				north: {texture: `#${alias}`, uv: [0, 0, 16, 16]},
				south: {texture: `#${alias}`, uv: [0, 0, 16, 16]},
				east: {texture: `#${alias}`, uv: [0, 0, 16, 16]},
				west: {texture: `#${alias}`, uv: [0, 0, 16, 16]},
				up: {texture: `#${alias}`, uv: [0, 0, 16, 16]},
				down: {texture: `#${alias}`, uv: [0, 0, 16, 16]}
			}
		}]
	};
}

function assertNoUnsafeAssetJson(asset, label) {
	let unsafe = collectUnsafeAssetJsonStrings(asset);
	assert.deepEqual(unsafe, [], `${label} must not contain absolute paths, backslashes, or traversal`);
}

function assertShapeDoesNotContainAssetFields(shape, label) {
	let forbidden = new Set([
		'guiTransform', 'guiTransformByType',
		'groundTransform', 'groundTransformByType',
		'tpHandTransform', 'tpHandTransformByType',
		'fpHandTransform', 'fpHandTransformByType',
		'toolrackTransform', 'toolrackTransformByType',
		'collisionbox', 'collisionboxes', 'collisionboxByType', 'collisionboxesByType',
		'selectionbox', 'selectionboxes', 'selectionboxByType', 'selectionboxesByType',
		'collisionSelectionBoxes', 'collisionSelectionBoxesByType',
		'attachableToEntity', 'attachableToEntityByType',
		'attributesByType', 'creativeinventoryByType'
	]);
	function walk(value, jsonPath = 'root') {
		if (Array.isArray(value)) {
			value.forEach((entry, index) => walk(entry, `${jsonPath}[${index}]`));
			return;
		}
		if (!value || typeof value !== 'object') return;
		Object.keys(value).forEach(key => {
			assert.equal(forbidden.has(key), false, `${label} shape JSON must not contain asset field ${jsonPath}.${key}`);
			walk(value[key], `${jsonPath}.${key}`);
		});
	}
	walk(shape);
}

function assertRootZipStructure(zip) {
	let files = Object.keys(zip.files).filter(file => !zip.files[file].dir);
	assert.equal(files.includes('modinfo.json'), true, 'package zip root must include modinfo.json');
	assert.equal(files.some(file => file.startsWith('assets/')), true, 'package zip root must include assets/');
	assert.equal(files.some(file => /^[^/]+\/modinfo\.json$/.test(file)), false, 'package zip must not nest modinfo under an extra folder');
}

function assertDiagnosticComplete(issue) {
	assert.ok(['info', 'warning', 'error'].includes(issue.severity), 'diagnostic has severity');
	assert.ok(issue.filePath, 'diagnostic has file path');
	assert.ok(issue.jsonPath, 'diagnostic has JSON path');
	assert.ok(issue.variantCode, 'diagnostic has variant code or n/a');
	assert.ok(issue.what, 'diagnostic says what is wrong');
	assert.ok(issue.why, 'diagnostic says why it matters');
	assert.ok(issue.suggestedFix, 'diagnostic has suggested fix');
	assert.ok(issue.blocks, 'diagnostic states save/export/package blocking behavior');
}

async function createPackageAndReopen({assetType, code, shapeBase, textureAlias, textureBase, assetPreset = ''}) {
	let domain = `release${assetType}`;
	let workspace = buildVintageStoryWorkspace({
		modRoot: path.join(tempRoot, `${assetType}-workspace`),
		domain,
		PathModule: path
	});
	let texturePath = writeSourceTexture(textureBase);
	let generated = buildVintageStoryAssetObject({
		code,
		domain,
		assetPreset,
		shapeBase,
		textureDefaults: {[textureAlias]: textureBase},
		creativeinventory: {general: ['*']}
	});
	assert.deepEqual(generated.errors, [], `${assetType} create should not produce errors`);
	let plan = createVintageStoryExportPlan({
		workspace,
		modInfo: {
			type: 'content',
			modid: domain,
			name: `${assetType} release gate`,
			description: 'Release gate fixture',
			authors: 'P1nkOblivion',
			version: '1.0.0'
		},
		assetObject: generated.asset,
		assetType,
		shapeJson: makeShape(textureAlias, textureBase),
		shapeBase,
		textureSources: {
			aliases: {
				[textureAlias]: {
					resolvedBase: textureBase,
					resolvedFilePath: texturePath,
					missing: false
				}
			}
		},
		copyTextures: true,
		generateLang: true,
		displayName: code
	}, {fs, PathModule: path});
	assert.deepEqual(plan.errors, [], `${assetType} export plan should be clean`);
	assert.equal(plan.entries.some(entry => entry.exists || entry.overwrite), false, `${assetType} first export should not overwrite`);
	let report = executeVintageStoryExportPlan(plan, {fs, PathModule: path}, {createBackups: true});
	assert.deepEqual(report.errors, [], `${assetType} export should succeed`);
	let packagePath = path.join(tempRoot, `${assetType}.zip`);
	let packageReport = await packageVintageStoryModWorkspace(workspace, packagePath, {fs, PathModule: path});
	assert.deepEqual(packageReport.errors, [], `${assetType} package should succeed`);
	let zip = await JSZip.loadAsync(fs.readFileSync(packagePath));
	assertRootZipStructure(zip);
	let folder = assetType === 'block' ? 'blocktypes' : 'itemtypes';
	let shapePath = `assets/${domain}/shapes/${shapeBase}.json`;
	let assetPath = `assets/${domain}/${folder}/${code}.json`;
	let texturePathInZip = `assets/${domain}/textures/${textureBase}.png`;
	assert.ok(zip.file(assetPath), `${assetType} package should include asset JSON`);
	assert.ok(zip.file(shapePath), `${assetType} package should include shape JSON`);
	assert.ok(zip.file(texturePathInZip), `${assetType} package should include texture`);
	let reopenedAsset = parseVintageStoryAssetText(await zip.file(assetPath).async('string'));
	let reopenedShape = parseVintageStoryAssetText(await zip.file(shapePath).async('string'));
	assert.equal(reopenedAsset.code, code);
	assert.equal(reopenedAsset.shape.base, shapeBase);
	assertNoUnsafeAssetJson(reopenedAsset, `${assetType} reopened asset`);
	assertShapeDoesNotContainAssetFields(reopenedShape, `${assetType} reopened shape`);
	return {workspace, plan, report, packageReport, zip, reopenedAsset, reopenedShape};
}

async function run() {
	try {
		let simpleItem = await createPackageAndReopen({
			assetType: 'item',
			code: 'simple-item-release',
			shapeBase: 'item/simple-item-release',
			textureAlias: 'texture',
			textureBase: 'item/simple-item-release'
		});
		let simpleBlock = await createPackageAndReopen({
			assetType: 'block',
			code: 'simple-block-release',
			shapeBase: 'block/simple-block-release',
			textureAlias: 'outside',
			textureBase: 'block/simple-block-release',
			assetPreset: 'decorative_block'
		});
		assert.ok(simpleBlock.reopenedAsset.collisionbox, 'simple block should retain collision box on asset JSON');
		assert.ok(simpleBlock.reopenedAsset.selectionbox, 'simple block should retain selection box on asset JSON');

		let secondItemPlan = createVintageStoryExportPlan({
			workspace: simpleItem.workspace,
			modInfo: {
				type: 'content',
				modid: 'releaseitem',
				name: 'item release gate',
				description: 'Release gate fixture',
				authors: 'P1nkOblivion',
				version: '1.0.0'
			},
			assetObject: simpleItem.reopenedAsset,
			assetType: 'item',
			shapeJson: simpleItem.reopenedShape,
			shapeBase: 'item/simple-item-release'
		}, {fs, PathModule: path});
		assert.equal(secondItemPlan.entries.some(entry => entry.exists && entry.overwrite), true, 'overwrite candidates must be visible in export plan');
		assert.match(formatVintageStoryExportReport(secondItemPlan), /UPDATE .*simple-item-release\.json/);
		let workflowSource = read('js/vintagestory/vs_mod_export_workflow.js');
		assert.match(workflowSource, /id:\s*'vintage_story_mod_export_plan'[\s\S]*onConfirm\(\)[\s\S]*executeVintageStoryExportPlan/, 'UI export must execute only from export-plan confirmation');

		let bladePath = path.join(fixtureRoot, 'mod', 'assets', 'test', 'itemtypes', 'tool', 'blade.json');
		let bladeDocument = parseVintageStoryAssetDocument(fs.readFileSync(bladePath, 'utf8'), bladePath);
		let bladeObject = JSON.parse(JSON.stringify(bladeDocument.assetObjects[0].object));
		let variants = listVintageStoryAssetVariants(bladeDocument, 0);
		let falxCopperVariant = variants.allVariants.find(variant => variant.variantCode === 'blade-falx-copper');
		let resolverOptions = {
			sourceFilePath: bladePath,
			fs,
			PathModule: path,
			modAssetRoot: path.join(fixtureRoot, 'mod')
		};
		let resolvedBefore = resolveVintageStoryAssetVariant(bladeDocument, 0, falxCopperVariant, resolverOptions);
		assert.equal(resolvedBefore.shape.resolvedBase, 'item/tool/blade/falx');
		let originalFallback = JSON.parse(JSON.stringify(bladeObject.guiTransformByType['*']));
		assert.equal(applyTransformEditToAssetObject(bladeObject, resolvedBefore.transforms.guiTransform, {
			translation: {x: 12, y: 0, z: 0},
			scale: 1.25
		}), true);
		assert.deepEqual(bladeObject.guiTransformByType['*'], originalFallback, 'fallback ByType edit must not happen silently');
		assert.equal(bladeObject.guiTransformByType['blade-falx-copper'].translation.x, 12);
		assertNoUnsafeAssetJson(bladeObject, 'blade edited asset');
		let bladeRoundTripPath = path.join(tempRoot, 'blade-mod', 'assets', 'test', 'itemtypes', 'tool', 'blade.json');
		fs.mkdirSync(path.dirname(bladeRoundTripPath), {recursive: true});
		fs.writeFileSync(bladeRoundTripPath, serializeVintageStoryAssetDocument(bladeObject), 'utf8');
		let reopenedBladeDocument = parseVintageStoryAssetDocument(fs.readFileSync(bladeRoundTripPath, 'utf8'), bladeRoundTripPath);
		let reopenedBlade = reopenedBladeDocument.assetObjects[0].object;
		assert.equal(reopenedBlade.attributesByType['blade-falx-*'].attachableToEntity.keepAttachmentExtra.nested, true);
		assert.equal(reopenedBlade.attributesByType['blade-falx-*'].attachableToEntity.attachedShapeBySlotCode.frontrightside.keepSlotExtra, true);
		let reopenedVariants = listVintageStoryAssetVariants(reopenedBladeDocument, 0);
		let reopenedResolverOptions = Object.assign({}, resolverOptions, {sourceFilePath: bladeRoundTripPath});
		let reopenedFalxCopper = resolveVintageStoryAssetVariant(reopenedBladeDocument, 0, reopenedVariants.allVariants.find(variant => variant.variantCode === 'blade-falx-copper'), reopenedResolverOptions);
		assert.equal(reopenedFalxCopper.shape.resolvedBase, resolvedBefore.shape.resolvedBase);
		assert.equal(reopenedFalxCopper.textures.aliases.falxblade.resolvedBase, resolvedBefore.textures.aliases.falxblade.resolvedBase);

		let unknownShapePath = path.join(root, 'test', 'fixtures', 'vintage_story_json', 'preserved_unknown_fields.json');
		let unknownShape = JSON.parse(fs.readFileSync(unknownShapePath, 'utf8'));
		let reopenedUnknownShape = parseVintageStoryAssetText(serializeVintageStoryAssetDocument(unknownShape));
		assert.deepEqual(reopenedUnknownShape, unknownShape, 'unknown shape fields must survive parse/serialize round-trip');

		let baggage = [
			['.git/config', '[core]\n'],
			['node_modules/example/index.js', 'module.exports = {};\n'],
			['types/generated/generated.d.ts', 'export type Generated = string;\n'],
			['temp/scratch.tmp', 'scratch\n'],
			['assets/releaseitem/textures/vintagebench/preview/reference.png', pngBytes]
		];
		baggage.forEach(([relativePath, content]) => {
			let target = path.join(simpleItem.workspace.modRoot, ...relativePath.split('/'));
			fs.mkdirSync(path.dirname(target), {recursive: true});
			fs.writeFileSync(target, content);
		});
		let repackPath = path.join(tempRoot, 'item-repack.zip');
		let repackReport = await packageVintageStoryModWorkspace(simpleItem.workspace, repackPath, {fs, PathModule: path});
		assert.deepEqual(repackReport.errors, [], 'repack should succeed');
		assert.equal(repackReport.included.some(entry => entry.includes('node_modules')), false);
		assert.equal(repackReport.included.some(entry => entry.includes('types/generated')), false);
		assert.equal(repackReport.included.some(entry => entry.includes('vintagebench/preview')), false);
		assert.equal(repackReport.excluded.includes('.git/config'), true);
		assert.equal(repackReport.excluded.includes('node_modules/example/index.js'), true);
		assert.equal(repackReport.excluded.includes('types/generated/generated.d.ts'), true);
		assert.equal(repackReport.excluded.includes('assets/releaseitem/textures/vintagebench/preview/reference.png'), true);
		let repackZip = await JSZip.loadAsync(fs.readFileSync(repackPath));
		assert.equal(!!repackZip.file('node_modules/example/index.js'), false);
		assert.equal(!!repackZip.file('assets/releaseitem/textures/vintagebench/preview/reference.png'), false);

		let badAssetPath = path.join(simpleItem.workspace.folders.itemtypes, 'bad-release.json');
		fs.writeFileSync(badAssetPath, serializeVintageStoryAssetDocument({
			code: 'bad-release',
			shape: {base: 'item/not-present'},
			textures: {texture: {base: 'C:/absolute/not-allowed'}},
			creativeinventory: {general: ['*']}
		}), 'utf8');
		let validation = validateVintageStoryWorkspace(simpleItem.workspace, {fs, PathModule: path}, {skipTextures: false});
		let codes = new Set((validation.diagnostics || []).map(issue => issue.code));
		assert.equal(codes.has('missing_shape'), true, 'validation should report missing shape');
		assert.equal(codes.has('unsafe_asset_json_path'), true, 'validation should report unsafe asset JSON path');
		assert.ok(validation.diagnostics.length >= 2, 'validation should produce structured diagnostics');
		validation.diagnostics.forEach(assertDiagnosticComplete);
		let validationText = validation.diagnostics.map(issue => `${issue.what}\n${issue.why}\n${issue.suggestedFix}\n${issue.blocks}`).join('\n');
		assert.match(validationText, /shape/i);
		assert.match(validationText, /absolute/i);

		let notice = read('NOTICE');
		let about = read('js/interface/about.ts');
		let source = read('SOURCE_CODE.md');
		assert.match(notice, /modified fork of Blockbench/i);
		assert.match(notice, /WITHOUT ANY\s+WARRANTY/i);
		assert.match(notice, /does not bundle proprietary Vintage Story/i);
		assert.match(about, /GNU General Public License version 3/i);
		assert.match(about, /ABSOLUTELY NO WARRANTY/i);
		assert.match(source, /npm run generate-types/);
		let packageJson = JSON.parse(read('package.json'));
		assert.match(packageJson.scripts['generate-types'], /tsc/);
		assert.match(read('.gitignore'), /\/types\/generated\//);
		assert.match(read('docs/VINTAGE_STORY_RELEASE_GATES.md'), /Known Limitations/i);
		assert.match(read('docs/VINTAGE_STORY_RELEASE_GATES.md'), /test-release-blockers/i);

		let requiredPresetIds = [
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
		];
		let presets = getVintageStoryAssetPresets();
		requiredPresetIds.forEach(id => {
			let preset = presets.find(entry => entry.id === id);
			assert.ok(preset, `missing verified preset ${id}`);
			assert.equal(preset.verified, true, `${id} should be verified`);
		});
		[
			'js/vintagestory/vs_interaction_box_handles.js',
			'js/vintagestory/vs_shape_alternatives.js',
			'js/vintagestory/vs_texture_manager.js',
			'js/vintagestory/vs_asset_explorer.js'
		].forEach(relPath => assert.equal(fs.existsSync(path.join(root, relPath)), true, `${relPath} must exist for v1.0 readiness`));

		console.log('Release blocker checks passed');
	} finally {
		fs.rmSync(tempRoot, {recursive: true, force: true});
	}
}

await run();
