import {
	cloneJSON,
	deepMergeObjects,
	fillPlaceholdersDeep,
	isPlainObject,
	resolveByTypeMap,
	wildcardMatch
} from './vs_variant_resolver.js';

const ATTACHABLE_TO_ENTITY_KEY = 'attachableToEntity';
const ATTACHABLE_TO_ENTITY_BY_TYPE_KEYS = ['attachableToEntityByType', 'attachabletoentityByType', 'attachabletoentitybytype'];
const CATEGORY_CODE_BY_TYPE_KEYS = ['categoryCodeByType', 'categorycodeByType', 'categorycodebytype'];
const ATTACHED_SHAPE_BY_SLOT_CODE_KEY = 'attachedShapeBySlotCode';
const ATTACHED_SHAPE_BY_SLOT_CODE_BY_TYPE_KEYS = ['attachedShapeBySlotCodeByType', 'attachedshapeBySlotCodeByType', 'attachedshapebyslotcodebytype'];

function addWarning(warnings, message) {
	if (warnings && message && !warnings.includes(message)) warnings.push(message);
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

function findExistingKey(object, keys = []) {
	if (!isPlainObject(object)) return '';
	for (let key of keys) {
		if (Object.prototype.hasOwnProperty.call(object, key)) return key;
	}
	let lower_keys = keys.map(key => key.toLowerCase());
	return Object.keys(object).find(key => lower_keys.includes(key.toLowerCase())) || '';
}

function getOrCreateContainer(root, path) {
	let current = root;
	for (let part of path) {
		if (!isPlainObject(current[part])) current[part] = {};
		current = current[part];
	}
	return current;
}

function isAbsoluteFilesystemPath(value) {
	let text = String(value || '').trim();
	return /^[a-zA-Z]:[\\/]/.test(text) || /^\//.test(text) || text.includes('\\');
}

function normalizeCompositeBase(entry) {
	if (typeof entry === 'string') return entry;
	if (entry?.base) return entry.base;
	if (entry?.Base) return typeof entry.Base === 'string' ? entry.Base : entry.Base?.path || entry.Base?.Path;
	if (entry?.path) return entry.path;
	if (entry?.Path) return entry.Path;
	return '';
}

function mergeAttachable(base, overlay) {
	if (!isPlainObject(base)) return cloneJSON(overlay);
	if (!isPlainObject(overlay)) return cloneJSON(base);
	return deepMergeObjects(base, overlay);
}

function resolveAttachableInnerByType(raw, variant, warnings) {
	let output = fillPlaceholdersDeep(cloneJSON(raw || {}), variant.states);
	let category_by_type_key = findExistingKey(raw, CATEGORY_CODE_BY_TYPE_KEYS);
	if (category_by_type_key) {
		let match = resolveByTypeMap(raw[category_by_type_key], variant.codePath);
		if (match) {
			output.categoryCode = fillPlaceholdersDeep(match.value, variant.states);
		} else {
			addWarning(warnings, `attachableToEntity.${category_by_type_key} has no match for ${variant.variantCode}.`);
		}
	}
	let slots_by_type_key = findExistingKey(raw, ATTACHED_SHAPE_BY_SLOT_CODE_BY_TYPE_KEYS);
	if (slots_by_type_key) {
		let match = resolveByTypeMap(raw[slots_by_type_key], variant.codePath);
		if (match) {
			let direct_slots = isPlainObject(output[ATTACHED_SHAPE_BY_SLOT_CODE_KEY]) ? output[ATTACHED_SHAPE_BY_SLOT_CODE_KEY] : {};
			let resolved_slots = fillPlaceholdersDeep(match.value, variant.states);
			output[ATTACHED_SHAPE_BY_SLOT_CODE_KEY] = isPlainObject(direct_slots) && isPlainObject(resolved_slots)
				? deepMergeObjects(direct_slots, resolved_slots)
				: resolved_slots;
		} else {
			addWarning(warnings, `attachableToEntity.${slots_by_type_key} has no match for ${variant.variantCode}.`);
		}
	}
	return output;
}

function makeSourcePointer(source) {
	return {
		sourceKind: source.sourceKind,
		familyPath: cloneJSON(source.familyPath || []),
		parentPattern: source.parentPattern || null,
		matchedPattern: source.matchedPattern || null,
		selectedVariantKey: source.selectedVariantKey,
		exact: !!source.exact,
		inherited: !!source.inherited,
		fallback: !!source.fallback,
		isByType: !!source.isByType,
		editTargetKey: source.exact ? source.matchedPattern : null,
		sourcePath: source.sourcePath,
		sourceMapPath: source.sourceMapPath
	};
}

function makeResolvedAttachment(raw, source, variant, resolve_shape_ref, warnings) {
	let value = resolveAttachableInnerByType(raw, variant, warnings);
	let slots = [];
	let slot_map = isPlainObject(value[ATTACHED_SHAPE_BY_SLOT_CODE_KEY]) ? value[ATTACHED_SHAPE_BY_SLOT_CODE_KEY] : {};
	for (let slot_code of Object.keys(slot_map)) {
		let raw_ref = slot_map[slot_code];
		let resolved_base = normalizeCompositeBase(raw_ref);
		let path_resolution = resolve_shape_ref?.(raw_ref, resolved_base) || {};
		if (resolved_base && path_resolution.missing) {
			addWarning(warnings, `Missing attached shape for ${variant.variantCode} slot "${slot_code}": ${resolved_base}`);
		}
		slots.push({
			slotCode: slot_code,
			shapeRef: cloneJSON(raw_ref),
			resolvedShapeBase: resolved_base,
			resolvedShapeFilePath: path_resolution.resolvedFilePath || '',
			missing: !!(resolved_base && path_resolution.missing),
			sourcePointer: {
				attachmentSource: makeSourcePointer(source),
				slotCode: slot_code,
				sourcePath: `${source.sourcePath}.${ATTACHED_SHAPE_BY_SLOT_CODE_KEY}[${JSON.stringify(slot_code)}]`
			}
		});
	}
	let extra_fields = {};
	Object.keys(value || {}).forEach(key => {
		if (key !== 'categoryCode' && key !== ATTACHED_SHAPE_BY_SLOT_CODE_KEY) extra_fields[key] = cloneJSON(value[key]);
	});
	return {
		selectedVariantCode: variant.variantCode,
		states: cloneJSON(variant.states),
		sourcePath: source.sourcePath,
		sourceMapPath: source.sourceMapPath,
		matchedPattern: source.matchedPattern || null,
		parentPattern: source.parentPattern || null,
		inherited: !!source.inherited,
		exact: !!source.exact,
		fallback: !!source.fallback,
		isByType: !!source.isByType,
		categoryCode: value?.categoryCode || '',
		value,
		slots,
		extraFields: extra_fields,
		sourcePointer: makeSourcePointer(source),
		warnings: []
	};
}

function attachableCandidateFromByTypeMap(map, source, variant, warnings) {
	let match = resolveByTypeMap(map, variant.codePath);
	if (!match) return null;
	return {
		raw: match.value,
		source: Object.assign({}, source, {
			matchedPattern: match.matchedPattern,
			sourcePath: `${makePathString(source.familyPath)}[${JSON.stringify(match.matchedPattern)}]`,
			sourceMapPath: makePathString(source.familyPath),
			exact: match.exact,
			inherited: match.inherited,
			fallback: match.fallback,
			isByType: true
		})
	};
}

function applyCandidate(current_raw, current_source, candidate) {
	if (!candidate?.raw) return {raw: current_raw, source: current_source};
	return {
		raw: mergeAttachable(current_raw || {}, candidate.raw),
		source: candidate.source
	};
}

export function resolveVintageStoryAttachments(asset_object, variant, resolve_shape_ref, warnings = []) {
	if (!isPlainObject(asset_object) || !variant) return null;
	let raw = null;
	let source = null;
	let attributes = isPlainObject(asset_object.attributes) ? asset_object.attributes : {};

	if (isPlainObject(attributes[ATTACHABLE_TO_ENTITY_KEY])) {
		raw = cloneJSON(attributes[ATTACHABLE_TO_ENTITY_KEY]);
		source = {
			sourceKind: 'attributes.attachableToEntity',
			familyPath: ['attributes', ATTACHABLE_TO_ENTITY_KEY],
			selectedVariantKey: variant.variantCode,
			sourcePath: 'root.attributes.attachableToEntity',
			sourceMapPath: 'root.attributes.attachableToEntity',
			exact: true,
			inherited: false,
			fallback: false,
			isByType: false
		};
	}

	let root_by_type_key = findExistingKey(attributes, ATTACHABLE_TO_ENTITY_BY_TYPE_KEYS);
	let root_by_type = root_by_type_key
		? attachableCandidateFromByTypeMap(attributes[root_by_type_key], {
			sourceKind: 'attributes.attachableToEntityByType',
			familyPath: ['attributes', root_by_type_key],
			selectedVariantKey: variant.variantCode
		}, variant, warnings)
		: null;
	({raw, source} = applyCandidate(raw, source, root_by_type));

	let attributes_by_type_match = resolveByTypeMap(asset_object.attributesByType, variant.codePath);
	if (attributes_by_type_match && isPlainObject(attributes_by_type_match.value)) {
		let matched_attributes = attributes_by_type_match.value;
		if (isPlainObject(matched_attributes[ATTACHABLE_TO_ENTITY_KEY])) {
			({raw, source} = applyCandidate(raw, source, {
				raw: matched_attributes[ATTACHABLE_TO_ENTITY_KEY],
				source: {
					sourceKind: 'attributesByType.attachableToEntity',
					familyPath: ['attributesByType'],
					parentPattern: attributes_by_type_match.matchedPattern,
					matchedPattern: attributes_by_type_match.matchedPattern,
					selectedVariantKey: variant.variantCode,
					sourcePath: `root.attributesByType[${JSON.stringify(attributes_by_type_match.matchedPattern)}].attachableToEntity`,
					sourceMapPath: 'root.attributesByType',
					exact: attributes_by_type_match.exact,
					inherited: attributes_by_type_match.inherited,
					fallback: attributes_by_type_match.fallback,
					isByType: true
				}
			}));
		}
		let nested_by_type_key = findExistingKey(matched_attributes, ATTACHABLE_TO_ENTITY_BY_TYPE_KEYS);
		if (nested_by_type_key) {
			let nested_candidate = attachableCandidateFromByTypeMap(matched_attributes[nested_by_type_key], {
				sourceKind: 'attributesByType.attachableToEntityByType',
				familyPath: ['attributesByType', attributes_by_type_match.matchedPattern, nested_by_type_key],
				parentPattern: attributes_by_type_match.matchedPattern,
				selectedVariantKey: variant.variantCode
			}, variant, warnings);
			({raw, source} = applyCandidate(raw, source, nested_candidate));
		}
	}

	if (!source || !isPlainObject(raw)) return null;
	return makeResolvedAttachment(raw, source, variant, resolve_shape_ref, warnings);
}

function attachableValueForWrite(value) {
	let output = isPlainObject(value?.value) ? cloneJSON(value.value) : cloneJSON(value || {});
	if (value?.categoryCode !== undefined) output.categoryCode = value.categoryCode;
	if (Array.isArray(value?.slots)) {
		let slots = {};
		value.slots.filter(slot => !slot.deleted).forEach(slot => {
			let slot_code = String(slot.slotCode || '').trim();
			if (!slot_code) return;
			let shape_ref = isPlainObject(slot.shapeRef) ? cloneJSON(slot.shapeRef) : {};
			let base = String(slot.resolvedShapeBase || normalizeCompositeBase(shape_ref) || '').trim();
			if (base) shape_ref.base = base;
			slots[slot_code] = shape_ref;
		});
		if (Object.keys(slots).length) output[ATTACHED_SHAPE_BY_SLOT_CODE_KEY] = slots;
		else delete output[ATTACHED_SHAPE_BY_SLOT_CODE_KEY];
	}
	return output;
}

export function applyAttachmentEditToAssetObject(asset_object, source, attachment_value) {
	if (!source || !asset_object) return false;
	let value = attachableValueForWrite(attachment_value);
	if (source.deleteOverride && source.isByType) {
		if (source.sourceKind === 'attributesByType.attachableToEntity') {
			let map = asset_object.attributesByType;
			if (isPlainObject(map) && isPlainObject(map[source.selectedVariantKey])) delete map[source.selectedVariantKey][ATTACHABLE_TO_ENTITY_KEY];
			return true;
		}
		let map_parent_path = source.familyPath.slice(0, -1);
		let map_key = source.familyPath[source.familyPath.length - 1];
		let map_parent = getOrCreateContainer(asset_object, map_parent_path);
		if (isPlainObject(map_parent[map_key])) delete map_parent[map_key][source.selectedVariantKey];
		return true;
	}

	if (source.sourceKind === 'attributes.attachableToEntity') {
		let attributes = getOrCreateContainer(asset_object, ['attributes']);
		attributes[ATTACHABLE_TO_ENTITY_KEY] = value;
		return true;
	}

	if (source.sourceKind === 'attributesByType.attachableToEntity') {
		if (!isPlainObject(asset_object.attributesByType)) asset_object.attributesByType = {};
		let target_key = source.editTargetKey || (source.exact ? source.matchedPattern : source.selectedVariantKey);
		if (!target_key) target_key = source.selectedVariantKey || source.matchedPattern || '*';
		if (!isPlainObject(asset_object.attributesByType[target_key])) asset_object.attributesByType[target_key] = {};
		asset_object.attributesByType[target_key][ATTACHABLE_TO_ENTITY_KEY] = value;
		return true;
	}

	let family_path = source.familyPath || [];
	if (!family_path.length) return false;
	let parent_path = family_path.slice(0, -1);
	let key = family_path[family_path.length - 1];
	let parent = getOrCreateContainer(asset_object, parent_path);
	if (!isPlainObject(parent[key])) parent[key] = {};
	let target_key = source.editTargetKey || (source.exact ? source.matchedPattern : source.selectedVariantKey);
	if (!target_key) target_key = source.selectedVariantKey || source.matchedPattern || '*';
	parent[key][target_key] = value;
	return true;
}

export function makeAttachmentEditSource(attachment, mode = 'override') {
	let source = cloneJSON(attachment?.sourcePointer || attachment || {});
	if (source.isByType) {
		if (mode === 'shared') {
			source.editTargetKey = source.matchedPattern;
		} else if (mode === 'override') {
			source.editTargetKey = source.selectedVariantKey;
			source.matchedPattern = source.selectedVariantKey;
			source.exact = true;
			source.inherited = false;
			source.fallback = false;
		}
	}
	return source;
}

export function cloneVintageStoryAttachments(attachment) {
	return cloneJSON(attachment || null);
}

export function attachmentSourceLabel(attachment) {
	let source = attachment?.sourcePointer || attachment;
	if (!source) return '';
	if (source.sourceKind === 'attributes.attachableToEntity') return 'attributes.attachableToEntity';
	if (source.sourceKind === 'attributesByType.attachableToEntity') {
		return `attributesByType[${JSON.stringify(source.matchedPattern || source.parentPattern)}].attachableToEntity`;
	}
	if (source.sourceKind === 'attributes.attachableToEntityByType') {
		return `attributes.attachableToEntityByType[${JSON.stringify(source.matchedPattern)}]`;
	}
	if (source.sourceKind === 'attributesByType.attachableToEntityByType') {
		return `attributesByType[${JSON.stringify(source.parentPattern)}].attachableToEntityByType[${JSON.stringify(source.matchedPattern)}]`;
	}
	return source.sourcePath || '';
}

export function validateVintageStoryAttachment(attachment, options = {}) {
	let warnings = [];
	if (!attachment) return warnings;
	if (!String(attachment.categoryCode || '').trim()) {
		addWarning(warnings, `${attachmentSourceLabel(attachment) || 'attachableToEntity'} is missing categoryCode.`);
	}
	(attachment.slots || []).filter(slot => !slot.deleted).forEach(slot => {
		if (!String(slot.slotCode || '').trim()) addWarning(warnings, 'attachedShapeBySlotCode has an empty slot code.');
		let base = slot.resolvedShapeBase || normalizeCompositeBase(slot.shapeRef);
		if (base && isAbsoluteFilesystemPath(base)) addWarning(warnings, `Attachment slot "${slot.slotCode || '?'}" uses an absolute filesystem path.`);
		if (!base) addWarning(warnings, `Attachment slot "${slot.slotCode || '?'}" has no shape base path.`);
		if (slot.missing) addWarning(warnings, `Attachment slot "${slot.slotCode || '?'}" references a missing shape: ${base || '(empty)'}.`);
	});
	let source = attachment.sourcePointer || {};
	if (source.isByType && source.matchedPattern && Array.isArray(options.variants)) {
		let matches = options.variants.filter(variant => wildcardMatch(source.matchedPattern, variant.variantCode || variant.codePath || variant.code));
		if (!matches.length) addWarning(warnings, `${source.sourceMapPath || 'attachableToEntityByType'}[${JSON.stringify(source.matchedPattern)}] matches no generated variants.`);
		let exact = options.variants.find(variant => String(variant.variantCode || '').toLowerCase() === String(source.matchedPattern).toLowerCase());
		if (exact && exact.included === false) addWarning(warnings, `${source.sourceMapPath || 'attachableToEntityByType'}[${JSON.stringify(source.matchedPattern)}] targets a skipped or disallowed variant.`);
		if ((source.inherited || source.fallback || String(source.matchedPattern).includes('*')) && matches.length > 1) {
			addWarning(warnings, `${source.sourceMapPath || 'attachableToEntityByType'}[${JSON.stringify(source.matchedPattern)}] affects ${matches.length} variants; edit the shared rule only intentionally.`);
		}
	}
	return Array.from(new Set(warnings));
}
