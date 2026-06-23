import { cloneJSON, isPlainObject } from './vs_variant_resolver.js';
import { normalizeCompositeBase } from './vs_asset_resolver.js';
import { validateVintageStoryAssetBasePath } from './vs_asset_path_safety.js';

function normalizeAlternates(alternates = []) {
	return (alternates || [])
		.filter(alternate => alternate && !alternate.deleted)
		.map((alternate, index) => ({
			index,
			sourceMapPath: alternate.sourceMapPath || '',
			sourcePath: alternate.sourcePath || '',
			matchedPattern: alternate.matchedPattern || null,
			rawRef: cloneJSON(alternate.rawRef !== undefined ? alternate.rawRef : {base: alternate.resolvedBase || ''}),
			resolvedBase: alternate.resolvedBase || normalizeCompositeBase(alternate.rawRef) || '',
			resolvedShapeFilePath: alternate.resolvedShapeFilePath || alternate.resolvedFilePath || '',
			resolvedFilePath: alternate.resolvedFilePath || alternate.resolvedShapeFilePath || '',
			invalid: !!alternate.invalid,
			error: alternate.error || '',
			missing: !!alternate.missing,
			exact: !!alternate.exact,
			inherited: !!alternate.inherited,
			fallback: !!alternate.fallback,
			isByType: !!alternate.isByType,
			selectedVariantKey: alternate.selectedVariantKey || '',
			shapeSourcePointer: cloneJSON(alternate.shapeSourcePointer || alternate.sourcePointer || {}),
			sourcePointer: cloneJSON(alternate.sourcePointer || null),
			dirty: !!alternate.dirty
		}));
}

function getOrCreateObject(parent, key) {
	if (!isPlainObject(parent[key])) parent[key] = {};
	return parent[key];
}

function setAlternatesOnShapeRef(shape_ref, alternates = []) {
	let clean = normalizeAlternates(alternates)
		.map(alternate => {
			let raw = cloneJSON(alternate.rawRef);
			if (isPlainObject(raw)) {
				if (!normalizeCompositeBase(raw) && alternate.resolvedBase) raw.base = alternate.resolvedBase;
				return raw;
			}
			return {base: alternate.resolvedBase || String(raw || '')};
		})
		.filter(raw => normalizeCompositeBase(raw));
	if (clean.length) {
		shape_ref.alternates = clean;
	} else {
		delete shape_ref.alternates;
	}
	return shape_ref;
}

function selectedVariantKey(source) {
	return source?.selectedVariantKey || source?.selected_variant_code || globalThis.Project?.vintage_story_data?.asset_context?.selected_variant_code || globalThis.Project?.name || '*';
}

function cloneShapeRefForEdit(source) {
	let ref = isPlainObject(source?.rawRef) ? cloneJSON(source.rawRef) : {};
	if (!normalizeCompositeBase(ref) && source?.resolvedBase) ref.base = source.resolvedBase;
	if (!normalizeCompositeBase(ref)) ref.base = '';
	return ref;
}

function makeShapeSourceForAlternates(shape_source = {}, mode = 'override') {
	let selected = selectedVariantKey(shape_source);
	let bytype = !!shape_source.isByType || /ByType$/i.test(String(shape_source.sourceMapPath || '').split('.').pop() || '');
	let shared = mode === 'shared';
	let edit_key = bytype
		? (shared ? shape_source.matchedPattern : (shape_source.exact ? (shape_source.matchedPattern || selected) : selected))
		: null;
	return {
		sourceKind: 'shape.alternates',
		sourceMapPath: shape_source.sourceMapPath || 'root.shape',
		sourcePath: shape_source.sourcePath || 'root.shape',
		matchedPattern: shape_source.matchedPattern || edit_key,
		selectedVariantKey: selected,
		exact: bytype ? (shared ? !!shape_source.exact : true) : true,
		inherited: false,
		fallback: bytype && shared ? !!shape_source.fallback : false,
		isByType: bytype,
		editTargetKey: edit_key,
		editMode: mode,
		rawRef: cloneShapeRefForEdit(shape_source),
		resolvedBase: shape_source.resolvedBase || normalizeCompositeBase(shape_source.rawRef) || ''
	};
}

function shapeRefContainer(asset_object, source = {}) {
	let map = source.sourceMapPath || '';
	let direct = source.sourcePath || '';
	if (map === 'root.shapeByType') {
		let key = source.editTargetKey || source.matchedPattern || source.selectedVariantKey;
		if (!key) return null;
		return getOrCreateObject(getOrCreateObject(asset_object, 'shapeByType'), key);
	}
	if (map === 'root.client.shapeByType') {
		let key = source.editTargetKey || source.matchedPattern || source.selectedVariantKey;
		if (!key) return null;
		let client = getOrCreateObject(asset_object, 'client');
		return getOrCreateObject(getOrCreateObject(client, 'shapeByType'), key);
	}
	if (map === 'root.shapeInventoryByType') {
		let key = source.editTargetKey || source.matchedPattern || source.selectedVariantKey;
		if (!key) return null;
		return getOrCreateObject(getOrCreateObject(asset_object, 'shapeInventoryByType'), key);
	}
	if (direct === 'root.client.shape') {
		let client = getOrCreateObject(asset_object, 'client');
		return getOrCreateObject(client, 'shape');
	}
	if (direct === 'root.shapeInventory') {
		return getOrCreateObject(asset_object, 'shapeInventory');
	}
	return getOrCreateObject(asset_object, 'shape');
}

export function cloneVintageStoryShapeAlternatives(alternates = []) {
	return normalizeAlternates(alternates);
}

export function makeShapeAlternativeFromBase(base, shape_source = {}, options = {}) {
	let validation = validateVintageStoryAssetBasePath(base, {
		label: 'Shape alternate base path',
		extensions: ['.json'],
		rejectAssetFolderPrefix: true
	});
	if (!validation.ok) throw new Error(validation.errors.join(' '));
	let source_pointer = makeShapeSourceForAlternates(shape_source, options.mode || 'override');
	return {
		index: Number.isInteger(options.index) ? options.index : -1,
		sourceMapPath: source_pointer.sourceMapPath,
		sourcePath: `${source_pointer.sourcePath}.alternates[${Number.isInteger(options.index) ? options.index : 0}]`,
		matchedPattern: source_pointer.matchedPattern,
		rawRef: {base: validation.base},
		resolvedBase: validation.base,
		resolvedShapeFilePath: options.resolvedShapeFilePath || '',
		resolvedFilePath: options.resolvedShapeFilePath || '',
		invalid: false,
		error: '',
		missing: !options.resolvedShapeFilePath,
		exact: source_pointer.exact,
		inherited: false,
		fallback: source_pointer.fallback,
		isByType: source_pointer.isByType,
		selectedVariantKey: source_pointer.selectedVariantKey,
		shapeSourcePointer: cloneJSON(shape_source || {}),
		sourcePointer: source_pointer,
		dirty: true
	};
}

export function applyShapeAlternativesToAssetObject(asset_object, source, alternates = []) {
	if (!asset_object || !source) return false;
	let edit_source = source.sourceKind === 'shape.alternates' ? source : makeShapeSourceForAlternates(source, 'override');
	let container = shapeRefContainer(asset_object, edit_source);
	if (!container) return false;
	if (!Object.keys(container).length) {
		Object.assign(container, cloneShapeRefForEdit(edit_source));
	}
	let base = normalizeCompositeBase(container) || edit_source.resolvedBase || normalizeCompositeBase(edit_source.rawRef);
	if (base && !normalizeCompositeBase(container)) container.base = base;
	setAlternatesOnShapeRef(container, alternates);
	return true;
}

export function validateVintageStoryShapeAlternatives(alternates = []) {
	let warnings = [];
	(alternates || []).forEach(alternate => {
		if (!alternate.resolvedBase) {
			warnings.push('Shape alternate is missing a base path.');
		} else if (alternate.invalid) {
			warnings.push(`Invalid alternate shape path: ${alternate.resolvedBase}${alternate.error ? ` (${alternate.error})` : ''}`);
		} else if (alternate.missing) {
			warnings.push(`Missing alternate shape file: ${alternate.resolvedBase}`);
		}
	});
	return warnings;
}

export function shapeAlternativeSourceLabel(alternative = {}) {
	if (alternative.isByType) {
		return alternative.matchedPattern
			? `shapeByType ${alternative.matchedPattern}`
			: 'shapeByType';
	}
	return alternative.sourcePath?.startsWith('root.client') ? 'client.shape' : (alternative.sourcePath?.includes('shapeInventory') ? 'shapeInventory' : 'shape');
}
