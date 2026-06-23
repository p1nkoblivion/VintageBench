import {
	cloneJSON,
	fillPlaceholdersDeep,
	isPlainObject,
	resolveByTypeMap,
	wildcardMatch
} from './vs_variant_resolver.js';

export const VS_INTERACTION_BOX_ROOT_FAMILIES = [
	{
		id: 'collisionbox',
		label: 'Collision',
		kind: 'collision',
		valueKind: 'single',
		keys: ['collisionbox'],
		byTypeKeys: ['collisionboxByType', 'collisionboxbyType', 'collisionboxbytype']
	},
	{
		id: 'collisionboxes',
		label: 'Collision Boxes',
		kind: 'collision',
		valueKind: 'array',
		keys: ['collisionboxes'],
		byTypeKeys: ['collisionboxesByType', 'collisionboxesbyType', 'collisionboxesbytype']
	},
	{
		id: 'selectionbox',
		label: 'Selection',
		kind: 'selection',
		valueKind: 'single',
		keys: ['selectionbox'],
		byTypeKeys: ['selectionboxByType', 'selectionboxbyType', 'selectionboxbytype']
	},
	{
		id: 'selectionboxes',
		label: 'Selection Boxes',
		kind: 'selection',
		valueKind: 'array',
		keys: ['selectionboxes'],
		byTypeKeys: ['selectionboxesByType', 'selectionboxesbyType', 'selectionboxesbytype']
	},
	{
		id: 'collisionSelectionBox',
		label: 'Collision + Selection',
		kind: 'combined',
		valueKind: 'single',
		keys: ['collisionSelectionBox', 'collisionselectionbox'],
		byTypeKeys: [
			'collisionSelectionBoxByType',
			'collisionselectionBoxByType',
			'collisionselectionboxByType',
			'collisionselectionboxbytype'
		]
	},
	{
		id: 'collisionSelectionBoxes',
		label: 'Collision + Selection Boxes',
		kind: 'combined',
		valueKind: 'array',
		keys: ['collisionSelectionBoxes', 'collisionSelectionboxes', 'collisionselectionboxes'],
		byTypeKeys: [
			'collisionSelectionBoxesByType',
			'collisionSelectionboxesByType',
			'collisionselectionBoxesByType',
			'collisionselectionboxesByType',
			'collisionselectionboxesbytype'
		]
	}
];

export const VS_INTERACTION_BOX_BEHAVIOR_FAMILIES = [
	{
		id: 'behavior.selectionBox',
		label: 'Behavior Selection',
		kind: 'selection',
		valueKind: 'single',
		keys: ['selectionBox'],
		byTypeKeys: ['selectionBoxByType', 'selectionboxByType', 'selectionboxbytype']
	},
	{
		id: 'behavior.selectionBoxes',
		label: 'Behavior Selection Boxes',
		kind: 'selection',
		valueKind: 'array',
		keys: ['selectionBoxes'],
		byTypeKeys: ['selectionBoxesByType', 'selectionboxesByType', 'selectionboxesbytype']
	},
	{
		id: 'behavior.collisionBox',
		label: 'Behavior Collision',
		kind: 'collision',
		valueKind: 'single',
		keys: ['collisionBox'],
		byTypeKeys: ['collisionBoxByType', 'collisionboxByType', 'collisionboxbytype']
	},
	{
		id: 'behavior.collisionBoxes',
		label: 'Behavior Collision Boxes',
		kind: 'collision',
		valueKind: 'array',
		keys: ['collisionBoxes'],
		byTypeKeys: ['collisionBoxesByType', 'collisionboxesByType', 'collisionboxesbytype']
	}
];

const AXES = ['x', 'y', 'z'];
const BOX_COORDS = ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'];
const GROUND_STORABLE_BEHAVIOR_NAME = 'GroundStorable';
const ROOT_ROTATE_Y_KEYS = ['rotateY', 'rotatey'];
const ROOT_ROTATE_Y_BYTYPE_KEYS = ['rotateYByType', 'rotateyByType', 'rotateybytype'];

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

function getOrCreateContainer(root, path) {
	let current = root;
	for (let i = 0; i < path.length; i++) {
		let part = path[i];
		let next_part = path[i + 1];
		if (typeof part === 'number') {
			if (!Array.isArray(current)) return current;
			if (!isPlainObject(current[part]) && !Array.isArray(current[part])) {
				current[part] = typeof next_part === 'number' ? [] : {};
			}
			current = current[part];
			continue;
		}
		if (typeof next_part === 'number') {
			if (!Array.isArray(current[part])) current[part] = [];
		} else if (!isPlainObject(current[part])) {
			current[part] = {};
		}
		current = current[part];
	}
	return current;
}

function getAtPath(root, path) {
	let current = root;
	for (let part of path) {
		if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
		current = current[part];
	}
	return current;
}

function findExistingKey(object, keys = []) {
	if (!isPlainObject(object)) return '';
	for (let key of keys) {
		if (Object.prototype.hasOwnProperty.call(object, key)) return key;
	}
	let lower_keys = keys.map(key => key.toLowerCase());
	return Object.keys(object).find(key => lower_keys.includes(key.toLowerCase())) || '';
}

function hasFamilyEntry(object, family) {
	return !!(findExistingKey(object, family.keys) || findExistingKey(object, family.byTypeKeys));
}

function isBoxLike(value) {
	return value === null || isPlainObject(value);
}

function sourcePathFor(source, array_index = null) {
	let path = source.isByType
		? `${makePathString(source.familyPath)}[${JSON.stringify(source.matchedPattern)}]`
		: makePathString(source.familyPath);
	if (array_index !== null && array_index !== undefined) path += `[${array_index}]`;
	return path;
}

function normalizeRootRotateYSource(value, source, warnings) {
	let number = typeof value === 'number' && Number.isFinite(value)
		? value
		: (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
	if (!Number.isFinite(number)) {
		addWarning(warnings, `${source.sourcePath} must be a numeric rotateY value.`);
		return null;
	}
	return Object.assign({}, source, {value: number});
}

function resolveRootRotateY(asset_object, variant, warnings) {
	let by_type_key = findExistingKey(asset_object, ROOT_ROTATE_Y_BYTYPE_KEYS);
	let direct_key = findExistingKey(asset_object, ROOT_ROTATE_Y_KEYS);
	let by_type_map = by_type_key ? asset_object[by_type_key] : undefined;
	let match = resolveByTypeMap(by_type_map, variant.codePath);
	if (match) {
		let family_path = [by_type_key];
		return normalizeRootRotateYSource(fillPlaceholdersDeep(match.value, variant.states), {
			family: 'rotateY',
			fieldKey: by_type_key,
			familyPath: family_path,
			sourcePath: `${makePathString(family_path)}[${JSON.stringify(match.matchedPattern)}]`,
			sourceMapPath: makePathString(family_path),
			isByType: true,
			matchedPattern: match.matchedPattern,
			selectedVariantKey: variant.variantCode,
			exact: match.exact,
			inherited: match.inherited,
			fallback: match.fallback
		}, warnings);
	}
	if (direct_key) {
		let family_path = [direct_key];
		return normalizeRootRotateYSource(fillPlaceholdersDeep(cloneJSON(asset_object[direct_key]), variant.states), {
			family: 'rotateY',
			fieldKey: direct_key,
			familyPath: family_path,
			sourcePath: makePathString(family_path),
			sourceMapPath: makePathString(family_path),
			isByType: false,
			matchedPattern: null,
			selectedVariantKey: variant.variantCode,
			exact: true,
			inherited: false,
			fallback: false
		}, warnings);
	}
	return null;
}

function normalizeBoxEntries(raw_value, source, warnings) {
	let values = Array.isArray(raw_value) ? raw_value : [raw_value];
	return values.map((raw, index) => {
		let entry_warnings = [];
		if (!isBoxLike(raw)) {
			entry_warnings.push(`${source.label} has a non-object box value.`);
		}
		let value = cloneJSON(raw);
		if (value !== null && !isPlainObject(value)) value = {};
		validateBoxValue(value, entry_warnings);
		entry_warnings.forEach(warning => addWarning(warnings, warning));
		let array_index = Array.isArray(raw_value) ? index : null;
		return {
			id: `${source.ownerKind}:${source.family}:${source.isByType ? source.matchedPattern : 'global'}:${array_index ?? 0}:${source.behaviorIndex ?? 'root'}`,
			label: `${source.label}${array_index !== null ? ` #${array_index + 1}` : ''}`,
			ownerKind: source.ownerKind,
			ownerPath: cloneJSON(source.ownerPath || []),
			behaviorIndex: source.behaviorIndex,
			behaviorName: source.behaviorName,
			kind: source.kind,
			family: source.family,
			fieldKey: source.fieldKey,
			valueKind: source.valueKind,
			variantMode: source.isByType ? 'byType' : 'global',
			matchedPattern: source.matchedPattern,
			selectedVariantCode: source.selectedVariantKey,
			inherited: !!source.inherited,
			exact: !!source.exact,
			fallback: !!source.fallback,
			isByType: !!source.isByType,
			editTargetKey: source.exact ? source.matchedPattern : null,
			arrayIndex: array_index,
			value,
			assetRotateY: source.assetRotateY ? cloneJSON(source.assetRotateY) : undefined,
			sourcePath: sourcePathFor(source, array_index),
			sourceMapPath: makePathString(source.familyPath),
			sourcePointer: {
				ownerKind: source.ownerKind,
				ownerPath: cloneJSON(source.ownerPath || []),
				behaviorIndex: source.behaviorIndex,
				behaviorName: source.behaviorName,
				family: source.family,
				kind: source.kind,
				valueKind: source.valueKind,
				fieldKey: source.fieldKey,
				familyPath: cloneJSON(source.familyPath),
				isByType: !!source.isByType,
				matchedPattern: source.matchedPattern,
				selectedVariantKey: source.selectedVariantKey,
				exact: !!source.exact,
				inherited: !!source.inherited,
				fallback: !!source.fallback,
				editTargetKey: source.exact ? source.matchedPattern : null,
				arrayIndex: array_index,
				overrideBaseValue: Array.isArray(raw_value) ? cloneJSON(raw_value) : undefined,
				assetRotateY: source.assetRotateY ? cloneJSON(source.assetRotateY) : undefined,
				sourcePath: sourcePathFor(source, array_index),
				sourceMapPath: makePathString(source.familyPath)
			},
			warnings: entry_warnings
		};
	});
}

function resolveFamily(container, owner, family, variant, warnings) {
	let by_type_key = findExistingKey(container, family.byTypeKeys);
	let direct_key = findExistingKey(container, family.keys);
	let by_type_map = by_type_key ? container[by_type_key] : undefined;
	let match = resolveByTypeMap(by_type_map, variant.codePath);
	if (match) {
		let value = fillPlaceholdersDeep(match.value, variant.states);
		return normalizeBoxEntries(value, {
			ownerKind: owner.kind,
			ownerPath: owner.path,
			behaviorIndex: owner.behaviorIndex,
			behaviorName: owner.behaviorName,
			family: family.id,
			label: family.label,
			kind: family.kind,
			valueKind: Array.isArray(value) ? 'array' : family.valueKind,
			fieldKey: by_type_key,
			familyPath: owner.path.concat(by_type_key),
			isByType: true,
			matchedPattern: match.matchedPattern,
			selectedVariantKey: variant.variantCode,
			exact: match.exact,
			inherited: match.inherited,
			fallback: match.fallback,
			assetRotateY: owner.assetRotateY
		}, warnings);
	}
	if (direct_key) {
		let value = fillPlaceholdersDeep(cloneJSON(container[direct_key]), variant.states);
		return normalizeBoxEntries(value, {
			ownerKind: owner.kind,
			ownerPath: owner.path,
			behaviorIndex: owner.behaviorIndex,
			behaviorName: owner.behaviorName,
			family: family.id,
			label: family.label,
			kind: family.kind,
			valueKind: Array.isArray(value) ? 'array' : family.valueKind,
			fieldKey: direct_key,
			familyPath: owner.path.concat(direct_key),
			isByType: false,
			matchedPattern: null,
			selectedVariantKey: variant.variantCode,
			exact: true,
			inherited: false,
			fallback: false,
			assetRotateY: owner.assetRotateY
		}, warnings);
	}
	return [];
}

export function resolveVintageStoryInteractionBoxes(asset_object, variant, warnings = []) {
	let boxes = [];
	if (!isPlainObject(asset_object) || !variant) return boxes;
	let root_owner = {kind: 'root', path: [], assetRotateY: resolveRootRotateY(asset_object, variant, warnings)};
	VS_INTERACTION_BOX_ROOT_FAMILIES.forEach(family => {
		boxes.push(...resolveFamily(asset_object, root_owner, family, variant, warnings));
	});

	if (Array.isArray(asset_object.behaviors)) {
		asset_object.behaviors.forEach((behavior, index) => {
			let properties = behavior?.properties;
			let behavior_name = behavior?.name || behavior?.Name || `Behavior ${index + 1}`;
			if (!isPlainObject(properties)) {
				if (String(behavior_name).toLowerCase() === GROUND_STORABLE_BEHAVIOR_NAME.toLowerCase()) {
					addWarning(warnings, `behaviors[${behavior_name}].properties is missing; GroundStorable selection/collision boxes cannot be resolved.`);
				}
				return;
			}
			let owner = {
				kind: 'behavior',
				path: ['behaviors', index, 'properties'],
				behaviorIndex: index,
				behaviorName: behavior_name
			};
			VS_INTERACTION_BOX_BEHAVIOR_FAMILIES.forEach(family => {
				boxes.push(...resolveFamily(properties, owner, family, variant, warnings));
			});
			if (String(behavior_name).toLowerCase() === GROUND_STORABLE_BEHAVIOR_NAME.toLowerCase()) {
				let has_selection = VS_INTERACTION_BOX_BEHAVIOR_FAMILIES
					.filter(family => family.kind === 'selection')
					.some(family => hasFamilyEntry(properties, family));
				let has_collision = VS_INTERACTION_BOX_BEHAVIOR_FAMILIES
					.filter(family => family.kind === 'collision')
					.some(family => hasFamilyEntry(properties, family));
				if (!has_selection) addWarning(warnings, `behaviors[${behavior_name}].properties has no selectionBox or selectionBoxes.`);
				if (!has_collision) addWarning(warnings, `behaviors[${behavior_name}].properties has no collisionBox or collisionBoxes.`);
			}
		});
	}
	return boxes;
}

function setArrayValue(parent, key, source, value) {
	if (!Array.isArray(parent[key])) parent[key] = [];
	let index = Number.isInteger(source.arrayIndex) ? source.arrayIndex : parent[key].length;
	if (source.deleteBox) {
		parent[key].splice(index, 1);
		if (!parent[key].length) delete parent[key];
		return;
	}
	parent[key][index] = cloneJSON(value);
}

function setFieldValue(parent, key, source, value) {
	if (source.deleteBox) {
		delete parent[key];
		return;
	}
	if (Number.isInteger(source.arrayIndex) || source.valueKind === 'array' || Array.isArray(parent[key])) {
		setArrayValue(parent, key, source, value);
		return;
	}
	parent[key] = cloneJSON(value);
}

export function applyInteractionBoxEditToAssetObject(asset_object, source, box_value) {
	if (!source || !asset_object) return false;
	let family_path = source.familyPath || [];
	if (!family_path.length) return false;
	let parent_path = family_path.slice(0, -1);
	let key = family_path[family_path.length - 1];
	let parent = getOrCreateContainer(asset_object, parent_path);
	if (source.deleteOverride && source.isByType) {
		if (isPlainObject(parent[key])) delete parent[key][source.selectedVariantKey];
		return true;
	}
	if (source.isByType) {
		if (!isPlainObject(parent[key])) parent[key] = {};
		let target_key = source.editTargetKey || (source.exact ? source.matchedPattern : source.selectedVariantKey);
		if (!target_key) target_key = source.selectedVariantKey;
		let current = parent[key][target_key];
		if (source.deleteBox) {
			if (Number.isInteger(source.arrayIndex) && Array.isArray(current)) {
				current.splice(source.arrayIndex, 1);
				if (!current.length) delete parent[key][target_key];
			} else {
				delete parent[key][target_key];
			}
			return true;
		}
		if (Number.isInteger(source.arrayIndex) || source.valueKind === 'array' || Array.isArray(current)) {
			if (!Array.isArray(parent[key][target_key])) {
				parent[key][target_key] = Array.isArray(current)
					? current
					: (Array.isArray(source.overrideBaseValue) ? cloneJSON(source.overrideBaseValue) : []);
			}
			let index = Number.isInteger(source.arrayIndex) ? source.arrayIndex : parent[key][target_key].length;
			parent[key][target_key][index] = cloneJSON(box_value);
		} else {
			parent[key][target_key] = cloneJSON(box_value);
		}
		return true;
	}
	setFieldValue(parent, key, source, box_value);
	return true;
}

export function makeInteractionBoxEditSource(box, mode = 'override') {
	let source = cloneJSON(box?.sourcePointer || box || {});
	if (source.isByType) {
		if (mode === 'shared') {
			source.editTargetKey = source.matchedPattern;
		} else if (mode === 'override') {
			source.editTargetKey = source.selectedVariantKey;
			source.arrayIndex = Number.isInteger(source.arrayIndex) ? source.arrayIndex : null;
		}
	}
	return source;
}

export function makeFullBlockInteractionBox() {
	return {x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1};
}

export function makeNoCollisionInteractionBox() {
	return null;
}

export function makeInteractionBoxSourceForNew(field_key, options = {}) {
	let owner_path = Array.isArray(options.ownerPath) ? options.ownerPath : [];
	let is_by_type = !!options.isByType;
	let selected_variant = options.selectedVariantKey || options.selectedVariantCode || '*';
	let target_key = is_by_type ? (options.editTargetKey || selected_variant || '*') : null;
	return {
		ownerKind: options.ownerKind || (owner_path[0] === 'behaviors' ? 'behavior' : 'root'),
		ownerPath: cloneJSON(owner_path),
		behaviorIndex: options.behaviorIndex,
		behaviorName: options.behaviorName,
		family: options.family || field_key,
		kind: options.kind || 'collision',
		valueKind: options.valueKind || 'single',
		fieldKey: field_key,
		familyPath: owner_path.concat(field_key),
		isByType: is_by_type,
		matchedPattern: is_by_type ? target_key : null,
		selectedVariantKey: selected_variant,
		exact: !is_by_type || target_key === selected_variant,
		inherited: false,
		fallback: target_key === '*',
		editTargetKey: target_key,
		arrayIndex: Number.isInteger(options.arrayIndex) ? options.arrayIndex : null
	};
}

export function cloneInteractionBoxes(boxes = []) {
	return cloneJSON(boxes || []);
}

export function validateBoxValue(value, warnings = []) {
	if (value === null) return warnings;
	if (!isPlainObject(value)) {
		addWarning(warnings, 'Box value must be an object or null.');
		return warnings;
	}
	BOX_COORDS.forEach(coord => {
		if (value[coord] === undefined) addWarning(warnings, `Box is missing ${coord}.`);
	});
	let numeric = BOX_COORDS.every(coord => typeof value[coord] === 'number' && Number.isFinite(value[coord]));
	if (!numeric) return warnings;
	AXES.forEach(axis => {
		if (value[`${axis}1`] > value[`${axis}2`]) {
			addWarning(warnings, `Box has ${axis}1 greater than ${axis}2.`);
		}
		if (value[`${axis}1`] === value[`${axis}2`]) {
			addWarning(warnings, `Box has zero ${axis.toUpperCase()} size.`);
		}
	});
	BOX_COORDS.forEach(coord => {
		if (value[coord] < 0 || value[coord] > 1) {
			addWarning(warnings, `Box ${coord} is outside the usual 0..1 block range.`);
		}
		if (value[coord] < -1 || value[coord] > 2) {
			addWarning(warnings, `Box ${coord} is far outside normal block space.`);
		}
	});
	return warnings;
}

function isFullBox(value) {
	return isPlainObject(value)
		&& value.x1 === 0 && value.y1 === 0 && value.z1 === 0
		&& value.x2 === 1 && value.y2 === 1 && value.z2 === 1;
}

export function validateVintageStoryInteractionBoxes(boxes = [], options = {}) {
	let warnings = [];
	let collision_boxes = boxes.filter(box => box.kind === 'collision');
	let selection_boxes = boxes.filter(box => box.kind === 'selection');
	boxes.forEach(box => {
		(box.warnings || []).forEach(warning => addWarning(warnings, `${box.label}: ${warning}`));
		validateBoxValue(box.value, warnings);
		if (box.missingBehavior || box.sourcePointer?.missingBehavior) {
			addWarning(warnings, `${box.label || 'Behavior box'} targets ${box.behaviorName || 'a behavior'} that is not present in the asset.`);
		}
		if (box.isByType && box.matchedPattern && Array.isArray(options.variants)) {
			let matches = options.variants.filter(variant => wildcardMatch(box.matchedPattern, variant.variantCode || variant.codePath || variant.code));
			if (!matches.length) addWarning(warnings, `${box.sourceMapPath}[${JSON.stringify(box.matchedPattern)}] matches no generated variants.`);
			let exact = options.variants.find(variant => String(variant.variantCode || '').toLowerCase() === String(box.matchedPattern).toLowerCase());
			if (exact && exact.included === false) addWarning(warnings, `${box.sourceMapPath}[${JSON.stringify(box.matchedPattern)}] targets a skipped or disallowed variant.`);
			if ((box.inherited || box.fallback || String(box.matchedPattern).includes('*')) && matches.length > 1) {
				addWarning(warnings, `${box.sourceMapPath}[${JSON.stringify(box.matchedPattern)}] affects ${matches.length} variants; edit the shared rule only intentionally.`);
			}
		}
		let rotate_source = box.assetRotateY || box.sourcePointer?.assetRotateY;
		if (rotate_source?.isByType && rotate_source.matchedPattern && Array.isArray(options.variants)) {
			let matches = options.variants.filter(variant => wildcardMatch(rotate_source.matchedPattern, variant.variantCode || variant.codePath || variant.code));
			if (!matches.length) addWarning(warnings, `${rotate_source.sourceMapPath}[${JSON.stringify(rotate_source.matchedPattern)}] matches no generated variants.`);
			let exact = options.variants.find(variant => String(variant.variantCode || '').toLowerCase() === String(rotate_source.matchedPattern).toLowerCase());
			if (exact && exact.included === false) addWarning(warnings, `${rotate_source.sourceMapPath}[${JSON.stringify(rotate_source.matchedPattern)}] targets a skipped or disallowed variant.`);
			if ((rotate_source.inherited || rotate_source.fallback || String(rotate_source.matchedPattern).includes('*')) && matches.length > 1) {
				addWarning(warnings, `${rotate_source.sourceMapPath}[${JSON.stringify(rotate_source.matchedPattern)}] affects ${matches.length} variants; rotateY is a shared block-level rule.`);
			}
		}
	});
	if (collision_boxes.some(box => box.value === null) && selection_boxes.some(box => isFullBox(box.value))) {
		addWarning(warnings, 'Collision is disabled while selection remains a full cube.');
	}
	if (collision_boxes.length > 1 && !selection_boxes.length) {
		addWarning(warnings, 'Multiple collision boxes are defined without matching selection boxes.');
	}
	return Array.from(new Set(warnings));
}

export function interactionBoxFromModelBounds(bounds) {
	if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) return null;
	return {
		x1: bounds.min[0] / 16,
		y1: bounds.min[1] / 16,
		z1: bounds.min[2] / 16,
		x2: bounds.max[0] / 16,
		y2: bounds.max[1] / 16,
		z2: bounds.max[2] / 16
	};
}

export function interactionBoxSourceLabel(box) {
	if (!box) return '';
	let prefix = box.ownerKind === 'behavior'
		? `behaviors[${box.behaviorName || box.behaviorIndex || 0}].properties`
		: 'root';
	let key = box.fieldKey || box.family;
	if (box.isByType) return `${prefix}.${key}[${JSON.stringify(box.matchedPattern)}]`;
	return `${prefix}.${key}`;
}

export function getInteractionBoxValueAtSource(asset_object, source) {
	if (!source?.familyPath?.length) return undefined;
	let value = getAtPath(asset_object, source.familyPath);
	if (source.isByType && isPlainObject(value)) value = value[source.editTargetKey || source.matchedPattern];
	if (Number.isInteger(source.arrayIndex) && Array.isArray(value)) value = value[source.arrayIndex];
	return cloneJSON(value);
}
