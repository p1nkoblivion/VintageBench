<template>
	<div class="vintage_texture_manager_panel">
		<div class="vintage_asset_context_notice" v-if="assetContext">
			<div class="vintage_asset_context_status">
				<label>Asset context</label>
				<span>{{ assetContext.selected_variant_code || assetContext.asset_code }}</span>
			</div>
		</div>

		<div class="bar vintage_texture_toolbar">
			<div class="tool wide" @click="copyTexture">Copy Texture</div>
			<div class="tool wide" @click="relinkTexture">Relink Missing Texture</div>
			<div class="tool" title="Open texture folder" @click="openFolder"><i class="material-icons">folder_open</i></div>
		</div>

		<div class="vintage_texture_list">
			<div
				v-for="(entry, index) in entries"
				:key="entry.alias + index"
				:class="{selected: selectedIndex === index, missing: entry.missing, invalid: entry.invalid, dirty: entry.dirty}"
				@click="selectEntry(index)"
			>
				<div class="vintage_texture_preview">
					<img v-if="entry.previewPath" :src="fileUrl(entry.previewPath)" :alt="entry.alias" />
					<i v-else class="material-icons">texture</i>
				</div>
				<div class="vintage_texture_summary">
					<b>{{ entry.alias || 'unnamed' }}</b>
					<span>{{ entry.resolvedBase || '(no base path)' }}</span>
					<small>{{ statusLabel(entry) }} · {{ sourceLabel(entry) }}</small>
				</div>
			</div>
			<p v-if="!entries.length" class="vintage_interaction_box_empty">No texture aliases resolved.</p>
		</div>

		<div v-if="selectedEntry" class="vintage_texture_fields">
			<label>
				<span>alias</span>
				<input type="text" :value="selectedEntry.alias" readonly />
			</label>
			<label>
				<span>asset base</span>
				<input type="text" :value="selectedEntry.resolvedBase" placeholder="item/example/texture" @change="setBase($event.target.value)" />
			</label>
			<label>
				<span>source</span>
				<input type="text" :value="sourceLabel(selectedEntry)" readonly />
			</label>
			<label>
				<span>JSON path</span>
				<input type="text" :value="selectedEntry.sourcePath || '(new override)'" readonly />
			</label>
			<div class="vintage_attachment_path">{{ selectedEntry.resolvedFilePath || 'No resolved texture file.' }}</div>

			<div v-if="selectedEntry.inherited && selectedEntry.isByType" class="bar vintage_asset_context_actions">
				<div class="tool wide" @click="createOverride">Create Override</div>
				<div class="tool wide" @click="editSharedRule">Edit Shared Rule</div>
			</div>
		</div>

		<div v-if="warnings.length" class="vintage_interaction_box_warnings">
			<p v-for="warning in warnings" :key="warning">{{ warning }}</p>
		</div>
	</div>
</template>

<script lang="js">
import { VintageStoryTextureManager } from './vs_texture_manager_panel.js';

export default {
	computed: {
		assetContext() {
			return Project?.vintage_story_data?.asset_context || null;
		},
		entries() {
			return VintageStoryTextureManager.getEntries();
		},
		selectedIndex() {
			return VintageStoryTextureManager.selectedIndex;
		},
		selectedEntry() {
			return VintageStoryTextureManager.getSelectedEntry();
		},
		warnings() {
			return VintageStoryTextureManager.validationWarnings();
		}
	},
	mounted() {
		VintageStoryTextureManager.vue = this;
	},
	methods: {
		selectEntry(index) {
			VintageStoryTextureManager.selectEntry(index);
		},
		sourceLabel(entry) {
			return VintageStoryTextureManager.sourceLabel(entry);
		},
		statusLabel(entry) {
			if (entry.invalid) return 'invalid path';
			if (entry.sourceKind === 'missing') return 'missing alias';
			if (entry.missing) return 'missing file';
			if (entry.dirty) return 'edited';
			return 'resolved';
		},
		fileUrl(path) {
			return VintageStoryTextureManager.fileUrl(path);
		},
		setBase(value) {
			VintageStoryTextureManager.setTextureBase(this.selectedEntry, value);
		},
		copyTexture() {
			VintageStoryTextureManager.copyTextureIntoWorkspace(this.selectedEntry);
		},
		relinkTexture() {
			VintageStoryTextureManager.relinkMissingTexture(this.selectedEntry);
		},
		openFolder() {
			VintageStoryTextureManager.openTextureFolder(this.selectedEntry);
		},
		createOverride() {
			VintageStoryTextureManager.createOverride(this.selectedEntry);
		},
		editSharedRule() {
			VintageStoryTextureManager.editSharedRule(this.selectedEntry);
		}
	}
}
</script>
