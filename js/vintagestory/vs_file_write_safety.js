function pathDirname(path_module, path) {
	if (path_module?.dirname) return path_module.dirname(path);
	let parts = String(path || '').replace(/\\/g, '/').split('/');
	parts.pop();
	return parts.join('/');
}

export function makeVintageStoryBackupPath(target_path, date = new Date()) {
	let stamp = date.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
	return `${target_path}.${stamp}.bak`;
}

export function makeUniqueVintageStoryBackupPath(target_path, adapters = {}, date = new Date()) {
	let fs = adapters.fs;
	let base_path = makeVintageStoryBackupPath(target_path, date);
	if (!fs?.existsSync || !fs.existsSync(base_path)) return base_path;
	for (let index = 1; index < 1000; index++) {
		let candidate = base_path.replace(/\.bak$/, `.${index}.bak`);
		if (!fs.existsSync(candidate)) return candidate;
	}
	throw new Error(`Could not create a unique backup path for ${target_path}`);
}

function parseVintageStoryBackupStamp(stamp) {
	if (!/^\d{14}$/.test(String(stamp || ''))) return null;
	let year = Number(stamp.slice(0, 4));
	let month = Number(stamp.slice(4, 6)) - 1;
	let day = Number(stamp.slice(6, 8));
	let hour = Number(stamp.slice(8, 10));
	let minute = Number(stamp.slice(10, 12));
	let second = Number(stamp.slice(12, 14));
	let date = new Date(Date.UTC(year, month, day, hour, minute, second));
	return isNaN(date.getTime()) ? null : date;
}

export function parseVintageStoryBackupPath(backup_path) {
	let match = String(backup_path || '').match(/^(.*)\.(\d{14})(?:\.(\d+))?\.bak$/);
	if (!match) return null;
	return {
		backupPath: backup_path,
		targetPath: match[1],
		timestamp: match[2],
		sequence: match[3] ? Number(match[3]) : 0,
		date: parseVintageStoryBackupStamp(match[2])
	};
}

export function restoreVintageStoryBackup(backup_path, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	if (!fs) throw new Error('No filesystem adapter was provided.');
	let parsed = parseVintageStoryBackupPath(backup_path);
	if (!parsed?.targetPath) throw new Error(`Backup path does not match Vintage Story backup naming: ${backup_path}`);
	if (!fs.existsSync(backup_path)) throw new Error(`Backup file does not exist: ${backup_path}`);
	let target_path = options.targetPath || parsed.targetPath;
	fs.mkdirSync(pathDirname(PathModule, target_path), {recursive: true});
	let overwritten = fs.existsSync(target_path);
	let preRestoreBackupPath = '';
	if (overwritten && options.createBackups !== false) {
		preRestoreBackupPath = makeUniqueVintageStoryBackupPath(target_path, {fs}, options.now || new Date());
		fs.copyFileSync(target_path, preRestoreBackupPath);
	}
	fs.copyFileSync(backup_path, target_path);
	return {restored: true, targetPath: target_path, overwritten, preRestoreBackupPath};
}

export function writeVintageStoryTextFile(target_path, content, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	if (!fs) throw new Error('No filesystem adapter was provided.');
	if (!target_path) throw new Error('Target path is empty.');
	fs.mkdirSync(pathDirname(PathModule, target_path), {recursive: true});
	let overwritten = fs.existsSync(target_path);
	let backupPath = '';
	if (overwritten && options.createBackups !== false) {
		backupPath = makeUniqueVintageStoryBackupPath(target_path, {fs}, options.now || new Date());
		fs.copyFileSync(target_path, backupPath);
	}
	fs.writeFileSync(target_path, content ?? '', options.encoding || 'utf8');
	return {written: true, overwritten, backupPath};
}

export function copyVintageStoryFile(target_path, source_path, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	if (!fs) throw new Error('No filesystem adapter was provided.');
	if (!source_path) throw new Error('Source path is empty.');
	if (!target_path) throw new Error('Target path is empty.');
	fs.mkdirSync(pathDirname(PathModule, target_path), {recursive: true});
	let overwritten = fs.existsSync(target_path);
	let backupPath = '';
	if (overwritten && options.createBackups !== false) {
		backupPath = makeUniqueVintageStoryBackupPath(target_path, {fs}, options.now || new Date());
		fs.copyFileSync(target_path, backupPath);
	}
	fs.copyFileSync(source_path, target_path);
	return {copied: true, overwritten, backupPath};
}
