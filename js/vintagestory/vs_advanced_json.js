import {
	createVintageStoryAssetDocument,
	extractVintageStoryAssetObjects,
	parseVintageStoryAssetText,
	serializeVintageStoryAssetDocument
} from './vs_asset_document.js';
import { VS_ASSET_TRANSFORM_FAMILIES } from './vs_asset_resolver.js';
import { cloneJSON, isPlainObject } from './vs_variant_resolver.js';

export const VS_ADVANCED_JSON_SECTION_IDS = {
	ROOT: 'root',
	ATTRIBUTES: 'attributes',
	ATTRIBUTES_BY_TYPE: 'attributesByType',
	BEHAVIORS: 'behaviors',
	TRANSFORM_MAPS: 'transformMaps'
};

const ROOT_CONTROLLED_KEYS = new Set([
	'code',
	'class',
	'entityclass',
	'variantgroups',
	'allowedvariants',
	'skipvariants',
	'shape',
	'shapebytype',
	'textures',
	'texturesbytype',
	'creativeinventory',
	'creativeinventorybytype',
	'attributes',
	'attributesbytype',
	'behaviors',
	'collisionbox',
	'collisionboxes',
	'collisionboxbytype',
	'collisionboxesbytype',
	'selectionbox',
	'selectionboxes',
	'selectionboxbytype',
	'selectionboxesbytype',
	'guiTransform'.toLowerCase(),
	'guiTransformByType'.toLowerCase(),
	'groundTransform'.toLowerCase(),
	'groundTransformByType'.toLowerCase(),
	'fpHandTransform'.toLowerCase(),
	'fpHandTransformByType'.toLowerCase(),
	'tpHandTransform'.toLowerCase(),
	'tpHandTransformByType'.toLowerCase(),
	'tpOffHandTransform'.toLowerCase(),
	'tpOffHandTransformByType'.toLowerCase(),
	'toolrackTransform'.toLowerCase(),
	'toolrackTransformByType'.toLowerCase()
]);

const ATTRIBUTE_TRANSFORM_KEYS = new Set(
	VS_ASSET_TRANSFORM_FAMILIES
		.filter(family => family.location === 'attributes')
		.flatMap(family => [family.jsonKey.toLowerCase(), (family.mapKey || `${family.jsonKey}ByType`).toLowerCase()])
);

const KNOWN_UNCONTROLLED_ROOT_KEYS = new Map([
	['attackpower', 'combat stat'],
	['attackpowerbytype', 'combat stat ByType map'],
	['durability', 'durability stat'],
	['durabilitybytype', 'durability ByType map'],
	['tooltier', 'tool tier stat'],
	['tooltierbytype', 'tool tier ByType map'],
	['miningspeed', 'mining speed stat'],
	['miningspeedbytype', 'mining speed ByType map'],
	['damagedby', 'damage rules'],
	['handbook', 'handbook metadata'],
	['handbookbytype', 'handbook ByType metadata'],
	['nutritionprops', 'nutrition properties'],
	['nutritionpropsbytype', 'nutrition ByType properties'],
	['transitionableprops', 'transition properties'],
	['transitionablepropsbytype', 'transition ByType properties'],
	['combustibleprops', 'combustible properties'],
	['combustiblepropsbytype', 'combustible ByType properties'],
	['grindingprops', 'grinding properties'],
	['grindingpropsbytype', 'grinding ByType properties'],
	['crushingprops', 'crushing properties'],
	['crushingpropsbytype', 'crushing ByType properties']
]);

function sectionIdForBehaviorProperties(index) {
	return `behaviorProperties:${index}`;
}

function behaviorIndexFromSectionId(section_id) {
	let match = String(section_id || '').match(/^behaviorProperties:(\d+)$/);
	return match ? Number(match[1]) : -1;
}

export function vintageStoryJsonPath(path = []) {
	let output = 'root';
	path.forEach(part => {
		if (typeof part === 'number') {
			output += `[${part}]`;
		} else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(part))) {
			output += `.${part}`;
		} else {
			output += `[${JSON.stringify(part)}]`;
		}
	});
	return output;
}

function valueAtPath(root, path = []) {
	let cursor = root;
	for (let part of path) {
		if (cursor === undefined || cursor === null) return undefined;
		cursor = cursor[part];
	}
	return cursor;
}

function ensureContainerAtPath(root, path = []) {
	let cursor = root;
	for (let i = 0; i < path.length; i++) {
		let part = path[i];
		let next_part = path[i + 1];
		if (!isPlainObject(cursor[part]) && !Array.isArray(cursor[part])) {
			cursor[part] = typeof next_part === 'number' ? [] : {};
		}
		cursor = cursor[part];
	}
	return cursor;
}

function setValueAtPath(root, path = [], value) {
	if (!path.length) return cloneJSON(value);
	let output = cloneJSON(root || {});
	let parent = ensureContainerAtPath(output, path.slice(0, -1));
	parent[path[path.length - 1]] = cloneJSON(value);
	return output;
}

function deleteValueAtPath(root, path = []) {
	if (!path.length) return {};
	let output = cloneJSON(root || {});
	let parent = valueAtPath(output, path.slice(0, -1));
	if (parent && Object.prototype.hasOwnProperty.call(parent, path[path.length - 1])) {
		delete parent[path[path.length - 1]];
	}
	return output;
}

export function formatVintageStoryAdvancedJson(value) {
	return `${JSON.stringify(value ?? {}, null, '\t')}\n`;
}

function parseAdvancedJsonText(text, section = {}) {
	try {
		let value = parseVintageStoryAssetText(String(text || ''), section.label || 'Advanced JSON');
		if (section.valueType === 'object' && !isPlainObject(value)) {
			return {value: null, errors: [`${section.label || 'Advanced JSON'} must be a JSON object.`]};
		}
		if (section.valueType === 'array' && !Array.isArray(value)) {
			return {value: null, errors: [`${section.label || 'Advanced JSON'} must be a JSON array.`]};
		}
		return {value, errors: []};
	} catch (error) {
		return {value: null, errors: [error.message || String(error)]};
	}
}

function behaviorName(behavior, index) {
	return behavior?.name || behavior?.Name || `Behavior ${index + 1}`;
}

export function getVintageStoryAdvancedAssetSections(asset_object = {}) {
	let sections = [
		{
			id: VS_ADVANCED_JSON_SECTION_IDS.ROOT,
			label: 'Root Asset JSON',
			description: 'Full item/block asset object.',
			valueType: 'object',
			path: []
		},
		{
			id: VS_ADVANCED_JSON_SECTION_IDS.ATTRIBUTES,
			label: 'attributes',
			description: 'Root attributes object.',
			valueType: 'object',
			path: ['attributes']
		},
		{
			id: VS_ADVANCED_JSON_SECTION_IDS.ATTRIBUTES_BY_TYPE,
			label: 'attributesByType',
			description: 'Variant-specific attributes map.',
			valueType: 'object',
			path: ['attributesByType']
		},
		{
			id: VS_ADVANCED_JSON_SECTION_IDS.BEHAVIORS,
			label: 'behaviors',
			description: 'Full behavior array.',
			valueType: 'array',
			path: ['behaviors']
		},
		{
			id: VS_ADVANCED_JSON_SECTION_IDS.TRANSFORM_MAPS,
			label: 'Transform ByType Maps',
			description: 'All recognized root and attributes transform ByType maps.',
			valueType: 'object',
			virtual: 'transformMaps'
		}
	];
	if (Array.isArray(asset_object?.behaviors)) {
		asset_object.behaviors.forEach((behavior, index) => {
			sections.push({
				id: sectionIdForBehaviorProperties(index),
				label: `${behaviorName(behavior, index)} properties`,
				description: `properties object for behaviors[${index}].`,
				valueType: 'object',
				path: ['behaviors', index, 'properties']
			});
		});
	}
	return sections;
}

export function findVintageStoryAdvancedAssetSection(asset_object, section_id) {
	return getVintageStoryAdvancedAssetSections(asset_object).find(section => section.id === section_id)
		|| getVintageStoryAdvancedAssetSections(asset_object)[0];
}

function transformMapPathForFamily(family) {
	let map_key = family.mapKey || `${family.jsonKey}ByType`;
	return family.location === 'attributes'
		? ['attributes', map_key]
		: [map_key];
}

function transformMapExportKey(family) {
	let map_key = family.mapKey || `${family.jsonKey}ByType`;
	return family.location === 'attributes'
		? `attributes.${map_key}`
		: map_key;
}

export function collectVintageStoryTransformMaps(asset_object = {}) {
	let maps = {};
	VS_ASSET_TRANSFORM_FAMILIES.forEach(family => {
		let path = transformMapPathForFamily(family);
		let value = valueAtPath(asset_object, path);
		if (value !== undefined) maps[transformMapExportKey(family)] = cloneJSON(value);
	});
	return maps;
}

function normalizeTransformMapEditValue(value = {}) {
	let output = {};
	if (!isPlainObject(value)) return output;
	Object.keys(value).forEach(key => {
		if (key === 'attributes' && isPlainObject(value.attributes)) {
			Object.keys(value.attributes).forEach(attribute_key => {
				output[`attributes.${attribute_key}`] = cloneJSON(value.attributes[attribute_key]);
			});
			return;
		}
		output[key] = cloneJSON(value[key]);
	});
	return output;
}

function applyTransformMaps(asset_object, edited_maps = {}) {
	let output = cloneJSON(asset_object || {});
	VS_ASSET_TRANSFORM_FAMILIES.forEach(family => {
		output = deleteValueAtPath(output, transformMapPathForFamily(family));
	});
	let normalized = normalizeTransformMapEditValue(edited_maps);
	Object.keys(normalized).forEach(key => {
		let family = VS_ASSET_TRANSFORM_FAMILIES.find(entry => transformMapExportKey(entry) === key);
		let path = family
			? transformMapPathForFamily(family)
			: key.split('.').filter(Boolean);
		output = setValueAtPath(output, path, normalized[key]);
	});
	return output;
}

export function getVintageStoryAdvancedSectionValue(asset_object = {}, section_id = VS_ADVANCED_JSON_SECTION_IDS.ROOT) {
	let section = findVintageStoryAdvancedAssetSection(asset_object, section_id);
	if (section.virtual === 'transformMaps') return collectVintageStoryTransformMaps(asset_object);
	let value = valueAtPath(asset_object, section.path);
	if (value !== undefined) return cloneJSON(value);
	return section.valueType === 'array' ? [] : {};
}

export function applyVintageStoryAdvancedSectionValue(asset_object = {}, section_id = VS_ADVANCED_JSON_SECTION_IDS.ROOT, value) {
	let section = findVintageStoryAdvancedAssetSection(asset_object, section_id);
	if (section.virtual === 'transformMaps') return {asset: applyTransformMaps(asset_object, value), errors: []};
	if (section.valueType === 'object' && !isPlainObject(value)) {
		return {errors: [`${section.label} must be a JSON object.`]};
	}
	if (section.valueType === 'array' && !Array.isArray(value)) {
		return {errors: [`${section.label} must be a JSON array.`]};
	}
	return {asset: setValueAtPath(asset_object, section.path, value), errors: []};
}

export function makeVintageStoryJsonDiff(before_text = '', after_text = {}, options = {}) {
	let before = String(before_text || '').replace(/\r\n/g, '\n').split('\n');
	let after = String(after_text || '').replace(/\r\n/g, '\n').split('\n');
	if (before.join('\n') === after.join('\n')) return 'No changes.';
	let context = Number.isInteger(options.context) ? options.context : 3;
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	let before_end = before.length - 1;
	let after_end = after.length - 1;
	while (before_end >= start && after_end >= start && before[before_end] === after[after_end]) {
		before_end--;
		after_end--;
	}
	let hunk_start = Math.max(0, start - context);
	let hunk_before_end = Math.min(before.length - 1, before_end + context);
	let hunk_after_end = Math.min(after.length - 1, after_end + context);
	let removed_count = Math.max(0, before_end - start + 1);
	let added_count = Math.max(0, after_end - start + 1);
	let lines = [
		'--- before',
		'+++ after',
		`@@ -${hunk_start + 1},${Math.max(0, hunk_before_end - hunk_start + 1)} +${hunk_start + 1},${Math.max(0, hunk_after_end - hunk_start + 1)} @@`
	];
	for (let i = hunk_start; i < start; i++) lines.push(` ${before[i]}`);
	for (let i = start; i < start + removed_count; i++) lines.push(`-${before[i] ?? ''}`);
	for (let i = start; i < start + added_count; i++) lines.push(`+${after[i] ?? ''}`);
	let trailing_context = Math.min(before.length - 1, hunk_before_end);
	for (let i = before_end + 1; i <= trailing_context; i++) lines.push(` ${before[i]}`);
	return lines.join('\n');
}

export function makeVintageStoryAdvancedEditPreview(asset_object = {}, section_id, edited_text) {
	let section = findVintageStoryAdvancedAssetSection(asset_object, section_id);
	let parsed = parseAdvancedJsonText(edited_text, section);
	if (parsed.errors.length) return {section, errors: parsed.errors, changed: false};
	let result = applyVintageStoryAdvancedSectionValue(asset_object, section.id, parsed.value);
	if (result.errors?.length) return {section, errors: result.errors, changed: false};
	let before_text = serializeVintageStoryAssetDocument(asset_object);
	let after_text = serializeVintageStoryAssetDocument(result.asset);
	return {
		section,
		errors: [],
		beforeAsset: cloneJSON(asset_object),
		afterAsset: result.asset,
		beforeText: before_text,
		afterText: after_text,
		changed: before_text !== after_text,
		diff: makeVintageStoryJsonDiff(before_text, after_text)
	};
}

export function makeVintageStoryAdvancedRootEditPreview(root_object = {}, edited_text, label = 'Root JSON') {
	let section = {id: 'root', label, valueType: 'object', path: []};
	let parsed = parseAdvancedJsonText(edited_text, section);
	if (parsed.errors.length) return {section, errors: parsed.errors, changed: false};
	let before_text = serializeVintageStoryAssetDocument(root_object);
	let after_text = serializeVintageStoryAssetDocument(parsed.value);
	return {
		section,
		errors: [],
		beforeRoot: cloneJSON(root_object),
		afterRoot: parsed.value,
		beforeText: before_text,
		afterText: after_text,
		changed: before_text !== after_text,
		diff: makeVintageStoryJsonDiff(before_text, after_text)
	};
}

function addPreservedField(output, json_path, value, what, why) {
	if (value === undefined) return;
	output.push({
		jsonPath: json_path,
		value: cloneJSON(value),
		what,
		why
	});
}

function isKnownButUncontrolledRootKey(key) {
	let lower = String(key || '').toLowerCase();
	return KNOWN_UNCONTROLLED_ROOT_KEYS.has(lower) || lower.endsWith('bytype');
}

export function collectVintageStoryPreservedFields(asset_object = {}) {
	let output = [];
	if (!isPlainObject(asset_object)) return output;
	Object.keys(asset_object).forEach(key => {
		let lower = key.toLowerCase();
		if (!ROOT_CONTROLLED_KEYS.has(lower)) {
			let known = KNOWN_UNCONTROLLED_ROOT_KEYS.get(lower);
			addPreservedField(
				output,
				vintageStoryJsonPath([key]),
				asset_object[key],
				known ? `Known ${known}` : 'Custom or behavior-specific root field',
				'Vintage Bench does not expose a structured control for this root field, so the advanced editor preserves it verbatim.'
			);
		} else if (isKnownButUncontrolledRootKey(key)) {
			addPreservedField(
				output,
				vintageStoryJsonPath([key]),
				asset_object[key],
				'Known ByType root field',
				'This map is resolved by Vintage Story but edited through advanced JSON unless a dedicated control exists.'
			);
		}
	});
	if (isPlainObject(asset_object.attributes)) {
		Object.keys(asset_object.attributes).forEach(key => {
			if (ATTRIBUTE_TRANSFORM_KEYS.has(key.toLowerCase())) return;
			addPreservedField(
				output,
				vintageStoryJsonPath(['attributes', key]),
				asset_object.attributes[key],
				'Attribute field preserved by advanced JSON',
				'Attributes are behavior-specific in Vintage Story; unknown entries must survive save and export.'
			);
		});
	}
	if (isPlainObject(asset_object.attributesByType)) {
		Object.keys(asset_object.attributesByType).forEach(pattern => {
			addPreservedField(
				output,
				vintageStoryJsonPath(['attributesByType', pattern]),
				asset_object.attributesByType[pattern],
				'Variant attributes preserved by advanced JSON',
				'attributesByType can contain arbitrary gameplay and behavior fields per variant.'
			);
		});
	}
	if (Array.isArray(asset_object.behaviors)) {
		asset_object.behaviors.forEach((behavior, index) => {
			if (!isPlainObject(behavior)) return;
			Object.keys(behavior).forEach(key => {
				if (key === 'name' || key === 'Name' || key === 'properties' || key === 'Properties') return;
				addPreservedField(
					output,
					vintageStoryJsonPath(['behaviors', index, key]),
					behavior[key],
					'Behavior root field preserved by advanced JSON',
					'Behavior implementations can define custom root-level fields.'
				);
			});
			let properties_key = isPlainObject(behavior.properties) ? 'properties' : (isPlainObject(behavior.Properties) ? 'Properties' : '');
			let properties = properties_key ? behavior[properties_key] : null;
			if (properties) {
				Object.keys(properties).forEach(key => {
					addPreservedField(
						output,
						vintageStoryJsonPath(['behaviors', index, properties_key, key]),
						properties[key],
						'Behavior property preserved by advanced JSON',
						'Behavior properties are implemented by game or mod code and must remain editable even when Vintage Bench has no dedicated control.'
					);
				});
			}
		});
	}
	return output;
}

export function formatVintageStoryPreservedFields(fields = []) {
	if (!fields.length) return 'No preserved advanced fields found for this asset object.';
	return fields.map(field => `${field.jsonPath} - ${field.what}\n  ${field.why}`).join('\n');
}

export function replaceVintageStoryDocumentAssetObject(document, asset_index, asset_object) {
	let entry = document?.assetObjects?.[asset_index || 0];
	if (!entry) throw new Error('Could not find the selected Vintage Story asset object.');
	if (!entry.path?.length) {
		document.root = cloneJSON(asset_object);
	} else {
		let parent = ensureContainerAtPath(document.root, entry.path.slice(0, -1));
		parent[entry.path[entry.path.length - 1]] = cloneJSON(asset_object);
	}
	let refreshed = createVintageStoryAssetDocument(document.root, document.filePath, document.sourceText);
	document.assetObjects = refreshed.assetObjects;
	return document;
}

export function parseVintageStoryAdvancedAssetDocument(text, file_path = '') {
	let document = createVintageStoryAssetDocument(parseVintageStoryAssetText(text, file_path), file_path, text);
	document.assetObjects = extractVintageStoryAssetObjects(document.root);
	return document;
}
