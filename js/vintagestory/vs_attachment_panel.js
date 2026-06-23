import VintageStoryAttachmentsPanel from './VintageStoryAttachmentsPanel.vue';
import { currentwindow, dialog, PathModule } from '../native_apis';
import { ValidatorCheck } from '../validator.js';
import {
	attachmentSourceLabel,
	cloneVintageStoryAttachments,
	makeAttachmentEditSource,
	validateVintageStoryAttachment
} from './vs_entity_attachments.js';
import { assetBaseFromFilePath } from './vs_asset_generator.js';
import { getVintageStoryWorkspaceFromSettings } from './vs_asset_workspace.js';

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function selectedVariantKey() {
	return Project?.vintage_story_data?.asset_context?.selected_variant_code || Project?.name || '*';
}

function hasProject() {
	return !!Project && typeof Project === 'object';
}

function ensureVintageData() {
	if (!hasProject()) return {};
	let data = Project?.vintage_story_data || (Project.vintage_story_data = {});
	if (!data.attachments && data.asset_context?.attachment_sources) {
		data.attachments = cloneVintageStoryAttachments(data.asset_context.attachment_sources);
	}
	return data;
}

function makeNewAttachment() {
	let selected = selectedVariantKey();
	return {
		selectedVariantCode: selected,
		states: clone(Project?.vintage_story_data?.asset_context?.selected_states || {}),
		sourcePath: `root.attributesByType[${JSON.stringify(selected)}].attachableToEntity`,
		sourceMapPath: 'root.attributesByType',
		matchedPattern: selected,
		inherited: false,
		exact: true,
		fallback: false,
		isByType: true,
		categoryCode: '',
		value: {categoryCode: '', attachedShapeBySlotCode: {}},
		slots: [],
		extraFields: {},
		sourcePointer: {
			sourceKind: 'attributesByType.attachableToEntity',
			familyPath: ['attributesByType'],
			matchedPattern: selected,
			selectedVariantKey: selected,
			exact: true,
			inherited: false,
			fallback: false,
			isByType: true,
			editTargetKey: selected,
			sourcePath: `root.attributesByType[${JSON.stringify(selected)}].attachableToEntity`,
			sourceMapPath: 'root.attributesByType'
		},
		warnings: [],
		dirty: true
	};
}

function currentWorkspace() {
	return getVintageStoryWorkspaceFromSettings(settings, PathModule, Project?.save_path || Project?.export_path || '');
}

function normalizeSlot(slot) {
	if (!slot.shapeRef || typeof slot.shapeRef !== 'object') slot.shapeRef = {};
	if (slot.resolvedShapeBase) slot.shapeRef.base = slot.resolvedShapeBase;
	return slot;
}

export const VintageStoryAttachments = {
	selectedSlotIndex: 0,
	vue: null,

	getAttachment() {
		return ensureVintageData().attachments || null;
	},

	ensureAttachment() {
		let data = ensureVintageData();
		if (!data.attachments) data.attachments = makeNewAttachment();
		return data.attachments;
	},

	getSlots() {
		return (this.getAttachment()?.slots || []).filter(slot => !slot.deleted);
	},

	getSelectedSlot() {
		return this.getSlots()[this.selectedSlotIndex] || this.getSlots()[0] || null;
	},

	selectSlot(index) {
		this.selectedSlotIndex = Math.max(0, index || 0);
		this.vue?.$forceUpdate?.();
	},

	sourceLabel(attachment = this.getAttachment()) {
		return attachmentSourceLabel(attachment);
	},

	validationWarnings() {
		let attachment = this.getAttachment();
		if (!attachment) return [];
		return validateVintageStoryAttachment(attachment);
	},

	ensureEditTarget(attachment = this.getAttachment()) {
		if (!attachment?.sourcePointer?.isByType || !attachment.sourcePointer.inherited || attachment.sourcePointer.editTargetKey) return true;
		let result = dialog?.showMessageBoxSync
			? dialog.showMessageBoxSync(currentwindow, {
				type: 'warning',
				noLink: true,
				title: 'Edit inherited attachment data?',
				message: `Attachment data is inherited from ${attachmentSourceLabel(attachment)}.`,
				buttons: [`Create override for ${attachment.sourcePointer.selectedVariantKey}`, 'Edit shared rule', 'Cancel'],
				cancelId: 2,
				defaultId: 0
			})
			: 0;
		if (result === 1) {
			this.editSharedRule(attachment);
			return true;
		}
		if (result === 2) return false;
		this.createOverride(attachment);
		return true;
	},

	markDirty(attachment = this.getAttachment()) {
		if (!attachment) return false;
		if (!this.ensureEditTarget(attachment)) return false;
		attachment.dirty = true;
		if (attachment.value) {
			attachment.value.categoryCode = attachment.categoryCode || '';
		}
		this.vue?.$forceUpdate?.();
		return true;
	},

	createOverride(attachment = this.getAttachment()) {
		if (!attachment?.sourcePointer) return;
		attachment.sourcePointer = makeAttachmentEditSource(attachment, 'override');
		attachment.sourcePointer.inherited = false;
		attachment.sourcePointer.exact = true;
		attachment.sourcePointer.fallback = false;
		attachment.inherited = false;
		attachment.exact = true;
		attachment.fallback = false;
		attachment.matchedPattern = attachment.sourcePointer.selectedVariantKey;
		attachment.dirty = true;
		this.vue?.$forceUpdate?.();
	},

	editSharedRule(attachment = this.getAttachment()) {
		if (!attachment?.sourcePointer) return;
		attachment.sourcePointer = makeAttachmentEditSource(attachment, 'shared');
		attachment.dirty = true;
		this.vue?.$forceUpdate?.();
	},

	deleteOverride(attachment = this.getAttachment()) {
		if (!attachment?.sourcePointer?.isByType) return;
		attachment.sourcePointer.deleteOverride = true;
		attachment.deleted = true;
		attachment.dirty = true;
		this.vue?.$forceUpdate?.();
	},

	setCategoryCode(value) {
		let attachment = this.ensureAttachment();
		attachment.categoryCode = String(value || '').trim();
		if (!attachment.value || typeof attachment.value !== 'object') attachment.value = {};
		attachment.value.categoryCode = attachment.categoryCode;
		this.markDirty(attachment);
	},

	addSlot() {
		let attachment = this.ensureAttachment();
		if (!Array.isArray(attachment.slots)) attachment.slots = [];
		attachment.slots.push({
			slotCode: 'slot',
			shapeRef: {base: ''},
			resolvedShapeBase: '',
			resolvedShapeFilePath: '',
			missing: false
		});
		this.selectedSlotIndex = this.getSlots().length - 1;
		this.markDirty(attachment);
	},

	removeSlot(slot = this.getSelectedSlot()) {
		if (!slot) return;
		slot.deleted = true;
		this.markDirty();
	},

	setSlotCode(slot, value) {
		if (!slot) return;
		slot.slotCode = String(value || '').trim();
		this.markDirty();
	},

	setSlotBase(slot, value) {
		if (!slot) return;
		slot.resolvedShapeBase = String(value || '').trim().replace(/\\/g, '/').replace(/\.json$/i, '');
		normalizeSlot(slot);
		this.markDirty();
	},

	chooseShapeForSlot(slot = this.getSelectedSlot()) {
		if (!slot) return;
		Blockbench.import({
			resource_id: 'vintage_story_attachment_shape_ref',
			extensions: ['json'],
			type: 'Vintage Story Shape',
			readtype: 'text',
			multiple: false
		}, files => {
			let file = files?.[0];
			if (!file?.path) return;
			let base = assetBaseFromFilePath(
				file.path,
				'shapes',
				Project?.vintage_story_data?.asset_context?.source_file_path || Project?.save_path || '',
				currentWorkspace()
			);
			if (!base) {
				Blockbench?.showMessageBox?.({
					title: 'Attachment Shape Path',
					icon: 'warning',
					message: 'The selected shape is outside a configured assets/<domain>/shapes folder. Enter a Vintage Story shape base path manually.'
				});
				return;
			}
			slot.resolvedShapeBase = base;
			slot.resolvedShapeFilePath = file.path;
			slot.missing = false;
			normalizeSlot(slot);
			this.markDirty();
		});
	},

	openSlot(slot = this.getSelectedSlot()) {
		if (!slot) return;
		window.openVintageStoryAttachedShape?.(this.getAttachment(), slot);
	}
};

Interface.definePanels(function() {
	new Panel('vintage_story_attachments', {
		icon: 'accessibility_new',
		condition: () => hasProject() && !!Project?.vintage_story_data?.asset_context,
		default_position: {
			slot: 'left_bar',
			float_position: [0, 0],
			float_size: [320, 440],
			height: 440,
			sidebar_index: 2
		},
		component: VintageStoryAttachmentsPanel
	});
	VintageStoryAttachments.vue = Interface.Panels.vintage_story_attachments.inside_vue;
});

new ValidatorCheck('vintage_story_attachments', {
	condition: () => !!Project?.vintage_story_data?.attachments,
	update_triggers: [],
	run() {
		VintageStoryAttachments.validationWarnings().forEach(message => {
			this.warn({message});
		});
	}
});

if (typeof window !== 'undefined') {
	Object.assign(window, {VintageStoryAttachments});
}
