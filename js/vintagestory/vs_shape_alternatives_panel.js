import VintageStoryShapeAlternativesPanel from './VintageStoryShapeAlternativesPanel.vue';
import { currentwindow, dialog, fs, PathModule } from '../native_apis';
import { assetFilePathForBase } from './vs_mod_exporter.js';
import { getVintageStoryWorkspaceFromSettings } from './vs_asset_workspace.js';
import {
	cloneVintageStoryShapeAlternatives,
	makeShapeAlternativeFromBase,
	shapeAlternativeSourceLabel,
	validateVintageStoryShapeAlternatives
} from './vs_shape_alternatives.js';
import {
	setVintageStoryDirty,
	VINTAGE_STORY_DIRTY_KINDS
} from './vs_dirty_state.js';
import { writeVintageStoryTextFile } from './vs_file_write_safety.js';

function hasProject() {
	return !!Project && typeof Project === 'object';
}

function currentWorkspace() {
	return getVintageStoryWorkspaceFromSettings(settings, PathModule, Project?.vintage_story_data?.asset_context?.source_file_path || Project?.save_path || Project?.export_path || '');
}

function shouldCreateBackups() {
	return settings?.vintage_story_create_backups?.value !== false;
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

function ensureVintageData() {
	if (!hasProject()) return {};
	let data = Project.vintage_story_data || (Project.vintage_story_data = {});
	if (!Array.isArray(data.shape_alternatives)) {
		data.shape_alternatives = cloneVintageStoryShapeAlternatives(data.asset_context?.shape_alternatives || data.asset_context?.shape?.alternates || []);
	}
	return data;
}

function syncAlternativesToAssetContext(alternatives) {
	let data = ensureVintageData();
	if (!data.asset_context) return;
	data.asset_context.shape_alternatives = cloneVintageStoryShapeAlternatives(alternatives);
	if (data.asset_context.shape) data.asset_context.shape.alternates = cloneVintageStoryShapeAlternatives(alternatives);
}

function markAssetDirty() {
	setVintageStoryDirty(Project, VINTAGE_STORY_DIRTY_KINDS.ASSET, true, {
		filePath: Project?.vintage_story_data?.asset_context?.source_file_path || '',
		reason: 'Unsaved shape alternate edits'
	});
}

function compileCurrentShapeContent() {
	if (globalThis.Codecs?.vintage_story_json?.compile) {
		return globalThis.Codecs.vintage_story_json.compile({omitDisplayTransforms: true});
	}
	return JSON.stringify({textureWidth: 16, textureHeight: 16, elements: []}, null, '\t');
}

function defaultAlternateBase() {
	let base = Project?.vintage_story_data?.asset_context?.shape?.resolvedBase
		|| Project?.vintage_story_data?.editing_target?.shape_base
		|| 'item/alternate';
	let stem = String(base).replace(/\.json$/i, '');
	let existing = VintageStoryShapeAlternatives.getAlternatives().map(alternate => alternate.resolvedBase);
	for (let index = 1; index < 100; index++) {
		let candidate = `${stem}-alt${index}`;
		if (!existing.includes(candidate)) return candidate;
	}
	return `${stem}-alt`;
}

export const VintageStoryShapeAlternatives = {
	selectedIndex: 0,
	vue: null,

	getAlternatives() {
		return ensureVintageData().shape_alternatives || [];
	},

	getSelectedAlternative() {
		return this.getAlternatives()[this.selectedIndex] || this.getAlternatives()[0] || null;
	},

	selectAlternative(index) {
		this.selectedIndex = Math.max(0, index || 0);
		this.vue?.$forceUpdate?.();
	},

	sourceLabel(alternative) {
		return shapeAlternativeSourceLabel(alternative);
	},

	validationWarnings() {
		return validateVintageStoryShapeAlternatives(this.getAlternatives());
	},

	markDirty(alternative = this.getSelectedAlternative()) {
		if (alternative) alternative.dirty = true;
		syncAlternativesToAssetContext(this.getAlternatives());
		markAssetDirty();
		this.vue?.$forceUpdate?.();
	},

	openAlternative(alternative = this.getSelectedAlternative()) {
		if (!alternative) return;
		window.openVintageStoryAlternateShape?.(alternative);
	},

	createAlternative() {
		let shape_source = Project?.vintage_story_data?.asset_context?.shape || {};
		let workspace = currentWorkspace();
		new Dialog({
			id: 'vintage_story_create_shape_alternate',
			title: 'Create Shape Alternate',
			width: 520,
			form: {
				base: {type: 'text', label: 'Shape base', value: defaultAlternateBase(), placeholder: 'item/tool/bow/charge1'}
			},
			onConfirm: result => {
				try {
					let base = String(result.base || '').trim();
					let target = assetFilePathForBase(workspace, 'shapes', base, '.json', PathModule);
					if (!target) throw new Error('Shape alternate base path must resolve under assets/<domain>/shapes.');
					if (fs.existsSync(target)) {
						let overwrite = dialog?.showMessageBoxSync
							? dialog.showMessageBoxSync(currentwindow, {
								type: 'warning',
								noLink: true,
								title: 'Overwrite Shape Alternate?',
								message: 'A shape file already exists for this alternate base.',
								detail: target,
								cancelId: 1,
								defaultId: 1,
								buttons: ['Overwrite', 'Cancel']
							})
							: 1;
						if (overwrite !== 0) return;
					}
					let write = writeVintageStoryTextFile(target, compileCurrentShapeContent(), {fs, PathModule}, {
						createBackups: shouldCreateBackups()
					});
					let alternatives = this.getAlternatives();
					let alternate = makeShapeAlternativeFromBase(base, shape_source, {
						index: alternatives.length,
						resolvedShapeFilePath: target,
						mode: 'override'
					});
					alternate.missing = false;
					alternatives.push(alternate);
					this.selectedIndex = alternatives.length - 1;
					this.markDirty(alternate);
					Blockbench?.showQuickMessage?.(write.backupPath ? 'Created alternate shape with backup.' : 'Created alternate shape.');
				} catch (error) {
					showMessage('Create Shape Alternate', error.message || String(error), 'error');
				}
			}
		}).show();
	}
};

Interface.definePanels(function() {
	new Panel('vintage_story_shape_alternatives', {
		icon: 'dynamic_feed',
		condition: () => hasProject() && !!Project?.vintage_story_data?.asset_context,
		default_position: {
			slot: 'left_bar',
			float_position: [0, 0],
			float_size: [340, 420],
			height: 420,
			sidebar_index: 5
		},
		component: VintageStoryShapeAlternativesPanel
	});
	VintageStoryShapeAlternatives.vue = Interface.Panels.vintage_story_shape_alternatives.inside_vue;
});

if (typeof window !== 'undefined') {
	Object.assign(window, {VintageStoryShapeAlternatives});
}
