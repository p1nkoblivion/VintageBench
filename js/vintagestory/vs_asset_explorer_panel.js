import VintageStoryAssetExplorerPanel from './VintageStoryAssetExplorerPanel.vue';
import { currentwindow, dialog, fs, PathModule, shell } from '../native_apis';
import {
	buildVintageStoryAssetExplorer,
	getVintageStoryAssetExplorerFindingGroups,
	parseVintageStoryRawShapeFile
} from './vs_asset_explorer.js';
import { getVintageStoryModExportConfigFromSettings } from './vs_mod_exporter.js';
import {
	collectVintageStoryDirtyRecords,
	formatVintageStoryDirtyRecords
} from './vs_dirty_state.js';

function hasProject() {
	return !!Project && typeof Project === 'object';
}

function getConfig() {
	return getVintageStoryModExportConfigFromSettings(settings, PathModule, Project?.save_path || Project?.export_path || '');
}

function pathName(path) {
	return PathModule?.basename ? PathModule.basename(path) : String(path || '').split(/[\\/]/g).pop();
}

function currentShapePath() {
	return Project?.vintage_story_data?.editing_target?.shape_path
		|| Project?.vintage_story_data?.asset_context?.current_shape_target?.shape_path
		|| Project?.save_path
		|| Project?.export_path
		|| '';
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

function confirmOpenOverDirty(title) {
	let records = collectVintageStoryDirtyRecords(Project, {includeExportPlan: false});
	if (!records.length) return true;
	let message = `Opening another Vintage Story file would leave unsaved edits behind:\n\n${formatVintageStoryDirtyRecords(records)}`;
	let result = dialog?.showMessageBoxSync
		? dialog.showMessageBoxSync(currentwindow, {
			type: 'warning',
			noLink: true,
			title,
			message,
			cancelId: 1,
			defaultId: 1,
			buttons: ['Open Anyway', 'Cancel']
		})
		: 0;
	return result === 0;
}

function makeFileForPath(path, content = '') {
	return {
		name: pathName(path),
		path,
		content,
		no_file: false
	};
}

function openAssetPath(path) {
	if (!path || !fs.existsSync(path)) {
		showMessage('Open Vintage Story Asset', `Asset file does not exist: ${path || '(empty)'}`, 'error');
		return;
	}
	if (!confirmOpenOverDirty('Open Vintage Story Asset?')) return;
	window.openVintageStoryAssetFile?.(makeFileForPath(path, fs.readFileSync(path, 'utf8')));
}

function openRawShapePath(path) {
	if (!path || !fs.existsSync(path)) {
		showMessage('Open Raw Shape', `Shape file does not exist: ${path || '(empty)'}`, 'error');
		return;
	}
	if (!confirmOpenOverDirty('Open Raw Shape?')) return;
	try {
		let shape_json = parseVintageStoryRawShapeFile(path, {fs, PathModule});
		let file = makeFileForPath(path, JSON.stringify(shape_json));
		Codecs.vintage_story_json.load(shape_json, file, {});
		Project.name = pathName(path).replace(/\.json$/i, '');
		Project.save_path = path;
		Project.export_path = path;
		Project.export_codec = 'vintage_story_json';
		let data = Project.vintage_story_data || (Project.vintage_story_data = {});
		data.editing_target = {kind: 'main', shape_path: path};
		if (typeof addRecentProject !== 'undefined') {
			addRecentProject({
				name: Project.name,
				path,
				icon: typeof Format !== 'undefined' ? Format.icon : undefined
			});
		}
	} catch (error) {
		showMessage('Open Raw Shape', error.message || String(error), 'error');
	}
}

function revealPath(path) {
	if (!path) return;
	if (fs.existsSync(path)) {
		shell?.showItemInFolder?.(path);
	} else {
		showMessage('Reveal File', `File does not exist: ${path}`, 'warning');
	}
}

export const VintageStoryAssetExplorer = {
	selectedRowIndex: 0,
	activeFindingGroupId: 'missingTextures',
	scan: null,
	config: null,
	vue: null,

	refresh() {
		try {
			this.config = getConfig();
			this.scan = buildVintageStoryAssetExplorer(this.config.workspace, {fs, PathModule}, {
				currentShapePath: currentShapePath(),
				gameAssetRoot: this.config.gameAssetRoot,
				additionalAssetRoots: this.config.additionalAssetRoots
			});
			if (this.selectedRowIndex >= this.getRows().length) this.selectedRowIndex = 0;
			this.vue?.$forceUpdate?.();
		} catch (error) {
			showMessage('Asset Explorer', error.message || String(error), 'error');
		}
	},

	ensureScan() {
		if (!this.scan) this.refresh();
		return this.scan;
	},

	getRows() {
		return this.ensureScan()?.treeRows || [];
	},

	getSelectedRow() {
		return this.getRows()[this.selectedRowIndex] || null;
	},

	selectRow(index) {
		this.selectedRowIndex = Math.max(0, index || 0);
		this.vue?.$forceUpdate?.();
	},

	openRow(row = this.getSelectedRow()) {
		if (!row?.path) return;
		if (row.kind === 'itemtype' || row.kind === 'blocktype') {
			openAssetPath(row.path);
		} else if (row.kind === 'shape') {
			openRawShapePath(row.path);
		} else {
			revealPath(row.path);
		}
	},

	getFindingGroups() {
		return getVintageStoryAssetExplorerFindingGroups(this.ensureScan());
	},

	setFindingGroup(id) {
		this.activeFindingGroupId = id;
		if (id === 'assetsReferencingCurrentShape' && !currentShapePath()) {
			showMessage('Find Assets Referencing Shape', 'Open or save a Vintage Story shape before searching for references.', 'warning');
		}
		this.vue?.$forceUpdate?.();
	},

	getActiveFindingGroup() {
		return this.getFindingGroups().find(group => group.id === this.activeFindingGroupId) || this.getFindingGroups()[0] || {entries: []};
	},

	openFinding(finding) {
		if (!finding) return;
		if (finding.assetFilePath) {
			openAssetPath(finding.assetFilePath);
		} else if (finding.type === 'unused_shape') {
			openRawShapePath(finding.filePath);
		} else {
			revealPath(finding.filePath);
		}
	},

	revealFinding(finding) {
		if (finding?.filePath) revealPath(finding.filePath);
	}
};

Interface.definePanels(function() {
	new Panel('vintage_story_asset_explorer', {
		icon: 'account_tree',
		condition: () => (hasProject() || !!globalThis.isApp) && !globalThis.Modes?.animate,
		default_position: {
			slot: 'left_bar',
			float_position: [0, 0],
			float_size: [360, 520],
			height: 520,
			sidebar_index: 4
		},
		component: VintageStoryAssetExplorerPanel
	});
	VintageStoryAssetExplorer.vue = Interface.Panels.vintage_story_asset_explorer.inside_vue;
});

if (typeof window !== 'undefined') {
	Object.assign(window, {VintageStoryAssetExplorer});
}
