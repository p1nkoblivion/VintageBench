import { AutoBackup } from '../auto_backup';
import { clipboard, currentwindow, dialog, fs, PathModule, shell } from '../native_apis';
import {
	parseVintageStoryBackupPath,
	restoreVintageStoryBackup
} from './vs_file_write_safety.js';
import { getVintageStoryModExportConfigFromSettings } from './vs_mod_exporter.js';

const BACKUP_SCAN_LIMIT = 5000;
const TEXT_COMPARE_LIMIT = 1024 * 1024;
const SKIPPED_BACKUP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'tmp', 'temp', '.vscode', '.idea']);

function showMessage(title, message, icon = 'info') {
	if (Blockbench?.showMessageBox) {
		Blockbench.showMessageBox({title, icon, message});
	} else if (icon === 'error') {
		console.error(title, message);
	} else {
		console.warn(title, message);
	}
}

function uniquePaths(paths = []) {
	let seen = new Set();
	let output = [];
	paths.forEach(path => {
		if (!path) return;
		let normalized = String(path).replace(/\\/g, '/').toLowerCase();
		if (seen.has(normalized)) return;
		seen.add(normalized);
		output.push(path);
	});
	return output;
}

function directoryForPath(path) {
	if (!path) return '';
	try {
		if (fs.existsSync(path) && fs.statSync(path).isDirectory()) return path;
	} catch (error) {}
	return PathModule.dirname(path);
}

export function collectVintageStoryBackupRoots(project = Project, settings_object = settings) {
	let roots = [];
	try {
		let config = getVintageStoryModExportConfigFromSettings(settings_object, PathModule, project?.save_path || project?.export_path || '');
		if (config?.workspace?.modRoot) roots.push(config.workspace.modRoot);
	} catch (error) {}
	let data = project?.vintage_story_data || {};
	[
		project?.save_path,
		project?.export_path,
		data.asset_context?.source_file_path,
		data.asset_context?.resolved_shape_path,
		data.editing_target?.shape_path
	].forEach(path => roots.push(directoryForPath(path)));
	let dirty_files = data.dirty_state?.files || {};
	Object.keys(dirty_files).forEach(kind => {
		let record = dirty_files[kind] || {};
		roots.push(directoryForPath(record.filePath));
		(record.pendingPaths || []).forEach(path => roots.push(directoryForPath(path)));
	});
	return uniquePaths(roots).filter(root => {
		try {
			return root && fs.existsSync(root) && fs.statSync(root).isDirectory();
		} catch (error) {
			return false;
		}
	});
}

function backupEntryFromPath(path, root) {
	let parsed = parseVintageStoryBackupPath(path);
	if (!parsed) return null;
	let stats = fs.statSync(path);
	return {
		id: path,
		path,
		root,
		targetPath: parsed.targetPath,
		targetName: PathModule.basename(parsed.targetPath),
		existsTarget: fs.existsSync(parsed.targetPath),
		timestamp: stats.mtime.getTime(),
		date: stats.mtime.toLocaleDateString(),
		time: stats.mtime.toLocaleTimeString().replace(/:\d+ /, ' '),
		dateLong: stats.mtime.toString(),
		size: `${Math.max(1, Math.round(stats.size / 1024))} KB`
	};
}

function walkBackupRoot(root, output, limit) {
	if (!root || output.length >= limit) return;
	let entries;
	try {
		entries = fs.readdirSync(root, {withFileTypes: true});
	} catch (error) {
		return;
	}
	for (let entry of entries) {
		if (output.length >= limit) break;
		let path = PathModule.join(root, entry.name);
		if (entry.isDirectory()) {
			if (!SKIPPED_BACKUP_DIRS.has(entry.name.toLowerCase())) {
				walkBackupRoot(path, output, limit);
			}
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith('.bak')) continue;
		let backup = backupEntryFromPath(path, root);
		if (backup) output.push(backup);
	}
}

export function listVintageStoryBackups(roots = collectVintageStoryBackupRoots(), options = {}) {
	let output = [];
	let limit = options.limit || BACKUP_SCAN_LIMIT;
	uniquePaths(roots).forEach(root => walkBackupRoot(root, output, limit));
	output.sort((a, b) => b.timestamp - a.timestamp);
	return output;
}

function readComparableText(path, local_fs = fs) {
	let stats = local_fs.statSync(path);
	if (stats.size > TEXT_COMPARE_LIMIT) {
		throw new Error(`File is too large for the built-in text comparison: ${path}`);
	}
	let text = local_fs.readFileSync(path, 'utf8');
	if (text.includes('\u0000')) {
		throw new Error(`File is not text-comparable: ${path}`);
	}
	return text;
}

export function makeVintageStoryBackupComparison(backup_path, adapters = {}) {
	let local_fs = adapters.fs || fs;
	let parsed = parseVintageStoryBackupPath(backup_path);
	if (!parsed?.targetPath) throw new Error(`Backup path does not match Vintage Story backup naming: ${backup_path}`);
	if (!local_fs.existsSync(backup_path)) throw new Error(`Backup file does not exist: ${backup_path}`);
	if (!local_fs.existsSync(parsed.targetPath)) throw new Error(`Current file does not exist: ${parsed.targetPath}`);
	let backup_text = readComparableText(backup_path, local_fs);
	let current_text = readComparableText(parsed.targetPath, local_fs);
	return [
		`Backup: ${backup_path}`,
		`Current: ${parsed.targetPath}`,
		'',
		'--- Backup ---',
		backup_text,
		'',
		'--- Current ---',
		current_text
	].join('\n');
}

function openCompareDialog(entry) {
	try {
		let text = makeVintageStoryBackupComparison(entry.path);
		new Dialog({
			id: 'vintage_story_compare_backup',
			title: 'Compare with Backup',
			width: 920,
			buttons: ['Copy Comparison', 'dialog.close'],
			confirmIndex: 1,
			form: {
				diff: {type: 'textarea', label: 'Backup Comparison', value: text, height: 520, readonly: true, style: 'code', share_text: true}
			},
			onButton(index) {
				if (index === 0) {
					clipboard?.writeText?.(text);
					Blockbench?.showQuickMessage?.('Backup comparison copied.');
					return false;
				}
			}
		}).show();
	} catch (error) {
		showMessage('Compare with Backup', error.message || String(error), 'error');
	}
}

function openBackupFolder(entry, roots = []) {
	if (entry?.path) {
		shell?.showItemInFolder?.(entry.path);
		return;
	}
	let root = roots.find(path => fs.existsSync(path));
	if (root) shell?.openPath?.(root);
}

function restoreBackupEntry(entry) {
	if (!entry?.path) {
		showMessage('Restore Backup', 'Select a backup to restore.', 'error');
		return;
	}
	let answer = dialog.showMessageBoxSync(currentwindow, {
		type: 'warning',
		noLink: true,
		title: 'Restore Vintage Story Backup?',
		message: `Restore this backup over the current file?\n\nBackup: ${entry.path}\nCurrent: ${entry.targetPath}`,
		cancelId: 1,
		defaultId: 1,
		buttons: ['Restore Backup', 'Cancel']
	});
	if (answer !== 0) return;
	try {
		let result = restoreVintageStoryBackup(entry.path, {fs, PathModule}, {createBackups: true});
		let backup = result.preRestoreBackupPath ? ` Pre-restore backup: ${result.preRestoreBackupPath}` : '';
		Blockbench?.showQuickMessage?.(`Restored ${PathModule.basename(result.targetPath)}.${backup}`);
	} catch (error) {
		showMessage('Restore Backup', error.message || String(error), 'error');
	}
}

export function rollbackVintageStoryExportReport(report = {}, adapters = {}, options = {}) {
	let local_fs = adapters.fs || fs;
	let local_PathModule = adapters.PathModule || PathModule;
	let rollback = {restored: [], removed: [], backups: [], skipped: [], warnings: [], errors: []};
	for (let backup_path of report.backups || []) {
		try {
			let result = restoreVintageStoryBackup(backup_path, {fs: local_fs, PathModule: local_PathModule}, {createBackups: true});
			rollback.restored.push(result.targetPath);
			if (result.preRestoreBackupPath) rollback.backups.push(result.preRestoreBackupPath);
		} catch (error) {
			rollback.errors.push(`${backup_path}: ${error.message || error}`);
		}
	}
	for (let path of report.created || []) {
		try {
			if (!local_fs.existsSync(path)) {
				rollback.skipped.push(path);
			} else if (options.removeCreated === true) {
				local_fs.unlinkSync(path);
				rollback.removed.push(path);
			} else {
				rollback.skipped.push(path);
			}
		} catch (error) {
			rollback.errors.push(`${path}: ${error.message || error}`);
		}
	}
	if (rollback.skipped.length) {
		rollback.warnings.push(`${rollback.skipped.length} created file(s) were left in place.`);
	}
	return rollback;
}

export function openVintageStoryBackupDialog() {
	let roots = collectVintageStoryBackupRoots();
	let entries = listVintageStoryBackups(roots);
	if (!entries.length) {
		showMessage('Vintage Story Backups', roots.length
			? `No Vintage Story .bak files were found under:\n${roots.join('\n')}`
			: 'No Vintage Story workspace or linked asset folder is available to scan.', 'info');
		return;
	}
	let selected = entries[0];
	let selected_id = selected.id;
	let dialog_ref;
	dialog_ref = new Dialog({
		id: 'vintage_story_backups',
		title: 'Vintage Story Backups',
		width: 920,
		buttons: ['Restore Backup', 'Compare with Backup', 'Open Backup Folder', 'dialog.close'],
		confirmIndex: 0,
		cancelIndex: 3,
		component: {
			data() {return {
				backups: entries,
				search_term: '',
				selected
			}},
			methods: {
				select(backup) {
					this.selected = selected = backup;
					selected_id = backup.id;
				},
				restore(backup) {
					this.select(backup);
					dialog_ref.confirm();
				}
			},
			computed: {
				filtered_backups() {
					let term = this.search_term.toLowerCase();
					return this.backups.filter(backup => {
						return !term
							|| backup.targetPath.toLowerCase().includes(term)
							|| backup.path.toLowerCase().includes(term);
					});
				}
			},
			template: `
				<div>
					<div class="bar">
						<search-bar v-model="search_term"></search-bar>
					</div>
					<ul id="vintage_story_backups_list" class="list">
						<li v-for="backup in filtered_backups" :key="backup.id" :class="{selected: selected && selected.id === backup.id}" @dblclick="restore(backup)" @click="select(backup);">
							<span :title="backup.path">{{ backup.targetName }}</span>
							<div class="view_backups_info_field" :title="backup.targetPath">{{ backup.existsTarget ? 'current' : 'missing current' }}</div>
							<div class="view_backups_info_field" :title="backup.dateLong">{{ backup.date }}</div>
							<div class="view_backups_info_field" :title="backup.dateLong">{{ backup.time }}</div>
							<div class="view_backups_info_field">{{ backup.size }}</div>
						</li>
					</ul>
				</div>
			`
		},
		onButton(index) {
			let entry = entries.find(backup => backup.id === selected_id) || selected;
			if (index === 1) {
				openCompareDialog(entry);
				return false;
			}
			if (index === 2) {
				openBackupFolder(entry, roots);
				return false;
			}
		},
		onConfirm() {
			restoreBackupEntry(entries.find(backup => backup.id === selected_id) || selected);
			return false;
		}
	}).show();
}

async function recoverAutosavedProjects() {
	if (!AutoBackup?.db) {
		showMessage('Recover Autosaved Projects', 'Autosave recovery is still starting. Try again in a moment.', 'warning');
		return;
	}
	let has_backups = await AutoBackup.hasBackups();
	if (!has_backups) {
		showMessage('Recover Autosaved Projects', 'No autosaved project recovery data is available.', 'info');
		return;
	}
	await AutoBackup.recoverAllBackups(true);
}

export function registerVintageStoryBackupRecovery() {
	if (typeof BARS === 'undefined' || typeof Action === 'undefined') return;
	BARS.defineActions(function() {
		if (!BarItems.recover_autosaved_projects) {
			new Action('recover_autosaved_projects', {
				icon: 'settings_backup_restore',
				category: 'file',
				name: 'Recover Autosaved Projects',
				description: 'Open crash-recovery autosaves stored by Vintage Bench.',
				click() {
					recoverAutosavedProjects();
				}
			});
		}
		if (!BarItems.vintage_story_backups) {
			new Action('vintage_story_backups', {
				icon: 'restore_page',
				category: 'file',
				name: 'Vintage Story Backups',
				description: 'Restore, compare, or open timestamped backups for linked Vintage Story files.',
				condition: () => isApp,
				click() {
					openVintageStoryBackupDialog();
				}
			});
		}
	});
}

if (typeof window !== 'undefined') {
	Object.assign(window, {
		VintageStoryBackupRecovery: {
			collectBackupRoots: collectVintageStoryBackupRoots,
			listBackups: listVintageStoryBackups,
			openDialog: openVintageStoryBackupDialog,
			rollbackExportReport: rollbackVintageStoryExportReport
		}
	});
	registerVintageStoryBackupRecovery();
}
