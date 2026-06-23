<template>
	<div class="vintage_interaction_boxes_panel">
		<div class="vintage_asset_context_notice" v-if="assetContext">
			<div class="vintage_asset_context_status">
				<label>Asset context</label>
				<span>{{ assetContext.selected_variant_code || assetContext.asset_code }}</span>
			</div>
		</div>
		<div class="vintage_asset_context_notice warning" v-else>
			Interaction boxes are saved on item/block asset files. Use Save As Asset or open a Vintage Story asset to write them back.
		</div>
		<div class="vintage_asset_context_notice">
			Numeric editing, viewport overlays, and drag handles are available.
		</div>

		<div class="bar vintage_interaction_box_toolbar vintage_interaction_box_topbar">
			<label class="vintage_interaction_box_toggle">
				<input type="checkbox" :checked="overlayVisible" @change="toggleOverlay($event.target.checked)" />
				Overlay
			</label>
			<select class="vintage_interaction_box_select" v-model="newTarget" title="Box Type">
				<option v-for="target in targets" :key="target.id" :value="target.id">{{ target.label }}</option>
			</select>
			<div class="tool" title="Add Box" @click="addBox"><i class="material-icons">add</i></div>
			<div class="tool" title="Duplicate Box" @click="duplicateBox"><i class="material-icons">content_copy</i></div>
			<div class="tool" title="Delete Box" @click="deleteBox"><i class="material-icons">delete</i></div>
		</div>

		<div class="bar vintage_interaction_box_toolbar vintage_interaction_box_iconbar">
			<div class="tool" title="Full Block" @click="fullBlock"><i class="material-icons">select_all</i></div>
			<div class="tool" title="No Collision" @click="noCollision"><i class="material-icons">block</i></div>
			<div class="tool" title="From Shape Bounds" @click="fromShapeBounds"><i class="material-icons">fit_screen</i></div>
			<div class="tool" title="Copy Collision To Selection" @click="copyCollisionToSelection"><i class="material-icons">east</i></div>
			<div class="tool" title="Copy Selection To Collision" @click="copySelectionToCollision"><i class="material-icons">west</i></div>
		</div>

		<div class="vintage_interaction_box_list">
			<div v-for="(box, index) in boxes" :key="box.id || index" :class="{selected: selectedIndex === index}" @click="select(index)">
				<b>{{ box.label }}</b>
				<span>{{ sourceLabel(box) }}</span>
				<small>{{ box.inherited ? (box.fallback ? 'fallback' : 'wildcard') : (box.exact ? 'exact' : 'direct') }}</small>
			</div>
			<p v-if="!boxes.length" class="vintage_interaction_box_empty">No interaction boxes resolved.</p>
		</div>

		<template v-if="selectedBox">
			<div class="vintage_asset_context_notice">
				<div class="vintage_asset_context_status">
					<label>{{ selectedBox.label }}</label>
					<span>{{ sourceLabel(selectedBox) }}</span>
				</div>
				<div v-if="selectedBox.inherited && selectedBox.isByType" class="bar vintage_asset_context_actions">
					<div class="tool wide" @click="createOverride">Create Override</div>
					<div class="tool wide" @click="editSharedRule">Edit Shared Rule</div>
				</div>
				<div v-else-if="selectedBox.isByType && !selectedBox.inherited" class="bar vintage_asset_context_actions">
					<div class="tool wide" @click="deleteOverride">Delete Override</div>
				</div>
			</div>

			<div v-if="selectedBox.value === null" class="vintage_interaction_box_null">
				This box is set to null.
			</div>
			<div v-else class="vintage_interaction_box_numeric">
				<label v-for="coord in coords" :key="coord">
					<span>{{ coord }}</span>
					<numeric-input v-model.number="selectedBox.value[coord]" :step="0.0625" @focusin.native="startNumericEdit" @mousedown="startNumericEdit" @input="markDirtyLive" @change="finishNumericEdit" />
				</label>
				<label>
					<span>rotateX</span>
					<numeric-input v-model.number="selectedBox.value.rotateX" :step="1" @focusin.native="startNumericEdit" @mousedown="startNumericEdit" @input="markDirtyLive" @change="finishNumericEdit" />
				</label>
				<label>
					<span>rotateY</span>
					<numeric-input v-model.number="selectedBox.value.rotateY" :step="1" @focusin.native="startNumericEdit" @mousedown="startNumericEdit" @input="markDirtyLive" @change="finishNumericEdit" />
				</label>
				<label>
					<span>rotateZ</span>
					<numeric-input v-model.number="selectedBox.value.rotateZ" :step="1" @focusin.native="startNumericEdit" @mousedown="startNumericEdit" @input="markDirtyLive" @change="finishNumericEdit" />
				</label>
			</div>
		</template>

		<div v-if="warnings.length" class="vintage_interaction_box_warnings">
			<p v-for="warning in warnings" :key="warning">{{ warning }}</p>
		</div>
	</div>
</template>

<script lang="js">
import { INTERACTION_BOX_TARGETS, VintageStoryInteractionBoxes } from './vs_interaction_box_panel.js';

export default {
	data() {return {
		newTarget: 'collisionbox',
		coords: ['x1', 'y1', 'z1', 'x2', 'y2', 'z2']
	}},
	computed: {
		targets() {
			return INTERACTION_BOX_TARGETS;
		},
		boxes() {
			return VintageStoryInteractionBoxes.activeBoxes();
		},
		selectedIndex() {
			return VintageStoryInteractionBoxes.selectedIndex;
		},
		selectedBox() {
			return VintageStoryInteractionBoxes.getSelectedBox();
		},
		assetContext() {
			return Project?.vintage_story_data?.asset_context || null;
		},
		overlayVisible() {
			return VintageStoryInteractionBoxes.visible;
		},
		warnings() {
			return VintageStoryInteractionBoxes.validationWarnings();
		}
	},
	mounted() {
		VintageStoryInteractionBoxes.vue = this;
		VintageStoryInteractionBoxes.refreshOverlay();
	},
	beforeDestroy() {
		VintageStoryInteractionBoxes.hideOverlay();
	},
	methods: {
		select(index) {
			VintageStoryInteractionBoxes.select(index);
		},
		sourceLabel(box) {
			return VintageStoryInteractionBoxes.sourceLabel(box);
		},
		addBox() {
			VintageStoryInteractionBoxes.addBox(this.newTarget);
		},
		duplicateBox() {
			VintageStoryInteractionBoxes.duplicateBox();
		},
		deleteBox() {
			VintageStoryInteractionBoxes.deleteBox();
		},
		fullBlock() {
			VintageStoryInteractionBoxes.setFullBlock();
		},
		noCollision() {
			VintageStoryInteractionBoxes.setNoCollision();
		},
		fromShapeBounds() {
			VintageStoryInteractionBoxes.setFromShapeBounds();
		},
		copyCollisionToSelection() {
			VintageStoryInteractionBoxes.copyCollisionToSelection();
		},
		copySelectionToCollision() {
			VintageStoryInteractionBoxes.copySelectionToCollision();
		},
		markDirty() {
			VintageStoryInteractionBoxes.markDirty(this.selectedBox);
		},
		startNumericEdit() {
			VintageStoryInteractionBoxes.beginBoxEdit(this.selectedBox);
		},
		markDirtyLive() {
			VintageStoryInteractionBoxes.updateBoxValueLive(this.selectedBox);
		},
		finishNumericEdit() {
			VintageStoryInteractionBoxes.updateBoxValueLive(this.selectedBox);
			VintageStoryInteractionBoxes.finishBoxEdit('Edit interaction box numbers');
		},
		createOverride() {
			VintageStoryInteractionBoxes.createOverride(this.selectedBox);
		},
		editSharedRule() {
			VintageStoryInteractionBoxes.editSharedRule(this.selectedBox);
		},
		deleteOverride() {
			VintageStoryInteractionBoxes.deleteOverride(this.selectedBox);
		},
		toggleOverlay(value) {
			VintageStoryInteractionBoxes.toggleOverlay(value);
		}
	}
}
</script>
