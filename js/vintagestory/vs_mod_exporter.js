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
	isAbsoluteFilesystemPath,
	serializeGeneratedVintageStoryAsset
} from './vs_asset_generator.js';

export const VS_MODINFO_TYPES = ['content', 'code'];
export const DEFAULT_VS_MOD_AUTHOR = 'P1nkOblivion';
export const DEFAULT_VS_MOD_VERSION = '1.0.0';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const JSON_EXT_RE = /\.json$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;
const MODID_RE = /^[a-z0-9_.-]+$/i;
const PACKAGE_EXCLUDE_RE = /(^|\/)(\.git|node_modules|types\/generated|dist-electron|\.vscode|\.idea)(\/|$)|(^|\/)(Thumbs\.db|desktop\.ini)$/i;
const BACKUP_EXT_RE = /\.(bak|tmp)$/i;

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
	let domain = value('vintage_story_mod_domain') || normalizeModid(value('vintage_story_mod_name')) || 'mycoolmod';
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
	let location = stripDomain(base, workspace?.domain || '');
	let domain = location.domain || workspace?.domain || '';
	let root = workspace?.modRoot && domain
		? pathJoin(PathModule, workspace.modRoot, 'assets', domain, folder)
		: workspace?.folders?.[folder] || '';
	let clean_path = location.path.replace(new RegExp(`${extension.replace('.', '\\.')}$`, 'i'), '');
	if (!root || !clean_path) return '';
	return pathJoin(PathModule, root, ...clean_path.split('/')) + extension;
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

function collectAbsolutePaths(value, path = 'root', output = []) {
	if (typeof value === 'string') {
		if (isAbsoluteFilesystemPath(value)) output.push({path, value});
		return output;
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) => collectAbsolutePaths(entry, `${path}[${index}]`, output));
		return output;
	}
	if (isPlainObject(value)) {
		Object.keys(value).forEach(key => collectAbsolutePaths(value[key], `${path}.${key}`, output));
	}
	return output;
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
			warnings: target ? [] : [`Could not map texture ${texture.base} into the workspace.`]
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
	collectAbsolutePaths(export_asset).forEach(entry => addError(plan, `Asset JSON contains absolute filesystem path at ${entry.path}: ${entry.value}`));
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

export function validateExportPlan(plan, adapters = {}) {
	(plan.entries || []).forEach(entry => {
		if (!entry.targetPath && !entry.skipped) addError(entry.errors, `${entry.kind} export target path is empty.`);
		if (entry.targetPath && isAbsoluteFilesystemPath(entry.targetPath) && !entry.targetPath.match(/^[A-Za-z]:[\\/]/)) {
			addError(entry.errors, `${entry.kind} target path is invalid.`);
		}
		if (entry.action === 'copy' && entry.sourcePath && adapters.fs && !adapters.fs.existsSync(entry.sourcePath)) {
			addError(entry.errors, `Source file does not exist: ${entry.sourcePath}`);
		}
		(entry.errors || []).forEach(error => addError(plan, error, entry.targetPath || entry.kind));
		(entry.warnings || []).forEach(warning => addWarning(plan, warning, entry.targetPath || entry.kind));
	});
	return plan;
}

function makeBackupPath(target_path) {
	let stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
	return `${target_path}.${stamp}.bak`;
}

export function executeVintageStoryExportPlan(plan, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let report = {written: [], copied: [], skipped: [], overwritten: [], backups: [], warnings: [], errors: []};
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
			fs.mkdirSync(pathDirname(PathModule, entry.targetPath), {recursive: true});
			let existed = fs.existsSync(entry.targetPath);
			if (existed && options.createBackups !== false) {
				let backup = makeBackupPath(entry.targetPath);
				fs.copyFileSync(entry.targetPath, backup);
				report.backups.push(backup);
			}
			if (entry.action === 'copy') {
				fs.copyFileSync(entry.sourcePath, entry.targetPath);
				report.copied.push(entry.targetPath);
			} else {
				fs.writeFileSync(entry.targetPath, entry.content || '', 'utf8');
				report.written.push(entry.targetPath);
			}
			if (existed) report.overwritten.push(entry.targetPath);
		} catch (error) {
			report.errors.push(`${entry.targetPath || entry.kind}: ${error.message || error}`);
		}
	});
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

function validateByTypeMaps(asset_object, variants, warnings) {
	let codes = (variants?.allVariants || variants || []).map(variant => variant.variantCode || variant.codePath).filter(Boolean);
	let skipped = (variants?.allVariants || variants || []).filter(variant => variant.skipped || variant.disallowed).map(variant => variant.variantCode || variant.codePath);
	collectByTypeMaps(asset_object).forEach(entry => {
		Object.keys(entry.map || {}).forEach(pattern => {
			let matched = codes.filter(code => wildcardMatch(pattern, code));
			if (!matched.length) addWarning(warnings, `${entry.path}[${JSON.stringify(pattern)}] matches no generated variants.`);
			if (!pattern.includes('*') && skipped.includes(pattern)) addWarning(warnings, `${entry.path}[${JSON.stringify(pattern)}] targets a skipped or disallowed variant.`);
		});
	});
}

export function validateVintageStoryWorkspace(workspace, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let warnings = [];
	let errors = [];
	if (!workspace?.modRoot) addError(errors, 'Mod workspace root is not configured.');
	if (!workspace?.domain) addError(errors, 'Workspace domain / modid is not configured.');
	let info_path = modInfoPath(workspace, PathModule);
	if (!info_path || !fs?.existsSync?.(info_path)) {
		addError(errors, 'modinfo.json is missing.');
	} else {
		try {
			let modinfo = parseVintageStoryAssetText(fs.readFileSync(info_path, 'utf8'), info_path);
			let result = validateVintageStoryModInfo(modinfo, workspace);
			warnings.push(...result.warnings);
			errors.push(...result.errors);
		} catch (error) {
			addError(errors, `modinfo.json could not be parsed: ${error.message || error}`);
		}
	}
	if (workspace?.assetsRoot && fs && !fs.existsSync(workspace.assetsRoot)) addError(errors, `assets/<domain> folder is missing: ${workspace.assetsRoot}`);
	['itemtypes', 'blocktypes', 'shapes', 'textures'].forEach(folder => {
		let path = workspace?.folders?.[folder];
		if (path && fs && !fs.existsSync(path)) addWarning(warnings, `${folder} folder does not exist yet: ${path}`);
	});
	if (fs && workspace?.assetsRoot && fs.existsSync(workspace.assetsRoot)) {
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
		asset_files.forEach(file => {
			try {
				let document = parseVintageStoryAssetDocument(fs.readFileSync(file, 'utf8'), file);
				document.assetObjects.forEach((entry, index) => {
					let variants = listVintageStoryAssetVariants(document, index);
					validateByTypeMaps(entry.object, variants, warnings);
					collectAbsolutePaths(entry.object).forEach(absolute => addError(errors, `${file}: absolute filesystem path at ${absolute.path}`));
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
						(resolved.warnings || []).forEach(warning => addWarning(warnings, `${file}: ${warning}`));
					});
				});
			} catch (error) {
				addError(errors, `${file}: ${error.message || error}`);
			}
		});
		let shape_files = walkFiles(workspace.folders.shapes || '', fs).filter(path => path.toLowerCase().endsWith('.json'));
		shape_files.forEach(file => {
			try {
				let shape = parseVintageStoryAssetText(fs.readFileSync(file, 'utf8'), file);
				collectObjectKeysDeep(shape, key => /^(guiTransform|groundTransform|tpHandTransform|tpOffHandTransform|.*TransformByType)$/i.test(key))
					.forEach(entry => addWarning(warnings, `${file}: display transform field appears in shape JSON at ${entry.path}.`));
				collectObjectKeysDeep(shape, key => /^(collisionbox|collisionboxes|selectionbox|selectionboxes|collisionSelectionBoxes)$/i.test(key))
					.forEach(entry => addWarning(warnings, `${file}: interaction box field appears in shape JSON at ${entry.path}.`));
			} catch (error) {
				addError(errors, `${file}: ${error.message || error}`);
			}
		});
	}
	return {warnings: Array.from(new Set(warnings)), errors: Array.from(new Set(errors))};
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
	if (PACKAGE_EXCLUDE_RE.test(rel) || BACKUP_EXT_RE.test(rel)) return false;
	if (rel === 'modinfo.json' || rel === 'modicon.png') return true;
	if (rel.startsWith('assets/')) return true;
	if (options.includeCode && (/^src\//i.test(rel) || /\.(dll|pdb)$/i.test(rel))) return true;
	return false;
}

export function defaultVintageStoryPackageName(modinfo = {}) {
	let modid = modinfo.modid || modinfo.modID || modinfo.Modid || modinfo.ModID || 'mod';
	let version = modinfo.version || modinfo.Version || DEFAULT_VS_MOD_VERSION;
	return `${modid}-${version}.zip`;
}

export async function packageVintageStoryModWorkspace(workspace, output_path, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let report = {outputPath: output_path || '', included: [], excluded: [], warnings: [], errors: []};
	if (!fs) {
		addError(report.errors, 'No filesystem adapter was provided.');
		return report;
	}
	let validation = validateVintageStoryWorkspace(workspace, adapters, options);
	report.warnings.push(...validation.warnings);
	report.errors.push(...validation.errors);
	if (report.errors.length && !options.allowValidationErrors) return report;
	let zip = new JSZip();
	let root = workspace.modRoot;
	let files = walkFiles(root, fs);
	files.forEach(file => {
		let rel = pathRelative(PathModule, root, file);
		if (!shouldPackageFile(rel, options)) {
			report.excluded.push(rel);
			return;
		}
		zip.file(rel, fs.readFileSync(file));
		report.included.push(rel);
	});
	if (!report.included.includes('modinfo.json')) addError(report.errors, 'Package would not contain modinfo.json at zip root.');
	if (!report.included.some(file => file === 'assets' || file.startsWith('assets/'))) addError(report.errors, 'Package would not contain assets/ at zip root.');
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

export function formatVintageStoryExportReport(report_or_plan) {
	if (!report_or_plan) return '';
	if (Array.isArray(report_or_plan.entries)) {
		let lines = ['Vintage Story Mod Export Plan', ''];
		(report_or_plan.errors || []).forEach(error => lines.push(`Error: ${error}`));
		(report_or_plan.warnings || []).forEach(warning => lines.push(`Warning: ${warning}`));
		if (report_or_plan.errors?.length || report_or_plan.warnings?.length) lines.push('');
		report_or_plan.entries.forEach(entry => {
			let action = entry.action || (entry.exists ? 'update' : 'write');
			lines.push(`${action.toUpperCase()} ${entry.kind}: ${entry.targetPath}`);
			if (entry.sourcePath) lines.push(`  source: ${entry.sourcePath}`);
			(entry.errors || []).forEach(error => lines.push(`  error: ${error}`));
			(entry.warnings || []).forEach(warning => lines.push(`  warning: ${warning}`));
		});
		return lines.join('\n');
	}
	let lines = ['Vintage Story Mod Export Report', ''];
	['written', 'copied', 'skipped', 'overwritten', 'backups', 'included', 'excluded'].forEach(key => {
		if (report_or_plan[key]?.length) {
			lines.push(`${key}:`);
			report_or_plan[key].forEach(value => lines.push(`  ${value}`));
			lines.push('');
		}
	});
	if (report_or_plan.outputPath) lines.push(`package: ${report_or_plan.outputPath}`);
	if (report_or_plan.copiedPath) lines.push(`mods folder copy: ${report_or_plan.copiedPath}`);
	(report_or_plan.errors || []).forEach(error => lines.push(`Error: ${error}`));
	(report_or_plan.warnings || []).forEach(warning => lines.push(`Warning: ${warning}`));
	return lines.join('\n').trim();
}
