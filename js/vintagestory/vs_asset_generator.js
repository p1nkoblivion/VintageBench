import {
	cloneJSON,
	expandVintageStoryVariants,
	isPlainObject,
	wildcardMatch
} from './vs_variant_resolver.js';
import { getVintageStoryAssetDomain } from './vs_asset_resolver.js';
import {
	VS_DISPLAY_CONTEXTS,
	displaySlotToVintageStoryTransform
} from '../display_mode/vintage_story_display_transforms.js';
import {
	applyInteractionBoxEditToAssetObject,
	getInteractionBoxValueAtSource,
	makeFullBlockInteractionBox,
	validateBoxValue,
	validateVintageStoryInteractionBoxes
} from './vs_interaction_boxes.js';
import {
	parseVintageStoryAssetText,
	serializeVintageStoryAssetDocument
} from './vs_asset_document.js';
import {
	applyVintageStoryAssetPresetToAsset,
	getSaveAsAssetPresetOptions,
	getVintageStoryAssetPresetTransformIds,
	validateVintageStoryPresetAsset
} from './vs_asset_presets.js';
import {
	collectUnsafeAssetJsonStrings,
	hasPathTraversal,
	isAbsoluteFilesystemPath,
	validateVintageStoryAssetBasePath
} from './vs_asset_path_safety.js';

export { getSaveAsAssetPresetOptions };
export { isAbsoluteFilesystemPath } from './vs_asset_path_safety.js';

export const SAVE_AS_ASSET_TEXTURE_MODES = {
	MODEL_DEFAULTS: 'model_defaults',
	BY_TYPE: 'by_type'
};

export const SAVE_AS_ASSET_TRANSFORM_MODES = {
	GLOBAL: 'global',
	BY_TYPE_FALLBACK: 'by_type_fallback',
	BY_TYPE_EXACT: 'by_type_exact'
};

export const SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES = {
	DIRECT: 'direct',
	BY_TYPE: 'by_type'
};

export const SAVE_AS_ASSET_LANG_MODES = {
	NONE: 'none',
	BASE: 'base',
	VARIANTS: 'variants'
};

export const SAVE_AS_ASSET_ATTACHMENT_MODES = {
	NONE: 'none',
	GLOBAL: 'global',
	BY_TYPE_FALLBACK: 'by_type_fallback',
	BY_TYPE_EXACT: 'by_type_exact'
};

export const SAVE_AS_ASSET_INTERACTION_BOX_MODES = {
	NONE: 'none',
	FULL_BLOCK: 'full_block',
	FULL_BLOCK_SELECTION: 'full_block_selection',
	FULL_BLOCK_COLLISION: 'full_block_collision',
	NO_COLLISION: 'no_collision',
	SHAPE_BOUNDS: 'shape_bounds',
	CUSTOM: 'custom'
};

export const SAVE_AS_ASSET_BEHAVIOR_BOX_MODES = {
	ADD_GROUND_STORABLE: 'add_groundstorable',
	EXISTING_ONLY: 'existing_only',
	EDITOR_ONLY: 'editor_only'
};

export const SAVE_AS_ASSET_GROUND_STORABLE_LAYOUTS = ['', 'Quadrants', 'SingleCenter', 'Halves', 'WallHalves', 'Messy12'];

const SAFE_CODE_RE = /^[a-z0-9_.:/-]+$/i;
const TEXTURE_EXT_RE = /\.(png|jpe?g)$/i;
const JSON_EXT_RE = /\.json$/i;
const GROUND_STORABLE_BEHAVIOR_NAME = 'GroundStorable';

function addWarning(warnings, message) {
	if (warnings && message && !warnings.includes(message)) warnings.push(message);
}

function addError(errors, message) {
	if (errors && message && !errors.includes(message)) errors.push(message);
}

function slash(path) {
	return String(path || '').replace(/\\/g, '/');
}

function isNonEmptyString(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

export function sanitizeVintageStoryAssetCode(value) {
	return String(value || '').trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_.:/-]/g, '').toLowerCase();
}

export function validateVintageStoryAssetCode(code) {
	let errors = [];
	if (!isNonEmptyString(code)) {
		errors.push('Asset code is required.');
	} else if (!SAFE_CODE_RE.test(code)) {
		errors.push('Asset code may only use letters, numbers, underscore, dash, dot, slash, colon, and forward slash.');
	}
	return errors;
}

function splitCommaList(value) {
	return String(value || '')
		.split(',')
		.map(part => part.trim())
		.filter(Boolean);
}

export function parsePatternListText(text) {
	let patterns = [];
	String(text || '').split(/\r?\n/g).forEach(raw_line => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		splitCommaList(line).forEach(pattern => {
			if (!patterns.includes(pattern)) patterns.push(pattern);
		});
	});
	return patterns;
}

export function parseVariantGroupsText(text) {
	let variantgroups = [];
	let errors = [];
	let warnings = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let separator = line.includes(':') ? ':' : '=';
		let parts = line.split(separator);
		if (parts.length < 2) {
			addError(errors, `Variant group line ${index + 1} must look like "color: red, blue".`);
			return;
		}
		let code = parts.shift().trim();
		let states = splitCommaList(parts.join(separator));
		if (!code) addError(errors, `Variant group line ${index + 1} is missing a code.`);
		if (!states.length) addError(errors, `Variant group "${code || index + 1}" has no states.`);
		let unique_states = Array.from(new Set(states));
		if (unique_states.length !== states.length) {
			addWarning(warnings, `Variant group "${code}" contains duplicate states; duplicates were removed.`);
		}
		if (code && unique_states.length) {
			variantgroups.push({code, states: unique_states});
		}
	});
	let seen_codes = new Set();
	variantgroups.forEach(group => {
		let key = group.code.toLowerCase();
		if (seen_codes.has(key)) addError(errors, `Variant group code "${group.code}" is duplicated.`);
		seen_codes.add(key);
	});
	return {variantgroups, errors, warnings};
}

export function parseCreativeInventoryText(text) {
	let creativeinventory = {};
	let errors = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let separator = line.includes(':') ? ':' : '=';
		let parts = line.split(separator);
		if (parts.length < 2) {
			addError(errors, `Creative inventory line ${index + 1} must look like "general: *".`);
			return;
		}
		let category = parts.shift().trim();
		let patterns = splitCommaList(parts.join(separator));
		if (!category) addError(errors, `Creative inventory line ${index + 1} is missing a category.`);
		if (!patterns.length) addError(errors, `Creative inventory category "${category || index + 1}" has no variant patterns.`);
		if (category && patterns.length) creativeinventory[category] = patterns;
	});
	return {creativeinventory, errors};
}

export function parseCreativeInventoryByTypeText(text) {
	let entries = [];
	let errors = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let parts = line.split('|').map(part => part.trim());
		if (parts.length < 3) {
			addError(errors, `Creative inventory by-type line ${index + 1} must look like "* | general | *".`);
			return;
		}
		let pattern = parts[0] || '*';
		let category = parts[1];
		let variants = splitCommaList(parts.slice(2).join('|'));
		if (!category) addError(errors, `Creative inventory by-type line ${index + 1} is missing a category.`);
		if (!variants.length) addError(errors, `Creative inventory by-type line ${index + 1} has no variant patterns.`);
		if (category && variants.length) entries.push({pattern, category, variants});
	});
	return {entries, errors};
}

export function parseTextureDefaultsText(text) {
	let textures = {};
	let errors = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let separator = line.includes('=') ? '=' : ':';
		let parts = line.split(separator);
		if (parts.length < 2) {
			addError(errors, `Texture line ${index + 1} must look like "outside = block/clay/redclay".`);
			return;
		}
		let alias = parts.shift().trim().replace(/^#/, '');
		let base = parts.join(separator).trim();
		if (!alias) addError(errors, `Texture line ${index + 1} is missing an alias.`);
		if (!base) addError(errors, `Texture alias "${alias || index + 1}" is missing a texture base path.`);
		if (alias && base) textures[alias] = base;
	});
	return {textures, errors};
}

export function parseTexturesByTypeText(text) {
	let entries = [];
	let errors = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let pattern = '*';
		let alias = '';
		let base = '';
		if (line.includes('|')) {
			let parts = line.split('|').map(part => part.trim());
			pattern = parts[0] || '*';
			alias = (parts[1] || '').replace(/^#/, '');
			base = parts.slice(2).join('|').trim();
		} else {
			let first_separator = line.includes(':') ? ':' : '=';
			let parts = line.split(first_separator);
			pattern = parts.shift().trim() || '*';
			let mappings = parts.join(first_separator);
			let mapping_separator = mappings.includes('=') ? '=' : ':';
			let mapping_parts = mappings.split(mapping_separator);
			alias = (mapping_parts.shift() || '').trim().replace(/^#/, '');
			base = mapping_parts.join(mapping_separator).trim();
		}
		if (!pattern) pattern = '*';
		if (!alias) addError(errors, `texturesByType line ${index + 1} is missing an alias.`);
		if (!base) addError(errors, `texturesByType line ${index + 1} is missing a texture base path.`);
		if (alias && base) entries.push({pattern, alias, base});
	});
	return {entries, errors};
}

export function parseTagsText(text) {
	let tags = [];
	let errors = [];
	String(text || '').split(/[\r\n,]+/g).forEach(raw_tag => {
		let tag = raw_tag.trim();
		if (!tag || tag.startsWith('#') || tag.startsWith('//')) return;
		if (isAbsoluteFilesystemPath(tag)) {
			addError(errors, `Tag "${tag}" must be a Vintage Story tag, not an absolute filesystem path.`);
			return;
		}
		if (!tags.includes(tag)) tags.push(tag);
	});
	return {tags, errors};
}

function isPathInside(file_path, root_path) {
	if (!file_path || !root_path) return false;
	let file = slash(file_path).toLowerCase();
	let root = slash(root_path).replace(/\/+$/, '').toLowerCase();
	return file === root || file.startsWith(`${root}/`);
}

export function assetBaseFromFilePath(file_path, folder, asset_file_path = '', workspace = null) {
	let normalized = slash(file_path);
	let folder_name = String(folder || '').replace(/^\/+|\/+$/g, '');
	let workspace_folder = workspace?.folders?.[folder_name] || workspace?.[`${folder_name}Folder`];
	let extension_re = folder_name === 'textures' ? TEXTURE_EXT_RE : JSON_EXT_RE;
	if (workspace_folder && isPathInside(normalized, workspace_folder)) {
		let relative = normalized.substring(slash(workspace_folder).replace(/\/+$/, '').length + 1);
		if (hasPathTraversal(relative)) return null;
		let base = relative.replace(extension_re, '');
		let domain = workspace?.domain || getVintageStoryAssetDomain(asset_file_path, 'game');
		let asset_domain = getVintageStoryAssetDomain(asset_file_path, domain);
		return asset_domain && domain.toLowerCase() !== asset_domain.toLowerCase()
			? `${domain}:${base}`
			: base;
	}
	let match = normalized.match(new RegExp(`(?:^|/)assets/([^/]+)/${folder_name}/(.+)$`, 'i'));
	if (!match) return null;
	let domain = match[1];
	if (hasPathTraversal(match[2])) return null;
	let base = match[2].replace(extension_re, '');
	let asset_domain = getVintageStoryAssetDomain(asset_file_path, domain);
	return asset_domain && domain.toLowerCase() !== asset_domain.toLowerCase()
		? `${domain}:${base}`
		: base;
}

export function defaultShapeFileName(code) {
	let path = String(code || 'shape').split(':').pop().split('/').pop();
	return `${sanitizeVintageStoryAssetCode(path || 'shape') || 'shape'}.json`;
}

export function defaultAssetFileName(code) {
	let path = String(code || 'asset').split(':').pop().split('/').pop();
	return `${sanitizeVintageStoryAssetCode(path || 'asset') || 'asset'}.json`;
}

function makeCompositeTexture(base) {
	return {base};
}

function normalizeTextureBase(base, errors, context) {
	let validation = validateVintageStoryAssetBasePath(base, {
		label: context,
		extensions: ['.png', '.jpg', '.jpeg'],
		rejectAssetFolderPrefix: true
	});
	validation.errors.forEach(error => addError(errors, error));
	return validation.ok ? validation.base : '';
}

function buildVariantPreviewObject(code, variantgroups, options = {}) {
	let asset = {code, variantgroups};
	if (Array.isArray(options.allowedVariants) && options.allowedVariants.length) asset.allowedVariants = cloneJSON(options.allowedVariants);
	if (Array.isArray(options.skipVariants) && options.skipVariants.length) asset.skipVariants = cloneJSON(options.skipVariants);
	return asset;
}

export function getGeneratedAssetVariants(code, variantgroups, options = {}) {
	return expandVintageStoryVariants(buildVariantPreviewObject(code, variantgroups, options), options);
}

function buildTexturesObject(texture_defaults, errors, warnings) {
	let textures = {};
	for (let alias in texture_defaults || {}) {
		let base = normalizeTextureBase(texture_defaults[alias], errors, `Texture "${alias}"`);
		if (base) textures[alias] = makeCompositeTexture(base);
	}
	if (!Object.keys(textures).length && Object.keys(texture_defaults || {}).length) {
		addWarning(warnings, 'No texture aliases could be written because their paths were empty or invalid.');
	}
	return textures;
}

function buildTexturesByType(entries, errors) {
	let texturesByType = {};
	let ordered_entries = (entries || [])
		.map((entry, index) => ({entry, index}))
		.sort((a, b) => {
			let a_wildcard = String(a.entry?.pattern || '*').includes('*');
			let b_wildcard = String(b.entry?.pattern || '*').includes('*');
			if (a_wildcard !== b_wildcard) return a_wildcard ? 1 : -1;
			return a.index - b.index;
		})
		.map(wrapped => wrapped.entry);
	for (let entry of ordered_entries) {
		let alias = String(entry.alias || '').trim().replace(/^#/, '');
		let pattern = String(entry.pattern || '*').trim() || '*';
		let base = normalizeTextureBase(entry.base, errors, `Texture "${alias}"`);
		if (!alias || !base) continue;
		if (!isPlainObject(texturesByType[pattern])) texturesByType[pattern] = {};
		texturesByType[pattern][alias] = makeCompositeTexture(base);
	}
	return texturesByType;
}

function parseLooseValue(value, errors, context) {
	let text = String(value || '').trim();
	if (!text) {
		addError(errors, `${context} is missing a value.`);
		return undefined;
	}
	if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
	if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
	if (/^null$/i.test(text)) return null;
	if (/^[{["']/.test(text)) {
		try {
			return parseVintageStoryAssetText(text);
		} catch (error) {
			addError(errors, `${context} could not be parsed: ${error.message}`);
			return undefined;
		}
	}
	return text;
}

export function parseGenericByTypeText(text) {
	let entries = [];
	let errors = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let parts = line.split('|').map(part => part.trim());
		if (parts.length < 3) {
			addError(errors, `ByType line ${index + 1} must look like "fieldByType | pattern | value".`);
			return;
		}
		let path = parts[0];
		let pattern = parts[1] || '*';
		let value = parseLooseValue(parts.slice(2).join('|'), errors, `ByType line ${index + 1}`);
		if (!path) addError(errors, `ByType line ${index + 1} is missing a field path.`);
		if (path && value !== undefined) entries.push({path, pattern, value});
	});
	return {entries, errors};
}

export function parseAdvancedJsonObjectText(text, label = 'Advanced JSON') {
	let value_text = String(text || '').trim();
	if (!value_text) return {value: {}, errors: []};
	try {
		let value = parseVintageStoryAssetText(value_text);
		return isPlainObject(value)
			? {value, errors: []}
			: {value: {}, errors: [`${label} must be a JSON object.`]};
	} catch (error) {
		return {value: {}, errors: [`${label} could not be parsed: ${error.message}`]};
	}
}

export function parseAdvancedJsonArrayText(text, label = 'Advanced JSON') {
	let value_text = String(text || '').trim();
	if (!value_text) return {value: [], errors: []};
	try {
		let value = parseVintageStoryAssetText(value_text);
		return Array.isArray(value)
			? {value, errors: []}
			: {value: [], errors: [`${label} must be a JSON array.`]};
	} catch (error) {
		return {value: [], errors: [`${label} could not be parsed: ${error.message}`]};
	}
}

export function parseShapeAlternatesText(text) {
	let alternates = [];
	let errors = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let validation = validateVintageStoryAssetBasePath(line, {
			label: `Shape alternate line ${index + 1}`,
			extensions: ['.json'],
			rejectAssetFolderPrefix: true
		});
		validation.errors.forEach(error => addError(errors, error));
		if (validation.ok) alternates.push({base: validation.base});
	});
	return {alternates, errors};
}

export function parseAttachmentSlotsText(text) {
	let slots = [];
	let errors = [];
	String(text || '').split(/\r?\n/g).forEach((raw_line, index) => {
		let line = raw_line.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let parts = line.includes('|')
			? line.split('|').map(part => part.trim())
			: line.split('=').map(part => part.trim());
		if (parts.length < 2) {
			addError(errors, `Attachment slot line ${index + 1} must look like "frontrightside | item/wearable/path".`);
			return;
		}
		let slotCode = parts.shift().trim();
		let raw_base = parts.join(line.includes('|') ? '|' : '=').trim();
		let validation = validateVintageStoryAssetBasePath(raw_base, {
			label: `Attachment slot "${slotCode || index + 1}"`,
			extensions: ['.json'],
			rejectAssetFolderPrefix: true
		});
		let base = validation.ok ? validation.base : '';
		if (!slotCode) addError(errors, `Attachment slot line ${index + 1} is missing a slot code.`);
		if (!base) addError(errors, `Attachment slot "${slotCode || index + 1}" is missing a shape base path.`);
		validation.errors.forEach(error => addError(errors, error));
		if (slotCode && base) slots.push({slotCode, base});
	});
	return {slots, errors};
}

function ensureAttributes(asset) {
	if (!isPlainObject(asset.attributes)) asset.attributes = {};
	return asset.attributes;
}

function deepMergeInto(target, source) {
	if (!isPlainObject(source)) return target;
	for (let key of Object.keys(source)) {
		if (isPlainObject(target[key]) && isPlainObject(source[key])) {
			deepMergeInto(target[key], source[key]);
		} else {
			target[key] = cloneJSON(source[key]);
		}
	}
	return target;
}

export function getVerifiedSaveAsAssetAttributes() {
	return [
		{
			id: 'shelvable',
			label: 'Shelvable',
			path: ['attributes', 'shelvable'],
			value: true,
			input: 'select',
			options: {
				none: 'Not shelvable',
				true: 'Shelvable quadrants',
				Halves: 'Shelvable halves',
				SingleCenter: 'Shelvable single center'
			},
			description: 'BlockEntityShelf accepts true, "Halves", and "SingleCenter".'
		},
		{id: 'rackable', label: 'Tool rackable', path: ['attributes', 'rackable'], value: true, description: 'Used by BlockToolRack and BlockEntityToolrack.'},
		{id: 'moldrackable', label: 'Mold rackable', path: ['attributes', 'moldrackable'], value: true, description: 'Used by BlockEntityMoldRack.'},
		{id: 'displaycaseable', label: 'Display caseable', path: ['attributes', 'displaycaseable'], value: true, description: 'Used by BlockEntityDisplayCase.'},
		{id: 'bookshelveable', label: 'Bookshelfable', path: ['attributes', 'bookshelveable'], value: true, description: 'Used by BlockEntityBookshelf.'},
		{id: 'scrollrackable', label: 'Scroll rackable', path: ['attributes', 'scrollrackable'], value: true, description: 'Used by BlockEntityScrollRack.'},
		{id: 'antlerMountable', label: 'Antler mountable', path: ['attributes', 'antlerMountable'], value: true, description: 'Used by BlockEntityAntlerMount.'},
		{id: 'omokpiece', label: 'Omok piece', path: ['attributes', 'omokpiece'], value: true, description: 'Used by BlockEntityOmokTable.'},
		{id: 'crockable', label: 'Crockable', path: ['attributes', 'crockable'], value: true, description: 'Used by BlockCrock.'}
	];
}

export function getSaveAsAssetTransformOptions() {
	return VS_DISPLAY_CONTEXTS
		.filter(context => !context.previewOnly && !context.aliasOf)
		.map(context => ({
			id: context.id,
			label: context.label,
			jsonKey: context.jsonKey,
			location: context.location,
			valuePath: context.valuePath ? context.valuePath.slice() : undefined
		}));
}

function applyOptionalAttributes(asset, selected = {}) {
	getVerifiedSaveAsAssetAttributes().forEach(attribute => {
		let selected_value = selected[attribute.id];
		if (selected_value === undefined || selected_value === false || selected_value === 'none' || selected_value === '') return;
		let output_value = selected_value === true
			? attribute.value
			: (selected_value === 'true' ? true : selected_value);
		let container = asset;
		for (let i = 0; i < attribute.path.length - 1; i++) {
			let part = attribute.path[i];
			if (!isPlainObject(container[part])) container[part] = {};
			container = container[part];
		}
		container[attribute.path[attribute.path.length - 1]] = cloneJSON(output_value);
	});
}

function includedVariantCodes(code, variantgroups, options) {
	let variants = getGeneratedAssetVariants(code, variantgroups, options);
	return variants.includedVariants.map(variant => variant.variantCode);
}

function applyDisplayTransforms(asset, config, variantgroups, warnings) {
	if (!config.includeDisplayTransforms || !config.displaySettings) return;
	let has_variants = variantgroups.length > 0;
	let mode = config.transformMode || (has_variants ? SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_FALLBACK : SAVE_AS_ASSET_TRANSFORM_MODES.GLOBAL);
	let exact_codes = mode === SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_EXACT
		? includedVariantCodes(config.code, variantgroups, {domain: config.domain || 'game'})
		: [];
	let transform_selection = isPlainObject(config.transformSelection) ? config.transformSelection : null;
	let preset_transform_ids = getVintageStoryAssetPresetTransformIds(config);
	VS_DISPLAY_CONTEXTS.forEach(context => {
		if (context.previewOnly || context.aliasOf) return;
		if (transform_selection && !transform_selection[context.id] && !preset_transform_ids.includes(context.id)) return;
		let slot = config.displaySettings[context.id];
		let transform = displaySlotToVintageStoryTransform(slot);
		if (!transform) return;
		let container = context.location === 'attributes' ? ensureAttributes(asset) : asset;
		let assign_transform = (target, value) => {
			if (context.valuePath?.length) {
				if (!isPlainObject(target[context.jsonKey])) target[context.jsonKey] = {};
				let cursor = target[context.jsonKey];
				for (let i = 0; i < context.valuePath.length - 1; i++) {
					let part = context.valuePath[i];
					let next_part = context.valuePath[i + 1];
					if (!isPlainObject(cursor[part]) && !Array.isArray(cursor[part])) {
						cursor[part] = typeof next_part === 'number' ? [] : {};
					}
					cursor = cursor[part];
				}
				cursor[context.valuePath[context.valuePath.length - 1]] = cloneJSON(value);
			} else {
				target[context.jsonKey] = cloneJSON(value);
			}
		};
		let make_transform_map_entry = value => {
			if (!context.valuePath?.length) return cloneJSON(value);
			let entry = {};
			let cursor = entry;
			for (let i = 0; i < context.valuePath.length - 1; i++) {
				let part = context.valuePath[i];
				let next_part = context.valuePath[i + 1];
				cursor[part] = typeof next_part === 'number' ? [] : {};
				cursor = cursor[part];
			}
			cursor[context.valuePath[context.valuePath.length - 1]] = cloneJSON(value);
			return entry;
		};
		if (has_variants && mode !== SAVE_AS_ASSET_TRANSFORM_MODES.GLOBAL) {
			let map_key = context.mapKey || `${context.jsonKey}ByType`;
			if (!isPlainObject(container[map_key])) container[map_key] = {};
			if (mode === SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_EXACT) {
				exact_codes.forEach(code => {
					container[map_key][code] = make_transform_map_entry(transform);
				});
			} else {
				container[map_key]['*'] = make_transform_map_entry(transform);
			}
		} else {
			assign_transform(container, transform);
		}
	});
	if (has_variants && mode === SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_EXACT) {
		addWarning(warnings, 'Display transforms were duplicated for every generated variant because exact variant transform output was selected.');
	}
}

function behaviorName(behavior) {
	return String(behavior?.name || behavior?.Name || '').trim();
}

function behaviorNameEquals(behavior, name) {
	return behaviorName(behavior).toLowerCase() === String(name || '').trim().toLowerCase();
}

function findBehaviorIndex(asset, name) {
	if (!Array.isArray(asset.behaviors)) return -1;
	return asset.behaviors.findIndex(behavior => behaviorNameEquals(behavior, name));
}

function ensureBehaviorProperties(behavior) {
	if (!isPlainObject(behavior.properties)) behavior.properties = {};
	return behavior.properties;
}

function makeGroundStorableProperties(config = {}) {
	let properties = {};
	let layout = String(config.groundStorableLayout ?? 'Quadrants').trim();
	if (layout) properties.layout = layout;
	if (config.groundStorableCtrlKey) properties.ctrlKey = true;
	return properties;
}

function createGroundStorableBehavior(asset, config) {
	if (!Array.isArray(asset.behaviors)) asset.behaviors = [];
	let behavior = {
		name: GROUND_STORABLE_BEHAVIOR_NAME,
		properties: makeGroundStorableProperties(config)
	};
	asset.behaviors.push(behavior);
	return asset.behaviors.length - 1;
}

function retargetBehaviorBoxSource(asset, source, config, warnings, label) {
	if (source.ownerKind !== 'behavior') return source;
	let behavior_index = Number.isInteger(source.behaviorIndex) ? source.behaviorIndex : -1;
	let behavior = Array.isArray(asset.behaviors) && behavior_index >= 0 ? asset.behaviors[behavior_index] : null;
	let requested_name = source.behaviorName || behaviorName(behavior);
	if (!behavior || (requested_name && !behaviorNameEquals(behavior, requested_name))) {
		behavior_index = requested_name ? findBehaviorIndex(asset, requested_name) : -1;
		behavior = Array.isArray(asset.behaviors) && behavior_index >= 0 ? asset.behaviors[behavior_index] : null;
	}
	if (!behavior) {
		let mode = config.behaviorBoxMode || SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE;
		if (String(requested_name).toLowerCase() !== GROUND_STORABLE_BEHAVIOR_NAME.toLowerCase()) {
			addWarning(warnings, `${label} targets missing behavior "${requested_name || 'unknown'}"; automatic behavior creation is only supported for GroundStorable.`);
			return null;
		}
		if (mode === SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.EDITOR_ONLY) {
			addWarning(warnings, `${label} was kept editor-only because GroundStorable behavior creation is disabled.`);
			return null;
		}
		if (mode === SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.EXISTING_ONLY) {
			addWarning(warnings, `${label} targets GroundStorable, but the generated asset has no GroundStorable behavior.`);
			return null;
		}
		behavior_index = createGroundStorableBehavior(asset, config);
		behavior = asset.behaviors[behavior_index];
		addWarning(warnings, `${label} created a GroundStorable behavior for its behavior-level box.`);
	}
	ensureBehaviorProperties(behavior);
	source.behaviorIndex = behavior_index;
	source.behaviorName = behaviorName(behavior) || GROUND_STORABLE_BEHAVIOR_NAME;
	source.ownerPath = ['behaviors', behavior_index, 'properties'];
	source.familyPath = source.ownerPath.concat(source.fieldKey || String(source.family || '').split('.').pop());
	return source;
}

function behaviorSourceWouldOverwrite(asset, source) {
	if (source.ownerKind !== 'behavior' || source.deleteBox || source.deleteOverride) return false;
	return getInteractionBoxValueAtSource(asset, source) !== undefined;
}

function applyInteractionBoxes(asset, config, warnings) {
	let mode = config.interactionBoxMode || SAVE_AS_ASSET_INTERACTION_BOX_MODES.NONE;
	if (mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.NONE) return;
	if (mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK) {
		let full = makeFullBlockInteractionBox();
		asset.collisionbox = cloneJSON(full);
		asset.selectionbox = cloneJSON(full);
		return;
	}
	if (mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK_SELECTION) {
		asset.selectionbox = cloneJSON(makeFullBlockInteractionBox());
		return;
	}
	if (mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK_COLLISION) {
		asset.collisionbox = cloneJSON(makeFullBlockInteractionBox());
		return;
	}
	if (mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.NO_COLLISION) {
		asset.collisionbox = null;
		return;
	}
	if (mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.SHAPE_BOUNDS) {
		if (!isPlainObject(config.shapeBoundsBox)) {
			addWarning(warnings, 'Shape bounds interaction boxes were requested, but no model bounds were available.');
			return;
		}
		asset.collisionbox = cloneJSON(config.shapeBoundsBox);
		asset.selectionbox = cloneJSON(config.shapeBoundsBox);
		return;
	}
	if (mode !== SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM) return;
	let boxes = Array.isArray(config.interactionBoxes) ? config.interactionBoxes : [];
	boxes.filter(box => !box.deleted && box.sourcePointer).forEach(box => {
		let label = box.label || 'Interaction box';
		let source = retargetBehaviorBoxSource(asset, cloneJSON(box.sourcePointer), config, warnings, label);
		if (!source) return;
		if (behaviorSourceWouldOverwrite(asset, source)) {
			addWarning(warnings, `${label} was not written because ${source.behaviorName || 'the behavior'} already has ${source.fieldKey || source.family}.`);
			return;
		}
		if (!applyInteractionBoxEditToAssetObject(asset, source, box.value)) {
			addWarning(warnings, `${label} could not be written to the generated asset.`);
		}
	});
}

function makeAttachableToEntity(config, errors) {
	let category_code = String(config.attachmentCategoryCode || '').trim();
	let attachment = {};
	if (category_code) attachment.categoryCode = category_code;
	let slots = {};
	(config.attachmentSlots || []).forEach(slot => {
		let slot_code = String(slot.slotCode || '').trim();
		let validation = validateVintageStoryAssetBasePath(slot.base || slot.shapeBase || '', {
			label: `Attachment slot "${slot_code || '?'}"`,
			extensions: ['.json'],
			rejectAssetFolderPrefix: true
		});
		validation.errors.forEach(error => addError(errors, error));
		if (!slot_code || !validation.ok) {
			return;
		}
		slots[slot_code] = {base: validation.base};
	});
	if (Object.keys(slots).length) attachment.attachedShapeBySlotCode = slots;
	return attachment;
}

function applyEntityAttachment(asset, config, variantgroups, errors, warnings) {
	let mode = config.attachmentMode || SAVE_AS_ASSET_ATTACHMENT_MODES.NONE;
	if (!config.includeAttachableToEntity || mode === SAVE_AS_ASSET_ATTACHMENT_MODES.NONE) return;
	let attachment = makeAttachableToEntity(config, errors);
	if (!attachment.categoryCode) addError(errors, 'attachableToEntity categoryCode is required when entity attachment output is enabled.');
	let has_variants = variantgroups.length > 0;
	if (!has_variants || mode === SAVE_AS_ASSET_ATTACHMENT_MODES.GLOBAL) {
		ensureAttributes(asset).attachableToEntity = attachment;
		return;
	}
	if (!isPlainObject(asset.attributesByType)) asset.attributesByType = {};
	if (mode === SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_EXACT) {
		includedVariantCodes(config.code, variantgroups, {domain: config.domain || 'game'}).forEach(code => {
			if (!isPlainObject(asset.attributesByType[code])) asset.attributesByType[code] = {};
			asset.attributesByType[code].attachableToEntity = cloneJSON(attachment);
		});
		addWarning(warnings, 'Entity attachment data was duplicated for every generated variant because exact variant attachment output was selected.');
		return;
	}
	if (!isPlainObject(asset.attributesByType['*'])) asset.attributesByType['*'] = {};
	asset.attributesByType['*'].attachableToEntity = attachment;
}

function applyCreativeInventoryByType(asset, entries) {
	for (let entry of entries || []) {
		if (!isPlainObject(asset.creativeinventoryByType)) asset.creativeinventoryByType = {};
		if (!isPlainObject(asset.creativeinventoryByType[entry.pattern])) asset.creativeinventoryByType[entry.pattern] = {};
		asset.creativeinventoryByType[entry.pattern][entry.category] = cloneJSON(entry.variants);
	}
}

function splitFieldPath(path) {
	return String(path || '')
		.split('.')
		.map(part => part.trim())
		.filter(Boolean);
}

function getOrCreatePath(root, path) {
	let current = root;
	for (let part of path) {
		if (!isPlainObject(current[part])) current[part] = {};
		current = current[part];
	}
	return current;
}

function applyGenericByTypeEntries(asset, entries) {
	for (let entry of entries || []) {
		let path = splitFieldPath(entry.path);
		if (!path.length) continue;
		let field = path.pop();
		let parent = getOrCreatePath(asset, path);
		if (!isPlainObject(parent[field])) parent[field] = {};
		parent[field][entry.pattern || '*'] = cloneJSON(entry.value);
	}
}

function applyAdvancedExtras(asset, config) {
	if (isPlainObject(config.rootExtras)) deepMergeInto(asset, config.rootExtras);
	if (isPlainObject(config.attributesExtras) && Object.keys(config.attributesExtras).length) {
		deepMergeInto(ensureAttributes(asset), config.attributesExtras);
	}
	if (Array.isArray(config.behaviors) && config.behaviors.length) {
		asset.behaviors = cloneJSON(config.behaviors);
	}
	if (isNonEmptyString(config.className)) asset.class = String(config.className).trim();
	if (isNonEmptyString(config.entityClassName)) asset.entityclass = String(config.entityClassName).trim();
}

function normalizeVariantPatterns(patterns) {
	return Array.from(new Set((patterns || []).map(pattern => String(pattern || '').trim()).filter(Boolean)));
}

function pruneEmptyObjects(value) {
	if (!isPlainObject(value)) return value;
	for (let key of Object.keys(value)) {
		if (isPlainObject(value[key])) {
			pruneEmptyObjects(value[key]);
			if (!Object.keys(value[key]).length) delete value[key];
		}
	}
	return value;
}

function collectByTypeMaps(object, path = [], output = []) {
	if (!isPlainObject(object)) return output;
	for (let key of Object.keys(object)) {
		let value = object[key];
		if (isPlainObject(value) && key.toLowerCase().endsWith('bytype')) {
			output.push({path: path.concat(key).join('.'), map: value});
		}
		if (isPlainObject(value)) collectByTypeMaps(value, path.concat(key), output);
	}
	return output;
}

function interactionBoxesForGeneratedValidation(config) {
	let boxes = cloneJSON(config.interactionBoxes || []);
	if ((config.behaviorBoxMode || SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE) !== SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE) return boxes;
	boxes.forEach(box => {
		let source = box.sourcePointer || {};
		if (source.ownerKind === 'behavior' && String(source.behaviorName || '').toLowerCase() === GROUND_STORABLE_BEHAVIOR_NAME.toLowerCase()) {
			delete box.missingBehavior;
			if (box.sourcePointer) delete box.sourcePointer.missingBehavior;
		}
	});
	return boxes;
}

function hasAnyKey(object, keys) {
	return isPlainObject(object) && keys.some(key => Object.prototype.hasOwnProperty.call(object, key));
}

function validateGroundStorableBehaviors(asset, warnings) {
	if (!Array.isArray(asset.behaviors)) return;
	asset.behaviors.forEach((behavior, index) => {
		let name = behaviorName(behavior);
		if (name.toLowerCase() !== GROUND_STORABLE_BEHAVIOR_NAME.toLowerCase()) return;
		let properties = behavior.properties;
		if (!isPlainObject(properties)) {
			addWarning(warnings, `behaviors[${index}] GroundStorable has no properties object.`);
			return;
		}
		if (!hasAnyKey(properties, ['selectionBox', 'selectionBoxes', 'selectionBoxByType', 'selectionBoxesByType'])) {
			addWarning(warnings, `behaviors[${index}] GroundStorable has no selectionBox or selectionBoxes.`);
		}
		if (!hasAnyKey(properties, ['collisionBox', 'collisionBoxes', 'collisionBoxByType', 'collisionBoxesByType'])) {
			addWarning(warnings, `behaviors[${index}] GroundStorable has no collisionBox or collisionBoxes.`);
		}
	});
}

function validateAttachableToEntityObject(value, path, warnings) {
	if (!isPlainObject(value)) return;
	if (!String(value.categoryCode || '').trim() && !isPlainObject(value.categoryCodeByType)) {
		addWarning(warnings, `${path} is missing categoryCode.`);
	}
	let slots = value.attachedShapeBySlotCode;
	if (isPlainObject(slots)) {
		Object.keys(slots).forEach(slot_code => {
			if (!slot_code.trim()) addWarning(warnings, `${path}.attachedShapeBySlotCode has an empty slot code.`);
			let ref = slots[slot_code];
			let base = typeof ref === 'string' ? ref : ref?.base || ref?.Base || '';
			if (!base) addWarning(warnings, `${path}.attachedShapeBySlotCode[${JSON.stringify(slot_code)}] has no shape base path.`);
			if (base) {
				validateVintageStoryAssetBasePath(base, {
					label: `${path}.attachedShapeBySlotCode[${JSON.stringify(slot_code)}]`,
					extensions: ['.json'],
					rejectAssetFolderPrefix: true
				}).errors.forEach(error => addWarning(warnings, error));
			}
		});
	}
}

function validateGeneratedAttachments(asset, warnings) {
	validateAttachableToEntityObject(asset.attributes?.attachableToEntity, 'attributes.attachableToEntity', warnings);
	let root_map = asset.attributes?.attachableToEntityByType;
	if (isPlainObject(root_map)) {
		Object.keys(root_map).forEach(pattern => {
			validateAttachableToEntityObject(root_map[pattern], `attributes.attachableToEntityByType[${JSON.stringify(pattern)}]`, warnings);
		});
	}
	if (isPlainObject(asset.attributesByType)) {
		Object.keys(asset.attributesByType).forEach(pattern => {
			let entry = asset.attributesByType[pattern];
			validateAttachableToEntityObject(entry?.attachableToEntity, `attributesByType[${JSON.stringify(pattern)}].attachableToEntity`, warnings);
			if (isPlainObject(entry?.attachableToEntityByType)) {
				Object.keys(entry.attachableToEntityByType).forEach(inner_pattern => {
					validateAttachableToEntityObject(entry.attachableToEntityByType[inner_pattern], `attributesByType[${JSON.stringify(pattern)}].attachableToEntityByType[${JSON.stringify(inner_pattern)}]`, warnings);
				});
			}
		});
	}
}

function validateSaveTargetPaths(config, errors) {
	if (config.shapeSavePath && !assetBaseFromFilePath(config.shapeSavePath, 'shapes', config.assetSavePath, config.workspace)) {
		addError(errors, 'Shape Save Path must be under assets/<domain>/shapes.');
	}
	if (config.assetSavePath) {
		let folder = config.assetType === 'item' ? 'itemtypes' : 'blocktypes';
		if (!assetBaseFromFilePath(config.assetSavePath, folder, config.assetSavePath, config.workspace)) {
			addError(errors, `${config.assetType === 'item' ? 'Item' : 'Block'} Asset Save Path must be under assets/<domain>/${folder}.`);
		}
	}
	if (config.generateLang && config.langPath && !assetBaseFromFilePath(config.langPath, 'lang', config.assetSavePath, config.workspace)) {
		addError(errors, 'Lang File must be under assets/<domain>/lang.');
	}
}

function validateAssetJsonStringSafety(asset, errors) {
	collectUnsafeAssetJsonStrings(asset).forEach(entry => {
		addError(errors, `Asset JSON contains ${entry.reasons.join(' and ')} at ${entry.path}: ${entry.value}`);
	});
}

function validateGeneratedAsset(asset, config, variants, warnings) {
	let included = variants.includedVariants || [];
	let all = variants.allVariants || [];
	let included_codes = new Set(included.map(variant => variant.variantCode.toLowerCase()));
	let all_by_code = new Map(all.map(variant => [variant.variantCode.toLowerCase(), variant]));

	if (isPlainObject(asset.creativeinventory) && !Object.prototype.hasOwnProperty.call(asset.creativeinventory, 'general')) {
		addWarning(warnings, 'Creative inventory does not include the "general" tab.');
	}
	if (isPlainObject(asset.creativeinventoryByType)) {
		let has_general = Object.values(asset.creativeinventoryByType).some(entry => isPlainObject(entry) && Object.prototype.hasOwnProperty.call(entry, 'general'));
		if (!has_general) addWarning(warnings, 'creativeinventoryByType does not include the "general" tab.');
	}
	let defined_aliases = new Set();
	Object.keys(asset.textures || {}).forEach(alias => defined_aliases.add(alias));
	Object.values(asset.texturesByType || {}).forEach(map => {
		if (isPlainObject(map)) Object.keys(map).forEach(alias => defined_aliases.add(alias));
	});
	(config.modelTextureAliases || []).forEach(alias => {
		if (!defined_aliases.has(alias)) addWarning(warnings, `Texture alias "${alias}" is used by the model but is not defined in the generated asset.`);
	});
	collectByTypeMaps(asset).forEach(entry => {
		Object.keys(entry.map).forEach(pattern => {
			let matches = all.filter(variant => wildcardMatch(pattern, variant.variantCode));
			if (!matches.length && all.length) {
				addWarning(warnings, `${entry.path}[${JSON.stringify(pattern)}] does not match any generated variant.`);
			}
			let exact = all_by_code.get(pattern.toLowerCase());
			if (exact && !included_codes.has(pattern.toLowerCase())) {
				addWarning(warnings, `${entry.path}[${JSON.stringify(pattern)}] targets a skipped or disallowed variant.`);
			}
		});
	});
	let box_warnings = [];
	['collisionbox', 'selectionbox', 'collisionSelectionBox'].forEach(key => {
		if (Object.prototype.hasOwnProperty.call(asset, key)) validateBoxValue(asset[key], box_warnings);
	});
	['collisionboxes', 'selectionboxes', 'collisionSelectionBoxes'].forEach(key => {
		if (Array.isArray(asset[key])) asset[key].forEach(value => validateBoxValue(value, box_warnings));
	});
	collectByTypeMaps(asset)
		.filter(entry => /collision|selection/i.test(entry.path))
		.forEach(entry => {
			Object.values(entry.map).forEach(value => {
				if (Array.isArray(value)) value.forEach(box => validateBoxValue(box, box_warnings));
				else validateBoxValue(value, box_warnings);
			});
		});
	box_warnings.forEach(warning => addWarning(warnings, warning));
	if (Array.isArray(config.interactionBoxes) && config.interactionBoxes.length) {
		validateVintageStoryInteractionBoxes(interactionBoxesForGeneratedValidation(config), {variants: all}).forEach(warning => addWarning(warnings, warning));
	}
	validateGeneratedAttachments(asset, warnings);
	validateVintageStoryPresetAsset(config, asset).forEach(warning => addWarning(warnings, warning));
	validateGroundStorableBehaviors(asset, warnings);
}

export function buildVintageStoryAssetObject(config = {}) {
	let errors = [];
	let warnings = [];
	let code = String(config.code || '').trim();
	validateVintageStoryAssetCode(code).forEach(error => addError(errors, error));
	validateSaveTargetPaths(config, errors);

	let variantgroups = Array.isArray(config.variantgroups) ? cloneJSON(config.variantgroups) : [];
	let allowed_variants = normalizeVariantPatterns(config.allowedVariants);
	let skip_variants = normalizeVariantPatterns(config.skipVariants);
	let asset = {code};
	if (variantgroups.length) asset.variantgroups = variantgroups;
	if (skip_variants.length) asset.skipVariants = skip_variants;
	if (allowed_variants.length) asset.allowedVariants = allowed_variants;
	applyVintageStoryAssetPresetToAsset(asset, config, warnings);

	let shape_base = String(config.shapeBase || '').trim();
	if (!shape_base && config.shapeSavePath) {
		shape_base = assetBaseFromFilePath(config.shapeSavePath, 'shapes', config.assetSavePath, config.workspace);
		if (!shape_base) {
			addWarning(warnings, 'Shape save path is outside an assets/<domain>/shapes folder; choose a shape save path under the mod shapes folder before saving.');
		}
	}
	if (!shape_base) {
		addError(errors, 'Shape base path could not be resolved.');
	} else {
		let shape_validation = validateVintageStoryAssetBasePath(shape_base, {
			label: 'Shape base path',
			extensions: ['.json'],
			rejectAssetFolderPrefix: true
		});
		shape_validation.errors.forEach(error => addError(errors, error));
		if (shape_validation.ok && config.shapeMode === 'by_type') {
			asset.shapeByType = {'*': {base: shape_validation.base}};
		} else if (shape_validation.ok) {
			asset.shape = {base: shape_validation.base};
			if (Array.isArray(config.shapeAlternates) && config.shapeAlternates.length) {
				asset.shape.alternates = cloneJSON(config.shapeAlternates);
			}
		}
	}

	if (config.textureMode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE) {
		let texturesByType = buildTexturesByType(config.texturesByTypeEntries || [], errors);
		if (Object.keys(texturesByType).length) asset.texturesByType = texturesByType;
	} else {
		let textures = buildTexturesObject(config.textureDefaults || {}, errors, warnings);
		if (Object.keys(textures).length) asset.textures = textures;
	}

	let max_stack_size = parseInt(config.maxStackSize);
	if (config.maxStackSize !== undefined && config.maxStackSize !== null && String(config.maxStackSize).trim() !== '') {
		if (!Number.isInteger(max_stack_size) || max_stack_size <= 0) {
			addError(errors, 'Max Stack Size must be a positive integer.');
		} else {
			asset.maxStackSize = max_stack_size;
		}
	}
	if (Array.isArray(config.tags) && config.tags.length) asset.tags = cloneJSON(config.tags);

	if (config.creativeInventoryMode === SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES.BY_TYPE) {
		applyCreativeInventoryByType(asset, config.creativeinventoryByTypeEntries || []);
	} else if (isPlainObject(config.creativeinventory) && Object.keys(config.creativeinventory).length) {
		asset.creativeinventory = cloneJSON(config.creativeinventory);
	}

	applyOptionalAttributes(asset, config.attributes || {});
	applyGenericByTypeEntries(asset, config.byTypeEntries || []);
	applyDisplayTransforms(asset, Object.assign({}, config, {code}), variantgroups, warnings);
	applyAdvancedExtras(asset, config);
	applyInteractionBoxes(asset, config, warnings);
	applyEntityAttachment(asset, Object.assign({}, config, {code}), variantgroups, errors, warnings);

	pruneEmptyObjects(asset);
	validateAssetJsonStringSafety(asset, errors);
	let variant_result = getGeneratedAssetVariants(code || 'asset', variantgroups, {
		domain: config.domain || 'game',
		allowedVariants: allowed_variants,
		skipVariants: skip_variants
	});
	validateGeneratedAsset(asset, config, variant_result, warnings);
	return {asset, errors, warnings};
}

export function generateVintageStoryAssetPreview(config = {}) {
	let errors = [];
	let warnings = [];
	let variantgroups = Array.isArray(config.variantgroups) ? config.variantgroups : [];
	let variant_result = getGeneratedAssetVariants(config.code || 'asset', variantgroups, {
		domain: config.domain || 'game',
		allowedVariants: config.allowedVariants || [],
		skipVariants: config.skipVariants || []
	});
	if (variant_result.warnings?.length) warnings.push(...variant_result.warnings);
	let generated = buildVintageStoryAssetObject(config);
	errors.push(...generated.errors);
	warnings.push(...generated.warnings);
	return {
		asset: generated.asset,
		errors: Array.from(new Set(errors)),
		warnings: Array.from(new Set(warnings)),
		variants: variant_result.includedVariants,
		allVariants: variant_result.allVariants
	};
}

function titleCasePart(value) {
	return String(value || '')
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, match => match.toUpperCase());
}

function codePath(value) {
	return String(value || '').split(':').pop();
}

export function buildVintageStoryLangEntries(config = {}, variants = []) {
	let mode = config.langMode || SAVE_AS_ASSET_LANG_MODES.NONE;
	if (mode === SAVE_AS_ASSET_LANG_MODES.NONE || !config.generateLang) return {};
	let asset_type = config.assetType === 'item' ? 'item' : 'block';
	let display_name = String(config.displayName || config.code || '').trim();
	if (!display_name) return {};
	let entries = {};
	if (mode === SAVE_AS_ASSET_LANG_MODES.VARIANTS && variants.length) {
		variants.forEach(variant => {
			let state_suffix = Object.values(variant.states || {}).map(titleCasePart).filter(Boolean).join(' ');
			entries[`${asset_type}-${variant.variantCode}`] = state_suffix ? `${display_name} ${state_suffix}` : display_name;
		});
		return entries;
	}
	entries[`${asset_type}-${codePath(config.code)}`] = display_name;
	return entries;
}

export function serializeGeneratedVintageStoryAsset(asset) {
	return serializeVintageStoryAssetDocument(asset);
}
