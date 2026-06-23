const ABSOLUTE_WINDOWS_PATH_RE = /^[a-zA-Z]:[\\/]/;
const ABSOLUTE_UNIX_PATH_RE = /^\//;
const DOMAIN_RE = /^[a-z0-9_.-]+$/i;

export function slashPath(path) {
	return String(path || '').replace(/\\/g, '/');
}

export function hasWindowsBackslash(value) {
	return String(value || '').includes('\\');
}

export function isAbsoluteFilesystemPath(value) {
	let text = String(value || '').trim();
	return ABSOLUTE_WINDOWS_PATH_RE.test(text) || ABSOLUTE_UNIX_PATH_RE.test(text) || hasWindowsBackslash(text);
}

export function splitVintageStoryAssetBase(value, fallback_domain = '') {
	let text = String(value || '').trim();
	if (!text.includes(':')) return {domain: fallback_domain, path: text, hasDomain: false};
	let [domain, ...rest] = text.split(':');
	return {domain: domain || fallback_domain, path: rest.join(':'), hasDomain: true};
}

export function hasPathTraversal(value) {
	let {path} = splitVintageStoryAssetBase(slashPath(value));
	return path.split('/').some(part => part === '..');
}

function stripExtension(value, extensions = []) {
	let output = value;
	extensions.forEach(extension => {
		let clean = String(extension || '').replace(/^\./, '');
		if (!clean) return;
		output = output.replace(new RegExp(`\\.${clean}$`, 'i'), '');
	});
	return output;
}

export function validateVintageStoryAssetBasePath(value, options = {}) {
	let label = options.label || 'Asset base path';
	let raw = String(value || '').trim();
	let errors = [];
	if (!raw) {
		if (!options.allowEmpty) errors.push(`${label} is required.`);
		return {ok: errors.length === 0, errors, base: '', domain: '', path: ''};
	}
	if (hasWindowsBackslash(raw)) {
		errors.push(`${label} must use forward slashes, not Windows backslashes.`);
	}
	if (ABSOLUTE_WINDOWS_PATH_RE.test(raw) || ABSOLUTE_UNIX_PATH_RE.test(raw)) {
		errors.push(`${label} must be a Vintage Story asset base path, not an absolute filesystem path.`);
	}
	let normalized = stripExtension(slashPath(raw).replace(/^\/+/, ''), options.extensions || []);
	let {domain, path, hasDomain} = splitVintageStoryAssetBase(normalized, options.fallbackDomain || '');
	if (hasDomain && !DOMAIN_RE.test(domain || '')) {
		errors.push(`${label} has an invalid domain prefix.`);
	}
	if (options.rejectAssetFolderPrefix && /^assets\/[^/]+\/(shapes|textures|itemtypes|blocktypes|lang)(?:\/|$)/i.test(path)) {
		errors.push(`${label} must be an asset base path, not an assets/<domain> filesystem path.`);
	}
	let parts = path.split('/');
	if (parts.some(part => part === '..')) {
		errors.push(`${label} must not contain path traversal segments.`);
	}
	if (parts.some(part => part === '.' || part === '')) {
		errors.push(`${label} must not contain empty or current-directory path segments.`);
	}
	return {
		ok: errors.length === 0,
		errors,
		base: hasDomain ? `${domain}:${path}` : path,
		domain,
		path
	};
}

export function normalizeVintageStoryAssetBasePath(value, options = {}) {
	let validation = validateVintageStoryAssetBasePath(value, options);
	return validation.ok ? validation.base : '';
}

export function collectUnsafeAssetJsonStrings(value, path = 'root', output = []) {
	if (typeof value === 'string') {
		let reasons = [];
		if (hasWindowsBackslash(value)) reasons.push('Windows backslash');
		if (ABSOLUTE_WINDOWS_PATH_RE.test(value) || ABSOLUTE_UNIX_PATH_RE.test(value)) reasons.push('absolute filesystem path');
		if (hasPathTraversal(value)) reasons.push('path traversal');
		if (reasons.length) output.push({path, value, reasons});
		return output;
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) => collectUnsafeAssetJsonStrings(entry, `${path}[${index}]`, output));
		return output;
	}
	if (value && typeof value === 'object') {
		Object.keys(value).forEach(key => collectUnsafeAssetJsonStrings(value[key], `${path}.${key}`, output));
	}
	return output;
}
