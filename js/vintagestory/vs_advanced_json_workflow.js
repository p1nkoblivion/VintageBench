import { currentwindow, dialog, fs, PathModule } from '../native_apis';
import {
	collectVintageStoryPreservedFields,
	findVintageStoryAdvancedAssetSection,
	formatVintageStoryAdvancedJson,
	formatVintageStoryPreservedFields,
	getVintageStoryAdvancedAssetSections,
	getVintageStoryAdvancedSectionValue,
	makeVintageStoryAdvancedEditPreview,
	makeVintageStoryAdvancedRootEditPreview,
	replaceVintageStoryDocumentAssetObject
} from './vs_advanced_json.js';
import {
	parseVintageStoryAssetDocument,
	serializeVintageStoryAssetDocument
} from './vs_asset_document.js';
import { isPathUnderRoot } from './vs_asset_resolver.js';
import {
	buildVintageStoryModInfo,
	getVintageStoryModExportConfigFromSettings,
	validateVintageStoryModInfo
} from './vs_mod_exporter.js';
import {
	clearVintageStoryDirtyFile,
	VINTAGE_STORY_DIRTY_KINDS
} from './vs_dirty_state.js';
import { writeVintageStoryTextFile } from './vs_file_write_safety.js';

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

function getSettingValue(id) {
	return settings?.[id]?.value || '';
}

function confirmVanillaWrite(path, label) {
	let game_root = getSettingValue('vintage_story_assets_path');
	if (!game_root || !path || !isPathUnderRoot(path, game_root)) return true;
	let result = dialog.showMessageBoxSync(currentwindow, {
		type: 'warning',
		noLink: true,
		title: `Overwrite Vintage Story Game ${label}?`,
		message: `This ${label} file is inside the configured Vintage Story game assets folder.`,
		detail: path,
		cancelId: 1,
		defaultId: 1,
		buttons: ['Overwrite anyway', 'Cancel']
	});
	return result === 0;
}

function confirmAdvancedJsonDiff(title, diff, apply) {
	new Dialog({
		id: 'vintage_story_advanced_json_diff',
		title,
		width: 900,
		buttons: ['Apply Changes', 'dialog.cancel'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			diff: {
				type: 'textarea',
				label: 'Diff',
				value: diff || 'No changes.',
				height: 460,
				readonly: true,
				style: 'code',
				share_text: true
			}
		},
		onConfirm() {
			apply();
		}
	}).show();
}

function writeAdvancedJsonFile(path, content, dirty_kind) {
	let write = writeVintageStoryTextFile(path, content, {fs, PathModule}, {
		createBackups: shouldCreateBackups()
	});
	clearVintageStoryDirtyFile(Project, dirty_kind, path);
	let backup = write.backupPath ? ` Backup: ${write.backupPath}` : '';
	Blockbench?.showQuickMessage?.(`Saved ${PathModule.basename(path)}.${backup}`);
}

function sectionOptions(sections) {
	let options = {};
	sections.forEach(section => {
		options[section.id] = section.label;
	});
	return options;
}

function readCurrentAssetDocument() {
	let asset_context = Project?.vintage_story_data?.asset_context;
	if (!asset_context?.source_file_path) {
		throw new Error('Open a Vintage Story item/block asset before using the advanced asset JSON editor.');
	}
	let text = fs.readFileSync(asset_context.source_file_path, 'utf8');
	let document = parseVintageStoryAssetDocument(text, asset_context.source_file_path);
	let asset_index = asset_context.source_object_index || 0;
	let asset_object = document.assetObjects?.[asset_index]?.object;
	if (!asset_object) throw new Error('Could not find the selected item/block asset object in the source file.');
	return {asset_context, document, asset_index, asset_object};
}

export function openVintageStoryAdvancedAssetJsonDialog(initial_section_id = 'root') {
	let state;
	try {
		state = readCurrentAssetDocument();
	} catch (error) {
		showMessage('Advanced Asset JSON', error.message || String(error), 'error');
		return;
	}

	let sections = getVintageStoryAdvancedAssetSections(state.asset_object);
	let active_section = findVintageStoryAdvancedAssetSection(state.asset_object, initial_section_id);
	let preserved_text = formatVintageStoryPreservedFields(collectVintageStoryPreservedFields(state.asset_object));
	let editor_dialog = null;

	function sectionText(section_id) {
		return formatVintageStoryAdvancedJson(getVintageStoryAdvancedSectionValue(state.asset_object, section_id));
	}

	function updateSection(section_id) {
		active_section = findVintageStoryAdvancedAssetSection(state.asset_object, section_id);
		editor_dialog?.setFormValues?.({
			section: active_section.id,
			json: sectionText(active_section.id),
			preserved: preserved_text
		}, false);
	}

	editor_dialog = new Dialog({
		id: 'vintage_story_advanced_asset_json',
		title: 'Advanced Vintage Story Asset JSON',
		width: 900,
		buttons: ['Preview Diff', 'dialog.cancel'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			section: {
				type: 'select',
				label: 'Section',
				options: sectionOptions(sections),
				value: active_section.id
			},
			json: {
				type: 'textarea',
				label: 'JSON',
				value: sectionText(active_section.id),
				height: 360,
				style: 'code',
				share_text: true
			},
			preserved: {
				type: 'textarea',
				label: 'Preserved Fields',
				value: preserved_text,
				height: 140,
				readonly: true,
				style: 'code',
				share_text: true
			}
		},
		onFormChange(result) {
			if (result.section && result.section !== active_section.id) updateSection(result.section);
		},
		onConfirm(result) {
			let preview = makeVintageStoryAdvancedEditPreview(state.asset_object, result.section || active_section.id, result.json);
			if (preview.errors?.length) {
				showMessage('Advanced Asset JSON', preview.errors.join('\n'), 'error');
				return false;
			}
			if (!preview.changed) {
				Blockbench?.showQuickMessage?.('No advanced JSON changes to apply.');
				return false;
			}
			confirmAdvancedJsonDiff('Apply Advanced Asset JSON Changes?', preview.diff, () => {
				try {
					if (!confirmVanillaWrite(state.asset_context.source_file_path, 'asset')) return;
					replaceVintageStoryDocumentAssetObject(state.document, state.asset_index, preview.afterAsset);
					writeAdvancedJsonFile(
						state.asset_context.source_file_path,
						serializeVintageStoryAssetDocument(state.document),
						VINTAGE_STORY_DIRTY_KINDS.ASSET
					);
					editor_dialog.hide();
				} catch (error) {
					showMessage('Advanced Asset JSON', error.message || String(error), 'error');
				}
			});
			return false;
		}
	});
	editor_dialog.show();
}

function getModInfoEditorState() {
	let config = getVintageStoryModExportConfigFromSettings(settings, PathModule, Project?.save_path || Project?.export_path || '');
	let modinfo_path = config.workspace?.modRoot ? PathModule.join(config.workspace.modRoot, 'modinfo.json') : '';
	if (!modinfo_path) throw new Error('Set a Vintage Story mod workspace root before editing modinfo.json.');
	let existing = {};
	if (fs.existsSync(modinfo_path)) {
		existing = parseVintageStoryAssetDocument(fs.readFileSync(modinfo_path, 'utf8'), modinfo_path).root;
	} else {
		existing = buildVintageStoryModInfo(config.modInfo, {});
	}
	return {config, modinfo_path, modinfo: existing};
}

export function openVintageStoryAdvancedModInfoJsonDialog() {
	let state;
	try {
		state = getModInfoEditorState();
	} catch (error) {
		showMessage('Advanced modinfo JSON', error.message || String(error), 'error');
		return;
	}
	new Dialog({
		id: 'vintage_story_advanced_modinfo_json',
		title: 'Advanced modinfo.json',
		width: 820,
		buttons: ['Preview Diff', 'dialog.cancel'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			path: {
				label: 'File',
				value: state.modinfo_path,
				readonly: true
			},
			json: {
				type: 'textarea',
				label: 'modinfo.json',
				value: formatVintageStoryAdvancedJson(state.modinfo),
				height: 430,
				style: 'code',
				share_text: true
			}
		},
		onConfirm(result) {
			let preview = makeVintageStoryAdvancedRootEditPreview(state.modinfo, result.json, 'modinfo.json');
			if (preview.errors?.length) {
				showMessage('Advanced modinfo JSON', preview.errors.join('\n'), 'error');
				return false;
			}
			let validation = validateVintageStoryModInfo(preview.afterRoot, state.config.workspace);
			if (validation.errors?.length) {
				showMessage('Advanced modinfo JSON', validation.errors.join('\n'), 'error');
				return false;
			}
			if (!preview.changed) {
				Blockbench?.showQuickMessage?.('No modinfo.json changes to apply.');
				return false;
			}
			let warnings = validation.warnings?.length ? `\n\nWarnings:\n${validation.warnings.join('\n')}` : '';
			confirmAdvancedJsonDiff('Apply modinfo.json Changes?', `${preview.diff}${warnings}`, () => {
				try {
					writeAdvancedJsonFile(
						state.modinfo_path,
						serializeVintageStoryAssetDocument(preview.afterRoot),
						VINTAGE_STORY_DIRTY_KINDS.MODINFO
					);
				} catch (error) {
					showMessage('Advanced modinfo JSON', error.message || String(error), 'error');
				}
			});
			return false;
		}
	}).show();
}

export function registerVintageStoryAdvancedJsonWorkflow() {
	if (typeof BARS === 'undefined' || typeof Action === 'undefined') return;
	BARS.defineActions(function() {
		if (!BarItems.advanced_vintage_story_asset_json) {
			new Action('advanced_vintage_story_asset_json', {
				icon: 'data_object',
				category: 'file',
				name: 'Advanced Asset JSON',
				description: 'Edit preserved Vintage Story item/block JSON sections and preview the diff before applying.',
				condition: () => !!Project?.vintage_story_data?.asset_context?.source_file_path,
				click() {
					openVintageStoryAdvancedAssetJsonDialog();
				}
			});
		}
		if (!BarItems.advanced_vintage_story_modinfo_json) {
			new Action('advanced_vintage_story_modinfo_json', {
				icon: 'description',
				category: 'file',
				name: 'Advanced modinfo.json',
				description: 'Edit modinfo.json and preview the diff before applying.',
				condition: () => isApp,
				click() {
					openVintageStoryAdvancedModInfoJsonDialog();
				}
			});
		}
	});
}

if (typeof window !== 'undefined') {
	Object.assign(window, {
		openVintageStoryAdvancedAssetJsonDialog,
		openVintageStoryAdvancedModInfoJsonDialog
	});
	registerVintageStoryAdvancedJsonWorkflow();
}
