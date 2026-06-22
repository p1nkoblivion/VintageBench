// Modified for Vintage Bench on 2026-06-22: central Vintage Story display transform mapping.

export const VS_DISPLAY_DIRECT_KEYS = [
	'guiTransform',
	'fpHandTransform',
	'tpHandTransform',
	'tpOffHandTransform',
	'groundTransform'
];

export const VS_DISPLAY_ATTRIBUTE_KEYS = [
	'toolrackTransform',
	'onmoldrackTransform',
	'onDisplayTransform',
	'groundStorageTransform',
	'onshelfTransform',
	'onscrollrackTransform',
	'onAntlerMountTransform',
	'onTongTransform',
	'inTrapTransform',
	'inForgeTransform',
	'onOmokTransform',
	'infirepitTransform'
];

export const VS_DISPLAY_CONTEXTS = [
	{id: 'tpHandTransform', label: 'Thirdperson Mainhand', section: 'Hands', icon: 'pan_tool', jsonKey: 'tpHandTransform', location: 'root', references: ['seraph', 'mannequin', 'vs_armor_stand']},
	{id: 'tpOffHandTransform', label: 'Thirdperson Offhand', section: 'Hands', icon: 'pan_tool', jsonKey: 'tpOffHandTransform', location: 'root', references: ['seraph', 'mannequin', 'vs_armor_stand']},
	{id: 'fpHandTransform', label: 'Firstperson Mainhand', section: 'Hands', icon: 'person', jsonKey: 'fpHandTransform', location: 'root', references: ['firstperson']},
	{id: 'fpOffHandTransform', label: 'Firstperson Offhand', section: 'Hands', icon: 'person', jsonKey: 'fpHandTransform', location: 'root', aliasOf: 'fpHandTransform', references: ['firstperson']},
	{id: 'onTongTransform', label: 'On tongs', section: 'Hands', icon: 'construction', jsonKey: 'onTongTransform', location: 'attributes', references: ['tongs']},

	{id: 'groundTransform', label: 'Ground', section: 'Ground', icon: 'public', jsonKey: 'groundTransform', location: 'root', references: ['ground']},
	{id: 'groundStorageTransform', label: 'Placed on ground', section: 'Ground', icon: 'inventory_2', jsonKey: 'groundStorageTransform', location: 'attributes', references: ['ground_storage']},
	{id: 'onAntlerMountTransform', label: 'On antler mount', section: 'Ground', icon: 'wall_art', jsonKey: 'onAntlerMountTransform', location: 'attributes', references: ['antler_mount']},

	{id: 'toolrackTransform', label: 'On tool rack', section: 'Shelf / Rack', icon: 'construction', jsonKey: 'toolrackTransform', location: 'attributes', references: ['tool_rack']},
	{id: 'onmoldrackTransform', label: 'On vertical rack', section: 'Shelf / Rack', icon: 'view_agenda', jsonKey: 'onmoldrackTransform', location: 'attributes', references: ['vertical_rack']},
	{id: 'onDisplayTransform', label: 'In display case', section: 'Shelf / Rack', icon: 'inventory_2', jsonKey: 'onDisplayTransform', location: 'attributes', references: ['display_case']},
	{id: 'onshelfTransform', label: 'On shelf', section: 'Shelf / Rack', icon: 'table_view', jsonKey: 'onshelfTransform', location: 'attributes', references: ['shelf']},
	{id: 'onscrollrackTransform', label: 'On scroll rack', section: 'Shelf / Rack', icon: 'receipt_long', jsonKey: 'onscrollrackTransform', location: 'attributes', references: ['scroll_rack']},

	{id: 'guiTransform', label: 'GUI', section: 'GUI', icon: 'border_style', jsonKey: 'guiTransform', location: 'root', references: ['inventory_full', 'hud']},

	{id: 'seraphPreviewTransform', label: 'Seraph preview', section: 'Entity / Armor', icon: 'accessibility', previewOnly: true, references: ['seraph']},
	{id: 'armorStandPreviewTransform', label: 'Armor stand preview', section: 'Entity / Armor', icon: 'accessibility', previewOnly: true, references: ['vs_armor_stand']},
	{id: 'mannequinPreviewTransform', label: 'Mannequin preview', section: 'Entity / Armor', icon: 'person', previewOnly: true, references: ['mannequin']},

	{id: 'inTrapTransform', label: 'In traps', section: 'Other', icon: 'select_all', jsonKey: 'inTrapTransform', location: 'attributes', references: ['trap']},
	{id: 'inForgeTransform', label: 'In forge', section: 'Other', icon: 'local_fire_department', jsonKey: 'inForgeTransform', location: 'attributes', references: ['forge']},
	{id: 'onOmokTransform', label: 'On omak tabletop', section: 'Other', icon: 'table_bar', jsonKey: 'onOmokTransform', location: 'attributes', references: ['omok_tabletop']},
	{id: 'infirepitTransform', label: 'In firepit', section: 'Other', icon: 'whatshot', jsonKey: 'infirepitTransform', location: 'attributes', references: ['firepit']},
];

export const VS_DISPLAY_SECTIONS = ['Hands', 'Ground', 'Shelf / Rack', 'GUI', 'Entity / Armor', 'Other'].map(section => ({
	id: section.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
	label: section,
	contexts: VS_DISPLAY_CONTEXTS.filter(context => context.section === section)
}));

const VS_TRANSFORM_FIELDS = new Set(['translation', 'rotation', 'origin', 'scale', 'scaleXyz', 'scaleXYZ']);

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJSON(value) {
	if (value === undefined) return undefined;
	return JSON.parse(JSON.stringify(value));
}

function numberOrDefault(value, fallback = 0) {
	return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function numberVectorObject(value, fallback = 0) {
	return [
		numberOrDefault(value?.x, fallback),
		numberOrDefault(value?.y, fallback),
		numberOrDefault(value?.z, fallback)
	];
}

function vectorObjectFromArray(value) {
	return {
		x: roundedNumber(value?.[0] || 0),
		y: roundedNumber(value?.[1] || 0),
		z: roundedNumber(value?.[2] || 0)
	};
}

function roundedNumber(value) {
	let number = numberOrDefault(value);
	if (Math.abs(number) < 0.000001) number = 0;
	return Math.round(number * 100000) / 100000;
}

function vectorsEqual(a, b) {
	return Array.isArray(a) && Array.isArray(b) && a.length >= 3 && b.length >= 3
		&& roundedNumber(a[0]) === roundedNumber(b[0])
		&& roundedNumber(a[1]) === roundedNumber(b[1])
		&& roundedNumber(a[2]) === roundedNumber(b[2]);
}

function isNeutralSlot(slot) {
	return vectorsEqual(slot.translation, [0, 0, 0])
		&& vectorsEqual(slot.rotation, [0, 0, 0])
		&& vectorsEqual(slot.origin || [0, 0, 0], [0, 0, 0])
		&& vectorsEqual(slot.scale, [1, 1, 1]);
}

function copyUnknownFields(source) {
	let extra = {};
	if (!isPlainObject(source)) return extra;
	for (let key in source) {
		if (!VS_TRANSFORM_FIELDS.has(key)) {
			extra[key] = cloneJSON(source[key]);
		}
	}
	return extra;
}

function addWarning(warnings, message) {
	if (warnings && !warnings.includes(message)) warnings.push(message);
}

export function getVintageStoryDisplayContext(id) {
	return VS_DISPLAY_CONTEXTS.find(context => context.id === id || context.jsonKey === id);
}

export function getVintageStoryDisplayContextByJsonKey(jsonKey, location) {
	return VS_DISPLAY_CONTEXTS.find(context => context.jsonKey === jsonKey && (!location || context.location === location));
}

export function createNeutralVintageStoryDisplaySlot(id) {
	return {
		slot_id: id,
		translation: [0, 0, 0],
		rotation: [0, 0, 0],
		origin: [0, 0, 0],
		scale: [1, 1, 1],
		vintage_story: {
			extra: {},
			was_present: false,
			had_fields: []
		}
	};
}

export function vintageStoryTransformToDisplaySlot(id, transform, warnings) {
	let slot = createNeutralVintageStoryDisplaySlot(id);
	if (!isPlainObject(transform)) {
		addWarning(warnings, `Display transform "${id}" is not an object and was ignored.`);
		return slot;
	}

	slot.translation = numberVectorObject(transform.translation, 0);
	slot.rotation = numberVectorObject(transform.rotation, 0);
	slot.origin = numberVectorObject(transform.origin, 0);
	let scale = typeof transform.scale === 'number' && isFinite(transform.scale) ? transform.scale : 1;
	let scale_xyz = null;
	if (isPlainObject(transform.scaleXyz) || isPlainObject(transform.scaleXYZ)) {
		scale_xyz = numberVectorObject(transform.scaleXyz || transform.scaleXYZ, 1);
		scale = scale_xyz[0];
		if (!vectorsEqual(scale_xyz, [scale, scale, scale])) {
			addWarning(warnings, `Display transform "${id}" uses non-uniform scaleXyz. Vintage Bench edits it as uniform scale and preserves the original while unchanged.`);
		}
	}
	slot.scale = [scale, scale, scale];
	slot.vintage_story = {
		extra: copyUnknownFields(transform),
		was_present: true,
		had_fields: Object.keys(transform).filter(key => VS_TRANSFORM_FIELDS.has(key)),
		scale_xyz,
		imported_scale: scale
	};
	return slot;
}

export function displaySlotHasVintageStoryTransform(slot) {
	return !!slot && (slot.vintage_story?.was_present || !isNeutralSlot(slot));
}

export function displaySlotToVintageStoryTransform(slot) {
	if (!displaySlotHasVintageStoryTransform(slot)) return null;
	let output = cloneJSON(slot.vintage_story?.extra || {});
	let had_fields = new Set(slot.vintage_story?.had_fields || []);
	let scale = roundedNumber(slot.scale?.[0] ?? 1);
	let original_scale_xyz = slot.vintage_story?.scale_xyz;
	let unchanged_imported_scale = original_scale_xyz
		&& roundedNumber(slot.vintage_story.imported_scale) === scale
		&& vectorsEqual(slot.scale, [scale, scale, scale]);

	if (!vectorsEqual(slot.translation, [0, 0, 0]) || had_fields.has('translation')) {
		output.translation = vectorObjectFromArray(slot.translation);
	}
	if (!vectorsEqual(slot.rotation, [0, 0, 0]) || had_fields.has('rotation')) {
		output.rotation = vectorObjectFromArray(slot.rotation);
	}
	if (!vectorsEqual(slot.origin || [0, 0, 0], [0, 0, 0]) || had_fields.has('origin')) {
		output.origin = vectorObjectFromArray(slot.origin || [0, 0, 0]);
	}
	if (unchanged_imported_scale && !vectorsEqual(original_scale_xyz, [scale, scale, scale])) {
		output.scaleXyz = vectorObjectFromArray(original_scale_xyz);
	} else if (scale !== 1 || had_fields.has('scale') || had_fields.has('scaleXyz') || had_fields.has('scaleXYZ')) {
		output.scale = scale;
	}
	return output;
}

export function collectVintageStoryDisplayTransformsFromModel(model, warnings) {
	let output = {};
	if (!isPlainObject(model)) return output;
	VS_DISPLAY_DIRECT_KEYS.forEach(key => {
		if (isPlainObject(model[key])) {
			let context = getVintageStoryDisplayContextByJsonKey(key, 'root');
			if (context) output[context.id] = vintageStoryTransformToDisplaySlot(context.id, model[key], warnings);
		}
	});
	let attributes = isPlainObject(model.attributes) ? model.attributes : {};
	VS_DISPLAY_ATTRIBUTE_KEYS.forEach(key => {
		if (isPlainObject(attributes[key])) {
			let context = getVintageStoryDisplayContextByJsonKey(key, 'attributes');
			if (context) output[context.id] = vintageStoryTransformToDisplaySlot(context.id, attributes[key], warnings);
		}
	});
	return output;
}

export function applyVintageStoryDisplayTransformsToModel(model, displaySettings) {
	if (!isPlainObject(model) || !displaySettings) return model;
	VS_DISPLAY_CONTEXTS.forEach(context => {
		if (context.previewOnly || context.aliasOf) return;
		let slot = displaySettings[context.id];
		let transform = displaySlotToVintageStoryTransform(slot);
		if (!transform) return;
		if (context.location === 'attributes') {
			if (!isPlainObject(model.attributes)) model.attributes = {};
			model.attributes[context.jsonKey] = transform;
		} else {
			model[context.jsonKey] = transform;
		}
	});
	let first_person_alias = displaySettings.fpOffHandTransform;
	if (!displaySettings.fpHandTransform && displaySlotHasVintageStoryTransform(first_person_alias)) {
		model.fpHandTransform = displaySlotToVintageStoryTransform(first_person_alias);
	}
	return model;
}
