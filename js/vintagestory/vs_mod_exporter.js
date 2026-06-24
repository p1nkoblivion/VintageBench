import JSZip from 'jszip';
import { cloneJSON, isPlainObject, wildcardMatch } from './vs_variant_resolver.js';
import {
	buildVintageStoryWorkspace,
	getVintageStoryWorkspaceFromSettings,
	getVintageStoryLangPath
} from './vs_asset_workspace.js';
import {
	buildVintageStoryAssetRoots,
	getVintageStoryAssetDomain,
	getVintageStorySourceKind,
	isPathUnderRoot,
	normalizeAssetRoots,
	normalizeCompositeBase,
	resolveAssetBasePath,
	resolveVintageStoryAssetVariant,
	listVintageStoryAssetVariants
} from './vs_asset_resolver.js';
import {
	createVintageStoryAssetDocument,
	parseVintageStoryAssetDocument,
	parseVintageStoryAssetText,
	serializeVintageStoryAssetDocument
} from './vs_asset_document.js';
import {
	assetBaseFromFilePath,
	buildVintageStoryLangEntries,
	defaultAssetFileName,
	defaultShapeFileName,
	serializeGeneratedVintageStoryAsset
} from './vs_asset_generator.js';
import {
	collectUnsafeAssetJsonStrings,
	isAbsoluteFilesystemPath,
	validateVintageStoryAssetBasePath
} from './vs_asset_path_safety.js';
import { validateBoxValue } from './vs_interaction_boxes.js';
import {
	addVintageStoryDiagnostic,
	formatVintageStoryDiagnostic,
	uniqueVintageStoryDiagnostics,
	validationIssueText
} from './vs_validation_diagnostics.js';
import {
	copyVintageStoryFile,
	writeVintageStoryTextFile
} from './vs_file_write_safety.js';

export const VS_MODINFO_TYPES = ['content', 'code'];
export const DEFAULT_VS_MOD_AUTHOR = 'P1nkOblivion';
export const DEFAULT_VS_MOD_VERSION = '1.0.0';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const JSON_EXT_RE = /\.json$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;
const MODID_RE = /^[a-z0-9_.-]+$/i;
const PACKAGE_EXCLUDE_RE = /(^|\/)(\.git|\.hg|\.svn|node_modules|bower_components|types\/generated|generated\/types|dist|dist-electron|build|coverage|tmp|temp|\.tmp|\.temp|\.cache|\.vscode|\.idea|\.history|\.vs|__pycache__)(\/|$)|(^|\/)(Thumbs\.db|desktop\.ini|\.DS_Store)$/i;
const PACKAGE_EXCLUDE_EXT_RE = /\.(bak|tmp|temp|log|map|tsbuildinfo|d\.ts|d\.ts\.map|bbmodel)$/i;
const PACKAGE_PREVIEW_ASSET_RE = /(^|\/)(\.vintagebench|vintagebench[-_]?preview|preview[-_]?assets?|preview[-_]?cache|calibration[-_]?backdrops?)(\/|$)|(^|\/)assets\/[^/]+\/(?:shapes|textures)\/vintagebench\/preview(\/|$)/i;

const MODINFO_KEY_GROUPS = {
	type: ['type', 'Type'],
	modid: ['modid', 'modID', 'Modid', 'ModID'],
	name: ['name', 'Name'],
	description: ['description', 'Description'],
	authors: ['authors', 'Authors'],
	version: ['version', 'Version'],
	dependencies: ['dependencies', 'Dependencies'],
	website: ['website', 'Website']
};

function slash(path) {
	return String(path || '').replace(/\\/g, '/');
}

function pathJoin(path_module, ...parts) {
	if (path_module?.join) return path_module.join(...parts);
	return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

function pathDirname(path_module, path) {
	if (path_module?.dirname) return path_module.dirname(path);
	let parts = slash(path).split('/');
	parts.pop();
	return parts.join('/');
}

function pathBasename(path_module, path) {
	if (path_module?.basename) return path_module.basename(path);
	return slash(path).split('/').pop() || '';
}

function pathExtname(path_module, path) {
	if (path_module?.extname) return path_module.extname(path);
	let name = pathBasename(null, path);
	let index = name.lastIndexOf('.');
	return index >= 0 ? name.substring(index) : '';
}

function pathRelative(path_module, from, to) {
	if (path_module?.relative) return slash(path_module.relative(from, to));
	let source = slash(from).replace(/\/+$/, '').split('/');
	let target = slash(to).split('/');
	while (source.length && target.length && source[0].toLowerCase() === target[0].toLowerCase()) {
		source.shift();
		target.shift();
	}
	return source.map(() => '..').concat(target).join('/');
}

function addWarning(plan_or_list, message, file = '') {
	if (!message) return;
	let warning = file ? `${file}: ${message}` : message;
	let list = Array.isArray(plan_or_list) ? plan_or_list : plan_or_list?.warnings;
	if (list && !list.includes(warning)) list.push(warning);
}

function addError(plan_or_list, message, file = '') {
	if (!message) return;
	let error = file ? `${file}: ${message}` : message;
	let list = Array.isArray(plan_or_list) ? plan_or_list : plan_or_list?.errors;
	if (list && !list.includes(error)) list.push(error);
}

function pushDiagnostic(diagnostics, options = {}) {
	return addVintageStoryDiagnostic(diagnostics, options);
}

function addWarningIssue(warnings, diagnostics, options = {}) {
	let issue = pushDiagnostic(diagnostics, Object.assign({severity: 'warning'}, options));
	addWarning(warnings, validationIssueText(issue), options.filePath || options.file || '');
	return issue;
}

function addErrorIssue(errors, diagnostics, options = {}) {
	let issue = pushDiagnostic(diagnostics, Object.assign({severity: 'error'}, options));
	addError(errors, validationIssueText(issue), options.filePath || options.file || '');
	return issue;
}

function normalizeModid(value) {
	return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_.-]/g, '');
}

export function validateVintageStoryModId(modid) {
	let errors = [];
	let value = String(modid || '').trim();
	if (!value) errors.push('Mod domain / modid is required.');
	if (value && !MODID_RE.test(value)) errors.push('Mod domain / modid may only use letters, numbers, underscore, dash, and dot.');
	return errors;
}

function firstExistingKey(object, logical_key) {
	let candidates = MODINFO_KEY_GROUPS[logical_key] || [logical_key];
	return candidates.find(key => Object.prototype.hasOwnProperty.call(object || {}, key)) || candidates[0];
}

function setModInfoValue(object, logical_key, value) {
	if (value === undefined || value === null) return;
	if (typeof value === 'string' && value.trim() === '' && logical_key !== 'description' && logical_key !== 'website') return;
	let key = firstExistingKey(object, logical_key);
	object[key] = cloneJSON(value);
}

function splitAuthors(value) {
	if (Array.isArray(value)) return value.map(entry => String(entry || '').trim()).filter(Boolean);
	return String(value || DEFAULT_VS_MOD_AUTHOR)
		.split(/[,\n;]/g)
		.map(entry => entry.trim())
		.filter(Boolean);
}

export function parseVintageStoryDependencyText(text) {
	let dependencies = {};
	String(text || 'game=').split(/\r?\n|;/g).forEach(raw => {
		let line = raw.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) return;
		let separator = line.includes('=') ? '=' : ':';
		let parts = line.split(separator);
		let key = parts.shift().trim();
		let value = parts.join(separator).trim();
		if (key) dependencies[key] = value;
	});
	if (!Object.prototype.hasOwnProperty.call(dependencies, 'game')) dependencies.game = '';
	return dependencies;
}

export function dependencyTextFromObject(dependencies = {}) {
	return Object.keys(dependencies || {}).map(key => `${key}=${dependencies[key] ?? ''}`).join('\n');
}

export function buildVintageStoryModInfo(config = {}, existing = {}) {
	let output = isPlainObject(existing) ? cloneJSON(existing) : {};
	let modid = normalizeModid(config.modid || config.domain || output.modid || output.modID || output.Modid || output.ModID);
	setModInfoValue(output, 'type', config.type || output.type || output.Type || 'content');
	setModInfoValue(output, 'modid', modid);
	setModInfoValue(output, 'name', config.name || output.name || output.Name || modid || 'Vintage Story Mod');
	setModInfoValue(output, 'description', config.description ?? output.description ?? output.Description ?? '');
	setModInfoValue(output, 'authors', splitAuthors(config.authors || output.authors || output.Authors || DEFAULT_VS_MOD_AUTHOR));
	setModInfoValue(output, 'version', config.version || output.version || output.Version || DEFAULT_VS_MOD_VERSION);
	let dependencies = isPlainObject(config.dependencies)
		? cloneJSON(config.dependencies)
		: parseVintageStoryDependencyText(config.dependenciesText || dependencyTextFromObject(output.dependencies || output.Dependencies || {game: ''}));
	setModInfoValue(output, 'dependencies', dependencies);
	if (config.website || output.website || output.Website) setModInfoValue(output, 'website', config.website || output.website || output.Website);
	return output;
}

export function validateVintageStoryModInfo(modinfo = {}, workspace = {}) {
	let warnings = [];
	let errors = [];
	let type = modinfo.type || modinfo.Type;
	let modid = modinfo.modid || modinfo.modID || modinfo.Modid || modinfo.ModID;
	let version = modinfo.version || modinfo.Version;
	let authors = modinfo.authors || modinfo.Authors;
	if (!VS_MODINFO_TYPES.includes(String(type || '').toLowerCase())) {
		addError(errors, `modinfo type must be one of ${VS_MODINFO_TYPES.join(', ')}.`);
	}
	validateVintageStoryModId(modid).forEach(error => addError(errors, error));
	if (workspace.domain && modid && String(workspace.domain).toLowerCase() !== String(modid).toLowerCase()) {
		addWarning(warnings, `modinfo modid "${modid}" does not match workspace domain "${workspace.domain}".`);
	}
	if (!version) addWarning(warnings, 'modinfo version is empty.');
	if (!Array.isArray(authors) || !authors.length) addWarning(warnings, 'modinfo authors is empty.');
	if (!isPlainObject(modinfo.dependencies || modinfo.Dependencies)) addWarning(warnings, 'modinfo dependencies is missing; "game": "" is normally expected.');
	return {warnings, errors};
}

export function getVintageStoryModExportConfigFromSettings(settings_object, PathModule = null, project_path = '') {
	let value = id => settings_object?.[id]?.value || '';
	let domain = value('vintage_story_mod_domain') || normalizeModid(value('vintage_story_mod_name')) || '';
	let workspace = getVintageStoryWorkspaceFromSettings(settings_object, PathModule, project_path);
	if (!workspace.modRoot || !workspace.domain) {
		workspace = buildVintageStoryWorkspace({
			modRoot: value('vintage_story_mod_root_path'),
			domain,
			PathModule
		});
	}
	if (!workspace.domain) workspace.domain = domain;
	let folder_overrides = {
		shapes: value('vintage_story_shapes_path'),
		textures: value('vintage_story_textures_path'),
		blocktypes: value('vintage_story_blocktypes_path'),
		itemtypes: value('vintage_story_itemtypes_path'),
		lang: value('vintage_story_lang_path')
	};
	Object.keys(folder_overrides).forEach(key => {
		if (folder_overrides[key]) workspace.folders[key] = folder_overrides[key];
	});
	return {
		workspace,
		modInfo: {
			type: value('vintage_story_mod_type') || 'content',
			modid: domain,
			name: value('vintage_story_mod_name') || domain,
			description: value('vintage_story_mod_description'),
			authors: value('vintage_story_mod_author') || DEFAULT_VS_MOD_AUTHOR,
			version: value('vintage_story_mod_version') || DEFAULT_VS_MOD_VERSION,
			dependenciesText: value('vintage_story_mod_dependencies') || 'game=',
			website: value('vintage_story_mod_website')
		},
		modIconPath: value('vintage_story_mod_icon_path'),
		dataFolder: value('vintage_story_data_path'),
		modsFolder: value('vintage_story_mods_path'),
		packageOutputFolder: value('vintage_story_package_output_path'),
		gameAssetRoot: value('vintage_story_assets_path'),
		additionalAssetRoots: value('vintage_story_additional_assets_paths'),
		createBackups: settings_object?.vintage_story_create_backups?.value !== false,
		projectPath: project_path
	};
}

function makePlan(workspace, options = {}) {
	return {
		kind: 'vintage_story_mod_export_plan',
		workspace: cloneJSON(workspace),
		createdAt: new Date().toISOString(),
		entries: [],
		warnings: [],
		errors: [],
		options: cloneJSON(options)
	};
}

function planEntry(plan, entry, adapters = {}) {
	let fs = adapters.fs;
	let exists = !!(entry.targetPath && fs?.existsSync?.(entry.targetPath));
	let normalized = Object.assign({
		id: `${entry.kind || 'file'}:${entry.targetPath || entry.sourcePath || plan.entries.length}`,
		action: entry.action || (exists ? 'update' : 'write'),
		kind: entry.kind || 'file',
		sourcePath: entry.sourcePath || '',
		targetPath: entry.targetPath || '',
		content: entry.content,
		exists,
		overwrite: exists,
		warnings: [],
		errors: [],
		skipped: false
	}, entry);
	plan.entries.push(normalized);
	return normalized;
}

function ensureWorkspace(plan, workspace, adapters = {}) {
	let fs = adapters.fs;
	validateVintageStoryModId(workspace?.domain).forEach(error => addError(plan, error));
	if (!workspace?.modRoot) addError(plan, 'Mod workspace root is required.');
	if (!workspace?.assetsRoot) addError(plan, 'assets/<domain> folder cannot be resolved without workspace root and domain.');
	if (workspace?.modRoot && fs && !fs.existsSync(workspace.modRoot)) {
		addWarning(plan, `Mod workspace root will be created: ${workspace.modRoot}`);
	}
	['shapes', 'textures', 'blocktypes', 'itemtypes', 'lang'].forEach(folder => {
		if (!workspace?.folders?.[folder]) addWarning(plan, `Workspace ${folder} folder is not configured.`);
	});
}

function readExistingObject(path, adapters = {}) {
	let fs = adapters.fs;
	if (!path || !fs?.existsSync?.(path)) return {};
	try {
		return parseVintageStoryAssetText(fs.readFileSync(path, 'utf8'), path);
	} catch (error) {
		return {};
	}
}

function modInfoPath(workspace, PathModule = null) {
	return workspace?.modRoot ? pathJoin(PathModule, workspace.modRoot, 'modinfo.json') : '';
}

function stripDomain(base, fallback_domain = '') {
	let text = String(base || '').trim().replace(/\\/g, '/');
	if (!text.includes(':')) return {domain: fallback_domain, path: text};
	let [domain, ...rest] = text.split(':');
	return {domain: domain || fallback_domain, path: rest.join(':')};
}

export function assetFilePathForBase(workspace, folder, base, extension = '.json', PathModule = null) {
	let validation = validateVintageStoryAssetBasePath(base, {
		label: `${folder} asset base`,
		extensions: [extension],
		rejectAssetFolderPrefix: true
	});
	if (!validation.ok) return '';
	let location = stripDomain(validation.base, workspace?.domain || '');
	let domain = location.domain || workspace?.domain || '';
	let root = workspace?.modRoot && domain
		? pathJoin(PathModule, workspace.modRoot, 'assets', domain, folder)
		: workspace?.folders?.[folder] || '';
	let clean_path = location.path.replace(new RegExp(`${extension.replace('.', '\\.')}$`, 'i'), '');
	if (!root || !clean_path) return '';
	let target = pathJoin(PathModule, root, ...clean_path.split('/')) + extension;
	return isPathUnderRoot(target, root) ? target : '';
}

function assetTypeFolder(type) {
	return type === 'item' ? 'itemtypes' : 'blocktypes';
}

export function assetFilePathForCode(workspace, type, code, PathModule = null) {
	let folder = assetTypeFolder(type);
	let base = String(code || 'asset').split(':').pop().split('/').pop();
	return workspace?.folders?.[folder]
		? pathJoin(PathModule, workspace.folders[folder], defaultAssetFileName(base))
		: '';
}

function collectObjectKeysDeep(value, key_predicate, path = 'root', output = []) {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => collectObjectKeysDeep(entry, key_predicate, `${path}[${index}]`, output));
		return output;
	}
	if (isPlainObject(value)) {
		Object.keys(value).forEach(key => {
			let next_path = `${path}.${key}`;
			if (key_predicate(key, value[key])) output.push({path: next_path, key, value: value[key]});
			collectObjectKeysDeep(value[key], key_predicate, next_path, output);
		});
	}
	return output;
}

function compileShapeContent(shape_json) {
	if (typeof shape_json === 'string') return shape_json.endsWith('\n') ? shape_json : `${shape_json}\n`;
	return serializeVintageStoryAssetDocument(shape_json || {});
}

function cloneAssetForExport(asset_object) {
	return cloneJSON(asset_object || {});
}

function mergeLangContent(existing_text, entries = {}, options = {}) {
	let warnings = [];
	let current = {};
	if (existing_text) {
		current = parseVintageStoryAssetText(existing_text);
		if (!isPlainObject(current)) throw new Error('Existing lang file is not a JSON object.');
	}
	Object.keys(entries || {}).forEach(key => {
		if (Object.prototype.hasOwnProperty.call(current, key) && current[key] !== entries[key] && !options.overwrite) {
			addWarning(warnings, `Preserved existing lang entry ${key}; generated value was not written.`);
			return;
		}
		current[key] = entries[key];
	});
	return {content: serializeVintageStoryAssetDocument(current), warnings};
}

function collectTextureEntriesFromSources(texture_sources = {}) {
	let entries = [];
	let aliases = texture_sources?.aliases || {};
	Object.keys(aliases).forEach(alias => {
		let entry = aliases[alias];
		if (!entry?.resolvedBase) return;
		entries.push({
			alias,
			base: entry.resolvedBase,
			sourcePath: entry.resolvedFilePath || '',
			missing: !!entry.missing,
			sourceMapPath: entry.sourceMapPath || '',
			matchedPattern: entry.matchedPattern || ''
		});
	});
	return entries;
}

function textureTargetPath(workspace, texture_entry, PathModule = null) {
	let source_ext = pathExtname(PathModule, texture_entry.sourcePath).toLowerCase();
	let extension = IMAGE_EXTENSIONS.includes(source_ext) ? source_ext : '.png';
	return assetFilePathForBase(workspace, 'textures', texture_entry.base, extension, PathModule);
}

function planTextures(plan, workspace, texture_sources, options = {}, adapters = {}) {
	let fs = adapters.fs;
	let game_root = options.gameAssetRoot || '';
	collectTextureEntriesFromSources(texture_sources).forEach(texture => {
		let target = textureTargetPath(workspace, texture, adapters.PathModule);
		if (!target) {
			addError(plan, `Texture "${texture.alias}" has an invalid texture base path: ${texture.base}`);
			return;
		}
		if (texture.missing || !texture.sourcePath || (fs && !fs.existsSync(texture.sourcePath))) {
			addWarning(plan, `Missing texture for alias "${texture.alias}": ${texture.base}`);
			return;
		}
		if (target && isPathUnderRoot(texture.sourcePath, workspace.modRoot || '')) {
			return;
		}
		if (game_root && isPathUnderRoot(texture.sourcePath, game_root) && !options.copyGameTextures) {
			addWarning(plan, `Texture "${texture.alias}" resolves to game assets and will not be copied: ${texture.base}`);
			return;
		}
		if (!options.copyTextures) {
			addWarning(plan, `Texture "${texture.alias}" was resolved but texture copying is disabled.`);
			return;
		}
		planEntry(plan, {
			action: 'copy',
			kind: 'texture',
			sourcePath: texture.sourcePath,
			targetPath: target,
			textureAlias: texture.alias,
			textureBase: texture.base,
			warnings: []
		}, adapters);
	});
}

function addModInfoEntry(plan, workspace, mod_info_config, adapters = {}) {
	let target = modInfoPath(workspace, adapters.PathModule);
	let existing = readExistingObject(target, adapters);
	let modinfo = buildVintageStoryModInfo(mod_info_config, existing);
	let validation = validateVintageStoryModInfo(modinfo, workspace);
	validation.warnings.forEach(warning => addWarning(plan, warning, 'modinfo.json'));
	validation.errors.forEach(error => addError(plan, error, 'modinfo.json'));
	planEntry(plan, {
		action: adapters.fs?.existsSync?.(target) ? 'update' : 'write',
		kind: 'modinfo',
		targetPath: target,
		content: serializeVintageStoryAssetDocument(modinfo),
		preview: modinfo
	}, adapters);
	return modinfo;
}

function addShapeEntry(plan, workspace, shape_json, shape_base, source_path, adapters = {}) {
	if (!shape_json) {
		addWarning(plan, 'No current shape JSON is available for export.');
		return '';
	}
	let base = shape_base || assetBaseFromFilePath(source_path, 'shapes', '', workspace);
	if (!base) {
		base = source_path ? pathBasename(adapters.PathModule, source_path).replace(JSON_EXT_RE, '') : 'shape';
		addWarning(plan, `Shape base could not be resolved; exporting as ${base}.`);
	}
	let validation = validateVintageStoryAssetBasePath(base, {
		label: 'Shape base path',
		extensions: ['.json'],
		rejectAssetFolderPrefix: true
	});
	validation.errors.forEach(error => addError(plan, error));
	if (validation.ok) base = validation.base;
	let target = assetFilePathForBase(workspace, 'shapes', base, '.json', adapters.PathModule);
	planEntry(plan, {
		action: 'write',
		kind: 'shape',
		sourcePath: source_path || '',
		targetPath: target,
		assetBase: base,
		content: compileShapeContent(shape_json)
	}, adapters);
	return target;
}

function addAssetEntry(plan, workspace, asset_object, asset_type, source_path, adapters = {}) {
	if (!asset_object) {
		addError(plan, 'No item/block asset JSON is available. Use Save As Asset or Open Vintage Story Asset first.');
		return '';
	}
	let code = asset_object.code || asset_object.Code || 'asset';
	let type = asset_type || getVintageStorySourceKind(source_path) || 'item';
	let target = assetFilePathForCode(workspace, type, code, adapters.PathModule);
	let export_asset = cloneAssetForExport(asset_object);
	collectUnsafeAssetJsonStrings(export_asset).forEach(entry => {
		addError(plan, `Asset JSON contains ${entry.reasons.join(' and ')} at ${entry.path}: ${entry.value}`);
	});
	planEntry(plan, {
		action: 'write',
		kind: type === 'block' ? 'blocktype' : 'itemtype',
		sourcePath: source_path || '',
		targetPath: target,
		content: serializeGeneratedVintageStoryAsset(export_asset),
		preview: export_asset
	}, adapters);
	return target;
}

function addLangEntry(plan, workspace, lang_entries, language, options = {}, adapters = {}) {
	if (!lang_entries || !Object.keys(lang_entries).length || options.includeLang === false) return '';
	let target = options.langPath || getVintageStoryLangPath(workspace, language || 'en', adapters.PathModule);
	let existing_text = adapters.fs?.existsSync?.(target) ? adapters.fs.readFileSync(target, 'utf8') : '';
	let merged = mergeLangContent(existing_text, lang_entries, {overwrite: !!options.overwriteLang});
	merged.warnings.forEach(warning => addWarning(plan, warning, target));
	planEntry(plan, {
		action: adapters.fs?.existsSync?.(target) ? 'update' : 'write',
		kind: 'lang',
		targetPath: target,
		content: merged.content,
		langEntries: cloneJSON(lang_entries)
	}, adapters);
	return target;
}

function addModIconEntry(plan, workspace, icon_path, adapters = {}) {
	if (!icon_path) return '';
	if (!adapters.fs?.existsSync?.(icon_path)) {
		addWarning(plan, `Configured mod icon does not exist: ${icon_path}`);
		return '';
	}
	let target = pathJoin(adapters.PathModule, workspace.modRoot, 'modicon.png');
	planEntry(plan, {
		action: 'copy',
		kind: 'modicon',
		sourcePath: icon_path,
		targetPath: target
	}, adapters);
	return target;
}

export function createVintageStoryExportPlan(options = {}, adapters = {}) {
	let workspace = options.workspace || buildVintageStoryWorkspace({
		modRoot: options.modRoot || '',
		domain: options.domain || options.modInfo?.modid || '',
		PathModule: adapters.PathModule
	});
	let plan = makePlan(workspace, options);
	ensureWorkspace(plan, workspace, adapters);
	addModInfoEntry(plan, workspace, Object.assign({}, options.modInfo || {}, {domain: workspace.domain}), adapters);
	let asset_object = options.assetObject || options.asset;
	let asset_type = options.assetType || getVintageStorySourceKind(options.assetFilePath || '');
	addAssetEntry(plan, workspace, asset_object, asset_type, options.assetFilePath, adapters);
	addShapeEntry(plan, workspace, options.shapeJson, options.shapeBase, options.shapeFilePath, adapters);
	let variants = options.variants || [];
	let lang_entries = options.langEntries || buildVintageStoryLangEntries({
		assetType: asset_type,
		code: asset_object?.code || asset_object?.Code || '',
		displayName: options.displayName || asset_object?.code || asset_object?.Code || '',
		generateLang: !!options.generateLang,
		langMode: options.langMode || 'base'
	}, variants);
	addLangEntry(plan, workspace, lang_entries, options.language || 'en', options, adapters);
	planTextures(plan, workspace, options.textureSources, options, adapters);
	addModIconEntry(plan, workspace, options.modIconPath, adapters);
	validateExportPlan(plan, adapters);
	return plan;
}

export function createVintageStoryExportPlanFromResolvedContext(options = {}, adapters = {}) {
	let context = options.assetContext || {};
	let asset_object = options.assetObject;
	if (!asset_object && context.source_file_path && adapters.fs?.existsSync?.(context.source_file_path)) {
		let document = parseVintageStoryAssetDocument(adapters.fs.readFileSync(context.source_file_path, 'utf8'), context.source_file_path);
		asset_object = document.assetObjects?.[context.source_object_index || 0]?.object;
	}
	let variants = context.selected_variant_code
		? [{variantCode: context.selected_variant_code, states: context.selected_states || {}}]
		: [];
	return createVintageStoryExportPlan(Object.assign({}, options, {
		assetObject: asset_object,
		assetType: context.source_kind || options.assetType,
		assetFilePath: context.source_file_path || options.assetFilePath,
		shapeFilePath: options.shapeFilePath || context.current_shape_target?.shape_path || context.resolved_shape_path,
		shapeBase: options.shapeBase || context.current_shape_target?.shape_base || context.shape?.resolvedBase,
		textureSources: options.textureSources || context.texture_sources,
		variants
	}), adapters);
}

function expectedFolderForEntry(workspace, entry) {
	if (!workspace?.folders) return '';
	if (entry.kind === 'shape') return workspace.folders.shapes;
	if (entry.kind === 'texture') return workspace.folders.textures;
	if (entry.kind === 'itemtype') return workspace.folders.itemtypes;
	if (entry.kind === 'blocktype') return workspace.folders.blocktypes;
	if (entry.kind === 'lang') return workspace.folders.lang;
	return '';
}

export function validateExportPlan(plan, adapters = {}) {
	(plan.entries || []).forEach(entry => {
		if (!entry.targetPath && !entry.skipped) addError(entry.errors, `${entry.kind} export target path is empty.`);
		if (entry.targetPath && isAbsoluteFilesystemPath(entry.targetPath) && !entry.targetPath.match(/^[A-Za-z]:[\\/]/)) {
			addError(entry.errors, `${entry.kind} target path is invalid.`);
		}
		let expected_folder = expectedFolderForEntry(plan.workspace, entry);
		if (entry.targetPath && expected_folder && !isPathUnderRoot(entry.targetPath, expected_folder)) {
			addError(entry.errors, `${entry.kind} target must be under ${expected_folder}.`);
		}
		let game_root = plan.options?.gameAssetRoot || '';
		if (entry.targetPath && game_root && isPathUnderRoot(entry.targetPath, game_root) && !plan.options?.allowGameAssetWrites) {
			addError(entry.errors, `${entry.kind} target is inside the configured Vintage Story game assets root; explicit allowGameAssetWrites is required.`);
		}
		if (entry.action === 'copy' && entry.sourcePath && adapters.fs && !adapters.fs.existsSync(entry.sourcePath)) {
			addError(entry.errors, `Source file does not exist: ${entry.sourcePath}`);
		}
		(entry.errors || []).forEach(error => addError(plan, error, entry.targetPath || entry.kind));
		(entry.warnings || []).forEach(warning => addWarning(plan, warning, entry.targetPath || entry.kind));
	});
	return plan;
}

export function executeVintageStoryExportPlan(plan, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let report = {written: [], copied: [], created: [], skipped: [], overwritten: [], backups: [], failed: [], warnings: [], errors: []};
	if (!fs) {
		addError(report.errors, 'No filesystem adapter was provided.');
		return report;
	}
	if (plan.errors?.length) {
		report.errors.push(...plan.errors);
		return report;
	}
	(plan.entries || []).forEach(entry => {
		if (entry.skipped) {
			report.skipped.push(entry.targetPath || entry.kind);
			return;
		}
		try {
			if (!entry.targetPath) throw new Error(`${entry.kind} target path is empty.`);
			if (entry.action === 'copy') {
				let result = copyVintageStoryFile(entry.targetPath, entry.sourcePath, {fs, PathModule}, {createBackups: options.createBackups !== false});
				report.copied.push(entry.targetPath);
				if (result.backupPath) report.backups.push(result.backupPath);
				if (result.overwritten) report.overwritten.push(entry.targetPath);
				else report.created.push(entry.targetPath);
			} else {
				let result = writeVintageStoryTextFile(entry.targetPath, entry.content || '', {fs, PathModule}, {createBackups: options.createBackups !== false});
				report.written.push(entry.targetPath);
				if (result.backupPath) report.backups.push(result.backupPath);
				if (result.overwritten) report.overwritten.push(entry.targetPath);
				else report.created.push(entry.targetPath);
			}
		} catch (error) {
			let message = `${entry.targetPath || entry.kind}: ${error.message || error}`;
			report.failed.push({kind: entry.kind, targetPath: entry.targetPath || '', error: error.message || String(error)});
			report.errors.push(message);
		}
	});
	let completed = report.written.length + report.copied.length;
	if (report.errors.length && completed) {
		addWarning(report.warnings, `Partial export completed: ${completed} file(s) were written or copied, ${report.errors.length} file(s) failed. Failed files remain dirty. Use the export report rollback action or Vintage Story Backups dialog to restore overwritten files.`);
	}
	return report;
}

function collectByTypeMaps(object, path = 'root', output = []) {
	if (!isPlainObject(object)) return output;
	Object.keys(object).forEach(key => {
		let value = object[key];
		let next = `${path}.${key}`;
		if (isPlainObject(value) && key.toLowerCase().endsWith('bytype')) output.push({path: next, map: value});
		if (isPlainObject(value)) collectByTypeMaps(value, next, output);
	});
	return output;
}

function validateByTypeMaps(asset_object, variants, warnings, diagnostics = [], file_path = '') {
	let codes = (variants?.allVariants || variants || []).map(variant => variant.variantCode || variant.codePath).filter(Boolean);
	let skipped = (variants?.allVariants || variants || []).filter(variant => variant.skipped || variant.disallowed).map(variant => variant.variantCode || variant.codePath);
	collectByTypeMaps(asset_object).forEach(entry => {
		Object.keys(entry.map || {}).forEach(pattern => {
			let matched = codes.filter(code => wildcardMatch(pattern, code));
			let json_path = `${entry.path}[${JSON.stringify(pattern)}]`;
			if (!matched.length) {
				addWarningIssue(warnings, diagnostics, {
					code: 'bytype_no_variant_match',
					filePath: file_path,
					jsonPath: json_path,
					what: `${json_path} matches no generated variants.`,
					why: 'Vintage Story will never apply this ByType entry, so the intended variant override is dead data.',
					suggestedFix: 'Change the ByType key to a generated variant code or wildcard pattern, or remove the unused entry.',
					blocks: 'none'
				});
			}
			if (!pattern.includes('*') && skipped.includes(pattern)) {
				addWarningIssue(warnings, diagnostics, {
					code: 'bytype_targets_skipped_variant',
					filePath: file_path,
					jsonPath: json_path,
					variantCode: pattern,
					what: `${json_path} targets a skipped or disallowed variant.`,
					why: 'The exact ByType value cannot apply because that variant will not be generated for the asset.',
					suggestedFix: 'Remove the entry, unskip or allow the variant, or move the value to a generated variant key.',
					blocks: 'none'
				});
			}
			if ((pattern === '*' || pattern.includes('*')) && matched.length > 1) {
				addWarningIssue(warnings, diagnostics, {
					code: 'bytype_shared_rule_multiple_variants',
					filePath: file_path,
					jsonPath: json_path,
					variantCode: matched.slice(0, 6).join(', ') + (matched.length > 6 ? `, and ${matched.length - 6} more` : ''),
					what: `${json_path} affects ${matched.length} generated variants.`,
					why: 'Editing this fallback or wildcard entry changes multiple variants at once.',
					suggestedFix: 'Create an exact ByType override for the selected variant before editing, unless the shared fallback change is intentional.',
					blocks: 'none'
				});
			}
		});
	});
}

function isUnderAnyRoot(file, roots = []) {
	return roots.some(root => root && isPathUnderRoot(file, root));
}

function looksLikeShapeJson(value) {
	if (!isPlainObject(value) || !Array.isArray(value.elements)) return false;
	if (typeof (value.code ?? value.Code) === 'string') return false;
	return Object.prototype.hasOwnProperty.call(value, 'textureWidth')
		|| Object.prototype.hasOwnProperty.call(value, 'textureHeight')
		|| Object.prototype.hasOwnProperty.call(value, 'textures')
		|| value.elements.length > 0;
}

function validateWorkspaceAssetPlacement(workspace, fs, errors, diagnostics = []) {
	if (!fs || !workspace?.assetsRoot || !fs.existsSync(workspace.assetsRoot)) return;
	let folders = workspace.folders || {};
	let item_block_roots = [folders.itemtypes, folders.blocktypes].filter(Boolean);
	let files = walkFiles(workspace.assetsRoot, fs);
	files.filter(file => IMAGE_EXT_RE.test(file)).forEach(file => {
		if (!folders.textures || !isPathUnderRoot(file, folders.textures)) {
			addErrorIssue(errors, diagnostics, {
				code: 'texture_file_outside_textures_folder',
				filePath: file,
				jsonPath: 'n/a',
				what: 'texture file must be under assets/<domain>/textures.',
				why: 'Vintage Story resolves texture asset bases against the domain textures folder; image files elsewhere will not resolve as textures.',
				suggestedFix: 'Move the image into assets/<domain>/textures and update any texture base paths to match.',
				blocks: {package: true}
			});
		}
	});
	files.filter(file => JSON_EXT_RE.test(file)).forEach(file => {
		try {
			let text = fs.readFileSync(file, 'utf8');
			let document = parseVintageStoryAssetDocument(text, file);
			if (document.assetObjects.length && !isUnderAnyRoot(file, item_block_roots)) {
				addErrorIssue(errors, diagnostics, {
					code: 'asset_json_outside_item_block_folder',
					filePath: file,
					jsonPath: 'root',
					what: 'item/block asset JSON must be under assets/<domain>/itemtypes or assets/<domain>/blocktypes.',
					why: 'Vintage Story only loads collectible asset JSON from the itemtypes and blocktypes folders.',
					suggestedFix: 'Move this item or block JSON into the matching itemtypes or blocktypes folder.',
					blocks: {package: true}
				});
			}
			if (looksLikeShapeJson(document.root) && (!folders.shapes || !isPathUnderRoot(file, folders.shapes))) {
				addErrorIssue(errors, diagnostics, {
					code: 'shape_json_outside_shapes_folder',
					filePath: file,
					jsonPath: 'root',
					what: 'shape JSON must be under assets/<domain>/shapes.',
					why: 'Vintage Story resolves shape asset bases against the domain shapes folder; shape JSON elsewhere will not load as a shape.',
					suggestedFix: 'Move this JSON into assets/<domain>/shapes and update shape.base references if the base path changes.',
					blocks: {package: true}
				});
			}
		} catch (error) {
			addErrorIssue(errors, diagnostics, {
				code: 'asset_json_parse_failed',
				filePath: file,
				jsonPath: 'root',
				what: `JSON could not be parsed: ${error.message || error}`,
				why: 'Invalid JSON prevents Vintage Story and Vintage Bench from reading the asset.',
				suggestedFix: 'Fix the JSON syntax in this file.',
				blocks: {save: true, export: true, package: true}
			});
		}
	});
}

function validateVariantGroupsForDiagnostics(asset_object, warnings, errors, diagnostics, file_path = '') {
	let groups = Array.isArray(asset_object?.variantgroups)
		? asset_object.variantgroups
		: (Array.isArray(asset_object?.VariantGroups) ? asset_object.VariantGroups : []);
	let seen_codes = new Set();
	groups.forEach((group, index) => {
		let path = `root.variantgroups[${index}]`;
		if (!isPlainObject(group)) {
			addErrorIssue(errors, diagnostics, {
				code: 'invalid_variantgroup',
				filePath: file_path,
				jsonPath: path,
				what: 'Variant group must be an object.',
				why: 'Vintage Story cannot generate predictable variant codes from a malformed variant group.',
				suggestedFix: 'Replace this entry with an object containing code and states.',
				blocks: {export: true, package: true}
			});
			return;
		}
		let code = group.code ?? group.Code;
		let states = Array.isArray(group.states) ? group.states : (Array.isArray(group.States) ? group.States : null);
		if (group.loadFromProperties || group.LoadFromProperties || group.loadFromPropertiesCombine || group.LoadFromPropertiesCombine) {
			addWarningIssue(warnings, diagnostics, {
				code: 'variantgroup_load_from_properties',
				filePath: file_path,
				jsonPath: path,
				what: `Variant group "${code || 'unknown'}" uses loadFromProperties; this validator resolves explicit state lists only.`,
				why: 'Vintage Bench cannot fully predict generated variant codes for property-loaded groups in this validation pass.',
				suggestedFix: 'Use explicit states while editing, or confirm generated variants in Vintage Story.',
				blocks: 'none'
			});
		}
		if (!String(code || '').trim()) {
			addErrorIssue(errors, diagnostics, {
				code: 'invalid_variantgroup',
				filePath: file_path,
				jsonPath: `${path}.code`,
				what: 'Variant group is missing a code.',
				why: 'The group code is part of the generated variant ordering and placeholder state map.',
				suggestedFix: 'Add a non-empty code such as "type", "material", or "size".',
				blocks: {export: true, package: true}
			});
		} else {
			let lowered = String(code).toLowerCase();
			if (seen_codes.has(lowered)) {
				addErrorIssue(errors, diagnostics, {
					code: 'duplicate_variantgroup_code',
					filePath: file_path,
					jsonPath: `${path}.code`,
					what: `Variant group code "${code}" is duplicated.`,
					why: 'Duplicate group codes overwrite variant state names and make generated codes ambiguous.',
					suggestedFix: 'Rename one of the variant groups so each group code is unique.',
					blocks: {export: true, package: true}
				});
			}
			seen_codes.add(lowered);
		}
		if (!Array.isArray(states)) {
			addErrorIssue(errors, diagnostics, {
				code: 'invalid_variantgroup',
				filePath: file_path,
				jsonPath: `${path}.states`,
				what: `Variant group "${code || index + 1}" must define states as an array.`,
				why: 'Vintage Story expands variants from the state list; without an array there is no deterministic variant set.',
				suggestedFix: 'Set states to an array of strings, for example ["normal", "aged"].',
				blocks: {export: true, package: true}
			});
			return;
		}
		if (!states.length) {
			addErrorIssue(errors, diagnostics, {
				code: 'invalid_variantgroup',
				filePath: file_path,
				jsonPath: `${path}.states`,
				what: `Variant group "${code || index + 1}" has no states.`,
				why: 'An empty state list produces no useful generated variants for this group.',
				suggestedFix: 'Add at least one state or remove the variant group.',
				blocks: {export: true, package: true}
			});
		}
		let seen_states = new Set();
		states.forEach((state, state_index) => {
			let lowered = String(state || '').toLowerCase();
			if (seen_states.has(lowered)) {
				addWarningIssue(warnings, diagnostics, {
					code: 'duplicate_variant_state',
					filePath: file_path,
					jsonPath: `${path}.states[${state_index}]`,
					variantCode: String(state || ''),
					what: `Variant group "${code || index + 1}" contains duplicate state "${state}".`,
					why: 'Duplicate states generate duplicate variant codes and can hide ByType matches.',
					suggestedFix: 'Remove the duplicate state or rename it to a unique value.',
					blocks: 'none'
				});
			}
			seen_states.add(lowered);
		});
	});
}

function readWorkspaceLangState(workspace, fs, PathModule, warnings, errors, diagnostics) {
	let path = getVintageStoryLangPath(workspace, 'en', PathModule);
	if (!path || !fs?.existsSync?.(path)) {
		addWarningIssue(warnings, diagnostics, {
			code: 'missing_lang_file',
			filePath: path || pathJoin(PathModule, workspace?.assetsRoot || '', 'lang', 'en.json'),
			jsonPath: 'root',
			what: 'lang/en.json is missing.',
			why: 'Without lang entries, generated items and blocks show raw translation keys in-game.',
			suggestedFix: 'Create assets/<domain>/lang/en.json and add item- or block-prefixed names for exported assets.',
			blocks: 'none'
		});
		return {path, entries: {}, exists: false};
	}
	try {
		let entries = parseVintageStoryAssetText(fs.readFileSync(path, 'utf8'), path);
		return {path, entries: isPlainObject(entries) ? entries : {}, exists: true};
	} catch (error) {
		addErrorIssue(errors, diagnostics, {
			code: 'lang_parse_failed',
			filePath: path,
			jsonPath: 'root',
			what: `lang/en.json could not be parsed: ${error.message || error}`,
			why: 'Vintage Story cannot load invalid lang JSON.',
			suggestedFix: 'Fix the JSON syntax in assets/<domain>/lang/en.json.',
			blocks: {export: true, package: true}
		});
		return {path, entries: {}, exists: true, parseError: true};
	}
}

function validateLangEntriesForVariants(lang_state, file_path, source_kind, variants, warnings, diagnostics) {
	if (!lang_state || !lang_state.exists || lang_state.parseError) return;
	let prefix = source_kind === 'block' ? 'block' : 'item';
	let included = variants?.includedVariants || [];
	included.slice(0, 40).forEach(variant => {
		let key = `${prefix}-${variant.variantCode}`;
		if (!Object.prototype.hasOwnProperty.call(lang_state.entries || {}, key)) {
			addWarningIssue(warnings, diagnostics, {
				code: 'missing_lang_entry',
				filePath: lang_state.path || file_path,
				jsonPath: `root[${JSON.stringify(key)}]`,
				variantCode: variant.variantCode,
				what: `Missing lang entry "${key}".`,
				why: 'Vintage Story will display the raw translation key instead of a player-facing name.',
				suggestedFix: `Add "${key}" to assets/<domain>/lang/en.json.`,
				blocks: 'none'
			});
		}
	});
	if (included.length > 40) {
		addWarningIssue(warnings, diagnostics, {
			code: 'missing_lang_entry',
			filePath: lang_state.path || file_path,
			jsonPath: 'root',
			what: `Lang validation checked the first 40 of ${included.length} generated variants.`,
			why: 'Large variant sets can produce a lot of repeated missing-name warnings.',
			suggestedFix: 'Use variant lang generation or validate the remaining entries manually.',
			blocks: 'none'
		});
	}
}

function collectResolvedVariantDiagnostics(resolved, diagnostics) {
	let file = resolved?.sourceFilePath || '';
	let variant = resolved?.variantCode || '';
	let shape = resolved?.shape || {};
	if (shape.invalid) {
		pushDiagnostic(diagnostics, {
			code: 'shape_path_outside_shapes_folder',
			severity: 'error',
			filePath: file,
			jsonPath: shape.sourcePath || shape.sourceMapPath || 'root.shape',
			variantCode: variant,
			what: `Shape path for ${variant} does not resolve under assets/<domain>/shapes: ${shape.resolvedBase}`,
			why: shape.error || 'Vintage Story resolves shape asset bases against assets/<domain>/shapes and will not load paths that escape that folder.',
			suggestedFix: 'Use a Vintage Story shape base path such as item/example or domain:item/example, without absolute paths, backslashes, or traversal.',
			blocks: {export: true, package: true}
		});
	} else if (shape.missing) {
		pushDiagnostic(diagnostics, {
			code: shape.resolvedBase ? 'missing_shape' : 'missing_shape_entry',
			severity: 'warning',
			filePath: file,
			jsonPath: shape.sourcePath || shape.sourceMapPath || 'root.shape',
			variantCode: variant,
			what: shape.resolvedBase
				? `Missing shape for ${variant}: ${shape.resolvedBase}`
				: `No shape or shapeByType entry resolved for ${variant}.`,
			why: 'Vintage Story cannot render this variant without a resolved shape.',
			suggestedFix: shape.resolvedBase
				? 'Create the referenced shape under assets/<domain>/shapes or correct the shape base path.'
				: 'Add a shape or shapeByType entry for this variant.',
			blocks: 'none'
		});
	}
	(shape.alternates || []).forEach(alternate => {
		if (alternate.invalid) {
			pushDiagnostic(diagnostics, {
				code: 'shape_alternate_path_outside_shapes_folder',
				severity: 'error',
				filePath: file,
				jsonPath: alternate.sourcePath || `${shape.sourcePath || 'root.shape'}.alternates[${alternate.index || 0}]`,
				variantCode: variant,
				what: `Alternate shape path for ${variant} does not resolve under assets/<domain>/shapes: ${alternate.resolvedBase}`,
				why: alternate.error || 'Vintage Story resolves alternate shape bases against assets/<domain>/shapes and will not load paths that escape that folder.',
				suggestedFix: 'Use a Vintage Story shape base path such as item/example or domain:item/example, without absolute paths, backslashes, or traversal.',
				blocks: {export: true, package: true}
			});
		} else if (alternate.missing) {
			pushDiagnostic(diagnostics, {
				code: 'missing_shape_alternate',
				severity: 'warning',
				filePath: file,
				jsonPath: alternate.sourcePath || `${shape.sourcePath || 'root.shape'}.alternates[${alternate.index || 0}]`,
				variantCode: variant,
				what: `Missing alternate shape for ${variant}: ${alternate.resolvedBase || '(empty)'}`,
				why: 'Vintage Story item state visuals that select this alternate will have no shape to render.',
				suggestedFix: 'Create the referenced alternate shape under assets/<domain>/shapes or correct the alternate base path.',
				blocks: 'none'
			});
		}
	});
	Object.keys(resolved?.textures?.aliases || {}).forEach(alias => {
		let entry = resolved.textures.aliases[alias] || {};
		if (!entry.resolvedBase) {
			pushDiagnostic(diagnostics, {
				code: 'missing_texture_alias',
				severity: 'warning',
				filePath: entry.sourceMapPath === 'shape.textures' ? (shape.resolvedFilePath || file) : file,
				jsonPath: entry.sourcePath || `root.textures.${alias}`,
				variantCode: variant,
				what: `Texture alias "${alias}" is used by the shape but is not defined.`,
				why: 'Shape faces using this alias will render missing or with fallback materials.',
				suggestedFix: `Add texture alias "${alias}" to the owning asset textures/texturesByType map or to the shape textures map.`,
				blocks: 'none'
			});
		} else if (entry.invalid) {
			pushDiagnostic(diagnostics, {
				code: 'texture_path_outside_textures_folder',
				severity: 'error',
				filePath: file,
				jsonPath: entry.sourcePath || `root.textures.${alias}`,
				variantCode: variant,
				what: `Texture path for ${variant} alias "${alias}" does not resolve under assets/<domain>/textures: ${entry.resolvedBase}`,
				why: entry.error || 'Vintage Story resolves texture asset bases against assets/<domain>/textures and will not load paths that escape that folder.',
				suggestedFix: 'Use a Vintage Story texture base path such as item/example or domain:item/example, without absolute paths, backslashes, or traversal.',
				blocks: {export: true, package: true}
			});
		} else if (entry.missing) {
			pushDiagnostic(diagnostics, {
				code: 'missing_texture',
				severity: 'warning',
				filePath: file,
				jsonPath: entry.sourcePath || `root.textures.${alias}`,
				variantCode: variant,
				what: `Missing texture for ${variant} alias "${alias}": ${entry.resolvedBase}`,
				why: 'Vintage Story resolves texture bases under assets/<domain>/textures; a missing file renders as a broken texture.',
				suggestedFix: 'Create the referenced texture under assets/<domain>/textures or correct the texture base path.',
				blocks: 'none'
			});
		}
	});
	(resolved?.interactionBoxes || []).forEach(box => {
		if (box.missingBehavior || box.sourcePointer?.missingBehavior) {
			pushDiagnostic(diagnostics, {
				code: 'behavior_box_missing_behavior',
				severity: 'warning',
				filePath: file,
				jsonPath: box.sourcePath || box.sourceMapPath || 'root.behaviors',
				variantCode: variant,
				what: `${box.label || 'Behavior box'} targets ${box.behaviorName || 'a behavior'} that is not present in the asset.`,
				why: 'Behavior-level boxes are ignored unless the owning behavior exists.',
				suggestedFix: 'Add the behavior, switch the box to root-level output, or remove the behavior-level box.',
				blocks: 'none'
			});
		}
		let box_warnings = [];
		validateBoxValue(box.value, box_warnings);
		if (String(box.behaviorName || '').toLowerCase() === 'groundstorable' && box_warnings.length) {
			box_warnings.forEach(warning => {
				pushDiagnostic(diagnostics, {
					code: 'groundstorable_box_malformed',
					severity: 'warning',
					filePath: file,
					jsonPath: box.sourcePath || box.sourceMapPath || 'root.behaviors',
					variantCode: variant,
					what: `GroundStorable box is malformed: ${warning}`,
					why: 'GroundStorable selection and collision boxes must be valid 0..1 block-space boxes for reliable placement.',
					suggestedFix: 'Fix the GroundStorable box coordinates or regenerate them from the interaction box panel.',
					blocks: 'none'
				});
			});
		}
	});
}

function validateShapeJsonOwnerFields(shape, file, warnings, diagnostics) {
	collectObjectKeysDeep(shape, key => /^(guiTransform|groundTransform|tpHandTransform|tpOffHandTransform|.*TransformByType)$/i.test(key))
		.forEach(entry => addWarningIssue(warnings, diagnostics, {
			code: 'transform_in_shape_json',
			filePath: file,
			jsonPath: entry.path,
			what: `Display transform field appears in shape JSON at ${entry.path}.`,
			why: 'Vintage Story item/block display transforms belong on the owning asset JSON, not the reusable shape model.',
			suggestedFix: 'Move this transform to the itemtype/blocktype JSON or attributes transform field, then remove it from the shape.',
			blocks: 'none'
		}));
	collectObjectKeysDeep(shape, key => /^(collisionbox|collisionboxes|selectionbox|selectionboxes|collisionSelectionBoxes)$/i.test(key))
		.forEach(entry => addWarningIssue(warnings, diagnostics, {
			code: 'interaction_box_in_shape_json',
			filePath: file,
			jsonPath: entry.path,
			what: `Interaction box field appears in shape JSON at ${entry.path}.`,
			why: 'Vintage Story block/item selection and collision boxes belong on the owning asset or behavior, not the shape model.',
			suggestedFix: 'Move the box to the itemtype/blocktype JSON or behavior properties, then remove it from the shape.',
			blocks: 'none'
		}));
	collectObjectKeysDeep(shape, key => /^(attachableToEntity|attachableToEntityByType|attachedShapeBySlotCode)$/i.test(key))
		.forEach(entry => addWarningIssue(warnings, diagnostics, {
			code: 'attachment_data_in_shape_json',
			filePath: file,
			jsonPath: entry.path,
			what: `Attachment asset data appears in shape JSON at ${entry.path}.`,
			why: 'Entity attachment behavior data belongs on the item/block asset; shape JSON should only carry model attachment points.',
			suggestedFix: 'Move attachableToEntity or attachedShapeBySlotCode data to the owning itemtype/blocktype JSON.',
			blocks: 'none'
		}));
}

export function validateVintageStoryWorkspace(workspace, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let warnings = [];
	let errors = [];
	let diagnostics = [];
	if (!workspace?.modRoot) {
		addErrorIssue(errors, diagnostics, {
			code: 'missing_workspace_root',
			filePath: 'settings',
			jsonPath: 'workspace.modRoot',
			what: 'Mod workspace root is not configured.',
			why: 'Vintage Bench needs a mod root to find modinfo.json and assets/<domain>.',
			suggestedFix: 'Set the Vintage Story mod workspace root in settings.',
			blocks: {export: true, package: true}
		});
	}
	if (!workspace?.domain) {
		addErrorIssue(errors, diagnostics, {
			code: 'missing_workspace_domain',
			filePath: 'settings',
			jsonPath: 'workspace.domain',
			what: 'Workspace domain / modid is not configured.',
			why: 'Vintage Story asset paths are resolved under assets/<domain>.',
			suggestedFix: 'Set the Vintage Story mod domain/modid in settings.',
			blocks: {export: true, package: true}
		});
	}
	let info_path = modInfoPath(workspace, PathModule);
	if (!info_path || !fs?.existsSync?.(info_path)) {
		addErrorIssue(errors, diagnostics, {
			code: 'missing_modinfo',
			filePath: info_path || 'modinfo.json',
			jsonPath: 'root',
			what: 'modinfo.json is missing.',
			why: 'Vintage Story ignores a mod package when modinfo.json is not present at the mod root or zip root.',
			suggestedFix: 'Create modinfo.json at the workspace root or export once with modinfo generation enabled.',
			blocks: {package: true}
		});
	} else {
		try {
			let modinfo = parseVintageStoryAssetText(fs.readFileSync(info_path, 'utf8'), info_path);
			let result = validateVintageStoryModInfo(modinfo, workspace);
			warnings.push(...result.warnings);
			errors.push(...result.errors);
			let modid = modinfo.modid || modinfo.modID || modinfo.Modid || modinfo.ModID;
			if (workspace.domain && modid && String(workspace.domain).toLowerCase() !== String(modid).toLowerCase()) {
				pushDiagnostic(diagnostics, {
					code: 'modid_domain_mismatch',
					severity: 'warning',
					filePath: info_path,
					jsonPath: 'root.modid',
					what: `modinfo modid "${modid}" does not match workspace domain "${workspace.domain}".`,
					why: 'The package domain controls assets/<domain>, while modinfo controls the mod id; a mismatch makes references and distribution confusing.',
					suggestedFix: 'Make modinfo.modid and the workspace domain the same value, or intentionally move assets to the matching domain.',
					blocks: 'none'
				});
			}
		} catch (error) {
			addErrorIssue(errors, diagnostics, {
				code: 'modinfo_parse_failed',
				filePath: info_path,
				jsonPath: 'root',
				what: `modinfo.json could not be parsed: ${error.message || error}`,
				why: 'Vintage Story cannot load invalid mod metadata.',
				suggestedFix: 'Fix the JSON syntax in modinfo.json.',
				blocks: {package: true}
			});
		}
	}
	if (workspace?.assetsRoot && fs && !fs.existsSync(workspace.assetsRoot)) {
		addErrorIssue(errors, diagnostics, {
			code: 'missing_assets_domain_folder',
			filePath: workspace.assetsRoot,
			jsonPath: 'n/a',
			what: `assets/<domain> folder is missing: ${workspace.assetsRoot}`,
			why: 'Vintage Story expects all mod assets under assets/<domain> at the mod root.',
			suggestedFix: 'Create assets/<domain>/ and put itemtypes, blocktypes, shapes, textures, and lang under it.',
			blocks: {export: true, package: true}
		});
	}
	['itemtypes', 'blocktypes', 'shapes', 'textures', 'lang'].forEach(folder => {
		let path = workspace?.folders?.[folder];
		if (path && fs && !fs.existsSync(path)) {
			addWarningIssue(warnings, diagnostics, {
				code: 'missing_asset_subfolder',
				filePath: path,
				jsonPath: 'n/a',
				what: `${folder} folder does not exist yet: ${path}`,
				why: `Vintage Story expects ${folder} content in the standard assets/<domain>/${folder} folder when those files exist.`,
				suggestedFix: `Create assets/<domain>/${folder} before exporting ${folder} content.`,
				blocks: 'none'
			});
		}
	});
	if (fs && workspace?.assetsRoot && fs.existsSync(workspace.assetsRoot)) {
		validateWorkspaceAssetPlacement(workspace, fs, errors, diagnostics);
		let roots = buildVintageStoryAssetRoots(info_path, {
			modAssetRoot: workspace.modRoot,
			gameAssetRoot: options.gameAssetRoot,
			additionalAssetRoots: options.additionalAssetRoots
		});
		let asset_files = [];
		['itemtypes', 'blocktypes'].forEach(folder => {
			let root = workspace.folders?.[folder];
			if (!root || !fs.existsSync(root)) return;
			walkFiles(root, fs).filter(path => path.toLowerCase().endsWith('.json')).forEach(path => asset_files.push(path));
		});
		let lang_state = (!options.skipLang && asset_files.length)
			? readWorkspaceLangState(workspace, fs, PathModule, warnings, errors, diagnostics)
			: null;
		asset_files.forEach(file => {
			try {
				let document = parseVintageStoryAssetDocument(fs.readFileSync(file, 'utf8'), file);
				document.assetObjects.forEach((entry, index) => {
					let variants = listVintageStoryAssetVariants(document, index);
					validateVariantGroupsForDiagnostics(entry.object, warnings, errors, diagnostics, file);
					validateByTypeMaps(entry.object, variants, warnings, diagnostics, file);
					validateLangEntriesForVariants(lang_state, file, getVintageStorySourceKind(file), variants, warnings, diagnostics);
					collectUnsafeAssetJsonStrings(entry.object).forEach(unsafe => {
						addErrorIssue(errors, diagnostics, {
							code: 'unsafe_asset_json_path',
							filePath: file,
							jsonPath: unsafe.path,
							what: `Asset JSON contains ${unsafe.reasons.join(' and ')} at ${unsafe.path}.`,
							why: 'Runtime asset JSON must contain Vintage Story asset base paths, not local filesystem paths or traversal.',
							suggestedFix: 'Replace the value with a domain asset base path such as item/example or block/example.',
							blocks: {export: true, package: true}
						});
					});
					variants.includedVariants.slice(0, options.maxValidatedVariants || 60).forEach(variant => {
						let resolved = resolveVintageStoryAssetVariant(document, index, variant, {
							sourceFilePath: file,
							fs,
							PathModule,
							modAssetRoot: workspace.modRoot,
							gameAssetRoot: options.gameAssetRoot,
							additionalAssetRoots: options.additionalAssetRoots,
							skipTextures: !!options.skipTextures
						});
						collectResolvedVariantDiagnostics(resolved, diagnostics);
						(resolved.warnings || []).forEach(warning => addWarning(warnings, `${file}: ${warning}`));
					});
				});
			} catch (error) {
				addErrorIssue(errors, diagnostics, {
					code: 'asset_parse_failed',
					filePath: file,
					jsonPath: 'root',
					what: `Asset JSON could not be parsed: ${error.message || error}`,
					why: 'Vintage Story cannot load invalid itemtype or blocktype JSON.',
					suggestedFix: 'Fix the JSON syntax in this asset file.',
					blocks: {export: true, package: true}
				});
			}
		});
		let shape_files = walkFiles(workspace.folders.shapes || '', fs).filter(path => path.toLowerCase().endsWith('.json'));
		shape_files.forEach(file => {
			try {
				let shape = parseVintageStoryAssetText(fs.readFileSync(file, 'utf8'), file);
				validateShapeJsonOwnerFields(shape, file, warnings, diagnostics);
			} catch (error) {
				addErrorIssue(errors, diagnostics, {
					code: 'shape_parse_failed',
					filePath: file,
					jsonPath: 'root',
					what: `Shape JSON could not be parsed: ${error.message || error}`,
					why: 'Vintage Story cannot load invalid shape JSON.',
					suggestedFix: 'Fix the JSON syntax in this shape file.',
					blocks: {export: true, package: true}
				});
			}
		});
	}
	return {
		warnings: Array.from(new Set(warnings)),
		errors: Array.from(new Set(errors)),
		diagnostics: uniqueVintageStoryDiagnostics(diagnostics)
	};
}

function walkFiles(root, fs) {
	let output = [];
	if (!root || !fs?.existsSync?.(root)) return output;
	for (let entry of fs.readdirSync(root, {withFileTypes: true})) {
		let path = `${slash(root).replace(/\/+$/, '')}/${entry.name}`;
		if (entry.isDirectory()) output.push(...walkFiles(path, fs));
		else output.push(path);
	}
	return output;
}

function shouldPackageFile(relative_path, options = {}) {
	let rel = slash(relative_path).replace(/^\/+/, '');
	if (!rel) return false;
	if (PACKAGE_EXCLUDE_RE.test(rel) || PACKAGE_EXCLUDE_EXT_RE.test(rel) || PACKAGE_PREVIEW_ASSET_RE.test(rel)) return false;
	if (rel === 'modinfo.json' || rel === 'modicon.png') return true;
	if (rel.startsWith('assets/')) {
		let domain = String(options.domain || '').trim().toLowerCase();
		return !domain || rel.toLowerCase().startsWith(`assets/${domain}/`);
	}
	if (options.includeCode && (/^src\//i.test(rel) || /\.(dll|pdb)$/i.test(rel))) return true;
	return false;
}

function packageExcludeReason(relative_path) {
	let rel = slash(relative_path).replace(/^\/+/, '');
	if (PACKAGE_PREVIEW_ASSET_RE.test(rel)) return 'non-redistributable preview asset';
	if (PACKAGE_EXCLUDE_RE.test(rel) || PACKAGE_EXCLUDE_EXT_RE.test(rel)) return 'internal/generated/local file';
	return '';
}

export function defaultVintageStoryPackageName(modinfo = {}) {
	let modid = modinfo.modid || modinfo.modID || modinfo.Modid || modinfo.ModID || 'mod';
	let version = modinfo.version || modinfo.Version || DEFAULT_VS_MOD_VERSION;
	return `${modid}-${version}.zip`;
}

export async function packageVintageStoryModWorkspace(workspace, output_path, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let report = {outputPath: output_path || '', included: [], excluded: [], warnings: [], errors: [], diagnostics: []};
	if (!fs) {
		addErrorIssue(report.errors, report.diagnostics, {
			code: 'missing_filesystem_adapter',
			filePath: 'n/a',
			jsonPath: 'n/a',
			what: 'No filesystem adapter was provided.',
			why: 'Packaging needs filesystem access to read mod files and write the zip.',
			suggestedFix: 'Run packaging from the desktop environment with filesystem access.',
			blocks: {package: true}
		});
		return report;
	}
	let validation = validateVintageStoryWorkspace(workspace, adapters, options);
	report.warnings.push(...validation.warnings);
	report.errors.push(...validation.errors);
	report.diagnostics.push(...(validation.diagnostics || []));
	if (report.errors.length && !options.allowValidationErrors) return report;
	let zip = new JSZip();
	let root = workspace.modRoot;
	let package_options = Object.assign({}, options, {domain: workspace.domain || options.domain || ''});
	let files = walkFiles(root, fs);
	files.forEach(file => {
		let rel = pathRelative(PathModule, root, file);
		let exclude_reason = packageExcludeReason(rel);
		if (!shouldPackageFile(rel, package_options)) {
			report.excluded.push(rel);
			if (exclude_reason) {
				pushDiagnostic(report.diagnostics, {
					code: 'package_excluded_internal_file',
					severity: 'info',
					filePath: rel,
					jsonPath: 'n/a',
					what: `Package excluded ${rel} (${exclude_reason}).`,
					why: 'Vintage Story mod zips should only contain distributable mod files, not editor state, generated declarations, caches, or preview-only assets.',
					suggestedFix: 'No action is needed unless this file should be redistributed; if so, move it into the correct assets/<domain> folder and remove preview/internal naming.',
					blocks: 'none'
				});
			}
			return;
		}
		if (exclude_reason) {
			addErrorIssue(report.errors, report.diagnostics, {
				code: 'package_includes_internal_file',
				filePath: rel,
				jsonPath: 'n/a',
				what: `Package would include ${rel} (${exclude_reason}).`,
				why: 'Internal/generated/local files should not ship in a Vintage Story mod package.',
				suggestedFix: 'Remove this file from the package input or add it to the package exclusion rules.',
				blocks: {package: true}
			});
			return;
		}
		zip.file(rel, fs.readFileSync(file));
		report.included.push(rel);
	});
	if (!report.included.includes('modinfo.json')) {
		addErrorIssue(report.errors, report.diagnostics, {
			code: 'package_missing_root_modinfo',
			filePath: 'modinfo.json',
			jsonPath: 'root',
			what: 'Package would not contain modinfo.json at zip root.',
			why: 'Vintage Story ignores a mod zip when modinfo.json is missing from the zip root.',
			suggestedFix: 'Generate or place modinfo.json at the mod workspace root before packaging.',
			blocks: {package: true}
		});
	}
	let domain = String(workspace.domain || '').trim().toLowerCase();
	let has_domain_assets = report.included.some(file => {
		let rel = file.toLowerCase();
		return domain ? rel.startsWith(`assets/${domain}/`) : rel.startsWith('assets/');
	});
	if (!has_domain_assets) {
		addErrorIssue(report.errors, report.diagnostics, {
			code: 'package_missing_assets_domain',
			filePath: 'assets',
			jsonPath: 'n/a',
			what: 'Package would not contain assets/<domain>/ at zip root.',
			why: 'Vintage Story expects mod assets under assets/<domain> inside the package.',
			suggestedFix: 'Create assets/<domain>/ with itemtypes, blocktypes, shapes, textures, or lang files before packaging.',
			blocks: {package: true}
		});
	}
	report.diagnostics = uniqueVintageStoryDiagnostics(report.diagnostics);
	if (report.errors.length) return report;
	let buffer = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
	if (output_path) {
		fs.mkdirSync(pathDirname(PathModule, output_path), {recursive: true});
		fs.writeFileSync(output_path, buffer);
	}
	report.buffer = buffer;
	return report;
}

export function copyVintageStoryPackageToModsFolder(package_path, mods_folder, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let report = {copiedPath: '', overwritten: false, warnings: [], errors: []};
	if (!package_path || !fs?.existsSync?.(package_path)) {
		addError(report.errors, `Package does not exist: ${package_path || '(empty)'}`);
		return report;
	}
	if (!mods_folder) {
		addWarning(report.warnings, 'Vintage Story Mods folder is not configured.');
		return report;
	}
	let target = pathJoin(PathModule, mods_folder, pathBasename(PathModule, package_path));
	if (fs.existsSync(target) && !options.overwrite) {
		addError(report.errors, `Package already exists in Mods folder: ${target}`);
		return report;
	}
	fs.mkdirSync(mods_folder, {recursive: true});
	report.overwritten = fs.existsSync(target);
	fs.copyFileSync(package_path, target);
	report.copiedPath = target;
	return report;
}

export function formatVintageStoryValidationReport(result = {}) {
	let lines = ['Vintage Story Mod Workspace Validation', ''];
	(result.errors || []).forEach(error => lines.push(`Error: ${error}`));
	(result.warnings || []).forEach(warning => lines.push(`Warning: ${warning}`));
	if (result.diagnostics?.length) {
		if (result.errors?.length || result.warnings?.length) lines.push('');
		lines.push('Diagnostics:');
		result.diagnostics.forEach(issue => {
			lines.push(formatVintageStoryDiagnostic(issue));
			lines.push('');
		});
	}
	if (!result.errors?.length && !result.warnings?.length && !result.diagnostics?.length) {
		lines.push('No validation issues found.');
	}
	return lines.join('\n').trim();
}

export function formatVintageStoryExportReport(report_or_plan) {
	if (!report_or_plan) return '';
	if (Array.isArray(report_or_plan.entries)) {
		let lines = ['Vintage Story Mod Export Plan', ''];
		(report_or_plan.errors || []).forEach(error => lines.push(`Error: ${error}`));
		(report_or_plan.warnings || []).forEach(warning => lines.push(`Warning: ${warning}`));
		if (report_or_plan.diagnostics?.length) {
			lines.push('Diagnostics:');
			report_or_plan.diagnostics.forEach(issue => lines.push(formatVintageStoryDiagnostic(issue)));
		}
		if (report_or_plan.errors?.length || report_or_plan.warnings?.length) lines.push('');
		report_or_plan.entries.forEach(entry => {
			let action = entry.exists ? 'update' : (entry.action || 'write');
			lines.push(`${action.toUpperCase()} ${entry.kind}: ${entry.targetPath}`);
			if (entry.sourcePath) lines.push(`  source: ${entry.sourcePath}`);
			(entry.errors || []).forEach(error => lines.push(`  error: ${error}`));
			(entry.warnings || []).forEach(warning => lines.push(`  warning: ${warning}`));
		});
		return lines.join('\n');
	}
	let lines = ['Vintage Story Mod Export Report', ''];
	['written', 'copied', 'created', 'skipped', 'overwritten', 'backups', 'restored', 'removed', 'included', 'excluded'].forEach(key => {
		if (report_or_plan[key]?.length) {
			lines.push(`${key}:`);
			report_or_plan[key].forEach(value => lines.push(`  ${value}`));
			lines.push('');
		}
	});
	if (report_or_plan.failed?.length) {
		lines.push('failed:');
		report_or_plan.failed.forEach(value => lines.push(`  ${value.targetPath || value.kind}: ${value.error}`));
		lines.push('');
	}
	if (report_or_plan.outputPath) lines.push(`package: ${report_or_plan.outputPath}`);
	if (report_or_plan.copiedPath) lines.push(`mods folder copy: ${report_or_plan.copiedPath}`);
	(report_or_plan.errors || []).forEach(error => lines.push(`Error: ${error}`));
	(report_or_plan.warnings || []).forEach(warning => lines.push(`Warning: ${warning}`));
	if (report_or_plan.diagnostics?.length) {
		lines.push('Diagnostics:');
		report_or_plan.diagnostics.forEach(issue => lines.push(formatVintageStoryDiagnostic(issue)));
	}
	return lines.join('\n').trim();
}
