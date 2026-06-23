<template>
	<div class="vintage_shape_alternatives_panel">
		<div class="vintage_asset_context_notice" v-if="assetContext">
			<div class="vintage_asset_context_status">
				<label>Asset context</label>
				<span>{{ assetContext.selected_variant_code || assetContext.asset_code }}</span>
			</div>
		</div>

		<div class="bar vintage_shape_alternatives_toolbar">
			<div class="tool wide" @click="createAlternative">Create Alternate</div>
			<div class="tool wide" @click="openAlternative">Open Alternate</div>
		</div>

		<div class="vintage_shape_alternatives_list">
			<div
				v-for="(alternative, index) in alternatives"
				:key="alternative.resolvedBase + index"
				:class="{selected: selectedIndex === index, missing: alternative.missing, invalid: alternative.invalid, dirty: alternative.dirty}"
				@click="selectAlternative(index)"
				@dblclick="openAlternative"
			>
				<b>{{ alternative.resolvedBase || '(empty alternate)' }}</b>
				<span>{{ alternative.resolvedShapeFilePath || alternative.resolvedFilePath || 'No resolved shape file.' }}</span>
				<small>{{ statusLabel(alternative) }} · {{ sourceLabel(alternative) }}</small>
			</div>
			<p v-if="!alternatives.length" class="vintage_interaction_box_empty">No shape alternates resolved for this variant.</p>
		</div>

		<div v-if="selectedAlternative" class="vintage_shape_alternatives_fields">
			<label>
				<span>base</span>
				<input type="text" :value="selectedAlternative.resolvedBase" readonly />
			</label>
			<label>
				<span>JSON path</span>
				<input type="text" :value="selectedAlternative.sourcePath || '(new alternate)'" readonly />
			</label>
			<label>
				<span>source</span>
				<input type="text" :value="sourceLabel(selectedAlternative)" readonly />
			</label>
		</div>

		<div v-if="warnings.length" class="vintage_interaction_box_warnings">
			<p v-for="warning in warnings" :key="warning">{{ warning }}</p>
		</div>
	</div>
</template>

<script lang="js">
import { VintageStoryShapeAlternatives } from './vs_shape_alternatives_panel.js';

export default {
	computed: {
		assetContext() {
			return Project?.vintage_story_data?.asset_context || null;
		},
		alternatives() {
			return VintageStoryShapeAlternatives.getAlternatives();
		},
		selectedIndex() {
			return VintageStoryShapeAlternatives.selectedIndex;
		},
		selectedAlternative() {
			return VintageStoryShapeAlternatives.getSelectedAlternative();
		},
		warnings() {
			return VintageStoryShapeAlternatives.validationWarnings();
		}
	},
	mounted() {
		VintageStoryShapeAlternatives.vue = this;
	},
	methods: {
		selectAlternative(index) {
			VintageStoryShapeAlternatives.selectAlternative(index);
		},
		openAlternative() {
			VintageStoryShapeAlternatives.openAlternative(this.selectedAlternative);
		},
		createAlternative() {
			VintageStoryShapeAlternatives.createAlternative();
		},
		sourceLabel(alternative) {
			return VintageStoryShapeAlternatives.sourceLabel(alternative);
		},
		statusLabel(alternative) {
			if (alternative.invalid) return 'invalid path';
			if (alternative.missing) return 'missing file';
			if (alternative.dirty) return 'edited';
			return 'resolved';
		}
	}
}
</script>
