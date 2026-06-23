<template>
	<div class="vintage_asset_explorer_panel">
		<div class="bar vintage_asset_explorer_toolbar">
			<div class="tool" title="Refresh" @click="refresh"><i class="material-icons">refresh</i></div>
			<div class="tool wide" @click="openSelected">Open</div>
			<div class="tool" title="Open generated package folder" @click="openPackageFolder"><i class="material-icons">inventory_2</i></div>
		</div>

		<div class="vintage_asset_context_notice" v-if="workspaceLabel">
			<div class="vintage_asset_context_status">
				<label>Workspace</label>
				<span>{{ workspaceLabel }}</span>
			</div>
		</div>

		<div class="vintage_asset_explorer_tree">
			<div
				v-for="(row, index) in rows"
				:key="row.id"
				:class="{selected: selectedRowIndex === index, file: isFileRow(row)}"
				:style="{paddingLeft: `${8 + row.depth * 14}px`}"
				:title="row.path"
				@click="selectRow(index)"
				@dblclick="openRow(row)"
			>
				<i class="material-icons">{{ iconFor(row) }}</i>
				<span>{{ row.label }}</span>
			</div>
		</div>

		<div class="vintage_asset_explorer_findbar">
			<div
				v-for="group in findingGroups"
				:key="group.id"
				:class="{selected: activeFindingGroupId === group.id}"
				class="tool wide"
				@click="setFindingGroup(group.id)"
			>
				{{ shortLabel(group) }} ({{ group.entries.length }})
			</div>
		</div>

		<div class="vintage_asset_explorer_findings">
			<div class="vintage_asset_explorer_heading">{{ activeFindingGroup.label }}</div>
			<div
				v-for="finding in activeFindingGroup.entries"
				:key="finding.type + finding.filePath + finding.jsonPath + finding.variantCode + finding.base"
				class="vintage_asset_explorer_finding"
				:title="finding.filePath"
			>
				<b>{{ finding.label }}</b>
				<span>{{ finding.message }}</span>
				<small>{{ finding.jsonPath || finding.filePath }}</small>
				<div class="bar">
					<div class="tool wide" @click="openFinding(finding)">Open</div>
					<div class="tool" title="Reveal file" @click="revealFinding(finding)"><i class="material-icons">folder_open</i></div>
				</div>
			</div>
			<p v-if="!activeFindingGroup.entries.length" class="vintage_interaction_box_empty">No findings.</p>
		</div>

		<div v-if="messages.length" class="vintage_interaction_box_warnings">
			<p v-for="message in messages" :key="message">{{ message }}</p>
		</div>
	</div>
</template>

<script lang="js">
import { VintageStoryAssetExplorer } from './vs_asset_explorer_panel.js';

export default {
	computed: {
		rows() {
			return VintageStoryAssetExplorer.getRows();
		},
		selectedRowIndex() {
			return VintageStoryAssetExplorer.selectedRowIndex;
		},
		findingGroups() {
			return VintageStoryAssetExplorer.getFindingGroups();
		},
		activeFindingGroupId() {
			return VintageStoryAssetExplorer.activeFindingGroupId;
		},
		activeFindingGroup() {
			return VintageStoryAssetExplorer.getActiveFindingGroup();
		},
		workspaceLabel() {
			let workspace = VintageStoryAssetExplorer.ensureScan()?.workspace;
			return workspace?.domain ? `${workspace.domain} · ${workspace.modRoot || ''}` : workspace?.modRoot || '';
		},
		messages() {
			let scan = VintageStoryAssetExplorer.ensureScan();
			return (scan?.errors || []).concat(scan?.warnings || []);
		}
	},
	mounted() {
		VintageStoryAssetExplorer.vue = this;
		VintageStoryAssetExplorer.refresh();
	},
	methods: {
		refresh() {
			VintageStoryAssetExplorer.refresh();
		},
		selectRow(index) {
			VintageStoryAssetExplorer.selectRow(index);
		},
		openSelected() {
			VintageStoryAssetExplorer.openRow();
		},
		openRow(row) {
			VintageStoryAssetExplorer.openRow(row);
		},
		setFindingGroup(id) {
			VintageStoryAssetExplorer.setFindingGroup(id);
		},
		openFinding(finding) {
			VintageStoryAssetExplorer.openFinding(finding);
		},
		revealFinding(finding) {
			VintageStoryAssetExplorer.revealFinding(finding);
		},
		openPackageFolder() {
			VintageStoryAssetExplorer.openPackageFolder();
		},
		isFileRow(row) {
			return ['itemtype', 'blocktype', 'shape', 'texture', 'lang', 'modinfo'].includes(row.kind);
		},
		iconFor(row) {
			if (row.kind === 'workspace') return 'workspaces';
			if (row.kind === 'assets' || row.kind === 'domain' || row.kind === 'folder') return 'folder';
			if (row.kind === 'texture') return 'image';
			if (row.kind === 'shape') return 'view_in_ar';
			if (row.kind === 'itemtype' || row.kind === 'blocktype') return 'description';
			if (row.kind === 'modinfo') return 'info';
			return 'insert_drive_file';
		},
		shortLabel(group) {
			if (group.id === 'assetsReferencingCurrentShape') return 'Refs';
			if (group.id === 'missingTextures') return 'Missing Tex';
			if (group.id === 'unusedShapes') return 'Unused Shapes';
			if (group.id === 'unusedTextures') return 'Unused Tex';
			if (group.id === 'brokenAttachedShapeRefs') return 'Broken Attach';
			return group.label;
		}
	}
}
</script>
