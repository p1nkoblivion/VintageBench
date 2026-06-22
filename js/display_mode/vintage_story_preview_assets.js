// Modified for Vintage Bench on 2026-06-22: resolve Vintage Story preview assets from a local game installation instead of bundling game assets.

import { fs, PathModule } from "../native_apis";
import { tl } from "../languages";
import { parseVintageStoryAssetText } from "./vintage_story_asset_parser";

export const VS_PREVIEW_ASSETS = [
	{id: 'seraph', label: 'Seraph', path: 'assets/game/shapes/entity/humanoid/seraph.json'},
	{id: 'vs_armor_stand', label: 'Vintage Story armor stand', path: 'assets/survival/entities/nonliving/mannequin.json'},
	{id: 'mannequin', label: 'Mannequin', path: 'assets/survival/blocktypes/wood/mannequin.json', variantDefaults: {part: 'complete'}},
	{id: 'tongs', label: 'Tongs', path: 'assets/survival/shapes/entity/humanoid/villageraccessories/held/tongsl.json'},
	{id: 'tool_rack', label: 'Tool rack', path: 'assets/survival/blocktypes/wood/toolrack.json'},
	{id: 'vertical_rack', label: 'Vertical rack', path: 'assets/survival/blocktypes/wood/moldrack.json'},
	{id: 'display_case', label: 'Display case', path: 'assets/survival/blocktypes/wood/displaycase.json', variantDefaults: {type: 'generic'}},
	{id: 'shelf', label: 'Shelf', path: 'assets/survival/blocktypes/wood/shelf.json'},
	{id: 'scroll_rack', label: 'Scroll rack', path: 'assets/survival/blocktypes/wood/woodtyped/scrollrack.json', variantDefaults: {material: 'aged', type: 'normal'}},
	{id: 'antler_mount', label: 'Antler mount', path: 'assets/survival/blocktypes/wood/woodtyped/antlermount.json', variantDefaults: {material: 'aged', type: 'square'}},
	{id: 'trap', label: 'Trap crate', path: 'assets/survival/blocktypes/wood/trapcrate.json', variantDefaults: {type: 'wood'}},
	{id: 'forge', label: 'Forge', path: 'assets/survival/blocktypes/stone/generic/forge.json'},
	{id: 'omok_tabletop', label: 'Omok tabletop', path: 'assets/survival/blocktypes/wood/table.json', variantDefaults: {type: 'normal'}},
	{id: 'firepit', label: 'Firepit', path: 'assets/survival/blocktypes/wood/firepit.json', variantDefaults: {burnstate: 'extinct'}}
];

let warned_missing_assets = false;
let warned_asset_load_issues = new Set();
let loaded_preview_asset_cache = new Map();

export function getVintageStoryAssetRoot() {
	return settings?.vintage_story_assets_path?.value || '';
}

export function resolveVintageStoryPreviewAsset(asset_id) {
	let asset = VS_PREVIEW_ASSETS.find(entry => entry.id === asset_id);
	let root = getVintageStoryAssetRoot();
	if (!asset || !root) return null;
	return PathModule.join(root, ...asset.path.split('/'));
}

function getPreviewAsset(asset_id) {
	return VS_PREVIEW_ASSETS.find(entry => entry.id === asset_id);
}

function getAssetDomain(file_path) {
	let normalized = String(file_path || '').replace(/\\/g, '/');
	let match = normalized.match(/\/assets\/([^/]+)\//);
	return match?.[1] || 'game';
}

function readVintageStoryAssetFile(file_path) {
	return parseVintageStoryAssetText(fs.readFileSync(file_path, 'utf8'), file_path);
}

function pathToFileUrl(file_path) {
	return encodeURI(`file:///${String(file_path).replace(/\\/g, '/')}`);
}

function splitDomainPath(base, fallback_domain) {
	let normalized = String(base || '').replace(/\\/g, '/').replace(/^\/+/, '');
	if (normalized.includes(':')) {
		let [domain, ...rest] = normalized.split(':');
		return {domain: domain || fallback_domain, path: rest.join(':')};
	}
	return {domain: fallback_domain, path: normalized};
}

function resolveAssetBasePath(root, fallback_domain, folder, base, extensions) {
	if (!root || !base) return null;
	let {domain, path} = splitDomainPath(base, fallback_domain);
	path = path.replace(/^assets\/[^/]+\//, '');
	path = path.replace(new RegExp(`^${folder}/`), '');
	for (let extension of extensions) {
		let clean_path = path.replace(new RegExp(`${extension.replace('.', '\\.')}$`), '');
		let candidate = PathModule.join(root, 'assets', domain, folder, ...clean_path.split('/')) + extension;
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

function getVariantValue(asset, asset_object, key) {
	let direct = asset?.variantDefaults?.[key];
	if (direct) return direct;
	let variant_group = Array.isArray(asset_object?.variantgroups)
		? asset_object.variantgroups.find(group => group.code === key)
		: null;
	let states = variant_group?.states || asset_object?.attributes?.[`${key}s`] || [];
	let preferred = ['generic', 'complete', 'normal', 'wood', 'aged', 'square', 'north'];
	if (Array.isArray(states)) {
		return preferred.find(value => states.includes(value)) || states[0] || key;
	}
	return preferred[0];
}

function resolvePlaceholders(value, asset, asset_object) {
	if (typeof value !== 'string') return value;
	return value.replace(/\{([^}]+)\}/g, (match, key) => getVariantValue(asset, asset_object, key));
}

function chooseByTypeEntry(map) {
	if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
	let keys = Object.keys(map);
	if (!keys.length) return null;
	let preferred = keys.find(key => key === '*' || key.includes('normal') || key.includes('generic')) || keys[0];
	return map[preferred];
}

function getShapeDescriptor(asset_object) {
	return asset_object?.shape
		|| asset_object?.Shape
		|| chooseByTypeEntry(asset_object?.shapeByType)
		|| chooseByTypeEntry(asset_object?.shapebytype)
		|| asset_object?.shapeinventory
		|| asset_object?.shapeInventory
		|| asset_object?.client?.shape
		|| chooseByTypeEntry(asset_object?.client?.shapeByType);
}

function resolveShapeFile(root, asset, asset_object, source_path, warnings) {
	if (Array.isArray(asset_object?.elements)) {
		return {shape: asset_object, shape_path: source_path};
	}
	let descriptor = getShapeDescriptor(asset_object);
	let base = resolvePlaceholders(descriptor?.base || descriptor, asset, asset_object);
	let shape_path = resolveAssetBasePath(root, getAssetDomain(source_path), 'shapes', base, ['.json']);
	if (!shape_path) {
		warnings.push(`Could not resolve Vintage Story preview shape for ${asset.label}.`);
		return null;
	}
	return {
		shape: readVintageStoryAssetFile(shape_path),
		shape_path
	};
}

function normalizeTextureEntry(entry) {
	if (typeof entry === 'string') return entry;
	if (entry?.base) return entry.base;
	if (Array.isArray(entry?.alternates) && entry.alternates[0]) return normalizeTextureEntry(entry.alternates[0]);
	return null;
}

function mergeTextureMaps(asset_object, shape) {
	return Object.assign({}, asset_object?.textures || {}, chooseByTypeEntry(asset_object?.texturesByType) || {}, shape?.textures || {});
}

function findFirstFaceTexture(elements) {
	if (!Array.isArray(elements)) return null;
	for (let element of elements) {
		let faces = element?.faces || {};
		for (let face_name of ['north', 'east', 'south', 'west', 'up', 'down']) {
			let texture = faces[face_name]?.texture;
			if (texture) return texture;
		}
		let child_texture = findFirstFaceTexture(element?.children);
		if (child_texture) return child_texture;
	}
	return null;
}

function resolveTextureFile(root, asset, asset_object, shape, source_path, warnings) {
	let texture_map = mergeTextureMaps(asset_object, shape);
	let texture_ref = findFirstFaceTexture(shape?.elements);
	let texture_base = texture_ref;
	if (texture_ref?.startsWith('#')) {
		texture_base = normalizeTextureEntry(texture_map[texture_ref.substring(1)]);
	} else {
		texture_base = normalizeTextureEntry(texture_ref);
	}
	texture_base = resolvePlaceholders(texture_base, asset, asset_object);
	let texture_path = resolveAssetBasePath(root, getAssetDomain(source_path), 'textures', texture_base, ['.png', '.jpg']);
	if (!texture_path && texture_ref) {
		warnings.push(`Could not resolve Vintage Story preview texture "${texture_ref}" for ${asset.label}; using a neutral preview material.`);
	}
	return texture_path;
}

export function loadVintageStoryPreviewModel(asset_id) {
	let root = getVintageStoryAssetRoot();
	let asset = getPreviewAsset(asset_id);
	if (!root || !asset) return null;

	let cache_key = `${root}|${asset_id}`;
	if (loaded_preview_asset_cache.has(cache_key)) {
		return loaded_preview_asset_cache.get(cache_key);
	}

	let warnings = [];
	let source_path = resolveVintageStoryPreviewAsset(asset_id);
	if (!source_path || !fs.existsSync(source_path)) {
		let result = {asset_id, warnings: [`Missing Vintage Story preview asset: ${asset.label}`]};
		loaded_preview_asset_cache.set(cache_key, result);
		return result;
	}

	try {
		let asset_object = readVintageStoryAssetFile(source_path);
		let resolved_shape = resolveShapeFile(root, asset, asset_object, source_path, warnings);
		if (!resolved_shape?.shape) {
			let result = {asset_id, source_path, warnings};
			loaded_preview_asset_cache.set(cache_key, result);
			return result;
		}
		let texture_path = resolveTextureFile(root, asset, asset_object, resolved_shape.shape, source_path, warnings);
		let result = {
			asset_id,
			source_path,
			shape_path: resolved_shape.shape_path,
			texture_path,
			warnings,
			model: {
				name: asset.label,
				vintage_story_shape: resolved_shape.shape,
				texture: texture_path ? pathToFileUrl(texture_path) : null,
				texture_size: [
					resolved_shape.shape.textureWidth || 16,
					resolved_shape.shape.textureHeight || 16
				],
				material_color: 0x6e675a
			}
		};
		loaded_preview_asset_cache.set(cache_key, result);
		return result;
	} catch (error) {
		let result = {asset_id, source_path, warnings: [`Could not load Vintage Story preview asset ${asset.label}: ${error.message}`]};
		loaded_preview_asset_cache.set(cache_key, result);
		return result;
	}
}

export function warnAboutVintageStoryPreviewAssetLoad(asset_id, result) {
	let warning = result?.warnings?.[0];
	if (!warning || !Blockbench?.showQuickMessage) return;
	let key = `${asset_id}:${warning}`;
	if (warned_asset_load_issues.has(key)) return;
	warned_asset_load_issues.add(key);
	Blockbench.showQuickMessage(warning, 4000);
}

export function getVintageStoryPreviewAssetStatus(asset_ids = VS_PREVIEW_ASSETS.map(asset => asset.id)) {
	return asset_ids.filter(id => VS_PREVIEW_ASSETS.some(entry => entry.id === id)).map(id => {
		let asset = getPreviewAsset(id);
		let resolved = resolveVintageStoryPreviewAsset(id);
		return {
			id,
			label: asset?.label || id,
			path: resolved,
			exists: !!(resolved && fs.existsSync(resolved))
		};
	});
}

export function warnAboutMissingVintageStoryPreviewAssets(asset_ids) {
	if (warned_missing_assets || !Blockbench?.showQuickMessage) return;
	let root = getVintageStoryAssetRoot();
	if (!root) {
		warned_missing_assets = true;
		Blockbench.showQuickMessage(tl('message.vintage_story_assets.configure'), 3000);
		return;
	}
	let missing = getVintageStoryPreviewAssetStatus(asset_ids).filter(asset => !asset.exists);
	if (missing.length) {
		warned_missing_assets = true;
		Blockbench.showQuickMessage(`Missing Vintage Story preview asset: ${missing[0].label}`, 3000);
	}
}
