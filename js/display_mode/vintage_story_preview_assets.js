// Modified for Vintage Bench on 2026-06-22: resolve Vintage Story preview assets from a local game installation instead of bundling game assets.

import { fs, PathModule } from "../native_apis";
import { tl } from "../languages";
import { parseVintageStoryAssetText } from "./vintage_story_asset_parser";

export const VS_PREVIEW_ASSETS = [
	{id: 'seraph', label: 'Seraph', path: 'assets/game/shapes/entity/humanoid/seraph.json'},
	{id: 'attachment_slots', label: 'Attachment slots', path: 'assets/game/shapes/entity/humanoid/seraph.json', attachmentSlotPreview: true},
	{id: 'vs_armor_stand', label: 'Vintage Story armor stand', path: 'assets/survival/entities/nonliving/mannequin.json'},
	{id: 'mannequin', label: 'Mannequin', path: 'assets/survival/blocktypes/wood/mannequin.json', variantDefaults: {part: 'complete'}},
	{id: 'tongs', label: 'Tongs', path: 'assets/survival/shapes/entity/humanoid/villageraccessories/held/tongsl.json'},
	{id: 'tool_rack', label: 'Tool rack', path: 'assets/survival/blocktypes/wood/toolrack.json'},
	{id: 'vertical_rack', label: 'Vertical rack', path: 'assets/survival/blocktypes/wood/moldrack.json'},
	{id: 'display_case', label: 'Display case', path: 'assets/survival/blocktypes/wood/displaycase.json', variantDefaults: {type: 'generic'}},
	{id: 'shelf', label: 'Shelf', path: 'assets/survival/blocktypes/wood/shelf.json'},
	{id: 'scroll_rack', label: 'Scroll rack', path: 'assets/survival/blocktypes/wood/woodtyped/scrollrack.json', variantDefaults: {material: 'aged', type: 'normal'}},
	{id: 'mount', label: 'Mount', path: 'assets/survival/blocktypes/wood/woodtyped/antlermount.json', variantDefaults: {material: 'aged', type: 'square'}},
	{id: 'antler_mount', label: 'Antler mount', path: 'assets/survival/blocktypes/wood/woodtyped/antlermount.json', variantDefaults: {material: 'aged', type: 'square'}},
	{id: 'trap', label: 'Trap crate', path: 'assets/survival/blocktypes/wood/trapcrate.json', variantDefaults: {type: 'wood'}},
	{id: 'forge', label: 'Forge', path: 'assets/survival/blocktypes/stone/generic/forge.json'},
	{id: 'omok_tabletop', label: 'Omok tabletop', path: 'assets/survival/blocktypes/wood/table.json', variantDefaults: {type: 'normal'}},
	{id: 'firepit', label: 'Firepit', path: 'assets/survival/blocktypes/wood/firepit.json', variantDefaults: {burnstate: 'extinct'}}
];

let warned_missing_assets = false;
let warned_asset_load_issues = new Set();
let loaded_preview_asset_cache = new Map();

function addWarning(warnings, message) {
	if (warnings && !warnings.includes(message)) warnings.push(message);
}

export function getVintageStoryAssetRoot() {
	return settings?.vintage_story_assets_path?.value || '';
}

function getPreviewAssetCandidateRelativePaths(asset) {
	return (Array.isArray(asset?.paths) && asset.paths.length)
		? asset.paths
		: (asset?.path ? [asset.path] : []);
}

function isPathInsideRoot(root, candidate) {
	if (!root || !candidate) return false;
	let resolved_root = PathModule.resolve(root);
	let resolved_candidate = PathModule.resolve(candidate);
	return resolved_candidate === resolved_root || resolved_candidate.startsWith(resolved_root + PathModule.sep);
}

export function getVintageStoryPreviewAssetCandidates(asset_id) {
	let asset = VS_PREVIEW_ASSETS.find(entry => entry.id === asset_id);
	let root = getVintageStoryAssetRoot();
	if (!asset || !root) return [];
	return getPreviewAssetCandidateRelativePaths(asset)
		.map(relative_path => {
			let path = PathModule.join(root, ...String(relative_path).split('/'));
			return {
				path,
				relative_path,
				exists: isPathInsideRoot(root, path) && fs.existsSync(path)
			};
		})
		.filter(candidate => isPathInsideRoot(root, candidate.path));
}

export function resolveVintageStoryPreviewAsset(asset_id) {
	let candidates = getVintageStoryPreviewAssetCandidates(asset_id);
	return candidates.find(candidate => candidate.exists)?.path || candidates[0]?.path || null;
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
		addWarning(warnings, `Could not resolve Vintage Story preview shape for ${asset.label}.`);
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

function getTextureEntryCandidates(asset_object, shape, source_path, shape_path, code) {
	let candidates = [];
	let shape_textures = shape?.textures || {};
	let asset_type_textures = chooseByTypeEntry(asset_object?.texturesByType) || {};
	let asset_textures = asset_object?.textures || {};
	if (shape_textures && Object.prototype.hasOwnProperty.call(shape_textures, code)) {
		candidates.push({entry: shape_textures[code], source_path: shape_path});
	}
	if (asset_type_textures && Object.prototype.hasOwnProperty.call(asset_type_textures, code)) {
		candidates.push({entry: asset_type_textures[code], source_path});
	}
	if (asset_textures && Object.prototype.hasOwnProperty.call(asset_textures, code)) {
		candidates.push({entry: asset_textures[code], source_path});
	}
	return candidates;
}

function collectUsedFaceTextureRefs(elements, used_refs = new Set()) {
	if (!Array.isArray(elements)) return used_refs;
	for (let element of elements) {
		let faces = element?.faces || {};
		for (let face_name of ['north', 'east', 'south', 'west', 'up', 'down']) {
			let texture = faces[face_name]?.texture;
			if (typeof texture === 'string' && texture !== '#null' && texture !== 'null') {
				used_refs.add(texture);
			}
		}
		collectUsedFaceTextureRefs(element?.children, used_refs);
	}
	return used_refs;
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

function resolveTextureFile(root, asset, asset_object, shape, source_path, shape_path, warnings, texture_ref) {
	if (!texture_ref || texture_ref === '#null' || texture_ref === 'null') return null;
	let candidates = [];
	if (texture_ref.startsWith('#')) {
		let code = texture_ref.substring(1);
		candidates = getTextureEntryCandidates(asset_object, shape, source_path, shape_path, code);
	} else {
		candidates = [{entry: texture_ref, source_path: shape_path || source_path}];
	}
	for (let candidate of candidates) {
		let texture_base = resolvePlaceholders(normalizeTextureEntry(candidate.entry), asset, asset_object);
		let texture_path = resolveAssetBasePath(root, getAssetDomain(candidate.source_path || source_path), 'textures', texture_base, ['.png', '.jpg']);
		if (texture_path) return texture_path;
	}
	if (texture_ref.startsWith('#') && !candidates.length) {
		addWarning(warnings, `Could not find Vintage Story preview texture key "${texture_ref}" for ${asset.label}; using a neutral preview material.`);
	} else if (texture_ref) {
		addWarning(warnings, `Could not resolve Vintage Story preview texture "${texture_ref}" for ${asset.label}; using a neutral preview material.`);
	}
	return null;
}

function resolveTextureFiles(root, asset, asset_object, shape, source_path, shape_path, warnings) {
	let used_refs = collectUsedFaceTextureRefs(shape?.elements);
	let texture_paths = {};
	let texture_urls = {};
	used_refs.forEach(texture_ref => {
		let code = texture_ref.startsWith('#') ? texture_ref.substring(1) : texture_ref;
		let texture_path = resolveTextureFile(root, asset, asset_object, shape, source_path, shape_path, warnings, texture_ref);
		if (texture_path) {
			texture_paths[code] = texture_path;
			texture_urls[code] = pathToFileUrl(texture_path);
		}
	});
	return {texture_paths, texture_urls};
}

function numericVector(value) {
	if (!Array.isArray(value) || value.length < 3) return null;
	let vector = value.slice(0, 3).map(number => typeof number === 'number' && isFinite(number) ? number : 0);
	return vector;
}

function collectShapeElements(elements, output = []) {
	if (!Array.isArray(elements)) return output;
	for (let element of elements) {
		if (!element || typeof element !== 'object') continue;
		output.push(element);
		collectShapeElements(element.children, output);
	}
	return output;
}

function isPlacementSurfaceElement(element) {
	return /^psurface/i.test(String(element?.name || ''));
}

function makeSurfaceReferenceBase(element, y_mode = 'top') {
	let from = numericVector(element?.from);
	let to = numericVector(element?.to);
	if (!from || !to) return null;
	let surface_y = y_mode === 'from' ? from[1] : to[1];
	return [
		(from[0] + to[0]) / 2,
		surface_y + 8,
		(from[2] + to[2]) / 2,
		0, 0, 0,
		1, 1, 1
	];
}

function getPlacementSurfaceReferenceBase(shape) {
	let placement_surface = collectShapeElements(shape?.elements).find(isPlacementSurfaceElement);
	return placement_surface ? makeSurfaceReferenceBase(placement_surface, 'from') : null;
}

function getShelfReferenceBase(shape) {
	let lower_shelf = collectShapeElements(shape?.elements).find(element => /lower\s+shelf/i.test(String(element?.name || '')));
	return lower_shelf ? makeSurfaceReferenceBase(lower_shelf, 'top') : null;
}

function getPreviewReferenceBase(asset_id, shape) {
	let placement_surface = getPlacementSurfaceReferenceBase(shape);
	if (placement_surface) return placement_surface;
	if (asset_id === 'shelf') return getShelfReferenceBase(shape);
	return null;
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
	let candidates = getVintageStoryPreviewAssetCandidates(asset_id);
	let selected_candidate = candidates.find(candidate => candidate.exists) || candidates[0];
	let source_path = selected_candidate?.path || null;
	if (!source_path || !selected_candidate?.exists) {
		let result = {asset_id, source_path, candidate_paths: candidates.map(candidate => candidate.path), warnings: [`Missing Vintage Story preview asset: ${asset.label}`]};
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
		let first_texture_ref = findFirstFaceTexture(resolved_shape.shape?.elements);
		let texture_path = resolveTextureFile(root, asset, asset_object, resolved_shape.shape, source_path, resolved_shape.shape_path, warnings, first_texture_ref);
		let texture_files = resolveTextureFiles(root, asset, asset_object, resolved_shape.shape, source_path, resolved_shape.shape_path, warnings);
		let result = {
			asset_id,
			source_path,
			candidate_paths: candidates.map(candidate => candidate.path),
			shape_path: resolved_shape.shape_path,
			texture_path,
			texture_paths: texture_files.texture_paths,
			warnings,
			model: {
				name: asset.label,
				vintage_story_shape: resolved_shape.shape,
				texture: texture_path ? pathToFileUrl(texture_path) : null,
				texture_urls: texture_files.texture_urls,
				reference_base: getPreviewReferenceBase(asset_id, resolved_shape.shape),
				texture_size: [
					resolved_shape.shape.textureWidth || 16,
					resolved_shape.shape.textureHeight || 16
				],
				texture_sizes: resolved_shape.shape.textureSizes || {},
				material_color: 0x6e675a,
				attachment_slot_preview: !!asset.attachmentSlotPreview
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
		let candidates = getVintageStoryPreviewAssetCandidates(id);
		let resolved = candidates.find(candidate => candidate.exists)?.path || candidates[0]?.path || null;
		return {
			id,
			label: asset?.label || id,
			path: resolved,
			candidates,
			exists: !!candidates.find(candidate => candidate.exists)
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
