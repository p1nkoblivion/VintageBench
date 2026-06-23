import VintageStoryTextureManagerPanel from './VintageStoryTextureManagerPanel.vue';
import { currentwindow, dialog, fs, PathModule, shell } from '../native_apis';
import { ValidatorCheck } from '../validator.js';
import { getVintageStoryWorkspaceFromSettings } from './vs_asset_workspace.js';
import {
	collectVintageStoryTextureEntries,
	copyTextureIntoWorkspace as copyTextureFileIntoWorkspace,
	makeTextureEditSource,
	textureAssetBaseFromFilePath,
	textureEntrySourceLabel,
	updateTextureEntryBase,
	validateVintageStoryTextureEntries
} from './vs_texture_manager.js';
import {
	setVintageStoryDirty,
	VINTAGE_STORY_DIRTY_KINDS
} from './vs_dirty_state.js';

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hasProject() {
	return !!Project && typeof Project === 'object';
}

function ensureVintageData() {
	if (!hasProject()) return {};
	let data = Project?.vintage_story_data || (Project.vintage_story_data = {});
	if (!Array.isArray(data.texture_manager_entries)) {
		data.texture_manager_entries = collectVintageStoryTextureEntries(data.asset_context?.texture_sources || {});
	}
	return data;
}

function currentWorkspace() {
	return getVintageStoryWorkspaceFromSettings(settings, PathModule, Project?.vintage_story_data?.asset_context?.source_file_path || Project?.save_path || Project?.export_path || '');
}

function syncEntryToAssetContext(entry) {
	let data = ensureVintageData();
	let aliases = data.asset_context?.texture_sources?.aliases;
	if (!aliases || !entry?.alias) return;
	aliases[entry.alias] = clone(entry);
}

function showTextureMessage(title, message, icon = 'info') {
	if (Blockbench?.showMessageBox) {
		Blockbench.showMessageBox({title, icon, message});
	} else {
		console[icon === 'error' ? 'error' : 'log'](title, message);
	}
}

function selectedImageFile(callback) {
	Blockbench.import({
		resource_id: 'vintage_story_texture_file',
		extensions: ['png', 'jpg', 'jpeg'],
		type: 'Vintage Story Texture',
		readtype: 'none',
		multiple: false
	}, files => {
		let file = files?.[0];
		if (file?.path) callback(file.path);
	});
}

function updateBlockbenchTexture(entry) {
	if (!entry?.resolvedFilePath || typeof Texture === 'undefined') return;
	let texture = Texture.all?.find(candidate => {
		return candidate?.vintage_story?.code === entry.alias || candidate?.name === entry.alias || candidate?.id === entry.alias;
	});
	if (!texture || typeof texture.fromPath !== 'function') return;
	texture.fromPath(entry.resolvedFilePath);
	texture.name = entry.alias;
	texture.vintage_story = Object.assign({}, texture.vintage_story || {}, {
		code: entry.alias,
		path: entry.resolvedBase,
		raw_value: clone(entry.rawRef),
		source: clone(entry)
	});
}

export const VintageStoryTextureManager = {
	selectedIndex: 0,
	vue: null,

	getEntries() {
		return ensureVintageData().texture_manager_entries || [];
	},

	getSelectedEntry() {
		return this.getEntries()[this.selectedIndex] || this.getEntries()[0] || null;
	},

	selectEntry(index) {
		this.selectedIndex = Math.max(0, index || 0);
		this.vue?.$forceUpdate?.();
	},

	sourceLabel(entry) {
		return textureEntrySourceLabel(entry);
	},

	validationWarnings() {
		return validateVintageStoryTextureEntries(this.getEntries());
	},

	fileUrl(path) {
		if (!path) return '';
		let normalized = String(path).replace(/\\/g, '/');
		if (/^[a-zA-Z]:\//.test(normalized)) normalized = `/${normalized}`;
		return encodeURI(`file://${normalized}`);
	},

	ensureEditTarget(entry = this.getSelectedEntry()) {
		if (!entry) return false;
		if (!(entry.sourceKind === 'texturesByType' || entry.isByType) || !entry.inherited || entry.sourcePointer?.editTargetKey) return true;
		let result = dialog?.showMessageBoxSync
			? dialog.showMessageBoxSync(currentwindow, {
				type: 'warning',
				noLink: true,
				title: 'Edit inherited texture rule?',
				message: `Texture alias "${entry.alias}" is inherited from ${textureEntrySourceLabel(entry)}.`,
				buttons: [`Create override for ${entry.selectedVariantKey}`, 'Edit shared rule', 'Cancel'],
				cancelId: 2,
				defaultId: 0
			})
			: 0;
		if (result === 1) {
			this.editSharedRule(entry);
			return true;
		}
		if (result === 2) return false;
		this.createOverride(entry);
		return true;
	},

	markDirty(entry = this.getSelectedEntry()) {
		if (!entry) return false;
		if (!this.ensureEditTarget(entry)) return false;
		entry.dirty = true;
		syncEntryToAssetContext(entry);
		setVintageStoryDirty(Project, VINTAGE_STORY_DIRTY_KINDS.ASSET, true, {
			filePath: Project?.vintage_story_data?.asset_context?.source_file_path || '',
			reason: 'Unsaved texture manager edits'
		});
		this.vue?.$forceUpdate?.();
		return true;
	},

	replaceEntry(updated) {
		let entries = this.getEntries();
		let index = entries.findIndex(entry => entry.alias === updated.alias);
		if (index < 0) {
			entries.push(updated);
			this.selectedIndex = entries.length - 1;
		} else {
			entries.splice(index, 1, updated);
			this.selectedIndex = index;
		}
		syncEntryToAssetContext(updated);
		updateBlockbenchTexture(updated);
		this.markDirty(updated);
	},

	createOverride(entry = this.getSelectedEntry()) {
		if (!entry) return;
		entry.sourcePointer = makeTextureEditSource(entry, 'override');
		entry.sourceKind = entry.sourcePointer?.sourceKind || 'textures';
		entry.sourceMapPath = entry.sourcePointer?.sourceMapPath || 'root.textures';
		entry.sourcePath = entry.sourcePointer?.sourcePath || `root.textures.${entry.alias}`;
		entry.matchedPattern = entry.sourcePointer?.matchedPattern || null;
		entry.editMode = 'override';
		entry.exact = true;
		entry.inherited = false;
		entry.fallback = false;
		entry.isByType = !!entry.sourcePointer?.isByType;
		entry.isAssetOverride = true;
		entry.isShapeAlias = false;
		this.markDirty(entry);
	},

	editSharedRule(entry = this.getSelectedEntry()) {
		if (!entry) return;
		entry.sourcePointer = makeTextureEditSource(entry, 'shared');
		entry.editMode = 'shared';
		entry.dirty = true;
		this.markDirty(entry);
	},

	setTextureBase(entry = this.getSelectedEntry(), value) {
		if (!entry) return;
		try {
			let updated = updateTextureEntryBase(entry, value, entry.resolvedFilePath || '', entry.editMode || entry.sourcePointer?.editMode || 'override');
			this.replaceEntry(updated);
		} catch (error) {
			showTextureMessage('Texture Base Path', error.message || String(error), 'error');
		}
	},

	openTextureFolder(entry = this.getSelectedEntry()) {
		let path = entry?.resolvedFilePath || '';
		let workspace = currentWorkspace();
		if (path && fs.existsSync(path)) {
			shell?.showItemInFolder?.(path);
			return;
		}
		let folder = workspace?.folders?.textures || '';
		if (folder && fs.existsSync(folder)) {
			shell?.openPath?.(folder);
			return;
		}
		showTextureMessage('Open Texture Folder', 'No resolved texture file or configured textures folder was found.', 'warning');
	},

	relinkMissingTexture(entry = this.getSelectedEntry()) {
		if (!entry) return;
		selectedImageFile(file_path => {
			let workspace = currentWorkspace();
			let asset_file = Project?.vintage_story_data?.asset_context?.source_file_path || '';
			let base = textureAssetBaseFromFilePath(file_path, asset_file, workspace);
			if (base) {
				this.replaceEntry(updateTextureEntryBase(entry, base, file_path, 'override'));
				return;
			}
			try {
				let copy = copyTextureFileIntoWorkspace(entry, file_path, workspace, {fs, PathModule}, {
					assetFilePath: asset_file,
					assetContext: Project?.vintage_story_data?.asset_context || {}
				});
				this.replaceEntry(updateTextureEntryBase(entry, copy.assetBase, copy.targetPath, 'override'));
				showTextureMessage('Relink Texture', copy.duplicate ? 'Reused an identical texture already in the workspace.' : 'Copied the texture into the workspace.');
			} catch (error) {
				showTextureMessage('Relink Texture', error.message || String(error), 'error');
			}
		});
	},

	copyTextureIntoWorkspace(entry = this.getSelectedEntry()) {
		if (!entry) return;
		let source_path = entry.resolvedFilePath;
		let runCopy = file_path => {
			try {
				let workspace = currentWorkspace();
				let asset_file = Project?.vintage_story_data?.asset_context?.source_file_path || '';
				let copy = copyTextureFileIntoWorkspace(entry, file_path, workspace, {fs, PathModule}, {
					assetFilePath: asset_file,
					assetContext: Project?.vintage_story_data?.asset_context || {}
				});
				this.replaceEntry(updateTextureEntryBase(entry, copy.assetBase, copy.targetPath, 'override'));
				showTextureMessage('Copy Texture', copy.duplicate ? 'Reused an identical texture already in the workspace.' : 'Copied the texture into the workspace.');
			} catch (error) {
				showTextureMessage('Copy Texture', error.message || String(error), 'error');
			}
		};
		if (source_path && fs.existsSync(source_path)) {
			runCopy(source_path);
		} else {
			selectedImageFile(runCopy);
		}
	}
};

Interface.definePanels(function() {
	new Panel('vintage_story_texture_manager', {
		icon: 'texture',
		condition: () => hasProject() && !!Project?.vintage_story_data?.asset_context,
		default_position: {
			slot: 'left_bar',
			float_position: [0, 0],
			float_size: [340, 500],
			height: 500,
			sidebar_index: 3
		},
		component: VintageStoryTextureManagerPanel
	});
	VintageStoryTextureManager.vue = Interface.Panels.vintage_story_texture_manager.inside_vue;
});

new ValidatorCheck('vintage_story_texture_manager', {
	condition: () => !!Project?.vintage_story_data?.asset_context,
	update_triggers: [],
	run() {
		VintageStoryTextureManager.validationWarnings().forEach(message => {
			this.warn({message});
		});
	}
});

if (typeof window !== 'undefined') {
	Object.assign(window, {VintageStoryTextureManager});
}
