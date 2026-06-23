import { clipboard, currentwindow, dialog, fs, PathModule, shell } from '../native_apis';
import { getDefaultVintageBenchModExportsPath } from './vs_app_data_paths.js';
import {
	copyVintageStoryPackageToModsFolder,
	createVintageStoryExportPlanFromResolvedContext,
	defaultVintageStoryPackageName,
	executeVintageStoryExportPlan,
	formatVintageStoryExportReport,
	formatVintageStoryValidationReport,
	getVintageStoryModExportConfigFromSettings,
	packageVintageStoryModWorkspace,
	validateVintageStoryWorkspace
} from './vs_mod_exporter.js';
import {
	writeVintageStoryAssetAttachmentEdits,
	writeVintageStoryAssetInteractionBoxEdits,
	writeVintageStoryAssetShapeAlternativeEdits,
	writeVintageStoryAssetTextureEdits,
	writeVintageStoryAssetTransformEdits
} from './vs_asset_workflow.js';
import { parseVintageStoryAssetText } from './vs_asset_document.js';
import {
	clearVintageStoryDirtyFilesWrittenByReport,
	markVintageStoryExportPlanDirty
} from './vs_dirty_state.js';
import { rollbackVintageStoryExportReport } from './vs_backup_recovery.js';

function showMessage(title, message, icon = 'info') {
	if (Blockbench?.showMessageBox) {
		Blockbench.showMessageBox({title, icon, message});
	} else if (icon === 'error') {
		console.error(title, message);
	} else {
		console.warn(title, message);
	}
}

function getConfig() {
	let config = getVintageStoryModExportConfigFromSettings(settings, PathModule, Project?.save_path || Project?.export_path || '');
	if (!config.packageOutputFolder) {
		config.packageOutputFolder = getDefaultVintageBenchModExportsPath();
	}
	return config;
}

function compileCurrentShapeText() {
	if (!Codecs?.vintage_story_json?.compile) {
		throw new Error('The current model cannot be compiled as Vintage Story shape JSON.');
	}
	return Codecs.vintage_story_json.compile({omitDisplayTransforms: true});
}

function runPreExportWritebacks(context, warnings) {
	let transform_result = writeVintageStoryAssetTransformEdits(context, Project?.display_settings);
	(transform_result?.warnings || []).forEach(warning => warnings.push(warning));
	(transform_result?.errors || []).forEach(error => warnings.push(error));
	let shape_alternate_result = writeVintageStoryAssetShapeAlternativeEdits(context, Project?.vintage_story_data?.shape_alternatives);
	(shape_alternate_result?.warnings || []).forEach(warning => warnings.push(warning));
	(shape_alternate_result?.errors || []).forEach(error => warnings.push(error));
	let texture_result = writeVintageStoryAssetTextureEdits(context, Project?.vintage_story_data?.texture_manager_entries);
	(texture_result?.warnings || []).forEach(warning => warnings.push(warning));
	(texture_result?.errors || []).forEach(error => warnings.push(error));
	let box_result = writeVintageStoryAssetInteractionBoxEdits(context, Project?.vintage_story_data?.interaction_boxes);
	(box_result?.warnings || []).forEach(warning => warnings.push(warning));
	(box_result?.errors || []).forEach(error => warnings.push(error));
	let attachment_result = writeVintageStoryAssetAttachmentEdits(context, Project?.vintage_story_data?.attachments);
	(attachment_result?.warnings || []).forEach(warning => warnings.push(warning));
	(attachment_result?.errors || []).forEach(error => warnings.push(error));
	return !!(
		transform_result?.cancelled || shape_alternate_result?.cancelled || texture_result?.cancelled || box_result?.cancelled || attachment_result?.cancelled
		|| transform_result?.errors?.length || shape_alternate_result?.errors?.length || texture_result?.errors?.length || box_result?.errors?.length || attachment_result?.errors?.length
	);
}

function makeCurrentSessionPlan(options = {}) {
	let config = getConfig();
	let context = Project?.vintage_story_data?.asset_context;
	if (!context?.source_file_path) {
		throw new Error('Open or create a Vintage Story item/block asset context before exporting a mod workspace.');
	}
	let warnings = [];
	let cancelled = runPreExportWritebacks(context, warnings);
	if (cancelled) throw new Error(warnings.join('\n') || 'Pre-export item/block writeback was cancelled.');
	let shape_text = compileCurrentShapeText();
	let plan = createVintageStoryExportPlanFromResolvedContext({
		workspace: config.workspace,
		modInfo: config.modInfo,
		modIconPath: config.modIconPath,
		assetContext: context,
		shapeJson: shape_text,
		shapeFilePath: Project?.vintage_story_data?.editing_target?.shape_path || Project?.save_path || Project?.export_path || context.resolved_shape_path,
		shapeBase: Project?.vintage_story_data?.editing_target?.shape_base || context.shape?.resolvedBase,
		textureSources: context.texture_sources,
		copyTextures: options.copyTextures !== false,
		copyGameTextures: !!options.copyGameTextures,
		generateLang: !!options.generateLang,
		langMode: options.langMode || 'base',
		displayName: Project?.name || context.asset_code || '',
		language: options.language || 'en',
		gameAssetRoot: config.gameAssetRoot,
		additionalAssetRoots: config.additionalAssetRoots,
		includeLang: options.includeLang !== false
	}, {fs, PathModule});
	warnings.forEach(warning => {
		if (!plan.warnings.includes(warning)) plan.warnings.push(warning);
	});
	return {plan, config};
}

function canRollbackReport(report) {
	return !!(report && ((report.backups || []).length || (report.created || []).length));
}

function confirmAndRollbackExport(report) {
	let has_backups = !!report.backups?.length;
	let has_created = !!report.created?.length;
	let buttons = has_created && has_backups
		? ['Restore Backups and Remove Created Files', 'Restore Backups Only', 'Cancel']
		: (has_created ? ['Remove Created Files', 'Cancel'] : ['Restore Backups', 'Cancel']);
	let answer = dialog.showMessageBoxSync(currentwindow, {
		type: 'warning',
		noLink: true,
		title: 'Rollback Vintage Story Export?',
		message: 'Rollback the files written by this export report?',
		detail: [
			has_backups ? `${report.backups.length} overwritten file backup(s) can be restored.` : '',
			has_created ? `${report.created.length} newly created file(s) can be removed.` : ''
		].filter(Boolean).join('\n'),
		cancelId: buttons.length - 1,
		defaultId: buttons.length - 1,
		buttons
	});
	if (answer === buttons.length - 1) return null;
	let removeCreated = has_created && (!has_backups || answer === 0);
	return rollbackVintageStoryExportReport(report, {fs, PathModule}, {removeCreated});
}

function openReportBackupFolder(report) {
	let backup = report?.backups?.[0];
	if (backup) shell?.showItemInFolder?.(backup);
}

function showReportDialog(title, text, report = null) {
	let buttons = [];
	if (canRollbackReport(report)) buttons.push('Rollback Export');
	if (report?.backups?.length) buttons.push('Open Backup Folder');
	buttons.push('Copy Report', 'dialog.close');
	let rollback_index = buttons.indexOf('Rollback Export');
	let folder_index = buttons.indexOf('Open Backup Folder');
	let copy_index = buttons.indexOf('Copy Report');
	new Dialog({
		id: 'vintage_story_mod_export_report',
		title,
		width: 820,
		buttons,
		confirmIndex: buttons.length - 1,
		form: {
			report: {type: 'textarea', label: 'Report', value: text || '', height: 420, readonly: true, style: 'code', share_text: true}
		},
		onButton(index) {
			if (index === rollback_index) {
				let rollback = confirmAndRollbackExport(report);
				if (rollback) {
					showReportDialog('Vintage Story Export Rollback Report', formatVintageStoryExportReport(rollback));
				}
				return false;
			}
			if (index === folder_index) {
				openReportBackupFolder(report);
				return false;
			}
			if (index === copy_index) {
				clipboard?.writeText?.(text || '');
				Blockbench?.showQuickMessage?.('Report copied.');
				return false;
			}
		}
	}).show();
}

function confirmPlanAndExport(plan, config) {
	markVintageStoryExportPlanDirty(Project, plan);
	let text = formatVintageStoryExportReport(plan);
	new Dialog({
		id: 'vintage_story_mod_export_plan',
		title: 'Export to Vintage Story Mod Workspace',
		width: 920,
		buttons: ['Export', 'Copy Report', 'dialog.cancel'],
		confirmIndex: 0,
		cancelIndex: 2,
		form: {
			plan: {type: 'textarea', label: 'Export Plan', value: text, height: 460, readonly: true, style: 'code', share_text: true}
		},
		onButton(index) {
			if (index === 1) {
				clipboard?.writeText?.(text);
				Blockbench?.showQuickMessage?.('Export plan copied.');
				return false;
			}
		},
		onConfirm() {
			if (plan.errors?.length) {
				showMessage('Export to Vintage Story Mod Workspace', 'Fix export plan errors before writing files.', 'error');
				return false;
			}
			let report = executeVintageStoryExportPlan(plan, {fs, PathModule}, {createBackups: config.createBackups !== false});
			clearVintageStoryDirtyFilesWrittenByReport(Project, report);
			showReportDialog('Vintage Story Mod Export Report', formatVintageStoryExportReport(report), report);
		}
	}).show();
}

export function openVintageStoryModExportDialog() {
	try {
		let {plan, config} = makeCurrentSessionPlan({copyTextures: true, generateLang: true, includeLang: true});
		confirmPlanAndExport(plan, config);
	} catch (error) {
		showMessage('Export to Vintage Story Mod Workspace', error.message || String(error), 'error');
	}
}

export function validateVintageStoryModWorkspaceAction() {
	try {
		let config = getConfig();
		let result = validateVintageStoryWorkspace(config.workspace, {fs, PathModule}, {
			gameAssetRoot: config.gameAssetRoot,
			additionalAssetRoots: config.additionalAssetRoots,
			skipTextures: false
		});
		showReportDialog('Validate Vintage Story Mod Workspace', formatVintageStoryValidationReport(result));
	} catch (error) {
		showMessage('Validate Vintage Story Mod Workspace', error.message || String(error), 'error');
	}
}

function readModInfoForPackage(workspace) {
	let path = workspace?.modRoot ? PathModule.join(workspace.modRoot, 'modinfo.json') : '';
	if (!path || !fs.existsSync(path)) return {};
	try {
		return parseVintageStoryAssetText(fs.readFileSync(path, 'utf8'), path);
	} catch (error) {
		return {};
	}
}

function choosePackageOutput(config) {
	let modinfo = readModInfoForPackage(config.workspace);
	let name = defaultVintageStoryPackageName(modinfo);
	let start = config.packageOutputFolder || config.workspace.modRoot || '';
	return dialog.showSaveDialogSync(currentwindow, {
		title: 'Package Vintage Story Mod',
		defaultPath: start ? PathModule.join(start, name) : name,
		filters: [{name: 'Vintage Story Mod Zip', extensions: ['zip']}]
	});
}

function maybeCopyPackageToModsFolder(package_path, config, report) {
	if (!package_path || !config.modsFolder || report.errors?.length) return;
	let result = dialog.showMessageBoxSync(currentwindow, {
		type: 'question',
		noLink: true,
		title: 'Copy Package to Mods Folder?',
		message: 'Copy the packaged mod zip to the configured Vintage Story Mods folder?',
		detail: config.modsFolder,
		cancelId: 1,
		defaultId: 1,
		buttons: ['Copy to Mods Folder', 'Skip']
	});
	if (result !== 0) return;
	let target = PathModule.join(config.modsFolder, PathModule.basename(package_path));
	let overwrite = false;
	if (fs.existsSync(target)) {
		let overwrite_result = dialog.showMessageBoxSync(currentwindow, {
			type: 'warning',
			noLink: true,
			title: 'Overwrite Existing Mod Package?',
			message: 'A package with this name already exists in the Mods folder.',
			detail: target,
			cancelId: 1,
			defaultId: 1,
			buttons: ['Overwrite', 'Cancel']
		});
		if (overwrite_result !== 0) return;
		overwrite = true;
	}
	let copy_report = copyVintageStoryPackageToModsFolder(package_path, config.modsFolder, {fs, PathModule}, {overwrite});
	if (copy_report.errors?.length) {
		showMessage('Copy Package to Mods Folder', copy_report.errors.join('\n'), 'error');
		return;
	}
	showReportDialog('Vintage Story Mod Package Report', `${formatVintageStoryExportReport(report)}\n\n${formatVintageStoryExportReport(copy_report)}`, copy_report);
}

export async function packageVintageStoryModAction() {
	try {
		let config = getConfig();
		let output = choosePackageOutput(config);
		if (!output) return;
		let report = await packageVintageStoryModWorkspace(config.workspace, output, {fs, PathModule}, {
			gameAssetRoot: config.gameAssetRoot,
			additionalAssetRoots: config.additionalAssetRoots,
			includeCode: false
		});
		showReportDialog('Vintage Story Mod Package Report', formatVintageStoryExportReport(report), report);
		if (!report.errors?.length) {
			let data = Project?.vintage_story_data || (Project.vintage_story_data = {});
			data.last_package_path = output;
			shell?.showItemInFolder?.(output);
			maybeCopyPackageToModsFolder(output, config, report);
		}
	} catch (error) {
		showMessage('Package Vintage Story Mod', error.message || String(error), 'error');
	}
}

export function registerVintageStoryModExportWorkflow() {
	if (typeof BARS === 'undefined' || typeof Action === 'undefined') return;
	BARS.defineActions(function() {
		if (!BarItems.export_vintage_story_mod_workspace) {
			new Action('export_vintage_story_mod_workspace', {
				icon: 'drive_folder_upload',
				category: 'file',
				name: 'Export to Vintage Story Mod Workspace',
				description: 'Preview and export the current Vintage Story asset session into a mod workspace.',
				condition: () => !!Project?.vintage_story_data?.asset_context?.source_file_path,
				click() {
					openVintageStoryModExportDialog();
				}
			});
		}
		if (!BarItems.validate_vintage_story_mod_workspace) {
			new Action('validate_vintage_story_mod_workspace', {
				icon: 'fact_check',
				category: 'file',
				name: 'Validate Workspace',
				description: 'Validate the configured Vintage Story mod workspace.',
				click() {
					validateVintageStoryModWorkspaceAction();
				}
			});
		}
		if (!BarItems.package_vintage_story_mod) {
			new Action('package_vintage_story_mod', {
				icon: 'inventory_2',
				category: 'file',
				name: 'Package into a Mod',
				description: 'Package the configured Vintage Story mod workspace as a distributable zip.',
				click() {
					packageVintageStoryModAction();
				}
			});
		}
	});
}

if (typeof window !== 'undefined') {
	Object.assign(window, {
		openVintageStoryModExportDialog,
		validateVintageStoryModWorkspaceAction,
		packageVintageStoryModAction
	});
	registerVintageStoryModExportWorkflow();
}
