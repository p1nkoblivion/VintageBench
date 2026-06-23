export const VINTAGE_STORY_DIRTY_KINDS = {
	MAIN_SHAPE: 'main_shape',
	ATTACHED_SHAPE: 'attached_shape',
	ASSET: 'asset',
	LANG: 'lang',
	MODINFO: 'modinfo',
	EXPORT_PLAN: 'workspace_export_plan'
};

const KIND_LABELS = {
	[VINTAGE_STORY_DIRTY_KINDS.MAIN_SHAPE]: 'Main shape file',
	[VINTAGE_STORY_DIRTY_KINDS.ATTACHED_SHAPE]: 'Attached shape file',
	[VINTAGE_STORY_DIRTY_KINDS.ASSET]: 'Item/block asset file',
	[VINTAGE_STORY_DIRTY_KINDS.LANG]: 'Lang file',
	[VINTAGE_STORY_DIRTY_KINDS.MODINFO]: 'modinfo.json',
	[VINTAGE_STORY_DIRTY_KINDS.EXPORT_PLAN]: 'Workspace export plan'
};

export function normalizeVintageStoryDirtyPath(path) {
	return String(path || '').replace(/\\/g, '/');
}

function samePath(left, right) {
	let a = normalizeVintageStoryDirtyPath(left).toLowerCase();
	let b = normalizeVintageStoryDirtyPath(right).toLowerCase();
	return !!a && !!b && a === b;
}

function pathInList(path, list = []) {
	return list.some(entry => samePath(path, entry));
}

function ensureVintageData(project) {
	if (!project || typeof project !== 'object') return null;
	return project.vintage_story_data || (project.vintage_story_data = {});
}

export function ensureVintageStoryDirtyState(project) {
	let data = ensureVintageData(project);
	if (!data) return {files: {}};
	if (!data.dirty_state || typeof data.dirty_state !== 'object') data.dirty_state = {files: {}};
	if (!data.dirty_state.files || typeof data.dirty_state.files !== 'object') data.dirty_state.files = {};
	return data.dirty_state;
}

function dirtyKindForShapeTarget(target = {}) {
	return target?.kind === 'attached_shape'
		? VINTAGE_STORY_DIRTY_KINDS.ATTACHED_SHAPE
		: VINTAGE_STORY_DIRTY_KINDS.MAIN_SHAPE;
}

export function getVintageStoryShapeDirtyKind(project) {
	let data = project?.vintage_story_data || {};
	return dirtyKindForShapeTarget(data.editing_target || data.asset_context?.current_shape_target || {});
}

function makeDirtyRecord(kind, dirty, details = {}) {
	return {
		kind,
		label: KIND_LABELS[kind] || kind,
		dirty: !!dirty,
		filePath: normalizeVintageStoryDirtyPath(details.filePath || details.path || ''),
		details: String(details.details || details.reason || ''),
		pendingPaths: (details.pendingPaths || []).map(normalizeVintageStoryDirtyPath).filter(Boolean),
		updatedAt: details.updatedAt || new Date().toISOString()
	};
}

export function setVintageStoryDirty(project, kind, dirty = true, details = {}) {
	let state = ensureVintageStoryDirtyState(project);
	let previous = state.files[kind] || {};
	state.files[kind] = Object.assign(
		makeDirtyRecord(kind, dirty, previous),
		previous,
		makeDirtyRecord(kind, dirty, details)
	);
	return state.files[kind];
}

export function clearVintageStoryDirtyFile(project, kind, file_path = '') {
	let state = ensureVintageStoryDirtyState(project);
	let record = state.files[kind];
	if (!record) return false;
	if (kind === VINTAGE_STORY_DIRTY_KINDS.EXPORT_PLAN && file_path) {
		record.pendingPaths = (record.pendingPaths || []).filter(path => !samePath(path, file_path));
		if (!record.pendingPaths.length) record.dirty = false;
		return true;
	}
	if (!file_path || !record.filePath || samePath(record.filePath, file_path)) {
		record.dirty = false;
		record.pendingPaths = [];
		return true;
	}
	return false;
}

export function isVintageStoryAssetFileDirty(project) {
	let display_dirty = Object.values(project?.display_settings || {})
		.some(slot => !!slot?.vintage_story?.asset_source?.dirty);
	let boxes_dirty = (project?.vintage_story_data?.interaction_boxes || [])
		.some(box => !!box?.dirty && !!box?.sourcePointer);
	let attachment_dirty = !!project?.vintage_story_data?.attachments?.dirty;
	let texture_dirty = (project?.vintage_story_data?.texture_manager_entries || [])
		.some(entry => !!entry?.dirty && !!entry?.alias);
	let alternate_dirty = (project?.vintage_story_data?.shape_alternatives || [])
		.some(alternate => !!alternate?.dirty);
	return display_dirty || boxes_dirty || attachment_dirty || texture_dirty || alternate_dirty;
}

function currentShapeDirtyRecord(project) {
	if (!project?.vintage_story_data || project.saved !== false) return null;
	let data = project.vintage_story_data || {};
	let target = data.editing_target || data.asset_context?.current_shape_target || {};
	let kind = dirtyKindForShapeTarget(target);
	return makeDirtyRecord(kind, true, {
		filePath: target.shape_path || project.save_path || project.export_path || data.source_path || '',
		reason: 'Unsaved shape edits'
	});
}

function dynamicAssetDirtyRecord(project) {
	if (!isVintageStoryAssetFileDirty(project)) return null;
	return makeDirtyRecord(VINTAGE_STORY_DIRTY_KINDS.ASSET, true, {
		filePath: project?.vintage_story_data?.asset_context?.source_file_path || '',
		reason: 'Unsaved transform, shape alternate, texture, interaction box, or attachment edits'
	});
}

export function collectVintageStoryDirtyRecords(project, options = {}) {
	let records = [];
	let add = record => {
		if (!record?.dirty) return;
		if (options.includeExportPlan === false && record.kind === VINTAGE_STORY_DIRTY_KINDS.EXPORT_PLAN) return;
		let key = `${record.kind}|${normalizeVintageStoryDirtyPath(record.filePath).toLowerCase()}|${record.details}`;
		if (!records.some(existing => `${existing.kind}|${normalizeVintageStoryDirtyPath(existing.filePath).toLowerCase()}|${existing.details}` === key)) {
			records.push(record);
		}
	};
	add(currentShapeDirtyRecord(project));
	add(dynamicAssetDirtyRecord(project));
	let state = project?.vintage_story_data?.dirty_state?.files || {};
	Object.keys(state).forEach(kind => add(makeDirtyRecord(kind, state[kind].dirty, state[kind])));
	return records;
}

export function hasVintageStoryDirtyFiles(project, options = {}) {
	return collectVintageStoryDirtyRecords(project, options).length > 0;
}

export function formatVintageStoryDirtyRecords(records = []) {
	return records.map(record => {
		let path = record.filePath || (record.pendingPaths?.length ? record.pendingPaths.join(', ') : 'pending changes');
		return `${record.label}: ${path}${record.details ? ` (${record.details})` : ''}`;
	}).join('\n');
}

function dirtyKindForExportEntry(project, entry) {
	if (entry.kind === 'shape') return getVintageStoryShapeDirtyKind(project);
	if (entry.kind === 'itemtype' || entry.kind === 'blocktype') return VINTAGE_STORY_DIRTY_KINDS.ASSET;
	if (entry.kind === 'lang') return VINTAGE_STORY_DIRTY_KINDS.LANG;
	if (entry.kind === 'modinfo') return VINTAGE_STORY_DIRTY_KINDS.MODINFO;
	return '';
}

export function markVintageStoryExportPlanDirty(project, plan) {
	if (!project || !plan) return [];
	let pending = [];
	(plan.entries || []).forEach(entry => {
		if (entry.skipped || !entry.targetPath) return;
		pending.push(entry.targetPath);
		let kind = dirtyKindForExportEntry(project, entry);
		if (kind) {
			setVintageStoryDirty(project, kind, true, {
				filePath: entry.targetPath,
				reason: `Pending ${entry.kind} export`
			});
		}
	});
	setVintageStoryDirty(project, VINTAGE_STORY_DIRTY_KINDS.EXPORT_PLAN, pending.length > 0, {
		filePath: plan.workspace?.modRoot || '',
		pendingPaths: pending,
		reason: `${pending.length} pending export file${pending.length === 1 ? '' : 's'}`
	});
	return pending;
}

export function clearVintageStoryDirtyFilesWrittenByReport(project, report = {}) {
	let written = []
		.concat(report.written || [])
		.concat(report.copied || [])
		.map(normalizeVintageStoryDirtyPath)
		.filter(Boolean);
	let cleared = [];
	if (!project || !written.length) return {cleared, remaining: collectVintageStoryDirtyRecords(project)};
	let state = ensureVintageStoryDirtyState(project);
	Object.keys(state.files).forEach(kind => {
		let record = state.files[kind];
		if (!record?.dirty) return;
		if (kind === VINTAGE_STORY_DIRTY_KINDS.EXPORT_PLAN) {
			let before = record.pendingPaths || [];
			record.pendingPaths = before.filter(path => !pathInList(path, written));
			if (before.length !== record.pendingPaths.length) cleared.push(kind);
			if (!record.pendingPaths.length) record.dirty = false;
			return;
		}
		if (record.filePath && pathInList(record.filePath, written)) {
			record.dirty = false;
			cleared.push(kind);
		}
	});
	if (project.saved === false) {
		let shape_path = project?.vintage_story_data?.editing_target?.shape_path || project.save_path || project.export_path || '';
		if (pathInList(shape_path, written)) project.saved = true;
	}
	return {cleared, remaining: collectVintageStoryDirtyRecords(project)};
}

if (typeof window !== 'undefined') {
	window.VintageStoryDirtyState = {
		kinds: VINTAGE_STORY_DIRTY_KINDS,
		collectDirtyRecords: collectVintageStoryDirtyRecords,
		hasDirtyFiles: hasVintageStoryDirtyFiles,
		formatDirtyRecords: formatVintageStoryDirtyRecords,
		markExportPlanDirty: markVintageStoryExportPlanDirty,
		clearWrittenByReport: clearVintageStoryDirtyFilesWrittenByReport
	};
}
