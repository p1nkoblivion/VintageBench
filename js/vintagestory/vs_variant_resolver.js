// Vintage Story registry-object variant and by-type resolver helpers.
// Source-backed behavior:
// - VSEssentials/ServerMods/NoObf/ModRegistryObjectTypeLoader.cs expands variants.
// - VSEssentials/ServerMods/NoObf/RegistryObjectType.cs resolves *byType maps.
// - VintagestoryAPI/API/Util/WildcardUtil.cs matches wildcard keys.

export function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function cloneJSON(value) {
	if (value === undefined) return undefined;
	return JSON.parse(JSON.stringify(value));
}

function enumName(value, fallback = 'Multiply') {
	if (typeof value !== 'string') return fallback;
	let lower = value.toLowerCase();
	if (lower === 'add') return 'Add';
	if (lower === 'selectivemultiply') return 'SelectiveMultiply';
	return 'Multiply';
}

export function splitAssetLocation(value, fallback_domain = 'game') {
	let text = String(value || '').trim().replace(/\\/g, '/');
	let domain = fallback_domain || 'game';
	let path = text;
	if (text.includes(':')) {
		let parts = text.split(':');
		domain = parts.shift() || domain;
		path = parts.join(':');
	}
	return {
		domain,
		path,
		full: `${domain}:${path}`
	};
}

export function wildcardMatch(pattern, value) {
	if (value === null || value === undefined) return false;
	pattern = String(pattern || '');
	value = String(value || '');
	if (!pattern) return false;
	if (pattern[0] === '@') {
		try {
			return new RegExp(`^${pattern.substring(1)}$`, 'i').test(value);
		} catch (error) {
			return false;
		}
	}
	let pi = 0;
	let vi = 0;
	let star = -1;
	let match = 0;
	let needle = pattern.toLowerCase();
	let haystack = value.toLowerCase();
	while (vi < haystack.length) {
		if (pi < needle.length && needle[pi] === '*') {
			star = pi++;
			match = vi;
		} else if (pi < needle.length && needle[pi] === haystack[vi]) {
			pi++;
			vi++;
		} else if (star !== -1) {
			pi = star + 1;
			vi = ++match;
		} else {
			return false;
		}
	}
	while (pi < needle.length && needle[pi] === '*') pi++;
	return pi === needle.length;
}

export function assetLocationMatch(pattern, code, fallback_domain = 'game') {
	let needle = splitAssetLocation(pattern, fallback_domain);
	let haystack = splitAssetLocation(code, fallback_domain);
	if (needle.domain !== '*' && needle.domain.toLowerCase() !== haystack.domain.toLowerCase()) return false;
	return wildcardMatch(needle.path, haystack.path);
}

export function fillPlaceholders(input, states = {}) {
	if (typeof input !== 'string' || !input.includes('{')) return input;
	return input.replace(/\{([^{}]+)\}/g, (match, content) => {
		let parts = content.split('|').map(part => part.trim()).filter(Boolean);
		for (let part of parts) {
			if (states[part] !== undefined && states[part] !== null) {
				return states[part];
			}
		}
		return match;
	});
}

export function fillPlaceholdersDeep(value, states = {}) {
	if (typeof value === 'string') return fillPlaceholders(value, states);
	if (Array.isArray(value)) return value.map(entry => fillPlaceholdersDeep(entry, states));
	if (isPlainObject(value)) {
		let output = {};
		for (let key in value) {
			output[key] = fillPlaceholdersDeep(value[key], states);
		}
		return output;
	}
	return value;
}

function makeVariantEntry(code) {
	return {code};
}

function collectFromStateList(variant_group, variantgroups, variants_mul, variants_add) {
	let code = variant_group?.code ?? variant_group?.Code;
	let states = Array.isArray(variant_group?.states) ? variant_group.states : (Array.isArray(variant_group?.States) ? variant_group.States : []);
	if (!code || !states.length) return;
	let combine = enumName(variant_group.combine ?? variant_group.Combine);
	if (combine === 'Add') {
		states.forEach(state => {
			variants_add.push({
				states: {[code]: state},
				orderedParts: [[code, state]]
			});
		});
		return;
	}
	if (combine !== 'Multiply') return;

	let entries = states.map(makeVariantEntry);
	for (let selective of variantgroups || []) {
		if (enumName(selective.combine ?? selective.Combine) !== 'SelectiveMultiply') continue;
		if ((selective.onVariant ?? selective.OnVariant) !== code) continue;
		let selective_code = selective.code ?? selective.Code;
		let selective_states = Array.isArray(selective.states) ? selective.states : (Array.isArray(selective.States) ? selective.States : []);
		for (let i = 0; i < entries.length; i++) {
			let entry = entries[i];
			if (selective_code !== entry.code) continue;
			entries.splice(i, 1);
			for (let state of selective_states) {
				let codes = entry.codes ? entry.codes.slice() : [entry.code];
				let types = entry.types ? entry.types.slice() : [code];
				codes.push(state);
				types.push(selective_code);
				entries.splice(i, 0, {
					code: state.length ? `${entry.code}-${state}` : entry.code,
					codes,
					types
				});
				i++;
			}
			i--;
		}
	}
	if (variants_mul[code]) {
		variants_mul[code] = entries.concat(variants_mul[code]);
	} else {
		variants_mul[code] = entries;
	}
}

function multiplyProperties(variant_arrays) {
	if (!variant_arrays.length) return [];
	let count = variant_arrays.reduce((total, entries) => total * entries.length, 1);
	let rows = [];
	for (let row_index = 0; row_index < count; row_index++) {
		let num = row_index;
		let row = [];
		for (let k = 0; k < variant_arrays.length; k++) {
			let entries = variant_arrays[k];
			row[k] = entries[num % entries.length];
			num = Math.floor(num / entries.length);
		}
		rows.push(row);
	}
	return rows;
}

function resolveVariantCode(base_code, ordered_parts) {
	let path = splitAssetLocation(base_code).path;
	for (let [, value] of ordered_parts) {
		if (String(value).length) path += `-${value}`;
	}
	let domain = splitAssetLocation(base_code).domain;
	return `${domain}:${path}`;
}

function buildVariantFromParts(base_code, ordered_parts, source_index) {
	let states = {};
	ordered_parts.forEach(([key, value]) => {
		states[key] = value;
	});
	let location = resolveVariantCode(base_code, ordered_parts);
	let {domain, path} = splitAssetLocation(location);
	return {
		sourceIndex: source_index,
		code: location,
		codePath: path,
		codeDomain: domain,
		variantCode: path,
		states,
		orderedParts: ordered_parts.map(part => part.slice()),
		skipped: false,
		disallowed: false,
		included: true
	};
}

export function expandVintageStoryVariants(asset_object, options = {}) {
	let fallback_domain = options.domain || 'game';
	let base_location = splitAssetLocation(asset_object?.code ?? asset_object?.Code ?? 'unknown', fallback_domain);
	let base_code = `${base_location.domain}:${base_location.path}`;
	let variantgroups = Array.isArray(asset_object?.variantgroups)
		? asset_object.variantgroups
		: (Array.isArray(asset_object?.VariantGroups) ? asset_object.VariantGroups : []);
	let warnings = [];
	if (!variantgroups.length) {
		return {
			baseCode: base_code,
			warnings,
			allVariants: [buildVariantFromParts(base_code, [], 0)],
			includedVariants: [buildVariantFromParts(base_code, [], 0)]
		};
	}

	let variants_mul = {};
	let variants_add = [];
	variantgroups.forEach(group => {
		if (group?.loadFromProperties || group?.LoadFromProperties || group?.loadFromPropertiesCombine || group?.LoadFromPropertiesCombine) {
			warnings.push(`Variant group "${group.code || group.Code || 'unknown'}" uses loadFromProperties; this pass resolves explicit state lists only.`);
		}
		collectFromStateList(group, variantgroups, variants_mul, variants_add);
	});

	let ordered_group_codes = Object.keys(variants_mul);
	let multiplied = multiplyProperties(ordered_group_codes.map(key => variants_mul[key]));
	let all = [];
	let index = 0;
	variants_add.forEach(entry => {
		all.push(buildVariantFromParts(base_code, entry.orderedParts, index++));
	});
	multiplied.forEach(row => {
		let ordered_parts = [];
		row.forEach((entry, group_index) => {
			if (entry.codes) {
				entry.codes.forEach((code, i) => ordered_parts.push([entry.types[i], code]));
			} else {
				ordered_parts.push([ordered_group_codes[group_index], entry.code]);
			}
		});
		all.push(buildVariantFromParts(base_code, ordered_parts, index++));
	});

	let skip_patterns = Array.isArray(asset_object?.skipVariants) ? asset_object.skipVariants : [];
	let allowed_patterns = Array.isArray(asset_object?.allowedVariants) ? asset_object.allowedVariants : [];
	all.forEach(variant => {
		variant.skipped = skip_patterns.some(pattern => assetLocationMatch(pattern, variant.code, fallback_domain));
		variant.disallowed = allowed_patterns.length > 0 && !allowed_patterns.some(pattern => assetLocationMatch(pattern, variant.code, fallback_domain));
		variant.included = !variant.skipped && !variant.disallowed;
	});

	return {
		baseCode: base_code,
		warnings,
		allVariants: all,
		includedVariants: all.filter(variant => variant.included)
	};
}

export function resolveByTypeMap(map, code_path) {
	if (!isPlainObject(map)) return null;
	let keys = Object.keys(map);
	let matches = [];
	for (let index = 0; index < keys.length; index++) {
		let key = keys[index];
		if (wildcardMatch(key, code_path)) {
			let exact = key.toLowerCase() === String(code_path).toLowerCase();
			matches.push({
				value: cloneJSON(map[key]),
				matchedPattern: key,
				sourceIndex: index,
				exact,
				fallback: key === '*',
				inherited: !exact,
				literalLength: key.replace(/\*/g, '').length,
				wildcardCount: (key.match(/\*/g) || []).length
			});
		}
	}
	if (!matches.length) return null;
	matches.sort((a, b) => {
		if (a.exact !== b.exact) return a.exact ? -1 : 1;
		if (a.fallback !== b.fallback) return a.fallback ? 1 : -1;
		if (a.literalLength !== b.literalLength) return b.literalLength - a.literalLength;
		if (a.wildcardCount !== b.wildcardCount) return a.wildcardCount - b.wildcardCount;
		return a.sourceIndex - b.sourceIndex;
	});
	let best = matches[0];
	delete best.literalLength;
	delete best.wildcardCount;
	return best;
}

export function deepMergeObjects(base, overlay) {
	if (!isPlainObject(base)) return cloneJSON(overlay);
	if (!isPlainObject(overlay)) return cloneJSON(overlay);
	let output = cloneJSON(base);
	for (let key in overlay) {
		if (isPlainObject(output[key]) && isPlainObject(overlay[key])) {
			output[key] = deepMergeObjects(output[key], overlay[key]);
		} else {
			output[key] = cloneJSON(overlay[key]);
		}
	}
	return output;
}

export function resolveByTypeIntoObject(object, code_path, states = {}, path = []) {
	if (Array.isArray(object)) {
		return object.map((entry, index) => resolveByTypeIntoObject(entry, code_path, states, path.concat(index)));
	}
	if (!isPlainObject(object)) return fillPlaceholdersDeep(object, states);

	let output = cloneJSON(object);
	let resolved_maps = [];
	for (let key of Object.keys(output)) {
		if (!key.toLowerCase().endsWith('bytype')) continue;
		let target_key = key.substring(0, key.length - 'byType'.length);
		if (target_key === key) target_key = key.substring(0, key.length - 'bytype'.length);
		let match = resolveByTypeMap(output[key], code_path);
		resolved_maps.push({key, target_key, match});
	}
	resolved_maps.forEach(entry => {
		delete output[entry.key];
		if (!entry.match) return;
		let value = fillPlaceholdersDeep(entry.match.value, states);
		if (isPlainObject(output[entry.target_key]) && isPlainObject(value)) {
			output[entry.target_key] = deepMergeObjects(output[entry.target_key], value);
		} else {
			output[entry.target_key] = value;
		}
	});
	for (let key of Object.keys(output)) {
		output[key] = resolveByTypeIntoObject(output[key], code_path, states, path.concat(key));
	}
	return output;
}
