<template>
	<div class="vintage_attachments_panel">
		<div class="vintage_asset_context_notice" v-if="assetContext">
			<div class="vintage_asset_context_status">
				<label>Asset context</label>
				<span>{{ assetContext.selected_variant_code || assetContext.asset_code }}</span>
			</div>
		</div>
		<div class="vintage_asset_context_notice warning" v-else>
			Entity attachments are saved on item/block asset files. Open a Vintage Story asset to edit them in context.
		</div>

		<div v-if="editingTarget && editingTarget.kind === 'attached_shape'" class="vintage_asset_context_notice">
			<div class="vintage_asset_context_status">
				<label>Current shape target</label>
				<span>Attached Shape: {{ editingTarget.slot_code }}</span>
			</div>
		</div>

		<div class="vintage_asset_context_notice" v-if="attachment">
			<div class="vintage_asset_context_status">
				<label>Attachment source</label>
				<span>{{ sourceLabel }}</span>
			</div>
			<div v-if="attachment.inherited && attachment.isByType" class="bar vintage_asset_context_actions">
				<div class="tool wide" @click="createOverride">Create Override</div>
				<div class="tool wide" @click="editSharedRule">Edit Shared Rule</div>
			</div>
			<div v-else-if="attachment.isByType && !attachment.inherited" class="bar vintage_asset_context_actions">
				<div class="tool wide" @click="deleteOverride">Delete Override</div>
			</div>
		</div>
		<div class="vintage_asset_context_notice" v-else>
			No attachableToEntity data resolved for this variant.
		</div>

		<div class="vintage_attachment_fields">
			<label>
				<span>categoryCode</span>
				<input type="text" :value="categoryCode" placeholder="toolholding" @change="setCategoryCode($event.target.value)" />
			</label>
		</div>

		<div class="bar vintage_interaction_box_toolbar">
			<div class="tool wide" @click="addSlot">Add Slot</div>
			<div class="tool wide" @click="chooseShape">Choose Shape</div>
			<div class="tool wide" @click="openSlot">Open Attached Shape</div>
			<div class="tool" title="Remove Slot" @click="removeSlot"><i class="material-icons">delete</i></div>
		</div>

		<div class="vintage_attachment_slot_list">
			<div v-for="(slot, index) in slots" :key="slot.slotCode + index" :class="{selected: selectedSlotIndex === index, missing: slot.missing}" @click="selectSlot(index)">
				<b>{{ slot.slotCode || 'unnamed slot' }}</b>
				<span>{{ slot.resolvedShapeBase || '(no shape)' }}</span>
				<small>{{ slot.missing ? 'missing' : 'shape' }}</small>
			</div>
			<p v-if="!slots.length" class="vintage_interaction_box_empty">No attached shape slots resolved.</p>
		</div>

		<div v-if="selectedSlot" class="vintage_attachment_fields">
			<label>
				<span>slotCode</span>
				<input type="text" :value="selectedSlot.slotCode" placeholder="frontrightside" @change="setSlotCode($event.target.value)" />
			</label>
			<label>
				<span>shape base</span>
				<input type="text" :value="selectedSlot.resolvedShapeBase" placeholder="item/wearable/hooved/elk/weaponr-falx" @change="setSlotBase($event.target.value)" />
			</label>
			<div class="vintage_attachment_path">{{ selectedSlot.resolvedShapeFilePath || 'No resolved file path yet.' }}</div>
		</div>

		<div v-if="warnings.length" class="vintage_interaction_box_warnings">
			<p v-for="warning in warnings" :key="warning">{{ warning }}</p>
		</div>
	</div>
</template>

<script lang="js">
import { VintageStoryAttachments } from './vs_attachment_panel.js';

export default {
	computed: {
		assetContext() {
			return Project?.vintage_story_data?.asset_context || null;
		},
		editingTarget() {
			return Project?.vintage_story_data?.editing_target || null;
		},
		attachment() {
			return VintageStoryAttachments.getAttachment();
		},
		sourceLabel() {
			return VintageStoryAttachments.sourceLabel(this.attachment);
		},
		categoryCode() {
			return this.attachment?.categoryCode || '';
		},
		slots() {
			return VintageStoryAttachments.getSlots();
		},
		selectedSlotIndex() {
			return VintageStoryAttachments.selectedSlotIndex;
		},
		selectedSlot() {
			return VintageStoryAttachments.getSelectedSlot();
		},
		warnings() {
			return VintageStoryAttachments.validationWarnings();
		}
	},
	mounted() {
		VintageStoryAttachments.vue = this;
	},
	methods: {
		selectSlot(index) {
			VintageStoryAttachments.selectSlot(index);
		},
		setCategoryCode(value) {
			VintageStoryAttachments.setCategoryCode(value);
		},
		setSlotCode(value) {
			VintageStoryAttachments.setSlotCode(this.selectedSlot, value);
		},
		setSlotBase(value) {
			VintageStoryAttachments.setSlotBase(this.selectedSlot, value);
		},
		addSlot() {
			VintageStoryAttachments.addSlot();
		},
		removeSlot() {
			VintageStoryAttachments.removeSlot();
		},
		chooseShape() {
			VintageStoryAttachments.chooseShapeForSlot();
		},
		openSlot() {
			VintageStoryAttachments.openSlot();
		},
		createOverride() {
			VintageStoryAttachments.createOverride(this.attachment);
		},
		editSharedRule() {
			VintageStoryAttachments.editSharedRule(this.attachment);
		},
		deleteOverride() {
			VintageStoryAttachments.deleteOverride(this.attachment);
		}
	}
}
</script>
