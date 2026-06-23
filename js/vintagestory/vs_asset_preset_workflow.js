import { fs, currentwindow, dialog } from '../native_apis';
import {
	buildVintageStoryPresetAssetPatch,
	buildVintageStoryPresetFormPatch,
	getVintageStoryAssetPresets,
	previewVintageStoryPresetPatch,
	applyVintageStoryPresetPatchToAsset
} from './vs_asset_presets.js';
import {
	parseAttachmentSlotsText,
	serializeGeneratedVintageStoryAsset
} from './vs_asset_generator.js';
import {
	parseVintageStoryAssetDocument,
	serializeVintageStoryAssetDocument
} from './vs_asset_document.js';
import { isPathUnderRoot } from './vs_asset_resolver.js';

function addWarning(warnings, message) {
	if (warnings && message && !warnings.includes(message)) warnings.push(message);
}

function getSettingValue(id) {
	return settings?.[id]?.value || '';
}

function showMessage(title, message, icon = 'info') {
	if (Blockbench?.showMessageBox) {
		Blockbench.showMessageBox({title, icon, message});
	} else if (icon === 'error') {
		console.error(title, message);
	} else {
		console.warn(title, message);
	}
}

function documentCreate(tag, class_name) {
	let element = globalThis.document.createElement(tag);
	if (class_name) element.className = class_name;
	return element;
}

function parsePresetInputs(inputs) {
	let slot_result = parseAttachmentSlotsText(inputs.attachmentSlotsText || '');
	return {
		toolType: inputs.toolType || '',
		durabilityValue: inputs.durabilityValue || '',
		attackPowerValue: inputs.attackPowerValue || '',
		attackRangeValue: inputs.attackRangeValue || '',
		attachmentCategoryCode: inputs.attachmentCategoryCode || '',
		attachmentSlotsText: inputs.attachmentSlotsText || '',
		attachmentSlots: slot_result.slots,
		parseErrors: slot_result.errors || []
	};
}

function presetDetails(preset) {
	if (!preset) return '';
	let parts = [
		preset.description,
		`Asset type: ${(preset.assetTypes || []).join(', ')}`,
		`Tags: ${(preset.tags || []).join(', ') || 'none'}`,
		`Required: ${(preset.requiredFields || []).join(', ') || 'none'}`,
		`Writes: ${(preset.generatedFields || []).join(', ') || 'none'}`
	];
	if (preset.experimental) parts.push('Experimental: only verified fields are written; advanced fields remain manual.');
	return parts.join('\n');
}

function setTextareaValue(textarea, value) {
	textarea.value = value || '';
}

function formatPatchPreview(preview, patch, warnings = []) {
	let lines = [];
	warnings.forEach(warning => lines.push(`Warning: ${warning}`));
	preview.changes.forEach(change => {
		lines.push(`${change.action === 'already' ? 'Already set' : 'Add'}: ${change.path}`);
	});
	preview.conflicts.forEach(conflict => {
		lines.push(`Conflict: ${conflict.path}`);
		lines.push(`  existing: ${JSON.stringify(conflict.existing)}`);
		lines.push(`  incoming: ${JSON.stringify(conflict.incoming)}`);
	});
	lines.push('');
	lines.push('Patch JSON:');
	lines.push(serializeGeneratedVintageStoryAsset(patch));
	return lines.join('\n');
}

export function openVintageStoryPresetLibrary(options = {}) {
	let presets = getVintageStoryAssetPresets(options.currentForm || {});
	let selected = {id: presets[0]?.id || ''};
	let inputs = {
		toolType: '',
		durabilityValue: '',
		attackPowerValue: '',
		attackRangeValue: '',
		attachmentCategoryCode: '',
		attachmentSlotsText: '',
		overwriteExisting: false
	};
	let wrapper = documentCreate('div', 'vintage_preset_library');
	let search = documentCreate('input');
	search.type = 'search';
	search.placeholder = 'Search presets';
	let body = documentCreate('div', 'vintage_preset_library_body');
	let list = documentCreate('div', 'vintage_preset_list');
	let side = documentCreate('div', 'vintage_preset_details');
	let title = documentCreate('h3');
	let details = documentCreate('textarea');
	details.readOnly = true;
	let field_grid = documentCreate('div', 'vintage_preset_fields');
	let preview = documentCreate('textarea');
	preview.readOnly = true;
	preview.className = 'vintage_preset_preview';
	side.append(title, details, field_grid, preview);
	body.append(list, side);
	wrapper.append(search, body);

	function addInput(id, label, placeholder = '') {
		let row = documentCreate('label');
		let span = documentCreate('span');
		span.textContent = label;
		let input = documentCreate('input');
		input.type = 'text';
		input.placeholder = placeholder;
		input.addEventListener('input', () => {
			inputs[id] = input.value;
			renderPreview();
		});
		row.append(span, input);
		field_grid.append(row);
		return input;
	}

	addInput('toolType', 'tool', 'axe');
	addInput('durabilityValue', 'durability', '250');
	addInput('attackPowerValue', 'attack power', '3.75');
	addInput('attackRangeValue', 'attack range', '2.5');
	addInput('attachmentCategoryCode', 'categoryCode', 'toolholding');
	let slot_row = documentCreate('label');
	let slot_span = documentCreate('span');
	slot_span.textContent = 'slots';
	let slot_input = documentCreate('textarea');
	slot_input.placeholder = 'frontrightside | item/wearable/hooved/elk/weaponr-falx';
	slot_input.addEventListener('input', () => {
		inputs.attachmentSlotsText = slot_input.value;
		renderPreview();
	});
	slot_row.append(slot_span, slot_input);
	field_grid.append(slot_row);
	let overwrite_row = documentCreate('label', 'vintage_preset_overwrite');
	let overwrite_input = documentCreate('input');
	overwrite_input.type = 'checkbox';
	overwrite_input.addEventListener('change', () => {
		inputs.overwriteExisting = overwrite_input.checked;
		renderPreview();
	});
	overwrite_row.append(overwrite_input, globalThis.document.createTextNode(' Overwrite existing fields intentionally'));
	field_grid.append(overwrite_row);

	function currentPreset() {
		return presets.find(preset => preset.id === selected.id) || presets[0] || null;
	}

	function renderList() {
		let query = search.value.trim().toLowerCase();
		list.textContent = '';
		presets.forEach(preset => {
			let haystack = `${preset.label} ${(preset.tags || []).join(' ')} ${preset.description}`.toLowerCase();
			if (query && !haystack.includes(query)) return;
			let row = documentCreate('div', selected.id === preset.id ? 'selected' : '');
			row.innerHTML = `<b>${preset.label}</b><span>${preset.assetTypes.join(', ')} | ${(preset.tags || []).join(', ')}</span>`;
			row.addEventListener('click', () => {
				selected.id = preset.id;
				renderList();
				renderPreview();
			});
			list.append(row);
		});
	}

	function renderPreview() {
		let preset = currentPreset();
		title.textContent = preset?.label || 'Preset';
		setTextareaValue(details, presetDetails(preset));
		let parsed = parsePresetInputs(inputs);
		if (options.mode === 'asset_context') {
			let built = buildVintageStoryPresetAssetPatch(selected.id, Object.assign({}, parsed, options.context || {}, {
				displaySettings: Project?.display_settings || {}
			}));
			let patch_preview = previewVintageStoryPresetPatch(options.assetObject || {}, built.patch);
			let warnings = (parsed.parseErrors || []).concat(built.warnings || []);
			setTextareaValue(preview, formatPatchPreview(patch_preview, built.patch, warnings));
			return;
		}
		let patch = buildVintageStoryPresetFormPatch(selected.id, options.currentForm || {}, parsed);
		let form = Object.assign({}, options.currentForm || {}, patch);
		let generated = options.makePreview?.(form);
		let lines = [];
		(parsed.parseErrors || []).forEach(error => lines.push(`Error: ${error}`));
		(generated?.errors || []).forEach(error => lines.push(`Error: ${error}`));
		(generated?.warnings || []).forEach(warning => lines.push(`Warning: ${warning}`));
		lines.push(generated?.text || '');
		setTextareaValue(preview, lines.join('\n'));
	}

	search.addEventListener('input', renderList);
	renderList();
	renderPreview();

	new Dialog({
		id: options.mode === 'asset_context' ? 'vintage_story_apply_asset_preset' : 'vintage_story_save_as_asset_preset_library',
		title: 'Vintage Story Preset Library',
		width: 980,
		buttons: ['Apply Preset', 'dialog.cancel'],
		lines: [wrapper],
		onConfirm() {
			let parsed = parsePresetInputs(inputs);
			if (parsed.parseErrors?.length) {
				showMessage('Preset Library', parsed.parseErrors.join('\n'), 'error');
				return false;
			}
			options.onApply?.({
				presetId: selected.id,
				formPatch: buildVintageStoryPresetFormPatch(selected.id, options.currentForm || {}, parsed),
				config: Object.assign({}, parsed, {overwriteExisting: !!inputs.overwriteExisting})
			});
		}
	}).show();
}

function confirmVanillaWrite(source_path) {
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

function applyPresetToCurrentAssetContext(result) {
	let context = Project?.vintage_story_data?.asset_context;
	if (!context?.source_file_path) {
		showMessage('Apply Vintage Story Preset', 'Open a Vintage Story item/block asset first.', 'error');
		return;
	}
	if (!confirmVanillaWrite(context.source_file_path)) return;
	let text = fs.readFileSync(context.source_file_path, 'utf8');
	let document = parseVintageStoryAssetDocument(text, context.source_file_path);
	let asset_object = document.assetObjects?.[context.source_object_index || 0]?.object;
	if (!asset_object) {
		showMessage('Apply Vintage Story Preset', 'Could not find the selected asset object.', 'error');
		return;
	}
	let built = buildVintageStoryPresetAssetPatch(result.presetId, Object.assign({}, result.config || {}, {
		selectedVariantKey: context.selected_variant_code,
		displaySettings: Project?.display_settings || {}
	}));
	let preview = previewVintageStoryPresetPatch(asset_object, built.patch);
	let warnings = [];
	(result.config?.parseErrors || []).forEach(error => addWarning(warnings, error));
	(built.warnings || []).forEach(warning => addWarning(warnings, warning));
	if (preview.conflicts.length && !result.config?.overwriteExisting) {
		addWarning(warnings, 'Existing fields with different values will be preserved. Enable overwrite in the Preset Library to replace them intentionally.');
	}
	if (warnings.length || preview.conflicts.length) {
		let message = formatPatchPreview(preview, built.patch, warnings);
		let confirm = dialog.showMessageBoxSync(currentwindow, {
			type: preview.conflicts.length ? 'warning' : 'info',
			noLink: true,
			title: 'Apply Vintage Story Preset',
			message: message.slice(0, 3800),
			cancelId: 1,
			defaultId: 0,
			buttons: ['Apply', 'Cancel']
		});
		if (confirm !== 0) return;
	}
	applyVintageStoryPresetPatchToAsset(asset_object, built.patch, {overwrite: !!result.config?.overwriteExisting});
	fs.writeFileSync(context.source_file_path, serializeVintageStoryAssetDocument(document), 'utf8');
	Blockbench?.showQuickMessage?.('Vintage Story preset applied.');
}

export function openVintageStoryAssetContextPresetLibrary() {
	let context = Project?.vintage_story_data?.asset_context;
	if (!context?.source_file_path) {
		showMessage('Apply Vintage Story Preset', 'Open a Vintage Story item/block asset first.', 'error');
		return;
	}
	let text = fs.readFileSync(context.source_file_path, 'utf8');
	let document = parseVintageStoryAssetDocument(text, context.source_file_path);
	let asset_object = document.assetObjects?.[context.source_object_index || 0]?.object;
	openVintageStoryPresetLibrary({
		mode: 'asset_context',
		context: {
			selectedVariantKey: context.selected_variant_code
		},
		assetObject: asset_object,
		onApply: applyPresetToCurrentAssetContext
	});
}

export function registerVintageStoryPresetWorkflow() {
	if (typeof BARS === 'undefined' || typeof Action === 'undefined') return;
	BARS.defineActions(function() {
		if (BarItems.apply_vintage_story_asset_preset) return;
		new Action('apply_vintage_story_asset_preset', {
			icon: 'auto_awesome',
			category: 'file',
			name: 'Apply Vintage Story Preset',
			description: 'Apply a verified Vintage Story asset preset to the current item/block asset context.',
			condition: () => !!Project?.vintage_story_data?.asset_context?.source_file_path,
			click() {
				openVintageStoryAssetContextPresetLibrary();
			}
		});
	});
}

if (typeof window !== 'undefined') {
	Object.assign(window, {
		openVintageStoryPresetLibrary,
		openVintageStoryAssetContextPresetLibrary
	});
	registerVintageStoryPresetWorkflow();
}
