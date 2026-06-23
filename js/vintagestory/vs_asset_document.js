import { cloneJSON, isPlainObject } from './vs_variant_resolver.js';

function stripJsonLikeComments(input) {
	let output = '';
	let in_string = false;
	let string_quote = '';
	for (let i = 0; i < input.length; i++) {
		let char = input[i];
		let next = input[i + 1];
		if (in_string) {
			output += char;
			if (char === '\\') {
				output += next || '';
				i++;
			} else if (char === string_quote) {
				in_string = false;
				string_quote = '';
			}
		} else if (char === '"' || char === "'") {
			in_string = true;
			string_quote = char;
			output += char;
		} else if (char === '/' && next === '/') {
			while (i < input.length && input[i] !== '\n') i++;
			output += '\n';
		} else if (char === '/' && next === '*') {
			i += 2;
			while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i++;
			i++;
		} else {
			output += char;
		}
	}
	return output;
}

function normalizeSingleQuotedStrings(input) {
	let output = '';
	let in_double = false;
	for (let i = 0; i < input.length; i++) {
		let char = input[i];
		if (in_double) {
			output += char;
			if (char === '\\') {
				output += input[i + 1] || '';
				i++;
			} else if (char === '"') {
				in_double = false;
			}
		} else if (char === '"') {
			in_double = true;
			output += char;
		} else if (char === "'") {
			let value = '';
			i++;
			while (i < input.length) {
				char = input[i];
				if (char === '\\') {
					value += input[i + 1] || '';
					i += 2;
					continue;
				}
				if (char === "'") break;
				value += char;
				i++;
			}
			output += JSON.stringify(value);
		} else {
			output += char;
		}
	}
	return output;
}

function quoteUnquotedObjectKeys(input) {
	return input.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

function normalizeLeadingDecimalNumbers(input) {
	return input.replace(/([:\[,]\s*)(-?)\.(\d+)/g, '$1$20.$3');
}

function removeTrailingCommas(input) {
	return input.replace(/,\s*([}\]])/g, '$1');
}

export function parseVintageStoryAssetText(text, file_path = '') {
	try {
		return JSON.parse(text);
	} catch (error) {}
	let normalized = stripJsonLikeComments(text);
	normalized = normalizeSingleQuotedStrings(normalized);
	normalized = quoteUnquotedObjectKeys(normalized);
	normalized = normalizeLeadingDecimalNumbers(normalized);
	normalized = removeTrailingCommas(normalized);
	try {
		return JSON.parse(normalized);
	} catch (error) {
		let suffix = file_path ? ` in ${file_path}` : '';
		throw new Error(`Could not parse Vintage Story asset${suffix}: ${error.message}`);
	}
}

export function serializeVintageStoryAssetDocument(document_or_value, options = {}) {
	let value = document_or_value?.root ?? document_or_value;
	let indentation = options.indentation || '\t';
	return `${JSON.stringify(value, null, indentation)}\n`;
}

function looksLikeAssetObject(value) {
	return isPlainObject(value) && typeof (value.code ?? value.Code) === 'string';
}

export function extractVintageStoryAssetObjects(root) {
	if (looksLikeAssetObject(root)) {
		return [{object: root, index: 0, path: []}];
	}
	if (Array.isArray(root)) {
		return root
			.map((entry, index) => ({object: entry, index, path: [index]}))
			.filter(entry => looksLikeAssetObject(entry.object));
	}
	if (isPlainObject(root) && Array.isArray(root.assets)) {
		return root.assets
			.map((entry, index) => ({object: entry, index, path: ['assets', index]}))
			.filter(entry => looksLikeAssetObject(entry.object));
	}
	if (isPlainObject(root)) {
		let entries = [];
		Object.keys(root).forEach(key => {
			if (looksLikeAssetObject(root[key])) {
				entries.push({object: root[key], index: entries.length, path: [key], key});
			}
		});
		return entries;
	}
	return [];
}

export function createVintageStoryAssetDocument(root, file_path = '', source_text = '') {
	let asset_objects = extractVintageStoryAssetObjects(root);
	return {
		root,
		filePath: file_path,
		sourceText: source_text,
		assetObjects: asset_objects,
		normalizedWriteback: true
	};
}

export function parseVintageStoryAssetDocument(text, file_path = '') {
	return createVintageStoryAssetDocument(parseVintageStoryAssetText(text, file_path), file_path, text);
}

export function getAssetObjectByIndex(document, index = 0) {
	let entry = document?.assetObjects?.[index];
	return entry?.object || null;
}

export function cloneVintageStoryAssetDocument(document) {
	return createVintageStoryAssetDocument(cloneJSON(document.root), document.filePath, document.sourceText);
}
