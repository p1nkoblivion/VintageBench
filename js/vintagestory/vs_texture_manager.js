import { assetBaseFromFilePath } from './vs_asset_generator.js';
import {
	splitVintageStoryAssetBase,
	validateVintageStoryAssetBasePath
} from './vs_asset_path_safety.js';
import { cloneJSON, isPlainObject } from './vs_variant_resolver.js';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;

function addWarning(warnings, message) {
	if (warnings && message && !warnings.includes(message)) warnings.push(message);
}

function slash(path) {
	return String(path || '').replace(/\\/g, '/');
}

function trimSlashes(value) {
	return String(value || '').replace(/^\/+|\/+$/g, '');
}

function normalizeAlias(alias) {
	return String(alias || '').replace(/^#/, '').trim();
}

function sanitizePathPart(value, fallback = 'texture') {
	let part = String(value || fallback)
		.trim()
		.replace(/\.[a-z0-9]+$/i, '')
		.replace(/[^a-zA-Z0-9_.-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();
	return part || fallback;
}

function normalizeRawBase(raw_ref, asset_base) {
	if (isPlainObject(raw_ref)) {
		let output = cloneJSON(raw_ref);
		output.base = asset_base;
		return output;
	}
	return asset_base;
}

function isMissingAlias(entry) {
	return entry?.sourceKind === 'missing' || (!entry?.rawRef && !entry?.resolvedBase);
}

function pathDirname(PathModule, file_path) {
	return PathModule?.dirname ? PathModule.dirname(file_path) : slash(file_path).split('/').slice(0, -1).join('/');
}

function pathBasename(PathModule, file_path) {
	return PathModule?.basename ? PathModule.basename(file_path) : slash(file_path).split('/').pop();
}

function pathExtname(PathModule, file_path) {
	let ext = PathModule?.extname ? PathModule.extname(file_path) : (String(pathBasename(PathModule, file_path)).match(/\.[^.]+$/)?.[0] || '');
	return IMAGE_EXT_RE.test(ext) ? ext.toLowerCase() : '.png';
}

function pathJoin(PathModule, ...parts) {
	return PathModule?.join ? PathModule.join(...parts) : parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

function normalizeAssetBaseForWorkspace(asset_base, workspace) {
	let split = splitVintageStoryAssetBase(asset_base, workspace?.domain || '');
	if (split.hasDomain && workspace?.domain && split.domain.toLowerCase() !== workspace.domain.toLowerCase()) {
		return null;
	}
	return trimSlashes(split.path);
}

function targetPathFromTextureBase(asset_base, workspace, adapters = {}, extension = '.png') {
	let PathModule = adapters.PathModule;
	let textures_folder = workspace?.folders?.textures || workspace?.texturesFolder || '';
	let relative = normalizeAssetBaseForWorkspace(asset_base, workspace);
	if (!textures_folder || !relative) return '';
	return pathJoin(PathModule, textures_folder, `${relative}${extension}`);
}

function compareFiles(fs, a, b) {
	if (!fs?.existsSync || !fs.existsSync(a) || !fs.existsSync(b)) return false;
	let left = fs.readFileSync(a);
	let right = fs.readFileSync(b);
	return left.length === right.length && left.equals(right);
}

function walkTextureFiles(fs, PathModule, folder, output = []) {
	if (!fs?.existsSync || !folder || !fs.existsSync(folder)) return output;
	let entries = fs.readdirSync(folder, {withFileTypes: true});
	entries.forEach(entry => {
		let path = pathJoin(PathModule, folder, entry.name);
		if (entry.isDirectory()) {
			walkTextureFiles(fs, PathModule, path, output);
		} else if (IMAGE_EXT_RE.test(entry.name)) {
			output.push(path);
		}
	});
	return output;
}

function findDuplicateTexture(source_path, workspace, adapters = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let textures_folder = workspace?.folders?.textures || workspace?.texturesFolder || '';
	let files = walkTextureFiles(fs, PathModule, textures_folder);
	return files.find(file => compareFiles(fs, file, source_path)) || '';
}

function nextAvailableTextureTarget(target_path, adapters = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	if (!fs?.existsSync || !fs.existsSync(target_path)) return target_path;
	let dir = pathDirname(PathModule, target_path);
	let base_name = pathBasename(PathModule, target_path);
	let ext = pathExtname(PathModule, target_path);
	let stem = base_name.replace(IMAGE_EXT_RE, '');
	for (let index = 2; index < 1000; index++) {
		let candidate = pathJoin(PathModule, dir, `${stem}-${index}${ext}`);
		if (!fs.existsSync(candidate)) return candidate;
	}
	return '';
}

function assetBaseFromTargetPath(target_path, asset_file_path, workspace) {
	return assetBaseFromFilePath(target_path, 'textures', asset_file_path || '', workspace);
}

export function cloneVintageStoryTextureEntries(entries) {
	return cloneJSON(entries || []);
}

export function textureEntrySourceLabel(entry) {
	if (!entry) return 'No texture';
	if (entry.sourceKind === 'texturesByType') {
		let pattern = entry.matchedPattern ? ` ${entry.matchedPattern}` : '';
		return `asset texturesByType${pattern}`;
	}
	if (entry.sourceKind === 'textures') return 'asset textures';
	if (entry.sourceKind === 'shape.textures') return 'shape textures';
	if (entry.sourceKind === 'missing') return 'missing alias';
	return entry.sourceMapPath || 'texture';
}

export function collectVintageStoryTextureEntries(asset_context_or_sources = {}) {
	let texture_sources = asset_context_or_sources.texture_sources || asset_context_or_sources;
	let aliases = texture_sources?.aliases || {};
	return Object.keys(aliases)
		.sort((a, b) => a.localeCompare(b))
		.map(alias => {
			let entry = cloneJSON(aliases[alias]) || {};
			entry.alias = normalizeAlias(entry.alias || alias);
			entry.sourceKind = entry.sourceKind || (entry.sourceMapPath === 'root.texturesByType'
				? 'texturesByType'
				: entry.sourceMapPath === 'root.textures'
					? 'textures'
					: 'shape.textures');
			entry.sourceLabel = textureEntrySourceLabel(entry);
			entry.isByType = !!entry.isByType || entry.sourceKind === 'texturesByType';
			entry.isAssetOverride = !!entry.isAssetOverride || entry.sourceKind === 'textures' || entry.sourceKind === 'texturesByType';
			entry.isShapeAlias = !!entry.isShapeAlias || entry.sourceKind === 'shape.textures';
			entry.hasFile = !!entry.resolvedFilePath && !entry.missing && !entry.invalid;
			entry.previewPath = entry.hasFile ? entry.resolvedFilePath : '';
			return entry;
		});
}

export function validateVintageStoryTextureEntries(entries) {
	let warnings = [];
	(entries || []).forEach(entry => {
		let alias = normalizeAlias(entry?.alias || '');
		if (!alias) return;
		if (isMissingAlias(entry)) {
			addWarning(warnings, `Missing texture alias "${alias}": the shape uses #${alias}, but neither the shape nor the item/block asset defines it. This blocks a correct preview/export until a texture base path is added.`);
			return;
		}
		if (entry.invalid) {
			addWarning(warnings, `Invalid texture path for "${alias}": ${entry.resolvedBase || entry.rawRef || ''}${entry.error ? ` (${entry.error})` : ''}. Use a Vintage Story texture base path with forward slashes.`);
		} else if (entry.missing) {
			addWarning(warnings, `Missing texture file for "${alias}": ${entry.resolvedBase || '(empty)'}. Put the image under assets/<domain>/textures or relink it.`);
		}
	});
	return warnings;
}

export function textureRawRefFromBase(asset_base, previous_raw_ref = undefined) {
	let validation = validateVintageStoryAssetBasePath(asset_base, {
		label: 'Texture base path',
		extensions: IMAGE_EXTENSIONS,
		rejectAssetFolderPrefix: true
	});
	if (!validation.ok) throw new Error(validation.errors.join(' '));
	return normalizeRawBase(previous_raw_ref, validation.base);
}

export function makeTextureEditSource(entry, mode = 'override') {
	if (!entry) return null;
	let alias = normalizeAlias(entry.alias);
	let project = globalThis.Project;
	let selected = entry.selectedVariantKey || entry.selected_variant_code || project?.vintage_story_data?.asset_context?.selected_variant_code || project?.name || '*';
	let bytype = entry.sourceKind === 'texturesByType' || entry.isByType;
	let shared = mode === 'shared';
	if (bytype) {
		let edit_key = shared ? entry.matchedPattern : (entry.exact ? (entry.matchedPattern || selected) : selected);
		return {
			sourceKind: 'texturesByType',
			alias,
			selectedVariantKey: selected,
			matchedPattern: entry.matchedPattern || edit_key,
			exact: shared ? !!entry.exact : true,
			inherited: false,
			fallback: shared ? !!entry.fallback : false,
			isByType: true,
			editTargetKey: edit_key,
			editMode: mode,
			sourceMapPath: 'root.texturesByType',
			sourcePath: `root.texturesByType[${JSON.stringify(edit_key)}].${alias}`
		};
	}
	return {
		sourceKind: 'textures',
		alias,
		selectedVariantKey: selected,
		exact: true,
		inherited: false,
		fallback: false,
		isByType: false,
		editTargetKey: null,
		editMode: mode,
		sourceMapPath: 'root.textures',
		sourcePath: `root.textures.${alias}`
	};
}

export function applyTextureOverrideToAssetObject(asset_object, source, raw_ref) {
	if (!asset_object || !source?.alias) return false;
	let alias = normalizeAlias(source.alias);
	if (!alias) return false;
	if (source.deleteOverride) {
		let key = source.editTargetKey || source.matchedPattern || source.selectedVariantKey;
		if (source.sourceKind === 'texturesByType' && key && isPlainObject(asset_object.texturesByType?.[key])) {
			delete asset_object.texturesByType[key][alias];
			if (!Object.keys(asset_object.texturesByType[key]).length) delete asset_object.texturesByType[key];
			return true;
		}
		if (isPlainObject(asset_object.textures)) {
			delete asset_object.textures[alias];
			return true;
		}
		return false;
	}
	if (source.sourceKind === 'texturesByType' || source.isByType) {
		let key = source.editTargetKey || source.matchedPattern || source.selectedVariantKey;
		if (!key) return false;
		if (!isPlainObject(asset_object.texturesByType)) asset_object.texturesByType = {};
		if (!isPlainObject(asset_object.texturesByType[key])) asset_object.texturesByType[key] = {};
		asset_object.texturesByType[key][alias] = cloneJSON(raw_ref);
		return true;
	}
	if (!isPlainObject(asset_object.textures)) asset_object.textures = {};
	asset_object.textures[alias] = cloneJSON(raw_ref);
	return true;
}

export function textureAssetBaseFromFilePath(file_path, asset_file_path, workspace) {
	return assetBaseFromFilePath(file_path, 'textures', asset_file_path || '', workspace);
}

export function makeTextureCopyBase(entry, asset_context = {}, source_path = '') {
	let alias = sanitizePathPart(entry?.alias || pathBasename(null, source_path), 'texture');
	let code = sanitizePathPart(asset_context.asset_code || asset_context.assetCode || 'asset', 'asset');
	return `item/${code}/${alias}`;
}

export function copyTextureIntoWorkspace(entry, source_path, workspace, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	if (!fs) throw new Error('No filesystem adapter was provided.');
	if (!source_path || !fs.existsSync(source_path)) throw new Error('Texture source file does not exist.');
	let textures_folder = workspace?.folders?.textures || workspace?.texturesFolder || '';
	if (!textures_folder) throw new Error('No Vintage Story textures folder is configured.');
	let duplicate = findDuplicateTexture(source_path, workspace, adapters);
	if (duplicate) {
		let duplicate_base = assetBaseFromTargetPath(duplicate, options.assetFilePath || '', workspace);
		return {
			copied: false,
			duplicate: true,
			sourcePath: source_path,
			targetPath: duplicate,
			assetBase: duplicate_base
		};
	}
	let ext = pathExtname(PathModule, source_path);
	let requested_base = options.assetBase || makeTextureCopyBase(entry, options.assetContext || {}, source_path);
	let validation = validateVintageStoryAssetBasePath(requested_base, {
		label: 'Texture copy target',
		extensions: IMAGE_EXTENSIONS,
		rejectAssetFolderPrefix: true,
		fallbackDomain: workspace?.domain || ''
	});
	if (!validation.ok) throw new Error(validation.errors.join(' '));
	if (normalizeAssetBaseForWorkspace(validation.base, workspace) === null) {
		throw new Error('Texture copy target domain must match the workspace domain.');
	}
	let target_path = targetPathFromTextureBase(validation.base, workspace, adapters, ext);
	if (!target_path) throw new Error('Could not build a texture target path.');
	if (fs.existsSync(target_path) && !compareFiles(fs, target_path, source_path)) {
		target_path = nextAvailableTextureTarget(target_path, adapters);
	}
	if (!target_path) throw new Error('Could not find an available texture target path.');
	fs.mkdirSync(pathDirname(PathModule, target_path), {recursive: true});
	fs.copyFileSync(source_path, target_path);
	let asset_base = assetBaseFromTargetPath(target_path, options.assetFilePath || '', workspace) || validation.base;
	return {
		copied: true,
		duplicate: false,
		sourcePath: source_path,
		targetPath: target_path,
		assetBase: asset_base
	};
}

export function updateTextureEntryBase(entry, asset_base, file_path = '', mode = 'override') {
	let output = cloneJSON(entry || {});
	output.alias = normalizeAlias(output.alias);
	output.rawRef = textureRawRefFromBase(asset_base, output.rawRef);
	output.resolvedBase = isPlainObject(output.rawRef) ? output.rawRef.base : output.rawRef;
	output.resolvedFilePath = file_path || output.resolvedFilePath || '';
	output.missing = false;
	output.invalid = false;
	output.error = '';
	output.hasFile = !!output.resolvedFilePath;
	output.previewPath = output.hasFile ? output.resolvedFilePath : '';
	output.sourcePointer = makeTextureEditSource(output, mode);
	output.sourceKind = output.sourcePointer?.sourceKind || 'textures';
	output.sourceMapPath = output.sourcePointer?.sourceMapPath || 'root.textures';
	output.sourcePath = output.sourcePointer?.sourcePath || `root.textures.${output.alias}`;
	output.isByType = !!output.sourcePointer?.isByType;
	output.isAssetOverride = true;
	output.isShapeAlias = false;
	output.exact = !!output.sourcePointer?.exact;
	output.inherited = false;
	output.fallback = !!output.sourcePointer?.fallback;
	output.matchedPattern = output.sourcePointer?.matchedPattern || null;
	output.editMode = mode;
	output.dirty = true;
	return output;
}
