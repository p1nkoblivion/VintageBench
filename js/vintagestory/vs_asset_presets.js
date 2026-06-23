import { cloneJSON, isPlainObject } from './vs_variant_resolver.js';
import { makeFullBlockInteractionBox } from './vs_interaction_boxes.js';
import {
	VS_DISPLAY_CONTEXTS,
	displaySlotToVintageStoryTransform
} from '../display_mode/vintage_story_display_transforms.js';

const MODE = {
	TEXTURE_DEFAULTS: 'model_defaults',
	CREATIVE_DIRECT: 'direct',
	CREATIVE_BY_TYPE: 'by_type',
	TRANSFORM_BY_TYPE_FALLBACK: 'by_type_fallback',
	ATTACHMENT_BY_TYPE_FALLBACK: 'by_type_fallback',
	INTERACTION_NONE: 'none',
	INTERACTION_FULL_BLOCK: 'full_block'
};

const FULL_BLOCK_BOX = makeFullBlockInteractionBox();
const GROUND_STORAGE_SELECTION_BOX = {x1: 0, y1: 0, z1: 0, x2: 1, y2: 0.1, z2: 1};
const GROUND_STORAGE_COLLISION_BOX = {x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0};

function addWarning(warnings, message) {
	if (warnings && message && !warnings.includes(message)) warnings.push(message);
}

function clone(value) {
	return cloneJSON(value);
}

function formPatch(base = {}) {
	return Object.assign({
		texture_mode: MODE.TEXTURE_DEFAULTS,
		include_creativeinventory: true,
		creativeinventory_mode: MODE.CREATIVE_DIRECT,
		creativeinventory: 'general: *',
		generate_lang: true
	}, base);
}

export const VINTAGE_STORY_ASSET_PRESETS = [
	{
		id: 'decorative_block',
		label: 'Decorative Block',
		description: 'Simple visual block with shape, textures, creative inventory, and starter collision/selection boxes.',
		assetTypes: ['block'],
		tags: ['block', 'decorative', 'collision'],
		verified: true,
		requiredFields: ['code', 'shape', 'textures'],
		generatedFields: ['shape', 'textures', 'creativeinventory', 'collisionbox', 'selectionbox'],
		formPatch: formPatch({
			asset_type: 'block',
			interaction_box_mode: MODE.INTERACTION_FULL_BLOCK,
			include_display_transforms: false
		}),
		rootPatch: {
			collisionbox: FULL_BLOCK_BOX,
			selectionbox: FULL_BLOCK_BOX
		},
		validation: {decorativeBlockBoxes: true}
	},
	{
		id: 'decorative_item',
		label: 'Decorative Item',
		description: 'Simple item with shape, textures, creative inventory, and common GUI/ground/hand transforms.',
		assetTypes: ['item'],
		tags: ['item', 'decorative', 'transforms'],
		verified: true,
		requiredFields: ['code', 'shape', 'textures'],
		generatedFields: ['shape', 'textures', 'creativeinventory', 'guiTransformByType', 'groundTransformByType', 'tpHandTransformByType'],
		transforms: ['guiTransform', 'groundTransform', 'tpHandTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			interaction_box_mode: MODE.INTERACTION_NONE,
			transform_guiTransform: true,
			transform_groundTransform: true,
			transform_tpHandTransform: true
		}),
		validation: {requiredTransforms: ['guiTransform', 'groundTransform', 'tpHandTransform']}
	},
	{
		id: 'shelfable_display_item',
		label: 'Shelfable / Display Case Item',
		description: 'Item intended for shelves and display cases using verified display attributes and display transforms.',
		assetTypes: ['item'],
		tags: ['item', 'shelf', 'display'],
		verified: true,
		requiredFields: ['code', 'shape'],
		generatedFields: ['attributes.shelvable', 'attributes.displaycaseable', 'attributes.onshelfTransformByType', 'attributes.onDisplayTransformByType'],
		transforms: ['onshelfTransform', 'onDisplayTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			attr_shelvable: 'true',
			attr_displaycaseable: true,
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			transform_onshelfTransform: true,
			transform_onDisplayTransform: true
		}),
		attributesPatch: {shelvable: true, displaycaseable: true},
		validation: {requiredTransforms: ['onshelfTransform', 'onDisplayTransform']}
	},
	{
		id: 'tool_rack_item',
		label: 'Tool Rack Item',
		description: 'Item that can be displayed on tool racks with a verified rackable attribute and toolrack transform map.',
		assetTypes: ['item'],
		tags: ['item', 'toolrack', 'display'],
		verified: true,
		requiredFields: ['code', 'shape'],
		generatedFields: ['attributes.rackable', 'attributes.toolrackTransformByType'],
		transforms: ['toolrackTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			attr_rackable: true,
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			transform_toolrackTransform: true
		}),
		attributesPatch: {rackable: true},
		validation: {requiredTransforms: ['toolrackTransform']}
	},
	{
		id: 'ground_storable_item',
		label: 'Ground Storable Item',
		description: 'Item with verified GroundStorable behavior, selection/collision boxes, and ground storage transform support.',
		assetTypes: ['item'],
		tags: ['item', 'groundstorage', 'behavior', 'boxes'],
		verified: true,
		requiredFields: ['code', 'shape'],
		generatedFields: ['behaviors.GroundStorable', 'behaviors.GroundStorable.properties.selectionBox', 'behaviors.GroundStorable.properties.collisionBox', 'attributes.groundStorageTransformByType'],
		transforms: ['groundStorageTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			transform_groundStorageTransform: true,
			interaction_box_mode: MODE.INTERACTION_NONE
		}),
		behaviorsPatch: [{
			name: 'GroundStorable',
			properties: {
				layout: 'Quadrants',
				selectionBox: GROUND_STORAGE_SELECTION_BOX,
				collisionBox: GROUND_STORAGE_COLLISION_BOX
			}
		}],
		validation: {groundStorable: true, requiredTransforms: ['groundStorageTransform']}
	},
	{
		id: 'antler_mount_item',
		label: 'Antler Mount Item',
		description: 'Item that can be mounted on antlers with verified antlerMountable attribute and mount transform.',
		assetTypes: ['item'],
		tags: ['item', 'antler', 'display'],
		verified: true,
		requiredFields: ['code', 'shape'],
		generatedFields: ['attributes.antlerMountable', 'attributes.onAntlerMountTransformByType'],
		transforms: ['onAntlerMountTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			attr_antlerMountable: true,
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			transform_onAntlerMountTransform: true
		}),
		attributesPatch: {antlerMountable: true},
		validation: {requiredTransforms: ['onAntlerMountTransform']}
	},
	{
		id: 'attachable_entity_item',
		label: 'Attachable Entity Item',
		description: 'Item with attachableToEntity category and optional attached shape slots.',
		assetTypes: ['item'],
		tags: ['item', 'wearable', 'attachment'],
		verified: true,
		requiredFields: ['code', 'shape', 'categoryCode'],
		generatedFields: ['attributes.attachableToEntity', 'attributesByType.*.attachableToEntity', 'attachedShapeBySlotCode'],
		formPatch: formPatch({
			asset_type: 'item',
			include_attachable_to_entity: true,
			attachment_mode: MODE.ATTACHMENT_BY_TYPE_FALLBACK,
			attachment_category_code: 'toolholding'
		}),
		validation: {attachment: true}
	},
	{
		id: 'simple_tool',
		label: 'Simple Tool',
		description: 'Basic tool item using verified root tool and durabilitybytype fields when values are provided.',
		assetTypes: ['item'],
		tags: ['item', 'tool', 'durability'],
		verified: true,
		requiredFields: ['code', 'shape', 'tool'],
		generatedFields: ['tool', 'durabilitybytype', 'guiTransformByType', 'groundTransformByType', 'tpHandTransformByType'],
		transforms: ['guiTransform', 'groundTransform', 'tpHandTransform', 'groundStorageTransform', 'toolrackTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			tool_type: 'axe',
			attr_rackable: true,
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			transform_guiTransform: true,
			transform_groundTransform: true,
			transform_tpHandTransform: true,
			transform_groundStorageTransform: true,
			transform_toolrackTransform: true
		}),
		attributesPatch: {rackable: true},
		validation: {toolStats: true}
	},
	{
		id: 'simple_weapon',
		label: 'Simple Weapon',
		description: 'Weapon-like item using verified tool, durabilitybytype, attackpowerbytype, and attackRangebytype fields when values are provided.',
		assetTypes: ['item'],
		tags: ['item', 'weapon', 'combat', 'durability'],
		verified: true,
		requiredFields: ['code', 'shape', 'tool'],
		generatedFields: ['tool', 'durabilitybytype', 'attackpowerbytype', 'attackRangebytype', 'guiTransformByType', 'groundTransformByType', 'tpHandTransformByType'],
		transforms: ['guiTransform', 'groundTransform', 'tpHandTransform', 'toolrackTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			tool_type: 'sword',
			attr_rackable: true,
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			transform_guiTransform: true,
			transform_groundTransform: true,
			transform_tpHandTransform: true,
			transform_toolrackTransform: true
		}),
		attributesPatch: {rackable: true},
		validation: {weaponStats: true}
	},
	{
		id: 'firepit_forge_item',
		label: 'Firepit / Forge Item',
		description: 'Item with verified firepit/forge display transform targets. Firepit property objects remain advanced/manual.',
		assetTypes: ['item'],
		tags: ['item', 'firepit', 'forge', 'experimental'],
		verified: false,
		experimental: true,
		requiredFields: ['code', 'shape'],
		generatedFields: ['attributes.infirepitTransformByType', 'attributes.inForgeTransformByType'],
		transforms: ['infirepitTransform', 'inForgeTransform'],
		formPatch: formPatch({
			asset_type: 'item',
			include_display_transforms: true,
			transform_mode: MODE.TRANSFORM_BY_TYPE_FALLBACK,
			transform_infirepitTransform: true,
			transform_inForgeTransform: true
		}),
		validation: {requiredTransforms: ['infirepitTransform', 'inForgeTransform']}
	}
];

const PRESET_BY_ID = new Map(VINTAGE_STORY_ASSET_PRESETS.map(preset => [preset.id, preset]));

export function getVintageStoryAssetPresets(options = {}) {
	let asset_type = options.assetType || options.asset_type || '';
	return VINTAGE_STORY_ASSET_PRESETS.filter(preset => !asset_type || preset.assetTypes.includes(asset_type) || preset.assetTypes.includes('both'));
}

export function getSaveAsAssetPresetOptions() {
	return [{id: 'none', label: 'None', description: 'No starter fields beyond the selected form values.'}]
		.concat(VINTAGE_STORY_ASSET_PRESETS)
		.map(preset => ({
			id: preset.id,
			label: preset.label,
			description: preset.description,
			assetType: preset.assetTypes?.[0] || 'both',
			tags: clone(preset.tags || []),
			verified: preset.verified !== false,
			experimental: !!preset.experimental
		}));
}

export function getVintageStoryAssetPreset(id) {
	return PRESET_BY_ID.get(id) || null;
}

export function getVintageStoryAssetPresetTransformIds(config_or_id) {
	let id = typeof config_or_id === 'string' ? config_or_id : config_or_id?.assetPreset;
	let preset = getVintageStoryAssetPreset(id);
	return Array.isArray(preset?.transforms) ? preset.transforms.slice() : [];
}

export function buildVintageStoryPresetFormPatch(id, current = {}, options = {}) {
	let preset = getVintageStoryAssetPreset(id);
	if (!preset) return {};
	let patch = clone(preset.formPatch || {});
	patch.asset_preset = preset.id;
	if (options.attachmentCategoryCode) patch.attachment_category_code = options.attachmentCategoryCode;
	if (options.attachmentSlotsText) patch.attachment_slots = options.attachmentSlotsText;
	if (options.toolType) patch.tool_type = options.toolType;
	if (options.durabilityValue !== undefined) patch.durability_value = options.durabilityValue;
	if (options.attackPowerValue !== undefined) patch.attack_power_value = options.attackPowerValue;
	if (options.attackRangeValue !== undefined) patch.attack_range_value = options.attackRangeValue;
	if (current.asset_type && preset.assetTypes.includes(current.asset_type)) patch.asset_type = current.asset_type;
	return patch;
}

function mergeInto(target, source) {
	if (!isPlainObject(source)) return target;
	for (let key of Object.keys(source)) {
		if (isPlainObject(target[key]) && isPlainObject(source[key])) {
			mergeInto(target[key], source[key]);
		} else {
			target[key] = clone(source[key]);
		}
	}
	return target;
}

function ensureObject(parent, key) {
	if (!isPlainObject(parent[key])) parent[key] = {};
	return parent[key];
}

function behaviorName(behavior) {
	return String(behavior?.name || behavior?.Name || '').trim();
}

function behaviorLabel(behavior) {
	return behaviorName(behavior) || 'unnamed';
}

function findBehaviorByName(behaviors, name) {
	if (!Array.isArray(behaviors)) return null;
	let needle = String(name || '').trim().toLowerCase();
	if (!needle) return null;
	return behaviors.find(entry => behaviorName(entry).toLowerCase() === needle) || null;
}

function upsertBehavior(asset, behavior) {
	if (!Array.isArray(asset.behaviors)) asset.behaviors = [];
	let existing = findBehaviorByName(asset.behaviors, behaviorName(behavior));
	if (existing) {
		if (isPlainObject(existing.properties) && isPlainObject(behavior.properties)) {
			mergeInto(existing.properties, behavior.properties);
		} else if (isPlainObject(behavior.properties)) {
			existing.properties = clone(behavior.properties);
		}
		return;
	}
	asset.behaviors.push(clone(behavior));
}

function numericValue(value) {
	if (value === undefined || value === null || String(value).trim() === '') return null;
	let parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function applyByTypeNumber(asset, key, value) {
	let numeric = numericValue(value);
	if (numeric === null) return false;
	if (!isPlainObject(asset[key])) asset[key] = {};
	asset[key]['*'] = numeric;
	return true;
}

export function applyVintageStoryAssetPresetToAsset(asset, config = {}, warnings = []) {
	let preset = getVintageStoryAssetPreset(config.assetPreset);
	if (!preset || !isPlainObject(asset)) return asset;
	if (isPlainObject(preset.rootPatch)) mergeInto(asset, preset.rootPatch);
	if (isPlainObject(preset.attributesPatch)) mergeInto(ensureObject(asset, 'attributes'), preset.attributesPatch);
	if (Array.isArray(preset.behaviorsPatch)) preset.behaviorsPatch.forEach(behavior => upsertBehavior(asset, behavior));
	if (preset.id === 'simple_tool' || preset.id === 'simple_weapon') {
		let tool_type = String(config.toolType || '').trim();
		if (tool_type) asset.tool = tool_type;
		if (!applyByTypeNumber(asset, 'durabilitybytype', config.durabilityValue)) {
			addWarning(warnings, `${preset.label} preset did not write durabilitybytype because no durability value was provided.`);
		}
		if (preset.id === 'simple_weapon') {
			if (!applyByTypeNumber(asset, 'attackpowerbytype', config.attackPowerValue)) {
				addWarning(warnings, 'Simple Weapon preset did not write attackpowerbytype because no attack power value was provided.');
			}
			if (!applyByTypeNumber(asset, 'attackRangebytype', config.attackRangeValue)) {
				addWarning(warnings, 'Simple Weapon preset did not write attackRangebytype because no attack range value was provided.');
			}
		}
	}
	return asset;
}

function setPatchPath(patch, path, value) {
	let current = patch;
	for (let i = 0; i < path.length - 1; i++) {
		let part = path[i];
		if (!isPlainObject(current[part])) current[part] = {};
		current = current[part];
	}
	current[path[path.length - 1]] = clone(value);
}

function transformContext(id) {
	return VS_DISPLAY_CONTEXTS.find(context => context.id === id);
}

function addPresetTransformsToPatch(patch, preset, config, warnings) {
	let selected_variant = config.selectedVariantKey || config.selectedVariantCode || '';
	let display_settings = config.displaySettings || {};
	(preset.transforms || []).forEach(id => {
		let context = transformContext(id);
		if (!context || context.previewOnly || context.aliasOf) return;
		let transform = displaySlotToVintageStoryTransform(display_settings[id]);
		if (!transform) {
			addWarning(warnings, `${preset.label} preset skipped ${context.jsonKey}; no current Display transform is configured.`);
			return;
		}
		let map_key = selected_variant ? `${context.jsonKey}ByType` : context.jsonKey;
		let path = context.location === 'attributes' ? ['attributes', map_key] : [map_key];
		if (selected_variant) {
			let map = {};
			map[selected_variant] = transform;
			setPatchPath(patch, path, map);
		} else {
			setPatchPath(patch, path, transform);
		}
	});
}

function addAttachmentToPatch(patch, config, warnings) {
	let category = String(config.attachmentCategoryCode || '').trim();
	if (!category) {
		addWarning(warnings, 'Attachable Entity Item preset needs categoryCode before it can write attachableToEntity.');
		return;
	}
	let attachment = {categoryCode: category};
	let slots = {};
	(config.attachmentSlots || []).forEach(slot => {
		let slot_code = String(slot.slotCode || '').trim();
		let base = String(slot.base || slot.shapeBase || '').trim();
		if (slot_code && base) slots[slot_code] = {base};
	});
	if (Object.keys(slots).length) attachment.attachedShapeBySlotCode = slots;
	let selected = config.selectedVariantKey || config.selectedVariantCode || '';
	if (selected) {
		setPatchPath(patch, ['attributesByType', selected, 'attachableToEntity'], attachment);
	} else {
		setPatchPath(patch, ['attributes', 'attachableToEntity'], attachment);
	}
}

export function buildVintageStoryPresetAssetPatch(id, config = {}) {
	let preset = getVintageStoryAssetPreset(id);
	let warnings = [];
	let patch = {};
	if (!preset) return {preset: null, patch, warnings: [`Unknown preset: ${id || '(empty)'}`]};
	if (isPlainObject(preset.rootPatch)) mergeInto(patch, preset.rootPatch);
	if (isPlainObject(preset.attributesPatch)) mergeInto(ensureObject(patch, 'attributes'), preset.attributesPatch);
	if (Array.isArray(preset.behaviorsPatch)) patch.behaviors = clone(preset.behaviorsPatch);
	if (preset.id === 'simple_tool' || preset.id === 'simple_weapon') {
		let tool_type = String(config.toolType || '').trim();
		if (tool_type) patch.tool = tool_type;
		let durability = numericValue(config.durabilityValue);
		if (durability !== null) patch.durabilitybytype = {'*': durability};
		else addWarning(warnings, `${preset.label} preset has no durability value to patch.`);
		if (preset.id === 'simple_weapon') {
			let attack_power = numericValue(config.attackPowerValue);
			let attack_range = numericValue(config.attackRangeValue);
			if (attack_power !== null) patch.attackpowerbytype = {'*': attack_power};
			else addWarning(warnings, 'Simple Weapon preset has no attack power value to patch.');
			if (attack_range !== null) patch.attackRangebytype = {'*': attack_range};
			else addWarning(warnings, 'Simple Weapon preset has no attack range value to patch.');
		}
	}
	if (preset.id === 'attachable_entity_item') addAttachmentToPatch(patch, config, warnings);
	addPresetTransformsToPatch(patch, preset, config, warnings);
	return {preset, patch, warnings};
}

function getAtPath(root, path) {
	let current = root;
	for (let part of path) {
		if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
		current = current[part];
	}
	return current;
}

function setAtPath(root, path, value) {
	let current = root;
	for (let i = 0; i < path.length - 1; i++) {
		let part = path[i];
		if (!isPlainObject(current[part])) current[part] = {};
		current = current[part];
	}
	current[path[path.length - 1]] = clone(value);
}

function pathToString(path) {
	return path.map(part => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(part)) ? `.${part}` : `[${JSON.stringify(part)}]`).join('').replace(/^\./, 'root.');
}

function collectPatchLeaves(value, path = [], output = []) {
	if (isPlainObject(value) && Object.keys(value).length) {
		Object.keys(value).forEach(key => collectPatchLeaves(value[key], path.concat(key), output));
		return output;
	}
	output.push({path, value});
	return output;
}

function valuesEqual(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

function previewPatchLeaf(asset_object, entry, changes, conflicts) {
	let existing = getAtPath(asset_object, entry.path);
	let path = pathToString(entry.path);
	if (existing === undefined) {
		changes.push({path, action: 'add', value: clone(entry.value)});
	} else if (valuesEqual(existing, entry.value)) {
		changes.push({path, action: 'already', value: clone(entry.value)});
	} else {
		conflicts.push({path, existing: clone(existing), incoming: clone(entry.value)});
	}
}

function behaviorPatchLeaves(asset_object, behavior) {
	let name = behaviorName(behavior);
	let existing = findBehaviorByName(asset_object?.behaviors, name);
	if (!existing) {
		return [{path: ['behaviors', behaviorLabel(behavior)], value: behavior}];
	}
	let leaves = [];
	collectPatchLeaves(behavior)
		.filter(entry => entry.path[0] !== 'name' && entry.path[0] !== 'Name')
		.forEach(entry => {
			leaves.push({
				path: ['behaviors', behaviorLabel(behavior)].concat(entry.path),
				value: entry.value,
				sourcePath: entry.path,
				existingBehavior: existing
			});
		});
	return leaves;
}

function previewBehaviorPatch(asset_object, behavior, changes, conflicts) {
	let name = behaviorName(behavior);
	let existing = findBehaviorByName(asset_object?.behaviors, name);
	if (!existing) {
		changes.push({path: `root.behaviors[${JSON.stringify(behaviorLabel(behavior))}]`, action: 'add', value: clone(behavior)});
		return;
	}
	behaviorPatchLeaves(asset_object, behavior).forEach(entry => {
		let existing_value = getAtPath(entry.existingBehavior, entry.sourcePath);
		let path = pathToString(entry.path);
		if (existing_value === undefined) {
			changes.push({path, action: 'add', value: clone(entry.value)});
		} else if (valuesEqual(existing_value, entry.value)) {
			changes.push({path, action: 'already', value: clone(entry.value)});
		} else {
			conflicts.push({path, existing: clone(existing_value), incoming: clone(entry.value)});
		}
	});
}

export function previewVintageStoryPresetPatch(asset_object, patch) {
	let changes = [];
	let conflicts = [];
	collectPatchLeaves(patch)
		.filter(entry => entry.path[0] !== 'behaviors')
		.forEach(entry => previewPatchLeaf(asset_object, entry, changes, conflicts));
	if (Array.isArray(patch.behaviors)) {
		patch.behaviors.forEach(behavior => previewBehaviorPatch(asset_object, behavior, changes, conflicts));
	}
	return {changes, conflicts};
}

function applyBehaviorPatch(asset_object, behavior, options = {}) {
	let name = behaviorName(behavior);
	if (!name) return;
	if (!Array.isArray(asset_object.behaviors)) asset_object.behaviors = [];
	let existing = findBehaviorByName(asset_object.behaviors, name);
	if (!existing) {
		asset_object.behaviors.push(clone(behavior));
		return;
	}
	collectPatchLeaves(behavior)
		.filter(entry => entry.path[0] !== 'name' && entry.path[0] !== 'Name')
		.forEach(entry => {
			let existing_value = getAtPath(existing, entry.path);
			if (existing_value !== undefined && !valuesEqual(existing_value, entry.value) && !options.overwrite) return;
			setAtPath(existing, entry.path, entry.value);
		});
}

export function applyVintageStoryPresetPatchToAsset(asset_object, patch, options = {}) {
	let preview = previewVintageStoryPresetPatch(asset_object, patch);
	collectPatchLeaves(patch)
		.filter(entry => entry.path[0] !== 'behaviors')
		.forEach(entry => {
			let existing = getAtPath(asset_object, entry.path);
			if (existing !== undefined && !valuesEqual(existing, entry.value) && !options.overwrite) return;
			setAtPath(asset_object, entry.path, entry.value);
		});
	if (Array.isArray(patch.behaviors)) {
		patch.behaviors.forEach(behavior => applyBehaviorPatch(asset_object, behavior, options));
	}
	return preview;
}

export function validateVintageStoryPresetAsset(config = {}, asset = {}) {
	let warnings = [];
	let preset = getVintageStoryAssetPreset(config.assetPreset);
	if (!preset) return warnings;
	let validation = preset.validation || {};
	if (preset.experimental) {
		addWarning(warnings, `${preset.label} preset is experimental; it only writes verified fields and leaves advanced behavior fields manual.`);
	}
	if (validation.decorativeBlockBoxes && (!asset.collisionbox || !asset.selectionbox)) {
		addWarning(warnings, 'Decorative Block preset normally includes collisionbox and selectionbox.');
	}
	if (validation.attachment && config.includeAttachableToEntity) {
		if (!String(config.attachmentCategoryCode || '').trim()) addWarning(warnings, 'Attachable Entity Item preset needs categoryCode.');
		if (!Array.isArray(config.attachmentSlots) || !config.attachmentSlots.length) addWarning(warnings, 'Attachable Entity Item preset has no attached shape slots yet.');
	}
	if (validation.toolStats) {
		if (!String(config.toolType || '').trim()) addWarning(warnings, 'Simple Tool preset needs a tool type to write the root tool field.');
		if (numericValue(config.durabilityValue) === null) addWarning(warnings, 'Simple Tool preset has no durability value.');
	}
	if (validation.weaponStats) {
		if (!String(config.toolType || '').trim()) addWarning(warnings, 'Simple Weapon preset needs a tool type to write the root tool field.');
		if (numericValue(config.durabilityValue) === null) addWarning(warnings, 'Simple Weapon preset has no durability value.');
		if (numericValue(config.attackPowerValue) === null) addWarning(warnings, 'Simple Weapon preset has no attack power value.');
		if (numericValue(config.attackRangeValue) === null) addWarning(warnings, 'Simple Weapon preset has no attack range value.');
	}
	if (validation.groundStorable) {
		let ground = Array.isArray(asset.behaviors) && asset.behaviors.find(behavior => String(behavior?.name || '').toLowerCase() === 'groundstorable');
		if (!ground) addWarning(warnings, 'Ground Storable Item preset should include a GroundStorable behavior.');
	}
	(validation.requiredTransforms || []).forEach(id => {
		let context = transformContext(id);
		if (!context) return;
		let direct = context.location === 'attributes' ? asset.attributes?.[context.jsonKey] : asset[context.jsonKey];
		let by_type = context.location === 'attributes' ? asset.attributes?.[`${context.jsonKey}ByType`] : asset[`${context.jsonKey}ByType`];
		if (!direct && !by_type) addWarning(warnings, `${preset.label} preset expects ${context.location === 'attributes' ? 'attributes.' : ''}${context.jsonKey} or ${context.jsonKey}ByType.`);
	});
	return warnings;
}
