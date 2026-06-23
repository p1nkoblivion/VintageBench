import {
	assetLocationMatch,
	cloneJSON,
	collectResolvedByTypeSources,
	deepMergeObjects,
	expandVintageStoryVariants,
	fillPlaceholdersDeep,
	isPlainObject,
	resolveByTypeIntoObject,
	resolveByTypeMap,
	splitAssetLocation
} from './vs_variant_resolver.js';
import { parseVintageStoryAssetText } from './vs_asset_document.js';
import { resolveVintageStoryInteractionBoxes } from './vs_interaction_boxes.js';
import { resolveVintageStoryAttachments } from './vs_entity_attachments.js';
import { validateVintageStoryAssetBasePath } from './vs_asset_path_safety.js';

export const VS_ASSET_TRANSFORM_FAMILIES = [
	{id: 'guiTransform', jsonKey: 'guiTransform', location: 'root'},
	{id: 'groundTransform', jsonKey: 'groundTransform', location: 'root'},
	{id: 'fpHandTransform', jsonKey: 'fpHandTransform', location: 'root'},
	{id: 'tpHandTransform', jsonKey: 'tpHandTransform', location: 'root'},
	{id: 'tpOffHandTransform', jsonKey: 'tpOffHandTransform', location: 'root'},
	{id: 'toolrackTransform', jsonKey: 'toolrackTransform', location: 'root'},
	{id: 'toolrackTransform', jsonKey: 'toolrackTransform', location: 'attributes'},
	{id: 'groundStorageTransform', jsonKey: 'groundStorageTransform', location: 'attributes'},
	{id: 'onAntlerMountTransform', jsonKey: 'onAntlerMountTransform', location: 'attributes'},
	{id: 'onmoldrackTransform', jsonKey: 'onmoldrackTransform', location: 'attributes'},
	{id: 'onDisplayTransform', jsonKey: 'onDisplayTransform', location: 'attributes'},
	{id: 'onshelfTransform', jsonKey: 'onshelfTransform', location: 'attributes'},
	{id: 'onscrollrackTransform', jsonKey: 'onscrollrackTransform', location: 'attributes'},
	{id: 'onTongTransform', jsonKey: 'onTongTransform', location: 'attributes'},
	{id: 'inTrapTransform', jsonKey: 'inTrapTransform', location: 'attributes'},
	{id: 'inForgeTransform', jsonKey: 'inForgeTransform', location: 'attributes'},
	{id: 'onOmokTransform', jsonKey: 'onOmokTransform', location: 'attributes'},
	{id: 'infirepitTransform', jsonKey: 'infirepitTransform', location: 'attributes'},
	{id: 'inFirePitPropsTransform', jsonKey: 'inFirePitProps', mapKey: 'inFirePitPropsByType', location: 'attributes', valuePath: ['transform']}
];

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function addWarning(warnings, message) {
	if (warnings && message && !warnings.includes(message)) warnings.push(message);
}

function slash(path) {
	return String(path || '').replace(/\\/g, '/');
}

function pathJoin(path_module, ...parts) {
	if (path_module?.join) return path_module.join(...parts);
	return parts.join('/').replace(/\/+/g, '/');
}

export function getVintageStoryAssetDomain(file_path, fallback = 'game') {
	let match = slash(file_path).match(/\/assets\/([^/]+)\//i);
	return match?.[1] || fallback;
}

export function getVintageStorySourceKind(file_path) {
	let normalized = slash(file_path).toLowerCase();
	if (normalized.includes('/itemtypes/')) return 'item';
	if (normalized.includes('/blocktypes/')) return 'block';
	return 'unknown';
}

export function findVintageStoryAssetRoot(file_path) {
	let normalized = slash(file_path);
	let match = normalized.match(/^(.*)\/assets\/[^/]+\//i);
	return match ? match[1] : '';
}

export function normalizeAssetRoots(roots = []) {
	let output = [];
	roots.forEach(root => {
		if (!root || typeof root !== 'string') return;
		root.split(/[;\n]/g).forEach(part => {
			let clean = part.trim();
			if (clean && !output.includes(clean)) output.push(clean);
		});
	});
	return output;
}

export function buildVintageStoryAssetRoots(source_file_path, options = {}) {
	let roots = [];
	let source_root = findVintageStoryAssetRoot(source_file_path);
	if (source_root) roots.push(source_root);
	if (options.modAssetRoot) roots.push(options.modAssetRoot);
	if (options.workspaceAssetRoot) roots.push(options.workspaceAssetRoot);
	normalizeAssetRoots(options.additionalAssetRoots || []).forEach(root => roots.push(root));
	if (options.gameAssetRoot) roots.push(options.gameAssetRoot);
	return normalizeAssetRoots(roots);
}

function stripKnownPrefix(path, folder) {
	path = path.replace(/^assets\/[^/]+\//i, '');
	path = path.replace(new RegExp(`^${folder}/`, 'i'), '');
	return path;
}

export function splitDomainPath(base, fallback_domain = 'game') {
	let normalized = slash(base).replace(/^\/+/, '');
	if (normalized.includes(':')) {
		let [domain, ...rest] = normalized.split(':');
		return {domain: domain || fallback_domain, path: rest.join(':')};
	}
	return {domain: fallback_domain, path: normalized};
}

export function resolveAssetBasePath(roots, fallback_domain, folder, base, extensions, adapters = {}) {
	let fs = adapters.fs;
	let path_module = adapters.PathModule;
	let raw_base = typeof base === 'string' ? base : normalizeCompositeBase(base);
	if (!raw_base) return {resolvedFilePath: '', missing: true};
	let base_validation = validateVintageStoryAssetBasePath(raw_base, {
		label: `${folder} asset base`,
		extensions,
		fallbackDomain: fallback_domain
	});
	if (!base_validation.ok) {
		return {resolvedFilePath: '', missing: true, invalid: true, error: base_validation.errors.join(' '), domain: '', path: ''};
	}
	let {domain, path} = splitDomainPath(base_validation.base, fallback_domain);
	path = stripKnownPrefix(path, folder);
	let path_validation = validateVintageStoryAssetBasePath(path, {
		label: `${folder} asset path`,
		extensions,
		allowEmpty: false
	});
	if (!path_validation.ok) {
		return {resolvedFilePath: '', missing: true, invalid: true, error: path_validation.errors.join(' '), domain, path};
	}
	path = path_validation.path;
	for (let root of normalizeAssetRoots(roots)) {
		for (let extension of extensions) {
			let clean_path = path.replace(new RegExp(`${extension.replace('.', '\\.')}$`, 'i'), '');
			let folder_root = pathJoin(path_module, root, 'assets', domain, folder);
			let candidate = pathJoin(path_module, folder_root, ...clean_path.split('/')) + extension;
			if (!isPathUnderRoot(candidate, folder_root)) {
				return {resolvedFilePath: '', missing: true, invalid: true, error: `${folder} asset path escapes assets/${domain}/${folder}.`, domain, path: clean_path};
			}
			if (!fs || fs.existsSync(candidate)) {
				return {resolvedFilePath: candidate, missing: fs ? !fs.existsSync(candidate) : false, domain, path: clean_path};
			}
		}
	}
	let first_root = normalizeAssetRoots(roots)[0] || '';
	let clean_path = path.replace(/\.[a-z0-9]+$/i, '');
	let folder_root = first_root ? pathJoin(path_module, first_root, 'assets', domain, folder) : '';
	let candidate = folder_root ? pathJoin(path_module, folder_root, ...clean_path.split('/')) + extensions[0] : '';
	if (candidate && !isPathUnderRoot(candidate, folder_root)) {
		return {resolvedFilePath: '', missing: true, invalid: true, error: `${folder} asset path escapes assets/${domain}/${folder}.`, domain, path: clean_path};
	}
	return {resolvedFilePath: candidate, missing: true, domain, path: clean_path};
}

export function normalizeCompositeBase(entry) {
	if (typeof entry === 'string') return entry;
	if (entry?.base) return entry.base;
	if (entry?.Base) return typeof entry.Base === 'string' ? entry.Base : entry.Base?.path || entry.Base?.Path;
	if (Array.isArray(entry?.alternates) && entry.alternates[0]) return normalizeCompositeBase(entry.alternates[0]);
	if (Array.isArray(entry?.Alternates) && entry.Alternates[0]) return normalizeCompositeBase(entry.Alternates[0]);
	return '';
}

function collectShapeAlternates(shape_ref) {
	let alternates = Array.isArray(shape_ref?.alternates)
		? shape_ref.alternates
		: (Array.isArray(shape_ref?.Alternates) ? shape_ref.Alternates : []);
	return alternates;
}

function getDirectAtPath(object, path) {
	let current = object;
	for (let part of path) {
		if (!isPlainObject(current)) return undefined;
		current = current[part];
	}
	return current;
}

function setDirectAtPath(object, path = [], value) {
	if (!path.length) return;
	let parent = getOrCreateContainer(object, path.slice(0, -1));
	parent[path[path.length - 1]] = cloneJSON(value);
}

function deleteDirectAtPath(object, path = []) {
	if (!path.length) return false;
	let parent = getDirectAtPath(object, path.slice(0, -1));
	if (!isPlainObject(parent) && !Array.isArray(parent)) return false;
	delete parent[path[path.length - 1]];
	return true;
}

function hasObjectKeys(value) {
	return isPlainObject(value) && Object.keys(value).length > 0;
}

function makePathString(path) {
	let output = 'root';
	path.forEach(part => {
		if (typeof part === 'number') {
			output += `[${part}]`;
		} else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)) {
			output += `.${part}`;
		} else {
			output += `[${JSON.stringify(part)}]`;
		}
	});
	return output;
}

function appendPathPart(base, part) {
	if (typeof part === 'number') return `${base}[${part}]`;
	if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(part))) return `${base}.${part}`;
	return `${base}[${JSON.stringify(part)}]`;
}

function resolveMapAtPath(asset_object, map_path, direct_path, variant, warnings) {
	let map = getDirectAtPath(asset_object, map_path);
	let direct = getDirectAtPath(asset_object, direct_path);
	let match = resolveByTypeMap(map, variant.codePath);
	if (match) {
		let value = fillPlaceholdersDeep(
			isPlainObject(direct) && isPlainObject(match.value) ? deepMergeObjects(direct, match.value) : match.value,
			variant.states
		);
		return {
			value,
			sourceMapPath: makePathString(map_path),
			sourcePath: `${makePathString(map_path)}[${JSON.stringify(match.matchedPattern)}]`,
			matchedPattern: match.matchedPattern,
			exact: match.exact,
			fallback: match.fallback,
			inherited: match.inherited,
			sourceIndex: match.sourceIndex,
			isByType: true
		};
	}
	if (direct !== undefined) {
		return {
			value: fillPlaceholdersDeep(cloneJSON(direct), variant.states),
			sourceMapPath: makePathString(direct_path),
			sourcePath: makePathString(direct_path),
			matchedPattern: null,
			exact: true,
			fallback: false,
			inherited: false,
			sourceIndex: -1,
			isByType: false
		};
	}
	return null;
}

export function resolveVintageStoryShapeReference(asset_object, variant, roots, source_file_path, adapters = {}, warnings = []) {
	let fallback_domain = getVintageStoryAssetDomain(source_file_path, variant.codeDomain || 'game');
	let resolved = resolveMapAtPath(asset_object, ['shapeByType'], ['shape'], variant, warnings)
		|| resolveMapAtPath(asset_object, ['client', 'shapeByType'], ['client', 'shape'], variant, warnings)
		|| resolveMapAtPath(asset_object, ['shapeInventoryByType'], ['shapeInventory'], variant, warnings);
	if (!resolved) {
		addWarning(warnings, `No shape or shapeByType entry resolved for ${variant.variantCode}.`);
		return {
			sourceMapPath: '',
			matchedPattern: '',
			rawRef: null,
			resolvedBase: '',
			resolvedFilePath: '',
			missing: true
		};
	}
	let base = normalizeCompositeBase(resolved.value);
	let path_resolution = resolveAssetBasePath(roots, fallback_domain, 'shapes', base, ['.json'], adapters);
	if (path_resolution.invalid) {
		addWarning(warnings, `Invalid shape path for ${variant.variantCode}: ${base} (${path_resolution.error})`);
	} else if (path_resolution.missing) {
		addWarning(warnings, `Missing shape for ${variant.variantCode}: ${base}`);
	}
	let sourcePath = resolved.sourcePath;
	let sourceMapPath = resolved.sourceMapPath;
	let shape_source = {
		sourceMapPath,
		sourcePath,
		matchedPattern: resolved.matchedPattern,
		rawRef: cloneJSON(resolved.value),
		resolvedBase: base,
		resolvedFilePath: path_resolution.resolvedFilePath,
		invalid: !!path_resolution.invalid,
		error: path_resolution.error || '',
		missing: path_resolution.missing,
		exact: resolved.exact,
		inherited: resolved.inherited,
		fallback: resolved.fallback,
		isByType: !!resolved.isByType,
		selectedVariantKey: variant.variantCode,
		editTargetKey: resolved.isByType && resolved.exact ? resolved.matchedPattern : null
	};
	let alternates = collectShapeAlternates(resolved.value).map((raw_ref, index) => {
		let alternate_base = normalizeCompositeBase(raw_ref);
		let alternate_resolution = alternate_base
			? resolveAssetBasePath(roots, fallback_domain, 'shapes', alternate_base, ['.json'], adapters)
			: {resolvedFilePath: '', missing: true};
		let alternate_source_path = `${sourcePath}.alternates[${index}]`;
		if (alternate_base && alternate_resolution.invalid) {
			addWarning(warnings, `Invalid alternate shape path for ${variant.variantCode}: ${alternate_base} (${alternate_resolution.error})`);
		} else if (alternate_base && alternate_resolution.missing) {
			addWarning(warnings, `Missing alternate shape for ${variant.variantCode}: ${alternate_base}`);
		}
		return {
			index,
			sourceMapPath,
			sourcePath: alternate_source_path,
			matchedPattern: resolved.matchedPattern,
			rawRef: cloneJSON(raw_ref),
			resolvedBase: alternate_base,
			resolvedShapeFilePath: alternate_resolution.resolvedFilePath,
			resolvedFilePath: alternate_resolution.resolvedFilePath,
			invalid: !!(alternate_base && alternate_resolution.invalid),
			error: alternate_resolution.error || '',
			missing: !alternate_base || !!alternate_resolution.missing,
			exact: resolved.exact,
			inherited: resolved.inherited,
			fallback: resolved.fallback,
			isByType: !!resolved.isByType,
			selectedVariantKey: variant.variantCode,
			shapeSourcePointer: cloneJSON(shape_source)
		};
	});
	return {
		...shape_source,
		alternates
	};
}

function collectUsedFaceTextureRefs(elements, used_refs = new Set()) {
	if (!Array.isArray(elements)) return used_refs;
	elements.forEach(element => {
		let faces = element?.faces || {};
		['north', 'east', 'south', 'west', 'up', 'down'].forEach(face_name => {
			let texture = faces[face_name]?.texture;
			if (typeof texture === 'string' && texture !== '#null' && texture !== 'null') {
				used_refs.add(texture.startsWith('#') ? texture.substring(1) : texture);
			}
		});
		collectUsedFaceTextureRefs(element?.children, used_refs);
	});
	return used_refs;
}

function resolveTextureMap(asset_object, variant) {
	let direct = isPlainObject(asset_object?.textures) ? asset_object.textures : {};
	let match = resolveByTypeMap(asset_object?.texturesByType, variant.codePath);
	let match_value = isPlainObject(match?.value) ? match.value : {};
	let value = match
		? (isPlainObject(match.value) ? deepMergeObjects(direct, match.value) : cloneJSON(match.value))
		: cloneJSON(direct);
	return {
		value: fillPlaceholdersDeep(value || {}, variant.states),
		match,
		directKeys: new Set(Object.keys(direct)),
		matchKeys: new Set(Object.keys(match_value))
	};
}

export function resolveVintageStoryTextureAliases(asset_object, shape, variant, roots, source_file_path, shape_file_path, adapters = {}, warnings = []) {
	let fallback_domain = getVintageStoryAssetDomain(source_file_path, variant.codeDomain || 'game');
	let shape_domain = getVintageStoryAssetDomain(shape_file_path, fallback_domain);
	let shape_textures = isPlainObject(shape?.textures) ? shape.textures : {};
	let used_face_aliases = collectUsedFaceTextureRefs(shape?.elements);
	let used_aliases = new Set(used_face_aliases);
	Object.keys(shape_textures).forEach(alias => used_aliases.add(alias));
	let texture_map = resolveTextureMap(asset_object, variant);
	Object.keys(texture_map.value || {}).forEach(alias => used_aliases.add(alias));
	let aliases = {};
	used_aliases.forEach(alias => {
		let has_asset = isPlainObject(texture_map.value) && Object.prototype.hasOwnProperty.call(texture_map.value, alias);
		let has_shape = Object.prototype.hasOwnProperty.call(shape_textures, alias);
		let has_match_alias = has_asset && texture_map.matchKeys.has(alias);
		let has_direct_alias = has_asset && texture_map.directKeys.has(alias);
		let raw = has_asset ? texture_map.value[alias] : shape_textures[alias];
		let missing_alias = used_face_aliases.has(alias) && !has_asset && !has_shape;
		let sourceMapPath = missing_alias
			? ''
			: has_asset
			? (has_match_alias ? 'root.texturesByType' : 'root.textures')
			: 'shape.textures';
		let matchedPattern = has_match_alias && texture_map.match ? texture_map.match.matchedPattern : null;
		let sourcePath = missing_alias
			? ''
			: has_asset
			? (has_match_alias
				? appendPathPart(`${sourceMapPath}[${JSON.stringify(matchedPattern)}]`, alias)
				: makePathString(['textures', alias]))
			: appendPathPart('shape.textures', alias);
		let resolvedBase = normalizeCompositeBase(raw);
		let resolved = resolvedBase
			? resolveAssetBasePath(roots, has_asset ? fallback_domain : shape_domain, 'textures', resolvedBase, IMAGE_EXTENSIONS, adapters)
			: {resolvedFilePath: '', missing: true};
		if (missing_alias) {
			addWarning(warnings, `Missing texture alias for ${variant.variantCode}: "${alias}" is used by the shape but not defined in shape textures, root.textures, or root.texturesByType.`);
		} else if (resolvedBase && resolved.invalid) {
			addWarning(warnings, `Invalid texture path for ${variant.variantCode} alias "${alias}": ${resolvedBase} (${resolved.error})`);
		} else if (resolvedBase && resolved.missing) {
			addWarning(warnings, `Missing texture for ${variant.variantCode} alias "${alias}": ${resolvedBase}`);
		}
		let sourceKind = missing_alias
			? 'missing'
			: has_asset
				? (has_match_alias ? 'texturesByType' : 'textures')
				: 'shape.textures';
		aliases[alias] = {
			alias,
			sourceKind,
			sourceMapPath,
			sourcePath,
			matchedPattern,
			rawRef: cloneJSON(raw),
			resolvedBase,
			resolvedFilePath: resolved.resolvedFilePath,
			invalid: !!(!missing_alias && resolvedBase && resolved.invalid),
			error: resolved.error || '',
			missing: missing_alias || !!(resolvedBase && resolved.missing),
			exact: has_match_alias && texture_map.match ? texture_map.match.exact : has_asset,
			inherited: has_match_alias && texture_map.match ? texture_map.match.inherited : false,
			fallback: has_match_alias && texture_map.match ? texture_map.match.fallback : false,
			isByType: !!has_match_alias,
			isAssetOverride: !!has_asset,
			isShapeAlias: !!has_shape,
			direct: !!has_direct_alias,
			selectedVariantKey: variant.variantCode,
			editTargetKey: has_match_alias && texture_map.match?.exact ? texture_map.match.matchedPattern : null
		};
	});
	return {aliases};
}

function resolveTransformFamily(asset_object, family, variant) {
	let container = family.location === 'attributes' ? asset_object?.attributes : asset_object;
	let container_path = family.location === 'attributes' ? ['attributes'] : [];
	let map_key = family.mapKey || `${family.jsonKey}ByType`;
	let value_path = Array.isArray(family.valuePath) ? family.valuePath : [];
	let bytype = null;
	if (value_path.length) {
		let map = getDirectAtPath(container, [map_key]);
		let direct = getDirectAtPath(container, [family.jsonKey]);
		let direct_value = getDirectAtPath(direct, value_path);
		let match = resolveByTypeMap(map, variant.codePath);
		let match_value = match ? getDirectAtPath(match.value, value_path) : undefined;
		if (match && match_value !== undefined) {
			let merged_value = isPlainObject(direct_value) && isPlainObject(match_value)
				? deepMergeObjects(direct_value, match_value)
				: match_value;
			bytype = {
				value: fillPlaceholdersDeep(merged_value, variant.states),
				sourceMapPath: makePathString([map_key]),
				sourcePath: `${makePathString([map_key])}[${JSON.stringify(match.matchedPattern)}]${value_path.map(part => appendPathPart('', part)).join('')}`,
				matchedPattern: match.matchedPattern,
				exact: match.exact,
				fallback: match.fallback,
				inherited: match.inherited,
				sourceIndex: match.sourceIndex,
				isByType: true
			};
		} else if (direct_value !== undefined) {
			bytype = {
				value: fillPlaceholdersDeep(cloneJSON(direct_value), variant.states),
				sourceMapPath: makePathString([family.jsonKey].concat(value_path)),
				sourcePath: makePathString([family.jsonKey].concat(value_path)),
				matchedPattern: null,
				exact: true,
				fallback: false,
				inherited: false,
				sourceIndex: -1,
				isByType: false
			};
		}
	} else {
		bytype = resolveMapAtPath(container, [map_key], [family.jsonKey], variant);
	}
	if (!bytype) return null;
	let base_path = container_path.concat(bytype.isByType ? [map_key] : [family.jsonKey]);
	let source_path = bytype.isByType
		? `${makePathString(base_path)}[${JSON.stringify(bytype.matchedPattern)}]`
		: makePathString(base_path);
	if (value_path.length) {
		source_path += bytype.isByType ? value_path.map(part => appendPathPart('', part)).join('') : value_path.map(part => appendPathPart('', part)).join('');
	}
	return {
		value: cloneJSON(bytype.value),
		sourcePath: source_path,
		sourceMapPath: makePathString(base_path),
		familyPath: base_path,
		valuePath: value_path,
		jsonKey: family.jsonKey,
		mapKey: map_key,
		location: family.location,
		matchedPattern: bytype.matchedPattern,
		inherited: bytype.inherited,
		exact: bytype.exact,
		fallback: bytype.fallback,
		isByType: bytype.isByType,
		editTargetKey: bytype.exact ? bytype.matchedPattern : null,
		selectedVariantKey: variant.variantCode
	};
}

export function resolveVintageStoryTransforms(asset_object, variant) {
	let transforms = {};
	VS_ASSET_TRANSFORM_FAMILIES.forEach(family => {
		let resolved = resolveTransformFamily(asset_object, family, variant);
		if (resolved) transforms[family.id] = resolved;
	});
	return transforms;
}

export function buildResolvedRuntimeAssetObject(asset_object, variant) {
	return resolveByTypeIntoObject(asset_object, variant.codePath, variant.states);
}

export function resolveVintageStoryAssetVariant(asset_document, asset_index, variant, options = {}) {
	let source_file_path = asset_document?.filePath || options.sourceFilePath || '';
	let source_entry = asset_document?.assetObjects?.[asset_index || 0];
	let asset_object = source_entry?.object || asset_document?.root;
	let warnings = [];
	let roots = buildVintageStoryAssetRoots(source_file_path, options);
	let shape = resolveVintageStoryShapeReference(asset_object, variant, roots, source_file_path, options, warnings);
	let shape_json = null;
	if (shape.resolvedFilePath && !shape.missing && options.fs) {
		try {
			shape_json = parseVintageStoryAssetText(options.fs.readFileSync(shape.resolvedFilePath, 'utf8'), shape.resolvedFilePath);
		} catch (error) {
			addWarning(warnings, `Could not read resolved shape ${shape.resolvedFilePath}: ${error.message}`);
		}
	}
	let textures = shape_json
		? (options.skipTextures
			? {aliases: {}, skipped: true}
			: resolveVintageStoryTextureAliases(asset_object, shape_json, variant, roots, source_file_path, shape.resolvedFilePath, options, warnings))
		: {aliases: {}};
	let transforms = resolveVintageStoryTransforms(asset_object, variant);
	let interactionBoxes = resolveVintageStoryInteractionBoxes(asset_object, variant, warnings);
	let fallback_domain = getVintageStoryAssetDomain(source_file_path, variant.codeDomain || 'game');
	let attachments = resolveVintageStoryAttachments(asset_object, variant, (raw_ref, base) => {
		let resolved_base = base || normalizeCompositeBase(raw_ref);
		return resolveAssetBasePath(roots, fallback_domain, 'shapes', resolved_base, ['.json'], options);
	}, warnings);
	return {
		sourceFilePath: source_file_path,
		sourceKind: getVintageStorySourceKind(source_file_path),
		sourceObjectIndex: asset_index || 0,
		assetCode: splitAssetLocation(asset_object?.code || asset_object?.Code || '', getVintageStoryAssetDomain(source_file_path)).path,
		variantCode: variant.variantCode,
		code: variant.code,
		states: cloneJSON(variant.states),
		shape,
		shapeJson: shape_json,
		textures,
		transforms,
		interactionBoxes,
		attachments,
		byTypeSources: collectResolvedByTypeSources(asset_object, variant.codePath),
		runtimeAssetObject: buildResolvedRuntimeAssetObject(asset_object, variant),
		warnings
	};
}

export function listVintageStoryAssetVariants(asset_document, asset_index = 0, options = {}) {
	let source_file_path = asset_document?.filePath || '';
	let source_entry = asset_document?.assetObjects?.[asset_index];
	let asset_object = source_entry?.object || asset_document?.root;
	return expandVintageStoryVariants(asset_object, {
		domain: getVintageStoryAssetDomain(source_file_path, options.domain || 'game')
	});
}

function getOrCreateContainer(root, path) {
	let current = root;
	for (let part of path) {
		if (!isPlainObject(current[part])) current[part] = {};
		current = current[part];
	}
	return current;
}

export function applyTransformEditToAssetObject(asset_object, source, transform_value) {
	if (!source || !asset_object) return false;
	let family_path = source.familyPath || [];
	if (!family_path.length) return false;
	let is_by_type = family_path[family_path.length - 1]?.toLowerCase?.().endsWith('bytype');
	let parent_path = family_path.slice(0, -1);
	let key = family_path[family_path.length - 1];
	let parent = getOrCreateContainer(asset_object, parent_path);
	let value_path = Array.isArray(source.valuePath) ? source.valuePath : [];
	if (source.deleteOverride && is_by_type) {
		if (isPlainObject(parent[key])) {
			if (value_path.length && isPlainObject(parent[key][source.selectedVariantKey])) {
				deleteDirectAtPath(parent[key][source.selectedVariantKey], value_path);
				if (!hasObjectKeys(parent[key][source.selectedVariantKey])) delete parent[key][source.selectedVariantKey];
			} else {
				delete parent[key][source.selectedVariantKey];
			}
		}
		return true;
	}
	if (is_by_type) {
		if (!isPlainObject(parent[key])) parent[key] = {};
		let target_key = source.editTargetKey || (source.exact ? source.matchedPattern : source.selectedVariantKey);
		if (!target_key) target_key = source.selectedVariantKey;
		if (value_path.length) {
			if (!isPlainObject(parent[key][target_key])) parent[key][target_key] = {};
			setDirectAtPath(parent[key][target_key], value_path, transform_value);
		} else {
			parent[key][target_key] = cloneJSON(transform_value);
		}
		return true;
	}
	if (value_path.length) {
		if (!isPlainObject(parent[key])) parent[key] = {};
		setDirectAtPath(parent[key], value_path, transform_value);
	} else {
		parent[key] = cloneJSON(transform_value);
	}
	return true;
}

export function isPathUnderRoot(file_path, root_path) {
	if (!file_path || !root_path) return false;
	let file = slash(file_path).toLowerCase();
	let root = slash(root_path).replace(/\/+$/, '').toLowerCase();
	return file === root || file.startsWith(`${root}/`);
}
