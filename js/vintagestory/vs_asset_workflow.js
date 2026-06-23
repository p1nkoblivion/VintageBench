import { fs, PathModule, currentwindow, dialog } from '../native_apis';
import {
	parseVintageStoryAssetDocument,
	parseVintageStoryAssetText,
	serializeVintageStoryAssetDocument
} from './vs_asset_document.js';
import {
	applyTransformEditToAssetObject,
	isPathUnderRoot,
	listVintageStoryAssetVariants,
	resolveVintageStoryAssetVariant
} from './vs_asset_resolver.js';
import { cloneJSON, isPlainObject } from './vs_variant_resolver.js';
import {
	applyInteractionBoxEditToAssetObject,
	cloneInteractionBoxes
} from './vs_interaction_boxes.js';
import {
	applyAttachmentEditToAssetObject,
	cloneVintageStoryAttachments
} from './vs_entity_attachments.js';
import {
	displaySlotToVintageStoryTransform,
	vintageStoryTransformToDisplaySlot
} from '../display_mode/vintage_story_display_transforms.js';

function addWarning(warnings, message) {
	if (warnings && message && !warnings.includes(message)) warnings.push(message);
}

function getSettingValue(id) {
	return settings?.[id]?.value || '';
}

function getResolverOptions(source_file_path) {
	return {
		sourceFilePath: source_file_path,
		fs,
		PathModule,
		gameAssetRoot: getSettingValue('vintage_story_assets_path'),
		modAssetRoot: getSettingValue('vintage_story_mod_root_path') || getSettingValue('vintage_story_mod_assets_path'),
		workspaceAssetRoot: '',
		additionalAssetRoots: getSettingValue('vintage_story_additional_assets_paths')
	};
}

function showError(title, message) {
	if (Blockbench?.showMessageBox) {
		Blockbench.showMessageBox({title, icon: 'error', message});
	} else {
		console.error(title, message);
	}
}

function showWarnings(title, warnings) {
	if (!warnings?.length || !Blockbench?.showMessageBox) return;
	Blockbench.showMessageBox({
		title,
		icon: 'warning',
		message: warnings.slice(0, 12).join('\n') + (warnings.length > 12 ? `\n...and ${warnings.length - 12} more.` : '')
	});
}

function makeOptionLabel(asset_entry, index) {
	let object = asset_entry.object;
	let code = object?.code || object?.Code || `Asset ${index + 1}`;
	let variant_count = Array.isArray(object?.variantgroups) ? object.variantgroups.length : 0;
	return `${code}${variant_count ? ` (${variant_count} variant groups)` : ''}`;
}

function chooseAssetObject(document, callback) {
	let entries = document.assetObjects || [];
	if (entries.length <= 1) {
		callback(0);
		return;
	}
	let options = {};
	entries.forEach((entry, index) => {
		options[index] = makeOptionLabel(entry, index);
	});
	new Dialog({
		id: 'open_vintage_story_asset_object',
		title: 'Choose Vintage Story Asset',
		width: 520,
		form: {
			asset: {type: 'select', label: 'Asset', options, value: '0'}
		},
		onConfirm(result) {
			callback(parseInt(result.asset) || 0);
		}
	}).show();
}

function summarizeRules(resolved) {
	let rules = [];
	if (resolved.shape?.matchedPattern) rules.push(`shape ${resolved.shape.matchedPattern}`);
	let texture_patterns = Object.values(resolved.textures?.aliases || {})
		.map(alias => alias.matchedPattern)
		.filter(Boolean)
		.unique?.() || [];
	if (!texture_patterns.length) {
		texture_patterns = [...new Set(Object.values(resolved.textures?.aliases || {}).map(alias => alias.matchedPattern).filter(Boolean))];
	}
	if (texture_patterns.length) rules.push(`textures ${texture_patterns.join(', ')}`);
	let transform_patterns = Object.values(resolved.transforms || {})
		.map(transform => transform.matchedPattern)
		.filter(Boolean);
	transform_patterns = [...new Set(transform_patterns)];
	if (transform_patterns.length) rules.push(`transforms ${transform_patterns.slice(0, 4).join(', ')}`);
	return rules.join(' | ');
}

function createVariantChooserRow(row, selected_ref, on_select) {
	let tr = globalThis.document.createElement('tr');
	tr.className = row.variant.included ? '' : 'vintage_variant_excluded';
	if (selected_ref.value === row.index) tr.classList.add('selected');
	let state_text = Object.entries(row.variant.states).map(([key, value]) => `${key}: ${value}`).join(', ');
	let warnings = row.resolved.warnings || [];
	let cells = [
		row.variant.variantCode,
		state_text,
		row.resolved.shape?.resolvedBase || '',
		row.resolved.shape?.matchedPattern || '',
		summarizeRules(row.resolved),
		warnings.length ? warnings[0] : ''
	];
	cells.forEach(text => {
		let td = globalThis.document.createElement('td');
		td.textContent = text;
		td.title = text;
		tr.append(td);
	});
	tr.addEventListener('click', () => {
		selected_ref.value = row.index;
		on_select();
	});
	return tr;
}

function chooseVariant(asset_document, asset_index, variants, resolver_options, callback) {
	function makeRows(skip_textures) {
		let row_options = Object.assign({}, resolver_options, {skipTextures: !!skip_textures});
		return variants.allVariants.map((variant, index) => ({
			index,
			variant,
			resolved: resolveVintageStoryAssetVariant(asset_document, asset_index, variant, row_options)
		}));
	}
	let first_included_variant = variants.allVariants.find(variant => variant.included) || variants.allVariants[0];
	let selected_ref = {value: first_included_variant ? variants.allVariants.indexOf(first_included_variant) : 0};
	let wrapper = document_create('div', 'vintage_variant_chooser');
	let controls = document_create('div', 'vintage_variant_controls');
	let search = document_create('input');
	search.type = 'search';
	search.placeholder = 'Search variants';
	let show_hidden_label = document_create('label', 'vintage_variant_toggle');
	let show_hidden = document_create('input');
	show_hidden.type = 'checkbox';
	show_hidden_label.append(show_hidden, globalThis.document.createTextNode(' Show skipped/not allowed'));
	let open_without_textures_label = document_create('label', 'vintage_variant_toggle');
	let open_without_textures = document_create('input');
	open_without_textures.type = 'checkbox';
	open_without_textures.checked = !!resolver_options.skipTextures;
	open_without_textures_label.append(open_without_textures, globalThis.document.createTextNode(' Open without textures'));
	controls.append(search, show_hidden_label, open_without_textures_label);
	let table_wrap = document_create('div', 'vintage_variant_table_wrap');
	let table = document_create('table', 'vintage_variant_table');
	let thead = globalThis.document.createElement('thead');
	let header = globalThis.document.createElement('tr');
	['Variant', 'States', 'Shape', 'Shape Rule', 'Rules', 'Warnings'].forEach(label => {
		let th = globalThis.document.createElement('th');
		th.textContent = label;
		header.append(th);
	});
	thead.append(header);
	let tbody = globalThis.document.createElement('tbody');
	table.append(thead, tbody);
	table_wrap.append(table);
	wrapper.append(controls, table_wrap);
	let rows = makeRows(open_without_textures.checked);

	function render() {
		let query = search.value.trim().toLowerCase();
		tbody.textContent = '';
		rows.forEach(row => {
			if (!show_hidden.checked && !row.variant.included) return;
			let haystack = `${row.variant.variantCode} ${Object.values(row.variant.states).join(' ')}`.toLowerCase();
			if (query && !haystack.includes(query)) return;
			tbody.append(createVariantChooserRow(row, selected_ref, render));
		});
	}
	search.addEventListener('input', render);
	show_hidden.addEventListener('change', render);
	open_without_textures.addEventListener('change', () => {
		rows = makeRows(open_without_textures.checked);
		render();
	});
	render();

	new Dialog({
		id: 'open_vintage_story_asset_variant',
		title: 'Choose Vintage Story Variant',
		width: 920,
		buttons: ['dialog.confirm', 'dialog.cancel'],
		lines: [wrapper],
		onConfirm() {
			let row = rows.find(entry => entry.index === selected_ref.value) || rows.find(entry => entry.variant.included) || rows[0];
			if (row && !row.variant.included) {
				Blockbench.showQuickMessage(row.variant.skipped ? 'Selected variant is skipped by this asset.' : 'Selected variant is not allowed by this asset.', 3000);
			}
			callback(row?.variant, {
				openWithoutTextures: !!open_without_textures.checked
			});
		}
	}).show();
}

function document_create(tag, class_name) {
	let element = globalThis.document.createElement(tag);
	if (class_name) element.className = class_name;
	return element;
}

function makeShapeTextureImportContext(resolved) {
	let textures = {};
	for (let alias in resolved.textures?.aliases || {}) {
		let entry = resolved.textures.aliases[alias];
		if (entry.rawRef !== undefined) textures[alias] = cloneJSON(entry.rawRef);
	}
	return textures;
}

export function applyVintageStoryAssetContextToProject(resolved, open_options = {}) {
	if (!Project) return;
	let vs_data = Project.vintage_story_data || (Project.vintage_story_data = {});
	vs_data.asset_context = {
		source_file_path: resolved.sourceFilePath,
		source_kind: resolved.sourceKind,
		source_object_index: resolved.sourceObjectIndex,
		asset_code: resolved.assetCode,
		selected_variant_code: resolved.variantCode,
		selected_states: cloneJSON(resolved.states),
		resolved_shape_path: resolved.shape?.resolvedFilePath || '',
		shape: cloneJSON(resolved.shape),
		texture_sources: cloneJSON(resolved.textures),
		transform_sources: cloneJSON(resolved.transforms),
		interaction_box_sources: cloneInteractionBoxes(resolved.interactionBoxes || []),
		attachment_sources: cloneVintageStoryAttachments(resolved.attachments),
		open_without_textures: !!open_options.openWithoutTextures,
		warnings: cloneJSON(resolved.warnings || []),
		current_shape_target: {kind: 'main', shape_path: resolved.shape?.resolvedFilePath || ''}
	};
	vs_data.interaction_boxes = cloneInteractionBoxes(resolved.interactionBoxes || []);
	vs_data.attachments = cloneVintageStoryAttachments(resolved.attachments);
	vs_data.editing_target = {kind: 'main', shape_path: resolved.shape?.resolvedFilePath || ''};
	let display_settings = Project.display_settings || (Project.display_settings = {});
	for (let id in resolved.transforms || {}) {
		let transform = resolved.transforms[id];
		let slot = vintageStoryTransformToDisplaySlot(id, transform.value, resolved.warnings);
		slot.vintage_story.asset_source = {
			isAssetContext: true,
			contextId: id,
			sourceFilePath: resolved.sourceFilePath,
			sourceObjectIndex: resolved.sourceObjectIndex,
			selectedVariantKey: resolved.variantCode,
			familyPath: transform.familyPath,
			jsonKey: transform.jsonKey,
			location: transform.location,
			sourcePath: transform.sourcePath,
			sourceMapPath: transform.sourceMapPath,
			matchedPattern: transform.matchedPattern,
			exact: transform.exact,
			inherited: transform.inherited,
			fallback: transform.fallback,
			isByType: transform.isByType,
			editTargetKey: transform.editTargetKey,
			editMode: transform.exact ? 'exact' : 'inherited',
			dirty: false,
			deleteOverride: false
		};
		display_settings[id] = slot;
	}
}

export function getVintageStoryAssetTextureImportContext(resolved, open_options = {}) {
	return {
		asset_context: {
			skipTextures: !!open_options.openWithoutTextures,
			resolved: {
				textures: {
					aliases: cloneJSON(resolved.textures?.aliases || {}),
					importTextures: open_options.openWithoutTextures ? {} : makeShapeTextureImportContext(resolved)
				},
				transforms: cloneJSON(resolved.transforms || {})
			}
		}
	};
}

function openResolvedShape(resolved, open_options = {}) {
	if (!resolved.shapeJson || !resolved.shape?.resolvedFilePath) {
		showWarnings('Vintage Story Asset Resolver', resolved.warnings || []);
		showError('Vintage Story Asset Resolver', `Could not open ${resolved.variantCode}; the resolved shape is missing.`);
		return;
	}
	let file = {
		name: pathToName(resolved.shape.resolvedFilePath, true),
		path: resolved.shape.resolvedFilePath,
		content: JSON.stringify(resolved.shapeJson),
		no_file: false
	};
	let args = getVintageStoryAssetTextureImportContext(resolved, open_options);
	Codecs.vintage_story_json.load(resolved.shapeJson, file, args);
	applyVintageStoryAssetContextToProject(resolved, open_options);
	Project.name = resolved.variantCode;
	Project.save_path = resolved.shape.resolvedFilePath;
	Project.export_path = resolved.shape.resolvedFilePath;
	Project.export_codec = 'vintage_story_json';
	addRecentProject({
		name: resolved.variantCode,
		path: resolved.shape.resolvedFilePath,
		icon: Format.icon
	});
	showWarnings('Vintage Story Asset Resolver Warnings', resolved.warnings || []);
}

function makeTextureImportContextFromAssetContext(asset_context, open_options = {}) {
	let textures = asset_context?.texture_sources || {};
	return {
		asset_context: {
			skipTextures: !!(open_options.openWithoutTextures || asset_context?.open_without_textures),
			resolved: {
				textures: {
					aliases: cloneJSON(textures.aliases || {}),
					importTextures: (open_options.openWithoutTextures || asset_context?.open_without_textures)
						? {}
						: makeShapeTextureImportContext({textures})
				}
			}
		}
	};
}

export function openVintageStoryAttachedShape(attachment, slot, open_options = {}) {
	try {
		if (!slot?.resolvedShapeFilePath || slot.missing) {
			showError('Open Attached Shape', `The attached shape for slot "${slot?.slotCode || 'unknown'}" is missing.`);
			return;
		}
		let content = fs.readFileSync(slot.resolvedShapeFilePath, 'utf8');
		let shape_json = parseVintageStoryAssetText(content, slot.resolvedShapeFilePath);
		let previous_data = Project?.vintage_story_data || {};
		let asset_context = cloneJSON(previous_data.asset_context || {});
		let attachments = cloneVintageStoryAttachments(previous_data.attachments || attachment);
		let interaction_boxes = cloneInteractionBoxes(previous_data.interaction_boxes || []);
		let file = {
			name: pathToName(slot.resolvedShapeFilePath, true),
			path: slot.resolvedShapeFilePath,
			content: JSON.stringify(shape_json),
			no_file: false
		};
		Codecs.vintage_story_json.load(shape_json, file, makeTextureImportContextFromAssetContext(asset_context, open_options));
		let vs_data = Project.vintage_story_data || (Project.vintage_story_data = {});
		vs_data.asset_context = asset_context;
		vs_data.attachments = attachments;
		vs_data.interaction_boxes = interaction_boxes;
		vs_data.editing_target = {
			kind: 'attached_shape',
			slot_code: slot.slotCode,
			shape_path: slot.resolvedShapeFilePath,
			shape_base: slot.resolvedShapeBase,
			attachment_source: cloneJSON(attachment?.sourcePointer || {})
		};
		vs_data.asset_context.current_shape_target = cloneJSON(vs_data.editing_target);
		Project.name = `${asset_context.selected_variant_code || asset_context.asset_code || 'attached'}-${slot.slotCode}`;
		Project.save_path = slot.resolvedShapeFilePath;
		Project.export_path = slot.resolvedShapeFilePath;
		Project.export_codec = 'vintage_story_json';
		addRecentProject({
			name: Project.name,
			path: slot.resolvedShapeFilePath,
			icon: Format.icon
		});
		Blockbench?.showQuickMessage?.(`Opened attached shape ${slot.slotCode}.`);
	} catch (error) {
		showError('Open Attached Shape', error.message || String(error));
	}
}

export function openVintageStoryAssetFile(file, open_options = {}) {
	try {
		let document = parseVintageStoryAssetDocument(file.content, file.path);
		if (!document.assetObjects.length) {
			showError('Open Vintage Story Asset', 'No item/block asset object with a code field was found.');
			return;
		}
		chooseAssetObject(document, asset_index => {
			let variants = listVintageStoryAssetVariants(document, asset_index);
			let options = getResolverOptions(file.path);
			options.skipTextures = !!open_options.openWithoutTextures;
			chooseVariant(document, asset_index, variants, options, (variant, variant_open_options = {}) => {
				if (!variant) return;
				let selected_open_options = Object.assign({}, open_options, variant_open_options);
				options.skipTextures = !!selected_open_options.openWithoutTextures;
				let resolved = resolveVintageStoryAssetVariant(document, asset_index, variant, options);
				openResolvedShape(resolved, selected_open_options);
			});
		});
	} catch (error) {
		showError('Open Vintage Story Asset', error.message || String(error));
	}
}

function confirmVanillaAssetWrite(source_path) {
	let game_root = getSettingValue('vintage_story_assets_path');
	if (!game_root || !isPathUnderRoot(source_path, game_root)) return true;
	let result = dialog.showMessageBoxSync(currentwindow, {
		type: 'warning',
		noLink: true,
		title: 'Overwrite Vintage Story Game Asset?',
		message: 'This item/block file is inside the configured Vintage Story game assets folder.',
		detail: source_path,
		cancelId: 1,
		defaultId: 1,
		buttons: ['Overwrite anyway', 'Cancel']
	});
	return result === 0;
}

export function writeVintageStoryAssetTransformEdits(asset_context, display_settings) {
	if (!asset_context?.source_file_path || !display_settings) return {changed: false, warnings: []};
	let warnings = [];
	let edited_slots = Object.values(display_settings).filter(slot => slot?.vintage_story?.asset_source?.dirty);
	if (!edited_slots.length) return {changed: false, warnings};
	if (!confirmVanillaAssetWrite(asset_context.source_file_path)) {
		addWarning(warnings, 'Skipped item/block transform writeback because the source file is inside the configured game assets root.');
		return {changed: false, warnings, cancelled: true};
	}
	let text = fs.readFileSync(asset_context.source_file_path, 'utf8');
	let document = parseVintageStoryAssetDocument(text, asset_context.source_file_path);
	let asset_object = document.assetObjects?.[asset_context.source_object_index || 0]?.object;
	if (!asset_object) {
		addWarning(warnings, 'Could not find the original asset object for transform writeback.');
		return {changed: false, warnings};
	}
	let changed = false;
	edited_slots.forEach(slot => {
		let source = slot.vintage_story.asset_source;
		let transform = displaySlotToVintageStoryTransform(slot);
		if (!transform && !source.deleteOverride) return;
		if (applyTransformEditToAssetObject(asset_object, source, transform || {})) {
			source.dirty = false;
			changed = true;
		}
	});
	if (!changed) return {changed: false, warnings};
	fs.writeFileSync(asset_context.source_file_path, serializeVintageStoryAssetDocument(document), 'utf8');
	return {changed: true, warnings};
}

export function writeVintageStoryAssetInteractionBoxEdits(asset_context, boxes) {
	if (!asset_context?.source_file_path || !Array.isArray(boxes)) return {changed: false, warnings: []};
	let warnings = [];
	let edited_boxes = boxes.filter(box => box?.dirty && box?.sourcePointer);
	if (!edited_boxes.length) return {changed: false, warnings};
	if (!confirmVanillaAssetWrite(asset_context.source_file_path)) {
		addWarning(warnings, 'Skipped item/block interaction box writeback because the source file is inside the configured game assets root.');
		return {changed: false, warnings, cancelled: true};
	}
	let text = fs.readFileSync(asset_context.source_file_path, 'utf8');
	let document = parseVintageStoryAssetDocument(text, asset_context.source_file_path);
	let asset_object = document.assetObjects?.[asset_context.source_object_index || 0]?.object;
	if (!asset_object) {
		addWarning(warnings, 'Could not find the original asset object for interaction box writeback.');
		return {changed: false, warnings};
	}
	let changed = false;
	edited_boxes.forEach(box => {
		let source = box.sourcePointer;
		if (applyInteractionBoxEditToAssetObject(asset_object, source, box.value)) {
			box.dirty = false;
			changed = true;
		}
	});
	if (!changed) return {changed: false, warnings};
	fs.writeFileSync(asset_context.source_file_path, serializeVintageStoryAssetDocument(document), 'utf8');
	return {changed: true, warnings};
}

export function writeVintageStoryAssetAttachmentEdits(asset_context, attachment) {
	if (!asset_context?.source_file_path || !attachment?.dirty || !attachment?.sourcePointer) return {changed: false, warnings: []};
	let warnings = [];
	if (!confirmVanillaAssetWrite(asset_context.source_file_path)) {
		addWarning(warnings, 'Skipped item/block attachment writeback because the source file is inside the configured game assets root.');
		return {changed: false, warnings, cancelled: true};
	}
	let text = fs.readFileSync(asset_context.source_file_path, 'utf8');
	let document = parseVintageStoryAssetDocument(text, asset_context.source_file_path);
	let asset_object = document.assetObjects?.[asset_context.source_object_index || 0]?.object;
	if (!asset_object) {
		addWarning(warnings, 'Could not find the original asset object for attachment writeback.');
		return {changed: false, warnings};
	}
	if (!applyAttachmentEditToAssetObject(asset_object, attachment.sourcePointer, attachment)) {
		addWarning(warnings, 'Could not write attachment edits to the item/block asset.');
		return {changed: false, warnings};
	}
	attachment.dirty = false;
	fs.writeFileSync(asset_context.source_file_path, serializeVintageStoryAssetDocument(document), 'utf8');
	return {changed: true, warnings};
}

export function saveVintageStoryAssetContextEdits() {
	let asset_context = Project?.vintage_story_data?.asset_context;
	if (!asset_context?.source_file_path) {
		showError('Save Asset', 'Open or create a Vintage Story item/block asset before saving asset data.');
		return;
	}
	let warnings = [];
	let changed = false;
	let cancelled = false;
	[
		writeVintageStoryAssetTransformEdits(asset_context, Project?.display_settings),
		writeVintageStoryAssetInteractionBoxEdits(asset_context, Project?.vintage_story_data?.interaction_boxes),
		writeVintageStoryAssetAttachmentEdits(asset_context, Project?.vintage_story_data?.attachments)
	].forEach(result => {
		if (!result) return;
		changed = changed || !!result.changed;
		cancelled = cancelled || !!result.cancelled;
		(result.warnings || []).forEach(warning => addWarning(warnings, warning));
	});
	if (warnings.length) showWarnings('Save Asset', warnings);
	if (cancelled) return;
	let name = PathModule?.basename ? PathModule.basename(asset_context.source_file_path) : 'asset JSON';
	Blockbench.showQuickMessage(changed ? `Saved ${name}` : 'No Vintage Story asset edits to save.');
}

export function registerVintageStoryAssetWorkflow() {
	if (typeof BARS === 'undefined' || typeof Action === 'undefined') return;
	BARS.defineActions(function() {
		if (!BarItems.open_vintage_story_asset) {
			new Action('open_vintage_story_asset', {
				icon: 'folder_special',
				category: 'file',
				name: 'Open Asset',
				description: 'Open a Vintage Story item/block JSON file and choose a resolved variant.',
				condition: () => isApp,
				click() {
					Blockbench.import({
						resource_id: 'vintage_story_asset',
						extensions: ['json'],
						type: 'Vintage Story Asset',
						readtype: 'text',
						multiple: false
					}, files => {
						if (files?.[0]) openVintageStoryAssetFile(files[0]);
					});
				}
			});
		}
		if (!BarItems.save_vintage_story_asset_context) {
			new Action('save_vintage_story_asset_context', {
				icon: 'save',
				category: 'file',
				name: 'Save Asset',
				description: 'Save Vintage Story item/block asset edits without saving shape geometry.',
				condition: () => !!Project?.vintage_story_data?.asset_context?.source_file_path,
				click() {
					try {
						saveVintageStoryAssetContextEdits();
					} catch (error) {
						showError('Save Asset', error.message || String(error));
					}
				}
			});
		}
	});
}

if (typeof window !== 'undefined') {
	Object.assign(window, {
		openVintageStoryAssetFile,
		applyVintageStoryAssetContextToProject,
		writeVintageStoryAssetTransformEdits,
		writeVintageStoryAssetInteractionBoxEdits,
		writeVintageStoryAssetAttachmentEdits,
		saveVintageStoryAssetContextEdits,
		openVintageStoryAttachedShape
	});
	registerVintageStoryAssetWorkflow();
}
