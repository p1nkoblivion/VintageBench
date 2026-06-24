import {
	assetBaseFromFilePath
} from './vs_asset_generator.js';
import {
	parseVintageStoryAssetDocument,
	parseVintageStoryAssetText
} from './vs_asset_document.js';
import {
	buildVintageStoryAssetRoots,
	listVintageStoryAssetVariants,
	normalizeCompositeBase,
	resolveAssetBasePath,
	resolveVintageStoryAssetVariant
} from './vs_asset_resolver.js';
import { cloneJSON, isPlainObject } from './vs_variant_resolver.js';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function slash(path) {
	return String(path || '').replace(/\\/g, '/');
}

function normalizePath(path) {
	return slash(path).replace(/\/+$/g, '').toLowerCase();
}

function samePath(left, right) {
	return !!left && !!right && normalizePath(left) === normalizePath(right);
}

function pathJoin(PathModule, ...parts) {
	return PathModule?.join ? PathModule.join(...parts) : parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

function pathBasename(PathModule, path) {
	return PathModule?.basename ? PathModule.basename(path) : slash(path).split('/').pop();
}

function relativePath(PathModule, root, file) {
	if (!root || !file) return file || '';
	if (PathModule?.relative) return slash(PathModule.relative(root, file));
	let root_slash = slash(root).replace(/\/+$/, '');
	let file_slash = slash(file);
	return file_slash.startsWith(`${root_slash}/`) ? file_slash.substring(root_slash.length + 1) : file_slash;
}

function walkFiles(root, fs, PathModule, output = []) {
	if (!root || !fs?.existsSync?.(root)) return output;
	let entries = fs.readdirSync(root, {withFileTypes: true});
	entries.forEach(entry => {
		let path = pathJoin(PathModule, root, entry.name);
		if (entry.isDirectory()) {
			walkFiles(path, fs, PathModule, output);
		} else {
			output.push(path);
		}
	});
	return output;
}

function uniquePush(list, item, key) {
	let id = key || JSON.stringify(item);
	if (!list.some(existing => (existing._key || JSON.stringify(existing)) === id)) {
		list.push(Object.assign({_key: id}, item));
	}
}

function stripKeys(value) {
	if (Array.isArray(value)) return value.map(stripKeys);
	if (value && typeof value === 'object') {
		let output = {};
		Object.keys(value).forEach(key => {
			if (key !== '_key') output[key] = stripKeys(value[key]);
		});
		return output;
	}
	return value;
}

function collectWorkspaceFiles(workspace, fs, PathModule) {
	let json = path => path.toLowerCase().endsWith('.json');
	let image = path => /\.(png|jpe?g)$/i.test(path);
	let modinfo = workspace?.modRoot ? pathJoin(PathModule, workspace.modRoot, 'modinfo.json') : '';
	let files = {
		modinfo: modinfo && fs?.existsSync?.(modinfo) ? modinfo : '',
		itemtypes: walkFiles(workspace?.folders?.itemtypes || '', fs, PathModule).filter(json),
		blocktypes: walkFiles(workspace?.folders?.blocktypes || '', fs, PathModule).filter(json),
		shapes: walkFiles(workspace?.folders?.shapes || '', fs, PathModule).filter(json),
		textures: walkFiles(workspace?.folders?.textures || '', fs, PathModule).filter(image),
		lang: walkFiles(workspace?.folders?.lang || '', fs, PathModule).filter(json)
	};
	return files;
}

function addTreeRow(rows, depth, kind, label, path = '', extra = {}) {
	rows.push(Object.assign({
		id: `${kind}:${path || label}:${rows.length}`,
		depth,
		kind,
		label,
		path
	}, extra));
}

function buildTreeRows(workspace, files, PathModule) {
	let rows = [];
	addTreeRow(rows, 0, 'workspace', 'Workspace', workspace?.modRoot || '');
	if (!workspace?.modRoot && !workspace?.assetsRoot && !workspace?.domain) {
		return rows;
	}
	addTreeRow(rows, 1, 'modinfo', 'modinfo.json', files.modinfo || pathJoin(PathModule, workspace?.modRoot || '', 'modinfo.json'));
	addTreeRow(rows, 1, 'assets', 'assets', workspace?.assetsRoot ? pathJoin(PathModule, workspace.modRoot, 'assets') : '');
	addTreeRow(rows, 2, 'domain', workspace?.domain ? `assets/${workspace.domain}` : 'assets/<domain>', workspace?.assetsRoot || '');
	[
		['itemtypes', 'itemtype'],
		['blocktypes', 'blocktype'],
		['shapes', 'shape'],
		['textures', 'texture'],
		['lang', 'lang']
	].forEach(([folder, file_kind]) => {
		let folder_path = workspace?.folders?.[folder] || '';
		addTreeRow(rows, 3, 'folder', folder, folder_path, {folder});
		(files[folder] || []).forEach(file => {
			addTreeRow(rows, 4, file_kind, relativePath(PathModule, folder_path, file), file, {folder});
		});
	});
	return rows;
}

function shapeBaseForFile(file, workspace) {
	return assetBaseFromFilePath(file, 'shapes', '', workspace) || '';
}

function textureBaseForFile(file, workspace) {
	return assetBaseFromFilePath(file, 'textures', '', workspace) || '';
}

function collectAttachedShapeRefs(value, path = 'root', output = []) {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => collectAttachedShapeRefs(entry, `${path}[${index}]`, output));
		return output;
	}
	if (!isPlainObject(value)) return output;
	Object.keys(value).forEach(key => {
		let child = value[key];
		let child_path = `${path}.${key}`;
		if (/^attachedShapeBySlotCode$/i.test(key) && isPlainObject(child)) {
			Object.keys(child).forEach(slot_code => {
				let raw = child[slot_code];
				let base = normalizeCompositeBase(raw);
				if (base) {
					output.push({
						slotCode: slot_code,
						base,
						rawRef: cloneJSON(raw),
						jsonPath: `${child_path}.${slot_code}`
					});
				}
			});
			return;
		}
		if (/^attachedShapeBySlotCodeByType$/i.test(key) && isPlainObject(child)) {
			Object.keys(child).forEach(pattern => {
				let slots = child[pattern];
				if (!isPlainObject(slots)) return;
				Object.keys(slots).forEach(slot_code => {
					let raw = slots[slot_code];
					let base = normalizeCompositeBase(raw);
					if (base) {
						output.push({
							slotCode: slot_code,
							pattern,
							base,
							rawRef: cloneJSON(raw),
							jsonPath: `${child_path}[${JSON.stringify(pattern)}].${slot_code}`
						});
					}
				});
			});
			return;
		}
		collectAttachedShapeRefs(child, child_path, output);
	});
	return output;
}

function currentShapeMatcher(workspace, current_shape_path = '') {
	let current_path = current_shape_path || '';
	let current_base = current_path ? shapeBaseForFile(current_path, workspace) : '';
	return {
		path: current_path,
		base: current_base,
		matches(resolved_path, resolved_base) {
			if (current_path && resolved_path && samePath(current_path, resolved_path)) return true;
			return !!current_base && !!resolved_base && current_base.toLowerCase() === String(resolved_base).toLowerCase();
		}
	};
}

function makeAssetLabel(asset_object, fallback) {
	return asset_object?.code || asset_object?.Code || fallback || 'asset';
}

function addMissingTextureFinding(findings, file, asset_object, variant, alias_key, alias) {
	let reason = alias?.sourceKind === 'missing' ? 'missing alias' : (alias?.invalid ? 'invalid texture path' : 'missing file');
	uniquePush(findings.missingTextures, {
		type: 'missing_texture',
		label: `${makeAssetLabel(asset_object)} ${variant.variantCode}: ${alias_key}`,
		filePath: file,
		assetFilePath: file,
		jsonPath: alias?.sourcePath || alias?.sourceMapPath || 'root.textures',
		variantCode: variant.variantCode,
		alias: alias_key,
		base: alias?.resolvedBase || '',
		reason,
		message: `${reason}: ${alias_key}${alias?.resolvedBase ? ` -> ${alias.resolvedBase}` : ''}`
	}, `${file}|${variant.variantCode}|${alias_key}|${reason}|${alias?.resolvedBase || ''}`);
}

function collectAssetReferences(context) {
	let {
		workspace,
		roots,
		file,
		document,
		asset_object,
		object_index,
		used_shape_paths,
		used_texture_paths,
		findings,
		current_shape,
		adapters,
		options
	} = context;
	let variants = listVintageStoryAssetVariants(document, object_index);
	let max_variants = options.maxValidatedVariants || 120;
	variants.includedVariants.slice(0, max_variants).forEach(variant => {
		let resolved = resolveVintageStoryAssetVariant(document, object_index, variant, {
			sourceFilePath: file,
			fs: adapters.fs,
			PathModule: adapters.PathModule,
			modAssetRoot: workspace.modRoot,
			gameAssetRoot: options.gameAssetRoot,
			additionalAssetRoots: options.additionalAssetRoots,
			skipTextures: false
		});
		if (resolved.shape?.resolvedFilePath && !resolved.shape.missing && !resolved.shape.invalid) {
			used_shape_paths.add(normalizePath(resolved.shape.resolvedFilePath));
		}
		if (current_shape.matches(resolved.shape?.resolvedFilePath, resolved.shape?.resolvedBase)) {
			uniquePush(findings.assetsReferencingCurrentShape, {
				type: 'asset_references_shape',
				label: `${makeAssetLabel(asset_object)} ${variant.variantCode}`,
				filePath: file,
				assetFilePath: file,
				jsonPath: resolved.shape?.sourcePath || 'root.shape',
				variantCode: variant.variantCode,
				base: resolved.shape?.resolvedBase || '',
				message: `${makeAssetLabel(asset_object)} resolves ${variant.variantCode} to the current shape.`
			}, `${file}|${object_index}|${variant.variantCode}|${resolved.shape?.sourcePath || ''}`);
		}
		(resolved.shape?.alternates || []).forEach(alternate => {
			if (alternate.resolvedShapeFilePath && !alternate.missing && !alternate.invalid) {
				used_shape_paths.add(normalizePath(alternate.resolvedShapeFilePath));
			}
			if (current_shape.matches(alternate.resolvedShapeFilePath, alternate.resolvedBase)) {
				uniquePush(findings.assetsReferencingCurrentShape, {
					type: 'asset_references_shape',
					label: `${makeAssetLabel(asset_object)} ${variant.variantCode} alternate`,
					filePath: file,
					assetFilePath: file,
					jsonPath: alternate.sourcePath || `${resolved.shape?.sourcePath || 'root.shape'}.alternates[${alternate.index || 0}]`,
					variantCode: variant.variantCode,
					base: alternate.resolvedBase || '',
					message: `${makeAssetLabel(asset_object)} resolves ${variant.variantCode} to the current alternate shape.`
				}, `${file}|${object_index}|${variant.variantCode}|${alternate.sourcePath || ''}`);
			}
		});
		Object.keys(resolved.textures?.aliases || {}).forEach(alias_key => {
			let alias = resolved.textures.aliases[alias_key];
			if (alias.invalid || alias.missing) {
				addMissingTextureFinding(findings, file, asset_object, variant, alias_key, alias);
			} else if (alias.resolvedFilePath) {
				used_texture_paths.add(normalizePath(alias.resolvedFilePath));
			}
		});
	});
	collectAttachedShapeRefs(asset_object).forEach(ref => {
		let resolved = resolveAssetBasePath(roots, workspace.domain || 'game', 'shapes', ref.base, ['.json'], adapters);
		if (resolved.resolvedFilePath && !resolved.missing && !resolved.invalid) {
			used_shape_paths.add(normalizePath(resolved.resolvedFilePath));
		}
		if (resolved.invalid || resolved.missing) {
			uniquePush(findings.brokenAttachedShapeRefs, {
				type: 'broken_attached_shape_ref',
				label: `${makeAssetLabel(asset_object)} ${ref.slotCode}`,
				filePath: file,
				assetFilePath: file,
				jsonPath: ref.jsonPath,
				slotCode: ref.slotCode,
				pattern: ref.pattern || '',
				base: ref.base,
				message: `Attached shape "${ref.slotCode}" does not resolve: ${ref.base}`
			}, `${file}|${ref.jsonPath}|${ref.base}`);
		}
	});
}

export function buildVintageStoryAssetExplorer(workspace, adapters = {}, options = {}) {
	let fs = adapters.fs;
	let PathModule = adapters.PathModule;
	let warnings = [];
	let errors = [];
	let findings = {
		assetsReferencingCurrentShape: [],
		missingTextures: [],
		unusedShapes: [],
		unusedTextures: [],
		brokenAttachedShapeRefs: []
	};
	if (!fs) {
		errors.push('No filesystem adapter was provided.');
		return {workspace, files: {}, treeRows: [], findings, warnings, errors};
	}
	let files = collectWorkspaceFiles(workspace, fs, PathModule);
	let treeRows = buildTreeRows(workspace, files, PathModule);
	let info_path = files.modinfo || pathJoin(PathModule, workspace?.modRoot || '', 'modinfo.json');
	let roots = buildVintageStoryAssetRoots(info_path, {
		modAssetRoot: workspace?.modRoot,
		gameAssetRoot: options.gameAssetRoot,
		additionalAssetRoots: options.additionalAssetRoots
	});
	let used_shape_paths = new Set();
	let used_texture_paths = new Set();
	let current_shape = currentShapeMatcher(workspace, options.currentShapePath || '');
	let asset_files = (files.itemtypes || []).concat(files.blocktypes || []);
	asset_files.forEach(file => {
		try {
			let document = parseVintageStoryAssetDocument(fs.readFileSync(file, 'utf8'), file);
			document.assetObjects.forEach((entry, index) => {
				collectAssetReferences({
					workspace,
					roots,
					file,
					document,
					asset_object: entry.object,
					object_index: index,
					used_shape_paths,
					used_texture_paths,
					findings,
					current_shape,
					adapters,
					options
				});
			});
		} catch (error) {
			warnings.push(`${file}: ${error.message || error}`);
		}
	});
	(files.shapes || []).forEach(file => {
		if (!used_shape_paths.has(normalizePath(file))) {
			uniquePush(findings.unusedShapes, {
				type: 'unused_shape',
				label: shapeBaseForFile(file, workspace) || pathBasename(PathModule, file),
				filePath: file,
				jsonPath: 'n/a',
				base: shapeBaseForFile(file, workspace),
				message: 'No item/block asset or attached shape reference points to this shape.'
			}, normalizePath(file));
		}
	});
	(files.textures || []).forEach(file => {
		if (!used_texture_paths.has(normalizePath(file))) {
			uniquePush(findings.unusedTextures, {
				type: 'unused_texture',
				label: textureBaseForFile(file, workspace) || pathBasename(PathModule, file),
				filePath: file,
				jsonPath: 'n/a',
				base: textureBaseForFile(file, workspace),
				message: 'No resolved item/block/shape texture alias points to this texture.'
			}, normalizePath(file));
		}
	});
	return {
		workspace: cloneJSON(workspace || {}),
		files,
		treeRows,
		findings: stripKeys(findings),
		warnings: Array.from(new Set(warnings)),
		errors: Array.from(new Set(errors)),
		currentShape: {path: current_shape.path, base: current_shape.base}
	};
}

export function getVintageStoryAssetExplorerFindingGroups(explorer) {
	let findings = explorer?.findings || {};
	return [
		{id: 'assetsReferencingCurrentShape', label: 'Assets Referencing Current Shape', entries: findings.assetsReferencingCurrentShape || []},
		{id: 'missingTextures', label: 'Missing Textures', entries: findings.missingTextures || []},
		{id: 'unusedShapes', label: 'Unused Shapes', entries: findings.unusedShapes || []},
		{id: 'unusedTextures', label: 'Unused Textures', entries: findings.unusedTextures || []},
		{id: 'brokenAttachedShapeRefs', label: 'Broken Attached Shape Refs', entries: findings.brokenAttachedShapeRefs || []}
	];
}

export function parseVintageStoryRawShapeFile(file_path, adapters = {}) {
	let fs = adapters.fs;
	if (!fs?.existsSync?.(file_path)) throw new Error(`Shape file does not exist: ${file_path}`);
	return parseVintageStoryAssetText(fs.readFileSync(file_path, 'utf8'), file_path);
}
