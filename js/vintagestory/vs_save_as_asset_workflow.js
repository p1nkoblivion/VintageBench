import { fs, PathModule, currentwindow, dialog, shell } from '../native_apis';
import { Settings } from '../interface/settings';
import { getDefaultVintageBenchModExportsPath } from './vs_app_data_paths.js';
import {
	SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES,
	SAVE_AS_ASSET_ATTACHMENT_MODES,
	SAVE_AS_ASSET_BEHAVIOR_BOX_MODES,
	SAVE_AS_ASSET_GROUND_STORABLE_LAYOUTS,
	SAVE_AS_ASSET_INTERACTION_BOX_MODES,
	SAVE_AS_ASSET_LANG_MODES,
	SAVE_AS_ASSET_TEXTURE_MODES,
	SAVE_AS_ASSET_TRANSFORM_MODES,
	assetBaseFromFilePath,
	buildVintageStoryLangEntries,
	defaultAssetFileName,
	defaultShapeFileName,
	generateVintageStoryAssetPreview,
	getSaveAsAssetPresetOptions,
	getSaveAsAssetTransformOptions,
	getVerifiedSaveAsAssetAttributes,
	parseAdvancedJsonArrayText,
	parseAdvancedJsonObjectText,
	parseCreativeInventoryText,
	parseCreativeInventoryByTypeText,
	parseGenericByTypeText,
	parsePatternListText,
	parseAttachmentSlotsText,
	parseShapeAlternatesText,
	parseTagsText,
	parseTextureDefaultsText,
	parseTexturesByTypeText,
	parseVariantGroupsText,
	sanitizeVintageStoryAssetCode,
	serializeGeneratedVintageStoryAsset
} from './vs_asset_generator.js';
import { displaySlotHasVintageStoryTransform } from '../display_mode/vintage_story_display_transforms.js';
import { interactionBoxFromModelBounds } from './vs_interaction_boxes.js';
import {
	clearVintageStoryDirtyFile,
	setVintageStoryDirty,
	VINTAGE_STORY_DIRTY_KINDS
} from './vs_dirty_state.js';
import { writeVintageStoryTextFile } from './vs_file_write_safety.js';
import {
	buildVintageStoryWorkspace,
	getVintageStoryLangPath,
	getVintageStoryWorkspaceFromSettings
} from './vs_asset_workspace.js';
import {
	getVintageStoryAssetDomain,
	isPathUnderRoot,
	listVintageStoryAssetVariants,
	resolveVintageStoryAssetVariant
} from './vs_asset_resolver.js';
import {
	parseVintageStoryAssetDocument,
	parseVintageStoryAssetText,
	serializeVintageStoryAssetDocument
} from './vs_asset_document.js';
import { applyVintageStoryAssetContextToProject } from './vs_asset_workflow.js';

function getSettingValue(id) {
	return settings?.[id]?.value || '';
}

function slash(path) {
	return String(path || '').replace(/\\/g, '/');
}

function showMessage(title, message, icon = 'info') {
	if (Blockbench?.showMessageBox) {
		Blockbench.showMessageBox({title, icon, message});
	} else if (icon === 'error') {
		console.error(title, message);
	} else {
		console.warn(title, message);
	}
}

function shouldCreateBackups() {
	return settings?.vintage_story_create_backups?.value !== false;
}

function currentWorkspace() {
	return getVintageStoryWorkspaceFromSettings(settings, PathModule, Project?.save_path || Project?.export_path || '');
}

function currentAssetDomain(fallback = 'game') {
	let workspace_domain = currentWorkspace().domain;
	if (workspace_domain) return workspace_domain;
	return getVintageStoryAssetDomain(Project?.save_path || Project?.export_path || '', fallback);
}

function getSuggestedRoot() {
	return getSettingValue('vintage_story_mod_root_path')
		|| getSettingValue('vintage_story_mod_assets_path')
		|| Project?.save_path && PathModule.dirname(Project.save_path)
		|| Project?.export_path && PathModule.dirname(Project.export_path)
		|| '';
}

function suggestShapePath(code, asset_type, domain) {
	let workspace = currentWorkspace();
	let root = getSuggestedRoot();
	let name = defaultShapeFileName(code);
	if (workspace.folders.shapes) {
		return PathModule.join(workspace.folders.shapes, asset_type === 'block' ? 'block' : 'item', name);
	}
	if (!root) return name;
	if (slash(root).match(/\/assets\/[^/]+$/i)) {
		return PathModule.join(root, 'shapes', asset_type === 'block' ? 'block' : 'item', name);
	}
	if (slash(root).match(/\/assets\/[^/]+\/shapes/i)) {
		return PathModule.join(root, name);
	}
	if (!root) return PathModule.join('assets', domain || 'game', 'shapes', asset_type === 'block' ? 'block' : 'item', name);
	return PathModule.join(root, 'assets', domain || 'game', 'shapes', asset_type === 'block' ? 'block' : 'item', name);
}

function suggestAssetPath(code, asset_type, shape_path, domain) {
	let workspace = currentWorkspace();
	let name = defaultAssetFileName(code);
	let workspace_folder = asset_type === 'block' ? workspace.folders.blocktypes : workspace.folders.itemtypes;
	if (workspace_folder) return PathModule.join(workspace_folder, name);
	let normalized_shape = slash(shape_path);
	let match = normalized_shape.match(/^(.*)\/assets\/([^/]+)\/shapes\//i);
	if (match) {
		return PathModule.join(match[1], 'assets', match[2], asset_type === 'block' ? 'blocktypes' : 'itemtypes', name);
	}
	let root = getSuggestedRoot();
	if (!root) return PathModule.join('assets', domain || 'game', asset_type === 'block' ? 'blocktypes' : 'itemtypes', name);
	return PathModule.join(root, 'assets', domain || 'game', asset_type === 'block' ? 'blocktypes' : 'itemtypes', name);
}

function suggestLangPath(language = 'en') {
	return getVintageStoryLangPath(currentWorkspace(), language || 'en', PathModule);
}

function textureAliasFromTexture(texture, used) {
	let alias = texture?.vintage_story?.code || texture?.id || texture?.name || 'texture';
	alias = String(alias).replace(/^#/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_./-]/g, '_') || 'texture';
	let unique = alias;
	let i = 2;
	while (used.has(unique)) unique = `${alias}_${i++}`;
	used.add(unique);
	return unique;
}

function collectCurrentTextureDefaults(asset_path = '') {
	let aliases = {};
	let used = new Set();
	let workspace = currentWorkspace();
	if (typeof Texture !== 'undefined' && Array.isArray(Texture.all)) {
		Texture.all.forEach(texture => {
			let alias = textureAliasFromTexture(texture, used);
			let base = '';
			if (typeof texture.vintage_story?.path === 'string' && texture.vintage_story.path && !texture.vintage_story.path.includes('\\')) {
				base = texture.vintage_story.path.replace(/\.(png|jpe?g)$/i, '');
			} else if (texture.path) {
				base = assetBaseFromFilePath(texture.path, 'textures', asset_path, workspace) || '';
			}
			aliases[alias] = base;
		});
	}
	return aliases;
}

function collectCurrentTextureAliases() {
	let aliases = [];
	if (typeof Texture !== 'undefined' && Array.isArray(Texture.all)) {
		let used = new Set();
		Texture.all.forEach(texture => aliases.push(textureAliasFromTexture(texture, used)));
	}
	return aliases;
}

function textureDefaultsToText(defaults) {
	let keys = Object.keys(defaults || {});
	if (!keys.length) return 'texture = ';
	return keys.map(alias => `${alias} = ${defaults[alias] || ''}`).join('\n');
}

function firstTextureAlias(defaults) {
	return Object.keys(defaults || {})[0] || 'outside';
}

function displayNameFromCode(code) {
	return String(code || 'asset')
		.split(':').pop()
		.split('/').pop()
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, match => match.toUpperCase());
}

function currentModelBounds() {
	let min = [Infinity, Infinity, Infinity];
	let max = [-Infinity, -Infinity, -Infinity];
	let found = false;
	let elements = globalThis.Cube?.all || globalThis.Outliner?.elements || [];
	elements.forEach(element => {
		let from = element.from || element.origin;
		let to = element.to;
		if (!Array.isArray(from) || !Array.isArray(to)) return;
		for (let i = 0; i < 3; i++) {
			min[i] = Math.min(min[i], from[i], to[i]);
			max[i] = Math.max(max[i], from[i], to[i]);
		}
		found = true;
	});
	return found ? {min, max} : null;
}

function compileSaveAsAssetShape() {
	if (!Codecs?.vintage_story_json?.compile) {
		throw new Error('The current model cannot be compiled as Vintage Story shape JSON.');
	}
	return Codecs.vintage_story_json.compile({omitDisplayTransforms: true});
}

const SAVE_AS_ASSET_ATTRIBUTE_OPTIONS = getVerifiedSaveAsAssetAttributes();
const SAVE_AS_ASSET_TRANSFORM_OPTIONS = getSaveAsAssetTransformOptions();
const SAVE_AS_ASSET_PRESET_OPTIONS = getSaveAsAssetPresetOptions();
const SAVE_AS_NEW_ASSET_TITLE = 'Save as New Asset';
const SAVE_AS_ASSET_WIZARD_PAGES = [
	'Asset Info',
	'Shape',
	'Textures',
	'Variants',
	'Attributes',
	'General',
	'Transforms',
	'Advanced',
	'Preview'
];

function attributeFieldId(id) {
	return `attr_${id}`;
}

function transformFieldId(id) {
	return `transform_${id}`;
}

function makeAttributeDefaults() {
	let defaults = {};
	SAVE_AS_ASSET_ATTRIBUTE_OPTIONS.forEach(attribute => {
		defaults[attributeFieldId(attribute.id)] = attribute.input === 'select' ? 'none' : false;
	});
	return defaults;
}

function makeTransformDefaults() {
	let defaults = {};
	SAVE_AS_ASSET_TRANSFORM_OPTIONS.forEach(option => {
		defaults[transformFieldId(option.id)] = displaySlotHasVintageStoryTransform(Project?.display_settings?.[option.id]);
	});
	return defaults;
}

function collectAttributesFromForm(form_result) {
	let attributes = {};
	SAVE_AS_ASSET_ATTRIBUTE_OPTIONS.forEach(attribute => {
		let value = form_result[attributeFieldId(attribute.id)];
		if (attribute.input === 'select') {
			if (value && value !== 'none') attributes[attribute.id] = value;
		} else if (value) {
			attributes[attribute.id] = true;
		}
	});
	return attributes;
}

function collectTransformSelectionFromForm(form_result) {
	let selection = {};
	SAVE_AS_ASSET_TRANSFORM_OPTIONS.forEach(option => {
		selection[option.id] = !!form_result[transformFieldId(option.id)];
	});
	return selection;
}

function makeAttributeFormFields(defaults) {
	let fields = {};
	SAVE_AS_ASSET_ATTRIBUTE_OPTIONS.forEach(attribute => {
		let field_id = attributeFieldId(attribute.id);
		let label = `Attribute: ${attribute.label}`;
		if (attribute.input === 'select') {
			fields[field_id] = {
				type: 'select',
				label,
				value: defaults[field_id],
				options: attribute.options,
				description: attribute.description
			};
		} else {
			fields[field_id] = {
				type: 'checkbox',
				label,
				value: defaults[field_id],
				description: attribute.description
			};
		}
	});
	return fields;
}

function makeTransformFormFields(defaults) {
	let fields = {};
	SAVE_AS_ASSET_TRANSFORM_OPTIONS.forEach(option => {
		let field_id = transformFieldId(option.id);
		fields[field_id] = {
			type: 'checkbox',
			label: `Transform: ${option.label}`,
			value: defaults[field_id],
			condition: result => result.include_display_transforms,
			description: option.location === 'attributes'
				? `Writes attributes.${option.jsonKey} or attributes.${option.jsonKey}ByType.`
				: `Writes ${option.jsonKey} or ${option.jsonKey}ByType.`
		};
	});
	return fields;
}

function presetSelectOptions() {
	return Object.fromEntries(SAVE_AS_ASSET_PRESET_OPTIONS.map(preset => [preset.id, preset.label]));
}

function groundStorableLayoutOptions() {
	return Object.fromEntries(SAVE_AS_ASSET_GROUND_STORABLE_LAYOUTS.map(layout => [layout, layout || 'No layout field']));
}

function formToConfig(form_result, asset_save_path = '') {
	let variant_result = parseVariantGroupsText(form_result.variantgroups);
	let allowed_variants = parsePatternListText(form_result.allowed_variants);
	let skip_variants = parsePatternListText(form_result.skip_variants);
	let creative_mode = form_result.creativeinventory_use_by_type
		? SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES.BY_TYPE
		: (form_result.creativeinventory_mode || SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES.DIRECT);
	let creative_result = form_result.include_creativeinventory && creative_mode === SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES.DIRECT
		? parseCreativeInventoryText(form_result.creativeinventory)
		: {creativeinventory: {}, errors: []};
	let creative_by_type_result = form_result.include_creativeinventory && creative_mode === SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES.BY_TYPE
		? parseCreativeInventoryByTypeText(form_result.creativeinventory_by_type)
		: {entries: [], errors: []};
	let texture_mode = form_result.texture_mode || SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS;
	let texture_defaults_result = texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS
		? parseTextureDefaultsText(form_result.texture_defaults)
		: {textures: {}, errors: []};
	let textures_by_type_result = texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE
		? parseTexturesByTypeText(form_result.textures_by_type)
		: {entries: [], errors: []};
	let by_type_result = parseGenericByTypeText(form_result.advanced_by_type);
	let root_extras_result = parseAdvancedJsonObjectText(form_result.root_extra_json, 'Root extras JSON');
	let attributes_extras_result = parseAdvancedJsonObjectText(form_result.attributes_extra_json, 'Attributes extras JSON');
	let behaviors_result = parseAdvancedJsonArrayText(form_result.behaviors_json, 'Behaviors JSON');
	let shape_alternates_result = parseShapeAlternatesText(form_result.shape_alternates);
	let tags_result = parseTagsText(form_result.tags);
	let attachment_slots_result = form_result.include_attachable_to_entity
		? parseAttachmentSlotsText(form_result.attachment_slots)
		: {slots: [], errors: []};
	let errors = []
		.concat(variant_result.errors || [])
		.concat(creative_result.errors || [])
		.concat(creative_by_type_result.errors || [])
		.concat(texture_defaults_result.errors || [])
		.concat(textures_by_type_result.errors || [])
		.concat(by_type_result.errors || [])
		.concat(root_extras_result.errors || [])
		.concat(attributes_extras_result.errors || [])
		.concat(behaviors_result.errors || [])
		.concat(shape_alternates_result.errors || [])
		.concat(tags_result.errors || [])
		.concat(attachment_slots_result.errors || []);
	let warnings = [].concat(variant_result.warnings || []);
	let attributes = collectAttributesFromForm(form_result);
	let workspace = currentWorkspace();
	return {
		assetType: form_result.asset_type || 'block',
		domain: form_result.domain || currentAssetDomain('game'),
		workspace,
		assetPreset: form_result.use_preset ? (form_result.asset_preset || 'none') : 'none',
		code: String(form_result.code || '').trim(),
		displayName: String(form_result.display_name || '').trim(),
		shapeSavePath: form_result.shape_save_path || '',
		assetSavePath: asset_save_path,
		shapeBase: String(form_result.shape_base || '').trim(),
		shapeMode: form_result.shape_mode || 'direct',
		shapeAlternates: shape_alternates_result.alternates,
		variantgroups: variant_result.variantgroups,
		allowedVariants: allowed_variants,
		skipVariants: skip_variants,
		textureMode: texture_mode,
		textureDefaults: texture_defaults_result.textures,
		texturesByTypeEntries: textures_by_type_result.entries,
		maxStackSize: form_result.max_stack_size,
		creativeInventoryMode: creative_mode,
		creativeinventory: creative_result.creativeinventory,
		creativeinventoryByTypeEntries: creative_by_type_result.entries,
		tags: tags_result.tags,
		attributes,
		toolType: form_result.tool_type,
		durabilityValue: form_result.durability_value,
		attackPowerValue: form_result.attack_power_value,
		attackRangeValue: form_result.attack_range_value,
		className: form_result.class_name,
		entityClassName: form_result.entityclass_name,
		byTypeEntries: by_type_result.entries,
		rootExtras: root_extras_result.value,
		attributesExtras: attributes_extras_result.value,
		behaviors: behaviors_result.value,
		includeDisplayTransforms: !!form_result.include_display_transforms,
		transformMode: form_result.transform_mode || SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_FALLBACK,
		transformSelection: collectTransformSelectionFromForm(form_result),
		displaySettings: Project?.display_settings || {},
		interactionBoxMode: form_result.interaction_box_mode || SAVE_AS_ASSET_INTERACTION_BOX_MODES.NONE,
		behaviorBoxMode: form_result.behavior_box_mode || SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE,
		groundStorableLayout: form_result.groundstorable_layout,
		groundStorableCtrlKey: !!form_result.groundstorable_ctrl_key,
		interactionBoxes: Project?.vintage_story_data?.interaction_boxes || [],
		shapeBoundsBox: interactionBoxFromModelBounds(currentModelBounds()),
		includeAttachableToEntity: !!form_result.include_attachable_to_entity,
		attachmentMode: form_result.attachment_mode || SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_FALLBACK,
		attachmentCategoryCode: form_result.attachment_category_code,
		attachmentSlots: attachment_slots_result.slots,
		modelTextureAliases: collectCurrentTextureAliases(),
		generateLang: !!form_result.generate_lang,
		langMode: form_result.lang_mode || SAVE_AS_ASSET_LANG_MODES.BASE,
		langLanguage: form_result.lang_language || 'en',
		langPath: form_result.lang_path || suggestLangPath(form_result.lang_language || 'en'),
		parseErrors: errors,
		parseWarnings: warnings
	};
}

function makePreview(form_result, asset_save_path = '') {
	let config = formToConfig(form_result, asset_save_path);
	let preview = generateVintageStoryAssetPreview(config);
	let errors = Array.from(new Set([...(config.parseErrors || []), ...(preview.errors || [])]));
	let warnings = Array.from(new Set([...(config.parseWarnings || []), ...(preview.warnings || [])]));
	let variants = preview.allVariants.map(variant => ({
		code: variant.variantCode,
		states: variant.states,
		included: variant.included,
		skipped: variant.skipped,
		disallowed: variant.disallowed
	}));
	let text = serializeGeneratedVintageStoryAsset(preview.asset);
	let langEntries = buildVintageStoryLangEntries(config, preview.variants || []);
	return {config, preview, errors, warnings, variants, text, langEntries};
}

function isVanillaGamePath(path) {
	let root = getSettingValue('vintage_story_assets_path');
	return !!(root && isPathUnderRoot(path, root));
}

function confirmWritePath(path, label) {
	if (!path) return false;
	if (isVanillaGamePath(path)) {
		let result = dialog.showMessageBoxSync(currentwindow, {
			type: 'warning',
			noLink: true,
			title: `Save ${label} inside game assets?`,
			message: `This ${label.toLowerCase()} path is inside the configured Vintage Story game assets folder.`,
			detail: path,
			cancelId: 1,
			defaultId: 1,
			buttons: ['Save anyway', 'Cancel']
		});
		if (result !== 0) return false;
	}
	if (fs.existsSync(path)) {
		let result = dialog.showMessageBoxSync(currentwindow, {
			type: 'warning',
			noLink: true,
			title: `Overwrite ${label}?`,
			message: `${label} already exists.`,
			detail: path,
			cancelId: 1,
			defaultId: 1,
			buttons: ['Overwrite', 'Cancel']
		});
		if (result !== 0) return false;
	}
	return true;
}

function confirmLangWritePath(path) {
	if (!path) return false;
	if (isVanillaGamePath(path)) {
		let result = dialog.showMessageBoxSync(currentwindow, {
			type: 'warning',
			noLink: true,
			title: 'Save Lang inside game assets?',
			message: 'This lang path is inside the configured Vintage Story game assets folder.',
			detail: path,
			cancelId: 1,
			defaultId: 1,
			buttons: ['Save anyway', 'Cancel']
		});
		return result === 0;
	}
	return true;
}

function updateLangFile(lang_path, entries) {
	if (!lang_path || !entries || !Object.keys(entries).length) return {written: false};
	if (!confirmLangWritePath(lang_path)) return {written: false};
	let current = {};
	if (fs.existsSync(lang_path)) {
		try {
			current = parseVintageStoryAssetText(fs.readFileSync(lang_path, 'utf8'), lang_path);
		} catch (error) {
			throw new Error(`Could not parse existing lang file ${lang_path}: ${error.message || error}`);
		}
	}
	if (!current || typeof current !== 'object' || Array.isArray(current)) {
		throw new Error(`Existing lang file ${lang_path} is not a JSON object.`);
	}
	Object.assign(current, entries);
	return writeVintageStoryTextFile(lang_path, serializeVintageStoryAssetDocument(current), {fs, PathModule}, {
		createBackups: shouldCreateBackups()
	});
}

function getResolverOptions(asset_path) {
	return {
		sourceFilePath: asset_path,
		fs,
		PathModule,
		gameAssetRoot: getSettingValue('vintage_story_assets_path'),
		modAssetRoot: getSettingValue('vintage_story_mod_root_path') || getSettingValue('vintage_story_mod_assets_path'),
		workspaceAssetRoot: '',
		additionalAssetRoots: getSettingValue('vintage_story_additional_assets_paths')
	};
}

function attachGeneratedAssetContext(asset_path, asset_text, open_without_textures = false) {
	try {
		let document = parseVintageStoryAssetDocument(asset_text, asset_path);
		let variants = listVintageStoryAssetVariants(document, 0);
		let variant = variants.includedVariants[0] || variants.allVariants[0];
		if (!variant) return;
		let options = getResolverOptions(asset_path);
		options.skipTextures = open_without_textures;
		let resolved = resolveVintageStoryAssetVariant(document, 0, variant, options);
		applyVintageStoryAssetContextToProject(resolved, {openWithoutTextures: open_without_textures});
	} catch (error) {
		showMessage(SAVE_AS_NEW_ASSET_TITLE, `Saved files, but could not attach generated asset context: ${error.message || error}`, 'warning');
	}
}

function saveShapeAndAsset(config, asset_text, lang_entries = {}) {
	let shape_path = config.shapeSavePath;
	let asset_path = config.assetSavePath;
	let backups = [];
	if (slash(shape_path).toLowerCase() === slash(asset_path).toLowerCase()) {
		showMessage(SAVE_AS_NEW_ASSET_TITLE, 'Shape JSON and asset JSON cannot be saved to the same file.', 'error');
		return false;
	}
	if (!confirmWritePath(shape_path, 'Shape JSON')) return false;
	if (!confirmWritePath(asset_path, 'Asset JSON')) return false;
	setVintageStoryDirty(Project, VINTAGE_STORY_DIRTY_KINDS.MAIN_SHAPE, true, {
		filePath: shape_path,
		reason: 'Pending Save as New Asset shape write'
	});
	setVintageStoryDirty(Project, VINTAGE_STORY_DIRTY_KINDS.ASSET, true, {
		filePath: asset_path,
		reason: 'Pending Save as New Asset item/block write'
	});
	if (config.generateLang && Object.keys(lang_entries || {}).length) {
		setVintageStoryDirty(Project, VINTAGE_STORY_DIRTY_KINDS.LANG, true, {
			filePath: config.langPath,
			reason: 'Pending Save as New Asset lang write'
		});
	}
	let shape_content = compileSaveAsAssetShape();
	try {
		let shape_write = writeVintageStoryTextFile(shape_path, shape_content, {fs, PathModule}, {createBackups: shouldCreateBackups()});
		if (shape_write.backupPath) backups.push(shape_write.backupPath);
		clearVintageStoryDirtyFile(Project, VINTAGE_STORY_DIRTY_KINDS.MAIN_SHAPE, shape_path);
		Project.save_path = shape_path;
		Project.export_path = shape_path;
		Project.export_codec = 'vintage_story_json';
		Project.name = pathToName(shape_path, false);
		Project.saved = true;
	} catch (error) {
		showMessage(SAVE_AS_NEW_ASSET_TITLE, `Shape JSON failed to save, so asset JSON was not written:\n${error.message || error}`, 'error');
		return false;
	}
	try {
		let asset_write = writeVintageStoryTextFile(asset_path, asset_text, {fs, PathModule}, {createBackups: shouldCreateBackups()});
		if (asset_write.backupPath) backups.push(asset_write.backupPath);
		clearVintageStoryDirtyFile(Project, VINTAGE_STORY_DIRTY_KINDS.ASSET, asset_path);
	} catch (error) {
		showMessage(SAVE_AS_NEW_ASSET_TITLE, `Shape was saved, but asset JSON failed to save:\n${error.message || error}`, 'error');
		return false;
	}
	if (config.generateLang && Object.keys(lang_entries || {}).length) {
		try {
			let lang_write = updateLangFile(config.langPath, lang_entries);
			if (lang_write.backupPath) backups.push(lang_write.backupPath);
			clearVintageStoryDirtyFile(Project, VINTAGE_STORY_DIRTY_KINDS.LANG, config.langPath);
		} catch (error) {
			showMessage(SAVE_AS_NEW_ASSET_TITLE, `Shape and asset were saved, but lang JSON failed to save:\n${error.message || error}`, 'warning');
		}
	}
	addRecentProject({
		name: pathToName(shape_path, true),
		path: shape_path,
		icon: Format.icon
	});
	attachGeneratedAssetContext(asset_path, asset_text);
	Blockbench.showQuickMessage(`Saved ${pathToName(asset_path, true)} and ${pathToName(shape_path, true)}${backups.length ? ` with ${backups.length} backup${backups.length === 1 ? '' : 's'}` : ''}`);
	try {
		shell.showItemInFolder(asset_path);
	} catch (error) {}
	return true;
}

function validateBeforeAssetSave(form_result) {
	let preview = makePreview(form_result);
	let errors = preview.errors.slice();
	if (!form_result.shape_save_path) errors.push('Shape Save Path is required.');
	if (!form_result.asset_type) errors.push('Asset Type is required.');
	if (form_result.generate_lang && !form_result.lang_path) errors.push('Lang File is required when Generate Lang Entry is enabled.');
	if (errors.length) {
		showMessage('Save as New Asset validation failed', errors.join('\n'), 'error');
		return null;
	}
	if (preview.warnings.length) {
		let result = dialog.showMessageBoxSync(currentwindow, {
			type: 'warning',
			noLink: true,
			title: 'Save as New Asset warnings',
			message: preview.warnings.join('\n'),
			cancelId: 1,
			defaultId: 0,
			buttons: ['Continue', 'Cancel']
		});
		if (result !== 0) return null;
	}
	return preview;
}

function openAssetSaveDialog(form_result, owner_dialog) {
	let initial_preview = validateBeforeAssetSave(form_result);
	if (!initial_preview) return;
	let code = sanitizeVintageStoryAssetCode(form_result.code || 'asset') || 'asset';
	let startpath = suggestAssetPath(code, form_result.asset_type || 'block', form_result.shape_save_path, form_result.domain || currentAssetDomain('game'));
	Blockbench.export({
		resource_id: 'vintage_story_asset_save_as_asset',
		type: form_result.asset_type === 'item' ? 'Vintage Story Item Asset' : 'Vintage Story Block Asset',
		extensions: ['json'],
		name: defaultAssetFileName(code),
		startpath,
		content: '',
		custom_writer(content, asset_path, callback) {
			let final_preview = makePreview(form_result, asset_path);
			let errors = final_preview.errors.slice();
			if (errors.length) {
				showMessage('Save as New Asset validation failed', errors.join('\n'), 'error');
				return;
			}
			let config = Object.assign({}, final_preview.config, {
				assetSavePath: asset_path,
				domain: getVintageStoryAssetDomain(asset_path, final_preview.config.domain || 'game')
			});
			let asset_text = final_preview.text;
			if (saveShapeAndAsset(config, asset_text, final_preview.langEntries)) {
				if (callback) callback(asset_path);
				owner_dialog.hide();
			}
		}
	});
}

function createSaveAsAssetFormDefaults() {
	let code = sanitizeVintageStoryAssetCode(Project?.name || 'asset') || 'asset';
	let domain = currentAssetDomain('game');
	let asset_type = 'block';
	let shape_path = suggestShapePath(code, asset_type, domain);
	let texture_defaults = collectCurrentTextureDefaults();
	let alias = firstTextureAlias(texture_defaults);
	let lang_path = suggestLangPath('en');
	return Object.assign({
		asset_type,
		use_preset: false,
		asset_preset: 'none',
		domain,
		code,
		display_name: displayNameFromCode(code),
		shape_save_path: shape_path,
		shape_base: '',
		shape_mode: 'direct',
		shape_alternates: '',
		variantgroups: '',
		allowed_variants: '',
		skip_variants: '',
		texture_mode: SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS,
		texture_defaults: textureDefaultsToText(texture_defaults),
		textures_by_type: `* | ${alias} | block/{${alias}}`,
		max_stack_size: '',
		tags: '',
		include_creativeinventory: true,
		creativeinventory_use_by_type: false,
		creativeinventory_mode: SAVE_AS_ASSET_CREATIVE_INVENTORY_MODES.DIRECT,
		creativeinventory: 'general: *',
		creativeinventory_by_type: '* | general | *',
		tool_type: '',
		durability_value: '',
		attack_power_value: '',
		attack_range_value: '',
		class_name: '',
		entityclass_name: '',
		advanced_by_type: '',
		behaviors_json: '',
		root_extra_json: '',
		attributes_extra_json: '',
		generate_lang: !!lang_path,
		lang_mode: SAVE_AS_ASSET_LANG_MODES.BASE,
		lang_language: 'en',
		lang_path,
		interaction_box_mode: SAVE_AS_ASSET_INTERACTION_BOX_MODES.NONE,
		behavior_box_mode: SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE,
		groundstorable_layout: 'Quadrants',
		groundstorable_ctrl_key: false,
		include_attachable_to_entity: false,
		attachment_mode: SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_FALLBACK,
		attachment_category_code: 'toolholding',
		attachment_slots: '',
		include_display_transforms: true,
		transform_mode: SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_FALLBACK,
		variant_preview: '',
		warnings_preview: '',
		asset_preview: ''
	}, makeAttributeDefaults(), makeTransformDefaults());
}

function wizardPageInfo(page_index) {
	return {
		type: 'info',
		label: `Page ${page_index + 1}`,
		text: `${page_index + 1} / ${SAVE_AS_ASSET_WIZARD_PAGES.length} - ${SAVE_AS_ASSET_WIZARD_PAGES[page_index]}`
	};
}

function sortTextureByTypeText(text) {
	let lines = String(text || '').split(/\r?\n/g)
		.map(line => line.trim())
		.filter(Boolean);
	return lines.map((line, index) => ({line, index}))
		.sort((a, b) => {
			let a_pattern = (a.line.split('|')[0] || '*').trim();
			let b_pattern = (b.line.split('|')[0] || '*').trim();
			let a_wildcard = a_pattern.includes('*');
			let b_wildcard = b_pattern.includes('*');
			if (a_wildcard !== b_wildcard) return a_wildcard ? 1 : -1;
			return a.index - b.index;
		})
		.map(entry => entry.line)
		.join('\n');
}

function textureAliasOptions(defaults) {
	let aliases = Object.keys(collectCurrentTextureDefaults() || {});
	if (!aliases.length) aliases = Object.keys(defaults?.texture_defaults ? parseTextureDefaultsText(defaults.texture_defaults).textures : {});
	if (!aliases.length) aliases = ['outside'];
	let options = {'': 'Select texture'};
	aliases.forEach(alias => {
		options[alias] = `#${alias}`;
	});
	return options;
}

function addTextureByTypeEntry(state, dialog_instance) {
	let result = Object.assign({}, state, dialog_instance?.getFormResult?.() || {});
	let pattern = String(result.texture_helper_pattern || '').trim() || '*';
	let alias = String(result.texture_helper_alias || '').trim().replace(/^#/, '');
	let domain = String(result.texture_helper_domain || '').trim();
	let base = String(result.texture_helper_path || '').trim().replace(/\\/g, '/');
	if (!alias || !base) {
		showMessage(SAVE_AS_NEW_ASSET_TITLE, 'Choose a texture alias and enter a texture path before adding a texturesByType entry.', 'error');
		return state;
	}
	if (domain && !base.includes(':')) {
		let asset_domain = String(result.domain || state.domain || '').trim();
		if (!asset_domain || domain.toLowerCase() !== asset_domain.toLowerCase()) {
			base = `${domain}:${base}`;
		}
	}
	let line = `${pattern} | ${alias} | ${base}`;
	let next_text = sortTextureByTypeText([state.textures_by_type, line].filter(Boolean).join('\n'));
	let next_state = Object.assign({}, state, result, {
		textures_by_type: next_text,
		texture_helper_pattern: '',
		texture_helper_alias: '',
		texture_helper_domain: '',
		texture_helper_path: ''
	});
	dialog_instance?.setFormValues?.({
		textures_by_type: next_text,
		texture_helper_pattern: '',
		texture_helper_alias: '',
		texture_helper_domain: '',
		texture_helper_path: ''
	}, true);
	return next_state;
}

function removeTextureByTypeEntry(state, dialog_instance) {
	let result = Object.assign({}, state, dialog_instance?.getFormResult?.() || {});
	let pattern = String(result.texture_helper_pattern || '').trim();
	let alias = String(result.texture_helper_alias || '').trim().replace(/^#/, '');
	if (!pattern && !alias) {
		showMessage(SAVE_AS_NEW_ASSET_TITLE, 'Enter a variant/wildcard pattern or choose a texture alias to remove matching texturesByType entries.', 'warning');
		return state;
	}
	let lines = String(result.textures_by_type || '').split(/\r?\n/g).filter(line => {
		let parts = line.split('|').map(part => part.trim());
		let line_pattern = parts[0] || '*';
		let line_alias = (parts[1] || '').replace(/^#/, '');
		if (pattern && line_pattern !== pattern) return true;
		if (alias && line_alias !== alias) return true;
		return false;
	});
	let next_text = sortTextureByTypeText(lines.join('\n'));
	let next_state = Object.assign({}, state, result, {textures_by_type: next_text});
	dialog_instance?.setFormValues?.({textures_by_type: next_text}, true);
	return next_state;
}

function mergeSaveAsAssetWizardState(previous_state, result) {
	let previous = Object.assign({}, previous_state);
	let next = Object.assign({}, previous_state, result || {});
	let previous_shape_path = suggestShapePath(previous.code, previous.asset_type, previous.domain);
	if (!next.shape_save_path || next.shape_save_path === previous_shape_path) {
		next.shape_save_path = suggestShapePath(next.code, next.asset_type, next.domain);
	}
	let previous_display_name = displayNameFromCode(previous.code);
	if (!next.display_name || next.display_name === previous_display_name) {
		next.display_name = displayNameFromCode(next.code);
	}
	if (!next.use_preset) next.asset_preset = 'none';
	return next;
}

function buildSaveAsAssetWizardForm(page_index, state, getDialog, setState) {
	let form = {
		page_info: wizardPageInfo(page_index)
	};
	switch (page_index) {
		case 0:
			return Object.assign(form, {
				domain: {label: 'Domain', value: state.domain, placeholder: 'game'},
				asset_type: {type: 'select', label: 'Asset Type', value: state.asset_type, options: {block: 'Block', item: 'Item'}},
				use_preset: {type: 'checkbox', label: 'Use Preset', value: !!state.use_preset},
				asset_preset: {type: 'select', label: 'Select Preset', value: state.asset_preset, condition: result => result.use_preset, options: presetSelectOptions()},
				code: {label: 'Asset Code', value: state.code, placeholder: 'flowerpot'},
				class_name: {label: 'Class', value: state.class_name, placeholder: 'ItemBow'},
				entityclass_name: {label: 'Entity Class', value: state.entityclass_name, placeholder: 'BlockEntityDisplay'},
				display_name: {label: 'In game name', value: state.display_name, placeholder: 'Flower Pot'}
			});
		case 1:
			return Object.assign(form, {
				shape_save_path: {type: 'save', label: 'Shape Save Path', value: state.shape_save_path, resource_id: 'vintage_story_shape_save_as_asset', extensions: ['json'], filetype: 'Vintage Story Shape', description: 'Default target is assets/<domain>/shapes/. The asset JSON will reference this as a Vintage Story shape base path.'},
				shape_alternates: {type: 'textarea', label: 'Shape Alternatives', value: state.shape_alternates, height: 76, placeholder: 'item/tool/bow/{type}-charge1\nitem/tool/bow/{type}-charge2'},
				interaction_box_mode: {type: 'select', label: 'Interaction Boxes', value: state.interaction_box_mode, options: {
					[SAVE_AS_ASSET_INTERACTION_BOX_MODES.NONE]: 'Do not include',
					[SAVE_AS_ASSET_INTERACTION_BOX_MODES.NO_COLLISION]: 'No Collision',
					[SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK_SELECTION]: 'Full block selection',
					[SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK_COLLISION]: 'Full block collision',
					[SAVE_AS_ASSET_INTERACTION_BOX_MODES.FULL_BLOCK]: 'Full block both',
					[SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM]: 'Custom from Panel'
				}},
				behavior_box_mode: {type: 'select', label: 'Behavior Box Targets', value: state.behavior_box_mode, condition: result => result.interaction_box_mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM, options: {
					[SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE]: 'Add GroundStorable if missing',
					[SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.EXISTING_ONLY]: 'Use existing behavior only',
					[SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.EDITOR_ONLY]: 'Keep behavior boxes editor-only'
				}},
				groundstorable_layout: {type: 'select', label: 'GroundStorable Layout', value: state.groundstorable_layout, condition: result => result.interaction_box_mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM && result.behavior_box_mode === SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE, options: groundStorableLayoutOptions(), description: 'Verified vanilla layouts include Quadrants, SingleCenter, Halves, WallHalves, and Messy12.'},
				groundstorable_ctrl_key: {type: 'checkbox', label: 'GroundStorable ctrlKey', value: state.groundstorable_ctrl_key, condition: result => result.interaction_box_mode === SAVE_AS_ASSET_INTERACTION_BOX_MODES.CUSTOM && result.behavior_box_mode === SAVE_AS_ASSET_BEHAVIOR_BOX_MODES.ADD_GROUND_STORABLE, description: 'Verified on vanilla wall-stored tools.'}
			});
		case 2:
			return Object.assign(form, {
				texture_mode: {type: 'select', label: 'Texture Mode', value: state.texture_mode, options: {
					[SAVE_AS_ASSET_TEXTURE_MODES.MODEL_DEFAULTS]: 'Use Model Defaults',
					[SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE]: 'Define By Type'
				}},
				texture_helper_pattern: {label: 'Variant / Wildcard', value: state.texture_helper_pattern || '', condition: result => result.texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE, placeholder: '* or flowerpot-red'},
				texture_helper_alias: {type: 'select', label: 'Texture Alias', value: state.texture_helper_alias || '', condition: result => result.texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE, options: textureAliasOptions(state)},
				texture_helper_domain: {label: 'Texture Domain', value: state.texture_helper_domain || '', condition: result => result.texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE, placeholder: state.domain || 'game', description: 'Leave blank for the current asset domain. Use game or another modid to write a domain prefix when needed.'},
				texture_helper_path: {label: 'Texture Path', value: state.texture_helper_path || '', condition: result => result.texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE, placeholder: 'block/clay/{color}clay'},
				texture_helper_actions: {type: 'buttons', label: 'Textures', condition: result => result.texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE, buttons: ['Add', 'Delete Matching'], click: index => {
					let next = index === 0
						? addTextureByTypeEntry(state, getDialog())
						: removeTextureByTypeEntry(state, getDialog());
					setState(next);
				}},
				textures_by_type: {type: 'textarea', label: 'Textures By Type', value: sortTextureByTypeText(state.textures_by_type), height: 130, condition: result => result.texture_mode === SAVE_AS_ASSET_TEXTURE_MODES.BY_TYPE, placeholder: 'flowerpot-red | outside | block/clay/redclay\n* | outside | block/clay/{color}clay'}
			});
		case 3:
			return Object.assign(form, {
				variantgroups: {type: 'textarea', label: 'Variant Groups', value: state.variantgroups, height: 90, placeholder: 'color: red, blue, fire\nsize: small, large'},
				allowed_variants: {type: 'textarea', label: 'Allowed Variants', value: state.allowed_variants, height: 72, placeholder: '*-copper\n*-iron'},
				skip_variants: {type: 'textarea', label: 'Skip Variants', value: state.skip_variants, height: 72, placeholder: '*-admin\nflowerpot-fire'}
			});
		case 4:
			return Object.assign(form, makeAttributeFormFields(state), {
				attachment_separator: '_',
				include_attachable_to_entity: {type: 'checkbox', label: 'Include Entity Attachment', value: state.include_attachable_to_entity},
				attachment_mode: {type: 'select', label: 'Attachment Output', value: state.attachment_mode, condition: result => result.include_attachable_to_entity, options: {
					[SAVE_AS_ASSET_ATTACHMENT_MODES.GLOBAL]: 'attributes.attachableToEntity',
					[SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_FALLBACK]: 'attributesByType "*" fallback',
					[SAVE_AS_ASSET_ATTACHMENT_MODES.BY_TYPE_EXACT]: 'attributesByType exact variants'
				}},
				attachment_category_code: {label: 'Attachment Category', value: state.attachment_category_code, condition: result => result.include_attachable_to_entity, placeholder: 'toolholding'},
				attachment_slots: {type: 'textarea', label: 'Attached Shape Slots', value: state.attachment_slots, height: 86, condition: result => result.include_attachable_to_entity, placeholder: 'frontrightside | item/wearable/hooved/elk/weaponr-falx\nfrontleftside | item/wearable/hooved/elk/weaponl-falx'}
			});
		case 5:
			return Object.assign(form, {
				max_stack_size: {label: 'Max Stack Size', value: state.max_stack_size, placeholder: '64'},
				tags: {type: 'textarea', label: 'Tags', value: state.tags, height: 64, placeholder: 'tool\nweapon'},
				generate_lang: {type: 'checkbox', label: 'Generate Lang Entries', value: state.generate_lang},
				lang_mode: {type: 'select', label: 'Lang Output', value: state.lang_mode, condition: result => result.generate_lang, options: {
					[SAVE_AS_ASSET_LANG_MODES.BASE]: 'Base code only',
					[SAVE_AS_ASSET_LANG_MODES.VARIANTS]: 'One entry per included variant'
				}},
				lang_language: {label: 'Lang Language', value: state.lang_language, condition: result => result.generate_lang, placeholder: 'en'},
				lang_path: {type: 'save', label: 'Lang File', value: state.lang_path, condition: result => result.generate_lang, resource_id: 'vintage_story_lang_save_as_asset', extensions: ['json'], filetype: 'Vintage Story Lang'},
				general_separator: '_',
				include_creativeinventory: {type: 'checkbox', label: 'Creative Inventory', value: state.include_creativeinventory},
				creativeinventory_use_by_type: {type: 'checkbox', label: 'Creative Inventory By Type', value: state.creativeinventory_use_by_type, condition: result => result.include_creativeinventory},
				creativeinventory: {type: 'textarea', label: 'Creative Categories', value: state.creativeinventory, height: 72, condition: result => result.include_creativeinventory && !result.creativeinventory_use_by_type, placeholder: 'general: *\ndecorative: *'},
				creativeinventory_by_type: {type: 'textarea', label: 'Creative Categories', value: state.creativeinventory_by_type, height: 72, condition: result => result.include_creativeinventory && result.creativeinventory_use_by_type, placeholder: '* | general | *\nblade-* | tools | blade-*'}
			});
		case 6:
			return Object.assign(form, {
				include_display_transforms: {type: 'checkbox', label: 'Include Display Transforms', value: state.include_display_transforms},
				transform_mode: {type: 'select', label: 'Transform Output', value: state.transform_mode, condition: result => result.include_display_transforms, options: {
					[SAVE_AS_ASSET_TRANSFORM_MODES.GLOBAL]: 'Global transform fields',
					[SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_FALLBACK]: 'ByType "*" fallback',
					[SAVE_AS_ASSET_TRANSFORM_MODES.BY_TYPE_EXACT]: 'Exact entries for each variant'
				}},
				...makeTransformFormFields(state)
			});
		case 7:
			return Object.assign(form, {
				advanced_by_type: {type: 'textarea', label: 'Advanced ByType Maps', value: state.advanced_by_type, height: 130, placeholder: 'attackpowerbytype | *-copper | 3.75\nattributes.inFirePitPropsByType | *-raw | { transform: { scale: 0.9 } }'},
				behaviors_json: {type: 'textarea', label: 'Advanced Behaviors', value: state.behaviors_json, height: 130, placeholder: '[{ name: "GroundStorable", properties: { layout: "Quadrants" } }]'}
			});
		default:
			return Object.assign(form, {
				warnings_preview: {type: 'textarea', label: 'Warnings', value: state.warnings_preview, height: 110, readonly: true},
				asset_preview: {type: 'textarea', label: 'Preview', value: state.asset_preview, height: 330, style: 'code', readonly: true, share_text: true}
			});
	}
}

export function openVintageStorySaveAsAssetDialog() {
	if (!Project || !Codecs?.vintage_story_json) {
		showMessage(SAVE_AS_NEW_ASSET_TITLE, 'Open or create a Vintage Story shape before using Save as New Asset.', 'error');
		return;
	}
	let state = createSaveAsAssetFormDefaults();
	let page_index = 0;
	let save_dialog;
	function setState(next_state) {
		state = Object.assign({}, state, next_state || {});
	}
	function updatePreview(result) {
		let preview = makePreview(Object.assign({}, state, result || {}));
		let warnings = preview.errors.concat(preview.warnings).join('\n');
		save_dialog?.setFormValues({
			warnings_preview: warnings || 'No blocking validation issues.',
			asset_preview: preview.text
		}, false);
	}
	function openPage(next_page_index) {
		page_index = Math.min(Math.max(next_page_index, 0), SAVE_AS_ASSET_WIZARD_PAGES.length - 1);
		if (save_dialog) save_dialog.hide();
		save_dialog = new Dialog({
			id: 'vintage_story_save_as_new_asset',
			title: `${SAVE_AS_NEW_ASSET_TITLE} - ${SAVE_AS_ASSET_WIZARD_PAGES[page_index]}`,
			width: 760,
			buttons: ['Back', 'Next', 'Save', 'Cancel'],
			confirmIndex: 2,
			cancelIndex: 3,
			form: buildSaveAsAssetWizardForm(page_index, state, () => save_dialog, setState),
			onFormChange(result) {
				state = mergeSaveAsAssetWizardState(state, result);
				updatePreview(result);
			},
			onButton(index) {
				if (index === 0) {
					state = mergeSaveAsAssetWizardState(state, save_dialog.getFormResult());
					if (page_index > 0) openPage(page_index - 1);
					return false;
				}
				if (index === 1) {
					state = mergeSaveAsAssetWizardState(state, save_dialog.getFormResult());
					if (page_index < SAVE_AS_ASSET_WIZARD_PAGES.length - 1) openPage(page_index + 1);
					return false;
				}
			},
			onConfirm(result) {
				state = mergeSaveAsAssetWizardState(state, result);
				openAssetSaveDialog(state, save_dialog);
				return false;
			}
		});
		save_dialog.show();
		updatePreview(save_dialog.getFormResult());
	}
	openPage(0);
}

function workspaceFormDefaults() {
	let workspace = currentWorkspace();
	let domain = workspace.domain || '';
	let mod_root = workspace.modRoot || '';
	let derived = buildVintageStoryWorkspace({modRoot: mod_root, domain, PathModule});
	return {
		mod_root,
		domain,
		mod_type: getSettingValue('vintage_story_mod_type') || 'content',
		mod_name: getSettingValue('vintage_story_mod_name') || domain,
		mod_author: getSettingValue('vintage_story_mod_author') || 'P1nkOblivion',
		mod_version: getSettingValue('vintage_story_mod_version') || '1.0.0',
		mod_description: getSettingValue('vintage_story_mod_description') || '',
		mod_dependencies: getSettingValue('vintage_story_mod_dependencies') || 'game=',
		mod_website: getSettingValue('vintage_story_mod_website') || '',
		mod_icon: getSettingValue('vintage_story_mod_icon_path') || '',
		data_folder: getSettingValue('vintage_story_data_path') || '',
		mods_folder: getSettingValue('vintage_story_mods_path') || '',
		package_output: getSettingValue('vintage_story_package_output_path') || getDefaultVintageBenchModExportsPath(),
		create_backups: settings?.vintage_story_create_backups?.value !== false,
		shapes: workspace.folders.shapes || derived.folders.shapes,
		textures: workspace.folders.textures || derived.folders.textures,
		blocktypes: workspace.folders.blocktypes || derived.folders.blocktypes,
		itemtypes: workspace.folders.itemtypes || derived.folders.itemtypes,
		lang: workspace.folders.lang || derived.folders.lang,
		game_assets: getSettingValue('vintage_story_assets_path'),
		additional_roots: getSettingValue('vintage_story_additional_assets_paths')
	};
}

function saveWorkspaceSettings(result) {
	let derived = buildVintageStoryWorkspace({
		modRoot: result.mod_root,
		domain: result.domain,
		PathModule
	});
	settings.vintage_story_mod_root_path?.set(result.mod_root || '');
	settings.vintage_story_mod_domain?.set(result.domain || '');
	settings.vintage_story_mod_type?.set(result.mod_type || 'content');
	settings.vintage_story_mod_name?.set(result.mod_name || '');
	settings.vintage_story_mod_author?.set(result.mod_author || 'P1nkOblivion');
	settings.vintage_story_mod_version?.set(result.mod_version || '1.0.0');
	settings.vintage_story_mod_description?.set(result.mod_description || '');
	settings.vintage_story_mod_dependencies?.set(result.mod_dependencies || 'game=');
	settings.vintage_story_mod_website?.set(result.mod_website || '');
	settings.vintage_story_mod_icon_path?.set(result.mod_icon || '');
	settings.vintage_story_data_path?.set(result.data_folder || '');
	settings.vintage_story_mods_path?.set(result.mods_folder || '');
	settings.vintage_story_package_output_path?.set(result.package_output || getDefaultVintageBenchModExportsPath());
	settings.vintage_story_create_backups?.set(!!result.create_backups);
	settings.vintage_story_shapes_path?.set(result.shapes || derived.folders.shapes || '');
	settings.vintage_story_textures_path?.set(result.textures || derived.folders.textures || '');
	settings.vintage_story_blocktypes_path?.set(result.blocktypes || derived.folders.blocktypes || '');
	settings.vintage_story_itemtypes_path?.set(result.itemtypes || derived.folders.itemtypes || '');
	settings.vintage_story_lang_path?.set(result.lang || derived.folders.lang || '');
	settings.vintage_story_assets_path?.set(result.game_assets || '');
	settings.vintage_story_additional_assets_paths?.set(result.additional_roots || '');
	settings.vintage_story_mod_assets_path?.set(result.mod_root || '');
	Settings?.saveLocalStorages?.();
}

export function openVintageStoryWorkspaceSettingsDialog() {
	let defaults = workspaceFormDefaults();
	new Dialog({
		id: 'vintage_story_workspace_settings',
		title: 'Vintage Story Workspace Settings',
		width: 640,
		form: {
			mod_root: {label: 'Workspace Root', value: defaults.mod_root, placeholder: 'C:/VintageStory'},
			domain: {label: 'Domain', value: defaults.domain, placeholder: 'game'},
			_: '_',
			mod_type: {type: 'select', label: 'Mod Type', value: defaults.mod_type, options: {content: 'content', code: 'code'}},
			mod_name: {label: 'Mod Name', value: defaults.mod_name, placeholder: 'My Cool Mod'},
			mod_author: {label: 'Author(s)', value: defaults.mod_author, placeholder: 'P1nkOblivion'},
			mod_version: {label: 'Version', value: defaults.mod_version, placeholder: '1.0.0'},
			mod_description: {type: 'textarea', label: 'Description', value: defaults.mod_description, height: 54},
			mod_dependencies: {type: 'textarea', label: 'Dependencies', value: defaults.mod_dependencies, height: 64, placeholder: 'game=\nattributerenderinglibrary=*'},
			mod_website: {label: 'Website', value: defaults.mod_website, placeholder: 'https://'},
			mod_icon: {label: 'Mod Icon Path', value: defaults.mod_icon, placeholder: 'modicon.png'},
			__meta: '_',
			shapes: {label: 'Shapes Folder', value: defaults.shapes, placeholder: 'assets/<domain>/shapes'},
			textures: {label: 'Textures Folder', value: defaults.textures, placeholder: 'assets/<domain>/textures'},
			blocktypes: {label: 'Blocktypes Folder', value: defaults.blocktypes, placeholder: 'assets/<domain>/blocktypes'},
			itemtypes: {label: 'Itemtypes Folder', value: defaults.itemtypes, placeholder: 'assets/<domain>/itemtypes'},
			lang: {label: 'Lang Folder', value: defaults.lang, placeholder: 'assets/<domain>/lang'},
			__: '_',
			data_folder: {label: 'Vintage Story Data Folder', value: defaults.data_folder, placeholder: 'C:/Users/<name>/AppData/Roaming/VintagestoryData'},
			mods_folder: {label: 'Vintage Story Mods Folder', value: defaults.mods_folder, placeholder: '.../VintagestoryData/Mods'},
			package_output: {label: 'Package Output Folder', value: defaults.package_output, placeholder: 'dist'},
			create_backups: {type: 'checkbox', label: 'Create backups before overwrite', value: defaults.create_backups},
			___export: '_',
			game_assets: {label: 'Game Assets Root', value: defaults.game_assets, placeholder: 'C:/Users/<name>/AppData/Roaming/Vintagestory'},
			additional_roots: {type: 'textarea', label: 'Additional Asset Roots', value: defaults.additional_roots, height: 64, placeholder: 'One root per line, or semicolon-separated'}
		},
		onConfirm(result) {
			saveWorkspaceSettings(result);
			Blockbench.showQuickMessage('Vintage Story workspace settings saved.');
		}
	}).show();
}

export function registerVintageStorySaveAsAssetWorkflow() {
	if (typeof BARS === 'undefined' || typeof Action === 'undefined') return;
	BARS.defineActions(function() {
		if (!BarItems.vintage_story_workspace_settings) {
			new Action('vintage_story_workspace_settings', {
				icon: 'folder',
				category: 'file',
				name: 'Vintage Story Workspace Settings',
				description: 'Configure the mod root, asset domain, and standard Vintage Story asset folders.',
				condition: () => isApp,
				click() {
					openVintageStoryWorkspaceSettingsDialog();
				}
			});
		}
		if (BarItems.save_vintage_story_asset) return;
		new Action('save_vintage_story_asset', {
			icon: 'save_as',
			category: 'file',
			name: SAVE_AS_NEW_ASSET_TITLE,
			description: 'Generate a new Vintage Story block/item asset JSON that references the current shape.',
			condition: () => !!Project && !!Codecs?.vintage_story_json && (Format?.codec?.id === 'vintage_story_json' || !!Project?.vintage_story_data),
			click() {
				openVintageStorySaveAsAssetDialog();
			}
		});
	});
}

if (typeof window !== 'undefined') {
	Object.assign(window, {
		openVintageStorySaveAsAssetDialog,
		openVintageStoryWorkspaceSettingsDialog
	});
	registerVintageStorySaveAsAssetWorkflow();
}
