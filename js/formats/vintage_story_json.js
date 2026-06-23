import {
	VS_DISPLAY_ATTRIBUTE_KEYS,
	VS_DISPLAY_DIRECT_KEYS,
	applyVintageStoryDisplayTransformsToModel,
	collectVintageStoryDisplayTransformsFromModel
} from '../display_mode/vintage_story_display_transforms.js';

const VS_FACE_DIRECTIONS = ['north', 'east', 'south', 'west', 'up', 'down'];
const VS_DEFAULT_TEXTURE_CODE = 'texture';
const VS_ROOT_FIELDS = new Set(['editor', 'textures', 'elements', 'animations', 'textureWidth', 'textureHeight', 'textureSizes', 'attributes', ...VS_DISPLAY_DIRECT_KEYS]);
const VS_INTERACTION_BOX_SHAPE_FIELDS = [
	'collisionbox',
	'collisionboxes',
	'collisionBox',
	'collisionBoxes',
	'collisionboxByType',
	'collisionboxesByType',
	'selectionbox',
	'selectionboxes',
	'selectionBox',
	'selectionBoxes',
	'selectionboxByType',
	'selectionboxesByType',
	'collisionSelectionBox',
	'collisionSelectionBoxes',
	'collisionSelectionBoxByType',
	'collisionSelectionBoxesByType'
];
const VS_ELEMENT_MAPPED_FIELDS = new Set([
	'name',
	'from',
	'to',
	'shade',
	'faces',
	'rotationOrigin',
	'rotationX',
	'rotationY',
	'rotationZ',
	'children'
]);
const VS_FACE_MAPPED_FIELDS = new Set(['texture', 'uv', 'rotation', 'enabled']);
const VS_ATTRIBUTE_TRANSFORM_FIELDS = new Set(VS_DISPLAY_ATTRIBUTE_KEYS);

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJSON(value) {
	if (value === undefined) return undefined;
	return JSON.parse(JSON.stringify(value));
}

function copyUnknownFields(source, mapped_fields) {
	let extra = {};
	if (!isPlainObject(source)) return extra;
	for (let key in source) {
		if (!mapped_fields.has(key)) {
			extra[key] = cloneJSON(source[key]);
		}
	}
	return extra;
}

function collectPresentFields(source, mapped_fields) {
	if (!isPlainObject(source)) return [];
	return Object.keys(source).filter(key => mapped_fields.has(key));
}

function hasKeys(object) {
	return isPlainObject(object) && Object.keys(object).length > 0;
}

function numberOrDefault(value, fallback = 0) {
	return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function numberArray(value, length, fallback = 0) {
	let output = [];
	for (let i = 0; i < length; i++) {
		output[i] = Array.isArray(value) && typeof value[i] === 'number' && isFinite(value[i]) ? value[i] : fallback;
	}
	return output;
}

function roundedNumber(value) {
	let number = numberOrDefault(value);
	if (Math.abs(number) < 0.000001) number = 0;
	return Math.round(number * 100000) / 100000;
}

function roundedArray(value, length, fallback = 0) {
	return numberArray(value, length, fallback).map(roundedNumber);
}

function addWarning(warnings, message) {
	if (warnings && !warnings.includes(message)) warnings.push(message);
}

function normalizeTextureCode(code, fallback = VS_DEFAULT_TEXTURE_CODE) {
	if (typeof code !== 'string') return fallback;
	if (code.startsWith('#')) code = code.substring(1);
	code = code.trim().replace(/\\/g, '/').replace(/\.[a-z0-9]+$/i, '');
	code = code.replace(/[^a-zA-Z0-9_./-]/g, '_');
	return code || fallback;
}

function uniqueTextureCode(code, used_codes) {
	let base = normalizeTextureCode(code);
	let unique = base;
	let i = 2;
	while (used_codes.has(unique)) {
		unique = `${base}_${i}`;
		i++;
	}
	used_codes.add(unique);
	return unique;
}

function resolveTextureCode(texture_ref) {
	if (typeof texture_ref !== 'string') return null;
	return normalizeTextureCode(texture_ref);
}

function createDefaultFace(texture_code = VS_DEFAULT_TEXTURE_CODE, uv = [0, 0, 1, 1]) {
	return {
		texture: `#${texture_code}`,
		uv: uv.slice()
	};
}

export function createDefaultVintageStoryShape() {
	let faces = {};
	VS_FACE_DIRECTIONS.forEach(direction => {
		faces[direction] = createDefaultFace();
	});
	return {
		editor: {
			allAngles: true
		},
		textureWidth: 16,
		textureHeight: 16,
		textures: {
			[VS_DEFAULT_TEXTURE_CODE]: ''
		},
		elements: [
			{
				name: 'Cube',
				from: [0, 0, 0],
				to: [1, 1, 1],
				shade: true,
				faces,
				rotationOrigin: [0, 0, 0]
			}
		]
	};
}

export function looksLikeVintageStoryShape(model) {
	if (!isPlainObject(model) || model.meta) return false;
	return Array.isArray(model.elements) || isPlainObject(model.textures);
}

export function validateVintageStoryShape(model) {
	let errors = [];
	let warnings = [];
	if (!isPlainObject(model)) {
		errors.push('Vintage Story JSON must be a JSON object.');
		return {ok: false, errors, warnings};
	}
	if (!looksLikeVintageStoryShape(model)) {
		errors.push('JSON does not look like a Vintage Story shape. Expected root "elements" or "textures".');
		return {ok: false, errors, warnings};
	}
	if (model.elements !== undefined && !Array.isArray(model.elements)) {
		errors.push('Vintage Story shape "elements" must be an array.');
	}
	if (model.textures !== undefined && !isPlainObject(model.textures)) {
		errors.push('Vintage Story shape "textures" must be an object.');
	}
	if (model.textureSizes !== undefined && !isPlainObject(model.textureSizes)) {
		warnings.push('Root "textureSizes" is not an object and will be ignored.');
	}
	VS_INTERACTION_BOX_SHAPE_FIELDS.forEach(field => {
		if (Object.prototype.hasOwnProperty.call(model, field)) {
			warnings.push(`Root "${field}" looks like an interaction box field. Vintage Story stores collision/selection boxes on item/block assets or behavior properties, not shape JSON.`);
		}
	});
	if (Array.isArray(model.elements)) {
		model.elements.forEach((element, index) => {
			if (!isPlainObject(element)) {
				warnings.push(`Root element ${index + 1} is not an object and will be skipped.`);
			}
		});
	}
	return {ok: errors.length === 0, errors, warnings};
}

function reportVintageStoryImportWarnings(warnings) {
	if (!warnings || warnings.length === 0) return;
	console.warn('Vintage Story JSON import warnings:', warnings);
	if (typeof Blockbench !== 'undefined' && Blockbench.showMessageBox) {
		Blockbench.showMessageBox({
			title: 'Vintage Story JSON import warnings',
			icon: 'warning',
			message: warnings.slice(0, 10).join('\n') + (warnings.length > 10 ? `\n...and ${warnings.length - 10} more.` : '')
		});
	}
}

function getProjectVintageStoryData(project) {
	if (!project.vintage_story_data || !isPlainObject(project.vintage_story_data)) {
		project.vintage_story_data = {};
	}
	return project.vintage_story_data;
}

function makeTextureSizeForCode(code, model) {
	let fallback = [
		numberOrDefault(model.textureWidth, 16),
		numberOrDefault(model.textureHeight, 16)
	];
	if (isPlainObject(model.textureSizes) && Array.isArray(model.textureSizes[code])) {
		return numberArray(model.textureSizes[code], 2, 16);
	}
	return fallback;
}

function getVintageStoryTexturePathValue(raw_value) {
	if (typeof raw_value === 'string') return raw_value;
	if (!isPlainObject(raw_value)) return '';
	if (typeof raw_value.base === 'string') return raw_value.base;
	if (typeof raw_value.Base === 'string') return raw_value.Base;
	if (isPlainObject(raw_value.Base) && typeof raw_value.Base.path === 'string') return raw_value.Base.path;
	if (isPlainObject(raw_value.Base) && typeof raw_value.Base.Path === 'string') return raw_value.Base.Path;
	return '';
}

function getAssetTextureSource(asset_context, raw_code, code) {
	let aliases = asset_context?.resolved?.textures?.aliases || asset_context?.texture_sources?.aliases || {};
	return aliases[raw_code] || aliases[code] || null;
}

function createVintageStoryTexture(code, raw_value, size, warnings, source, options = {}) {
	let path = getVintageStoryTexturePathValue(raw_value);
	let raw_value_has_path = typeof raw_value === 'string' || !!path;
	let resolved_path = source?.resolvedFilePath && !source.missing ? source.resolvedFilePath : '';
	let texture = new Texture({
		name: code,
		uv_width: size[0],
		uv_height: size[1]
	}).add(false);
	texture.vintage_story = {
		code,
		path,
		raw_value: typeof raw_value === 'string' ? undefined : cloneJSON(raw_value),
		source: source ? cloneJSON(source) : undefined
	};
	if (resolved_path && !options.skipTextureFiles && typeof texture.fromPath === 'function') {
		texture.fromPath(resolved_path);
		texture.name = code;
		texture.vintage_story = {
			code,
			path,
			raw_value: typeof raw_value === 'string' ? undefined : cloneJSON(raw_value),
			source: source ? cloneJSON(source) : undefined
		};
	} else if (typeof texture.loadEmpty === 'function') {
		texture.loadEmpty(1);
	}
	if (raw_value !== undefined && !raw_value_has_path) {
		addWarning(warnings, `Texture "${code}" has no string or CompositeTexture base path and will be preserved as raw JSON.`);
	}
	return texture;
}

function collectTextures(model, warnings, asset_context, options = {}) {
	let textures = isPlainObject(model.textures) ? model.textures : {[VS_DEFAULT_TEXTURE_CODE]: ''};
	let texture_map = {};
	for (let raw_code in textures) {
		let code = normalizeTextureCode(raw_code);
		let size = makeTextureSizeForCode(raw_code, model);
		let source = getAssetTextureSource(asset_context, raw_code, code);
		let texture = createVintageStoryTexture(code, textures[raw_code], size, warnings, source, options);
		texture_map[code] = texture;
		if (code !== raw_code) texture_map[raw_code] = texture;
	}
	if (!Object.keys(texture_map).length) {
		let texture = createVintageStoryTexture(VS_DEFAULT_TEXTURE_CODE, '', [numberOrDefault(model.textureWidth, 16), numberOrDefault(model.textureHeight, 16)], warnings, null, options);
		texture_map[VS_DEFAULT_TEXTURE_CODE] = texture;
	}
	return texture_map;
}

function makeTextureImportModelForAssetContext(model, asset_context) {
	if (asset_context?.skipTextures) return model;
	let import_textures = asset_context?.resolved?.textures?.importTextures;
	if (!isPlainObject(import_textures)) return model;
	let texture_model = cloneJSON(model);
	texture_model.textures = Object.assign({}, isPlainObject(model.textures) ? model.textures : {}, cloneJSON(import_textures));
	return texture_model;
}

function applyFaceToCube(cube, direction, face_data, texture_map, warnings) {
	let face = cube.faces[direction];
	face.enabled = true;
	face.vintage_story = {
		extra: copyUnknownFields(face_data, VS_FACE_MAPPED_FIELDS),
		was_present: true,
		had_fields: collectPresentFields(face_data, VS_FACE_MAPPED_FIELDS)
	};
	if (face_data.enabled === false) {
		face.enabled = false;
	}
	if (Array.isArray(face_data.uv)) {
		face.uv = numberArray(face_data.uv, 4, 0);
	}
	if (typeof face_data.rotation === 'number') {
		face.rotation = face_data.rotation;
	}
	let texture_code = resolveTextureCode(face_data.texture);
	if (texture_code) {
		if (!texture_map[texture_code]) {
			addWarning(warnings, `Face references missing texture "${texture_code}". A placeholder texture was created.`);
			texture_map[texture_code] = createVintageStoryTexture(texture_code, '', [Project.texture_width, Project.texture_height], warnings);
		}
		face.texture = texture_map[texture_code].uuid;
	}
	if (hasKeys(face.vintage_story.extra)) {
		addWarning(warnings, `Face "${direction}" contains preserved fields that are not editable yet.`);
	}
}

function createCubeFromVintageStoryElement(element, parent, texture_map, warnings, name, kind, rotation) {
	let node = new Cube({
		name,
		from: numberArray(element.from, 3, 0),
		to: numberArray(element.to, 3, 0),
		origin: Array.isArray(element.rotationOrigin) ? numberArray(element.rotationOrigin, 3, 0) : [0, 0, 0],
		rotation: rotation || [
			numberOrDefault(element.rotationX, 0),
			numberOrDefault(element.rotationY, 0),
			numberOrDefault(element.rotationZ, 0)
		],
		shade: element.shade !== false,
		vintage_story: {
			extra: copyUnknownFields(element, VS_ELEMENT_MAPPED_FIELDS),
			kind,
			had_fields: collectPresentFields(element, VS_ELEMENT_MAPPED_FIELDS)
		}
	}).addTo(parent || 'root').init();

	VS_FACE_DIRECTIONS.forEach(direction => {
		node.faces[direction].enabled = false;
		node.faces[direction].texture = false;
	});
	if (isPlainObject(element.faces)) {
		VS_FACE_DIRECTIONS.forEach(direction => {
			if (isPlainObject(element.faces[direction])) {
				applyFaceToCube(node, direction, element.faces[direction], texture_map, warnings);
			}
		});
	} else {
		addWarning(warnings, `Element "${name}" has no face object; faces were imported disabled.`);
	}
	return node;
}

function importVintageStoryElement(element, parent, texture_map, warnings) {
	if (!isPlainObject(element)) {
		addWarning(warnings, 'Skipped a non-object element.');
		return null;
	}

	let name = typeof element.name === 'string' && element.name ? element.name : 'Element';
	let extra = copyUnknownFields(element, VS_ELEMENT_MAPPED_FIELDS);

	// Modified for Vintage Bench on 2026-06-22: import Vintage Story parent elements as parent-capable cuboids instead of splitting them into groups plus generated geometry children.
	let node = createCubeFromVintageStoryElement(element, parent, texture_map, warnings, name, 'cube');

	if (hasKeys(extra)) {
		addWarning(warnings, `Element "${name}" contains preserved fields that are not editable yet.`);
	}
	if (Array.isArray(element.children)) {
		element.children.forEach(child => importVintageStoryElement(child, node, texture_map, warnings));
	}
	return node;
}

export function applyVintageStoryShapeToProject(model, path, options = {}) {
	let warnings = options.warnings || [];
	let validation = validateVintageStoryShape(model);
	validation.warnings.forEach(warning => addWarning(warnings, warning));
	if (!validation.ok) {
		throw new Error(validation.errors.join('\n'));
	}

	Project.texture_width = numberOrDefault(model.textureWidth, 16);
	Project.texture_height = numberOrDefault(model.textureHeight, 16);
	let vs_data = getProjectVintageStoryData(Project);
	vs_data.root_extra = copyUnknownFields(model, VS_ROOT_FIELDS);
	vs_data.editor = cloneJSON(model.editor || {allAngles: true});
	vs_data.animations = Array.isArray(model.animations) ? cloneJSON(model.animations) : [];
	vs_data.had_animations = Array.isArray(model.animations);
	vs_data.shape_had_textures = isPlainObject(model.textures);
	vs_data.shape_textures = isPlainObject(model.textures) ? cloneJSON(model.textures) : {};
	vs_data.shape_had_texture_sizes = isPlainObject(model.textureSizes);
	vs_data.texture_sizes = isPlainObject(model.textureSizes) ? cloneJSON(model.textureSizes) : {};
	// Modified for Vintage Bench on 2026-06-22: preserve non-display attributes while editable display transforms use Project.display_settings.
	vs_data.attributes = isPlainObject(model.attributes) ? copyUnknownFields(model.attributes, VS_ATTRIBUTE_TRANSFORM_FIELDS) : {};
	vs_data.source_path = path || '';
	Project.display_settings = Object.assign(Project.display_settings || {}, collectVintageStoryDisplayTransformsFromModel(model, warnings));

	if (hasKeys(vs_data.root_extra)) {
		addWarning(warnings, 'Root object contains preserved fields that are not editable yet.');
	}
	if (vs_data.had_animations && vs_data.animations.length) {
		addWarning(warnings, 'Animations are preserved in JSON but are not editable in this pass.');
	}

	let texture_model = makeTextureImportModelForAssetContext(model, options.asset_context);
	let texture_map = collectTextures(texture_model, warnings, options.asset_context, {
		skipTextureFiles: !!options.asset_context?.skipTextures
	});
	if (Array.isArray(model.elements)) {
		model.elements.forEach(element => importVintageStoryElement(element, null, texture_map, warnings));
	}

	Canvas.updateAllBones();
	Canvas.updateAllPositions();
	Canvas.updateAllFaces();
	Validator.validate();
	Project.saved = true;
	reportVintageStoryImportWarnings(warnings);
}

function textureCodeFromTexture(texture, used_codes) {
	let preferred = texture.vintage_story?.code || texture.id || texture.name || VS_DEFAULT_TEXTURE_CODE;
	return uniqueTextureCode(preferred, used_codes);
}

function texturePathFromTexture(texture) {
	if (texture.vintage_story?.raw_value !== undefined) {
		return cloneJSON(texture.vintage_story.raw_value);
	}
	if (typeof texture.vintage_story?.path === 'string') {
		return texture.vintage_story.path;
	}
	if (typeof texture.path === 'string' && texture.path) {
		let clean_path = texture.path.replace(/\\/g, '/');
		return clean_path.replace(/\.[a-z0-9]+$/i, '');
	}
	if (typeof texture.name === 'string' && texture.name.includes('/')) {
		return texture.name.replace(/\.[a-z0-9]+$/i, '');
	}
	return '';
}

function buildTextureExportData() {
	let textures = {};
	let texture_sizes = {};
	let code_by_uuid = {};
	let used_codes = new Set();

	Texture.all.forEach(texture => {
		let code = textureCodeFromTexture(texture, used_codes);
		code_by_uuid[texture.uuid] = code;
		textures[code] = texturePathFromTexture(texture);
		let width = numberOrDefault(texture.uv_width, Project.texture_width || 16);
		let height = numberOrDefault(texture.uv_height, Project.texture_height || 16);
		if (width !== (Project.texture_width || 16) || height !== (Project.texture_height || 16) || Project.vintage_story_data?.texture_sizes?.[code]) {
			texture_sizes[code] = [width, height];
		}
	});

	if (!Object.keys(textures).length) {
		textures[VS_DEFAULT_TEXTURE_CODE] = '';
		used_codes.add(VS_DEFAULT_TEXTURE_CODE);
	}

	return {
		textures,
		texture_sizes,
		code_by_uuid,
		default_code: Object.keys(textures)[0] || VS_DEFAULT_TEXTURE_CODE
	};
}

function compileVintageStoryFace(face, direction, texture_data) {
	if (face.enabled === false && !face.vintage_story?.was_present) return null;
	let output = cloneJSON(face.vintage_story?.extra || {});
	let had_fields = new Set(face.vintage_story?.had_fields || []);
	let texture_code = texture_data.code_by_uuid[face.texture] || texture_data.default_code;
	output.texture = `#${texture_code}`;
	output.uv = roundedArray(face.uv, 4, 0);
	if (face.rotation || had_fields.has('rotation')) output.rotation = roundedNumber(face.rotation);
	if (face.enabled === false || had_fields.has('enabled')) output.enabled = face.enabled !== false;
	return output;
}

function compileVintageStoryFaces(cube, texture_data) {
	let faces = {};
	VS_FACE_DIRECTIONS.forEach(direction => {
		let face = cube.faces[direction];
		if (!face) return;
		let output = compileVintageStoryFace(face, direction, texture_data);
		if (output) faces[direction] = output;
	});
	return faces;
}

function compileVintageStoryChildren(node, texture_data, warnings, skip_node) {
	if (!node.children || !Array.isArray(node.children)) return undefined;
	let children = [];
	node.children.forEach(child => {
		if (child === skip_node) return;
		let compiled = compileVintageStoryNode(child, texture_data, warnings);
		if (compiled) children.push(compiled);
	});
	return children.length ? children : undefined;
}

function applyRotationFields(output, rotation, vintage_data) {
	let had_fields = new Set(vintage_data?.had_fields || []);
	let had_rotation = vintage_data?.extra && (
		Object.prototype.hasOwnProperty.call(vintage_data.extra, 'rotationX') ||
		Object.prototype.hasOwnProperty.call(vintage_data.extra, 'rotationY') ||
		Object.prototype.hasOwnProperty.call(vintage_data.extra, 'rotationZ')
	) || had_fields.has('rotationX') || had_fields.has('rotationY') || had_fields.has('rotationZ');
	let rx = roundedNumber(rotation?.[0] || 0);
	let ry = roundedNumber(rotation?.[1] || 0);
	let rz = roundedNumber(rotation?.[2] || 0);
	if (rx || had_rotation) output.rotationX = rx;
	if (ry || had_rotation) output.rotationY = ry;
	if (rz || had_rotation) output.rotationZ = rz;
}

function compileVintageStoryCube(cube, texture_data, warnings) {
	let output = cloneJSON(cube.vintage_story?.extra || {});
	let had_fields = new Set(cube.vintage_story?.had_fields || []);
	output.name = cube.name || 'Cube';
	output.from = roundedArray(cube.from, 3, 0);
	output.to = roundedArray(cube.to, 3, 0);
	if (cube.shade !== true || had_fields.has('shade')) output.shade = cube.shade !== false;
	output.faces = compileVintageStoryFaces(cube, texture_data);
	output.rotationOrigin = roundedArray(cube.origin, 3, 0);
	applyRotationFields(output, cube.rotation, cube.vintage_story);
	let children = compileVintageStoryChildren(cube, texture_data, warnings);
	if (children) output.children = children;
	return output;
}

function compileVintageStoryGroup(group, texture_data, warnings) {
	let geometry_child = group.children?.find(child => typeof Cube !== 'undefined' && child instanceof Cube && child.vintage_story?.kind === 'parent_geometry');
	let output = geometry_child
		? Object.assign(cloneJSON(group.vintage_story?.extra || {}), compileVintageStoryCube(geometry_child, texture_data, warnings))
		: cloneJSON(group.vintage_story?.extra || {});
	let had_fields = new Set(group.vintage_story?.had_fields || []);
	let origin = roundedArray(group.origin, 3, 0);
	output.name = group.name || 'Group';
	if (!geometry_child) {
		output.from = origin.slice();
		output.to = origin.slice();
		output.faces = {};
	}
	if (group.shade !== true || had_fields.has('shade')) output.shade = group.shade !== false;
	output.rotationOrigin = origin;
	applyRotationFields(output, group.rotation, group.vintage_story);
	let children = compileVintageStoryChildren(group, texture_data, warnings, geometry_child);
	if (children) output.children = children;
	return output;
}

function compileVintageStoryNode(node, texture_data, warnings) {
	if (node.export === false) return null;
	if (typeof Cube !== 'undefined' && node instanceof Cube) {
		return compileVintageStoryCube(node, texture_data, warnings);
	}
	if (typeof Group !== 'undefined' && node instanceof Group) {
		return compileVintageStoryGroup(node, texture_data, warnings);
	}
	addWarning(warnings, `Outliner node "${node.name || node.type || 'unknown'}" is not a cuboid/group and was not exported.`);
	return null;
}

export function compileVintageStoryShape(options = {}) {
	let warnings = [];
	let texture_data = buildTextureExportData();
	let vs_data = Project.vintage_story_data || {};
	let is_asset_context = !!vs_data.asset_context?.source_file_path;
	let shape = cloneJSON(vs_data.root_extra || {});
	shape.editor = cloneJSON(vs_data.editor || {allAngles: true});
	if (hasKeys(vs_data.attributes)) {
		shape.attributes = cloneJSON(vs_data.attributes);
	}
	shape.textureWidth = Project.texture_width || 16;
	shape.textureHeight = Project.texture_height || 16;
	if (is_asset_context) {
		if (vs_data.shape_had_texture_sizes && Object.keys(vs_data.texture_sizes || {}).length) {
			shape.textureSizes = cloneJSON(vs_data.texture_sizes);
		}
		if (vs_data.shape_had_textures) {
			shape.textures = cloneJSON(vs_data.shape_textures || {});
		}
	} else if (vs_data.shape_had_texture_sizes) {
		shape.textureSizes = cloneJSON(vs_data.texture_sizes || {});
	} else if (Object.keys(texture_data.texture_sizes).length) {
		shape.textureSizes = texture_data.texture_sizes;
	}
	if (!is_asset_context) {
		shape.textures = texture_data.textures;
	}
	shape.elements = [];

	Outliner.root.forEach(node => {
		let compiled = compileVintageStoryNode(node, texture_data, warnings);
		if (compiled) shape.elements.push(compiled);
	});

	if (vs_data.had_animations || (Array.isArray(vs_data.animations) && vs_data.animations.length)) {
		shape.animations = cloneJSON(vs_data.animations || []);
	}
	if (!is_asset_context && !options.omitDisplayTransforms) {
		applyVintageStoryDisplayTransformsToModel(shape, Project.display_settings);
	}
	if (warnings.length && typeof console !== 'undefined') {
		console.warn('Vintage Story JSON export warnings:', warnings);
	}
	if (options.raw) return shape;
	if (typeof compileJSON === 'function') {
		return compileJSON(shape, {small: false});
	}
	return `${JSON.stringify(shape, null, '\t')}\n`;
}

function setupDefaultVintageStoryTexture() {
	let texture = new Texture({
		name: VS_DEFAULT_TEXTURE_CODE,
		uv_width: 16,
		uv_height: 16,
		vintage_story: {
			code: VS_DEFAULT_TEXTURE_CODE,
			path: ''
		}
	}).add(false);
	if (typeof texture.loadEmpty === 'function') texture.loadEmpty(1);
	return texture;
}

function setupStarterVintageStoryCube(texture) {
	let cube = new Cube({
		name: 'Cube',
		// Modified for Vintage Bench on 2026-06-22: place the starter cuboid in the center of the Vintage Story 0..16 grid.
		from: [7.5, 0, 7.5],
		to: [8.5, 1, 8.5],
		origin: [8, 0, 8],
		shade: true
	}).addTo('root').init();
	VS_FACE_DIRECTIONS.forEach(direction => {
		let face = cube.faces[direction];
		face.texture = texture.uuid;
		face.uv = [0, 0, 1, 1];
		face.enabled = true;
	});
	return cube;
}

export function setupNewVintageStoryProject(project, new_model) {
	if (!project) return;
	project.texture_width = 16;
	project.texture_height = 16;
	project.vintage_story_data = {
		root_extra: {},
		editor: {allAngles: true},
		animations: [],
		had_animations: false,
		texture_sizes: {},
		attributes: {}
	};
	if (!new_model || typeof Texture === 'undefined' || typeof Cube === 'undefined') return;
	let texture = setupDefaultVintageStoryTexture();
	setupStarterVintageStoryCube(texture);
	Canvas.updateAllPositions();
	Canvas.updateAllFaces();
}

function showVintageStoryLoadError(error) {
	let message = error && error.message ? error.message : String(error);
	if (typeof Blockbench !== 'undefined' && Blockbench.showMessageBox) {
		Blockbench.showMessageBox({
			title: 'Vintage Story JSON import failed',
			icon: 'error',
			message
		});
	} else {
		throw error;
	}
}

export function registerVintageStoryCodec() {
	if (typeof window === 'undefined' || !window.Codec || !window.Formats) return null;
	if (window.Codecs?.vintage_story_json) return window.Codecs.vintage_story_json;

	// Modified for Vintage Bench on 2026-06-22: user-facing model save/open now targets Vintage Story shape JSON.
	let codec = new Codec('vintage_story_json', {
		name: 'Vintage Story JSON Model',
		extension: 'json',
		remember: true,
		format: Formats.free,
		load_filter: {
			type: 'json',
			extensions: ['json'],
			condition: looksLikeVintageStoryShape
		},
		compile: compileVintageStoryShape,
		parse(model, path, args = {}) {
			try {
				applyVintageStoryShapeToProject(model, path, args);
			} catch (error) {
				showVintageStoryLoadError(error);
			}
		},
		load(model, file, args = {}) {
			if (args.import_to_current_project) {
				this.merge(model, file?.path, args);
				return;
			}
			setupProject(Formats.free);
			if (file?.path) {
				Project.name = pathToName(file.path, false);
				if (isApp && !file.no_file) {
					Project.save_path = file.path;
					Project.export_path = file.path;
					Project.export_codec = this.id;
					addRecentProject({
						name: pathToName(file.path, true),
						path: file.path,
						icon: Format.icon
					});
					setTimeout(() => updateRecentProjectThumbnail(), 200);
				}
			}
			this.parse(model, file?.path, args);
		},
		merge(model, path, args = {}) {
			try {
				Undo.initEdit({outliner: true, elements: [], textures: []});
				applyVintageStoryShapeToProject(model, path, Object.assign({}, args, {warnings: []}));
				Undo.finishEdit('Import Vintage Story JSON');
			} catch (error) {
				Undo.cancelEdit();
				showVintageStoryLoadError(error);
			}
		},
		export() {
			Blockbench.export({
				resource_id: 'model',
				type: this.name,
				extensions: [this.extension],
				name: this.fileName(),
				startpath: Project.save_path || Project.export_path,
				content: isApp ? null : this.compile(),
				custom_writer: isApp ? (content, path) => {
					Project.save_path = path;
					Project.export_path = path;
					Project.export_codec = this.id;
					Project.name = pathToName(path, false);
					this.write(this.compile(), path);
				} : null,
			}, path => this.afterDownload(path));
		},
		afterSave(path) {
			let writeTransformEdits = typeof window !== 'undefined' ? window.writeVintageStoryAssetTransformEdits : null;
			let writeback = writeTransformEdits?.(Project.vintage_story_data?.asset_context, Project.display_settings);
			let writeInteractionBoxEdits = typeof window !== 'undefined' ? window.writeVintageStoryAssetInteractionBoxEdits : null;
			let box_writeback = writeInteractionBoxEdits?.(Project.vintage_story_data?.asset_context, Project.vintage_story_data?.interaction_boxes);
			if (box_writeback?.warnings?.length) {
				writeback = writeback || {warnings: []};
				writeback.warnings = (writeback.warnings || []).concat(box_writeback.warnings);
				writeback.cancelled = writeback.cancelled || box_writeback.cancelled;
			}
			let writeAttachmentEdits = typeof window !== 'undefined' ? window.writeVintageStoryAssetAttachmentEdits : null;
			let attachment_writeback = writeAttachmentEdits?.(Project.vintage_story_data?.asset_context, Project.vintage_story_data?.attachments);
			if (attachment_writeback?.warnings?.length) {
				writeback = writeback || {warnings: []};
				writeback.warnings = (writeback.warnings || []).concat(attachment_writeback.warnings);
				writeback.cancelled = writeback.cancelled || attachment_writeback.cancelled;
			}
			if (writeback?.warnings?.length && Blockbench?.showMessageBox) {
				Blockbench.showMessageBox({
					title: 'Vintage Story Asset Save',
					icon: writeback.cancelled ? 'warning' : 'info',
					message: writeback.warnings.join('\n')
				});
			}
			let name = pathToName(path, true);
			Project.save_path = path;
			Project.export_path = path;
			Project.export_codec = this.id;
			Project.name = pathToName(path, false);
			Project.saved = true;
			Settings.updateSettingsInProfiles();
			addRecentProject({
				name,
				path,
				icon: Format.icon
			});
			updateRecentProjectThumbnail();
			Blockbench.showQuickMessage(tl('message.save_file', [name]));
		}
	});

	Formats.free.codec = codec;
	return codec;
}

const VintageStoryJson = {
	VS_FACE_DIRECTIONS,
	createDefaultVintageStoryShape,
	looksLikeVintageStoryShape,
	validateVintageStoryShape,
	compileVintageStoryShape,
	setupNewVintageStoryProject,
	registerVintageStoryCodec
};

if (typeof window !== 'undefined') {
	window.VintageStoryJson = VintageStoryJson;
	registerVintageStoryCodec();
}

export {VintageStoryJson};
