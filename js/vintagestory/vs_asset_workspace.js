export const VINTAGE_STORY_WORKSPACE_SETTING_IDS = {
	modRoot: 'vintage_story_mod_root_path',
	domain: 'vintage_story_mod_domain',
	shapesFolder: 'vintage_story_shapes_path',
	texturesFolder: 'vintage_story_textures_path',
	blocktypesFolder: 'vintage_story_blocktypes_path',
	itemtypesFolder: 'vintage_story_itemtypes_path',
	langFolder: 'vintage_story_lang_path',
	gameAssetRoot: 'vintage_story_assets_path',
	legacyModAssetRoot: 'vintage_story_mod_assets_path'
};

function slash(path) {
	return String(path || '').replace(/\\/g, '/');
}

function settingValue(settings_object, id) {
	return settings_object?.[id]?.value || '';
}

function trimSlashes(value) {
	return String(value || '').replace(/^\/+|\/+$/g, '');
}

export function inferVintageStoryDomainFromPath(path, fallback = '') {
	let match = slash(path).match(/\/assets\/([^/]+)(?:\/|$)/i);
	return match?.[1] || fallback;
}

export function inferVintageStoryModRootFromPath(path) {
	let match = slash(path).match(/^(.*)\/assets\/[^/]+(?:\/|$)/i);
	return match?.[1] || '';
}

export function buildVintageStoryWorkspace({modRoot = '', domain = '', PathModule = null} = {}) {
	let root = String(modRoot || '').trim();
	let modid = String(domain || '').trim();
	let join = PathModule?.join
		? (...parts) => PathModule.join(...parts)
		: (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');
	let assets_root = root && modid ? join(root, 'assets', modid) : '';
	return {
		modRoot: root,
		domain: modid,
		assetsRoot: assets_root,
		folders: {
			shapes: assets_root ? join(assets_root, 'shapes') : '',
			textures: assets_root ? join(assets_root, 'textures') : '',
			blocktypes: assets_root ? join(assets_root, 'blocktypes') : '',
			itemtypes: assets_root ? join(assets_root, 'itemtypes') : '',
			lang: assets_root ? join(assets_root, 'lang') : ''
		}
	};
}

export function getVintageStoryWorkspaceFromSettings(settings_object, PathModule = null, project_path = '') {
	let ids = VINTAGE_STORY_WORKSPACE_SETTING_IDS;
	let mod_root = settingValue(settings_object, ids.modRoot)
		|| inferVintageStoryModRootFromPath(project_path)
		|| settingValue(settings_object, ids.legacyModAssetRoot);
	let domain = settingValue(settings_object, ids.domain)
		|| inferVintageStoryDomainFromPath(project_path)
		|| inferVintageStoryDomainFromPath(settingValue(settings_object, ids.legacyModAssetRoot));
	let direct_asset_root = slash(mod_root).match(/^(.*)\/assets\/([^/]+)$/i);
	if (direct_asset_root) {
		mod_root = direct_asset_root[1];
		if (!domain) domain = direct_asset_root[2];
	}
	let workspace = buildVintageStoryWorkspace({modRoot: mod_root, domain, PathModule});
	let overrides = {
		shapes: settingValue(settings_object, ids.shapesFolder),
		textures: settingValue(settings_object, ids.texturesFolder),
		blocktypes: settingValue(settings_object, ids.blocktypesFolder),
		itemtypes: settingValue(settings_object, ids.itemtypesFolder),
		lang: settingValue(settings_object, ids.langFolder)
	};
	Object.keys(overrides).forEach(key => {
		if (overrides[key]) workspace.folders[key] = overrides[key];
	});
	return workspace;
}

export function getVintageStoryWorkspaceFolder(workspace, folder) {
	return workspace?.folders?.[trimSlashes(folder)] || '';
}

export function getVintageStoryLangPath(workspace, language = 'en', PathModule = null) {
	let folder = getVintageStoryWorkspaceFolder(workspace, 'lang');
	if (!folder) return '';
	return PathModule?.join ? PathModule.join(folder, `${language || 'en'}.json`) : `${slash(folder).replace(/\/+$/, '')}/${language || 'en'}.json`;
}
