const VALID_SEVERITIES = new Set(['info', 'warning', 'error']);

function clean(value, fallback = '') {
	return String(value ?? fallback).trim();
}

export function normalizeValidationBlocks(blocks, severity = 'warning') {
	if (typeof blocks === 'string') return blocks || 'none';
	if (Array.isArray(blocks)) return blocks.length ? blocks.join(', ') : 'none';
	if (blocks && typeof blocks === 'object') {
		let names = ['save', 'export', 'package'].filter(key => blocks[key]);
		return names.length ? names.join(', ') : 'none';
	}
	return severity === 'error' ? 'save, export, package' : 'none';
}

export function makeVintageStoryDiagnostic(options = {}) {
	let severity = clean(options.severity, 'warning').toLowerCase();
	if (!VALID_SEVERITIES.has(severity)) severity = 'warning';
	let what = clean(options.what || options.message, 'Validation issue.');
	return {
		kind: 'vintage_story_validation_diagnostic',
		code: clean(options.code, 'vintage_story_validation'),
		severity,
		filePath: clean(options.filePath || options.file, 'current project'),
		jsonPath: clean(options.jsonPath || options.path, 'root'),
		variantCode: clean(options.variantCode || options.variant, 'n/a'),
		what,
		why: clean(options.why, 'Vintage Story may not load or resolve this asset as intended.'),
		suggestedFix: clean(options.suggestedFix || options.fix, 'Inspect the referenced file and correct the highlighted field.'),
		blocks: normalizeValidationBlocks(options.blocks, severity),
		message: what
	};
}

export function diagnosticKey(diagnostic) {
	let issue = makeVintageStoryDiagnostic(diagnostic || {});
	return [
		issue.severity,
		issue.code,
		issue.filePath,
		issue.jsonPath,
		issue.variantCode,
		issue.what,
		issue.blocks
	].join('|');
}

export function addVintageStoryDiagnostic(list, options = {}) {
	if (!Array.isArray(list)) return null;
	let issue = makeVintageStoryDiagnostic(options);
	let key = diagnosticKey(issue);
	if (!list.some(existing => diagnosticKey(existing) === key)) list.push(issue);
	return issue;
}

export function validationIssueText(issue) {
	if (typeof issue === 'string') return issue;
	return clean(issue?.what || issue?.message, String(issue || ''));
}

export function formatVintageStoryDiagnostic(issue, options = {}) {
	let normalized = makeVintageStoryDiagnostic(issue || {});
	let prefix = options.prefix || normalized.severity.toUpperCase();
	return [
		`${prefix}: ${normalized.what}`,
		`  file: ${normalized.filePath}`,
		`  json: ${normalized.jsonPath}`,
		`  variant: ${normalized.variantCode}`,
		`  why: ${normalized.why}`,
		`  fix: ${normalized.suggestedFix}`,
		`  blocks: ${normalized.blocks}`
	].join('\n');
}

export function uniqueVintageStoryDiagnostics(issues = []) {
	let seen = new Set();
	let output = [];
	(issues || []).forEach(issue => {
		let normalized = makeVintageStoryDiagnostic(issue || {});
		let key = diagnosticKey(normalized);
		if (seen.has(key)) return;
		seen.add(key);
		output.push(normalized);
	});
	return output;
}
