import VintageStoryInteractionBoxesPanel from './VintageStoryInteractionBoxesPanel.vue';
import { THREE } from '../lib/libs';
import { migrateStoredPanelPosition } from '../interface/panels';
import { currentwindow, dialog } from '../native_apis';
import { Validator, ValidatorCheck } from '../validator.js';
import { VintageStoryInteractionBoxHandles } from './vs_interaction_box_handles.js';
import {
	cloneInteractionBoxes,
	interactionBoxFromModelBounds,
	interactionBoxSourceLabel,
	makeFullBlockInteractionBox,
	makeInteractionBoxEditSource,
	makeInteractionBoxSourceForNew,
	makeNoCollisionInteractionBox,
	validateBoxValue,
	validateVintageStoryInteractionBoxes
} from './vs_interaction_boxes.js';

export const INTERACTION_BOX_TARGETS = [
	{id: 'collisionbox', label: 'Collision', kind: 'collision', fieldKey: 'collisionbox', valueKind: 'single'},
	{id: 'selectionbox', label: 'Selection', kind: 'selection', fieldKey: 'selectionbox', valueKind: 'single'},
	{id: 'collisionSelectionBox', label: 'Collision + Selection', kind: 'combined', fieldKey: 'collisionSelectionBox', valueKind: 'single'},
	{id: 'hitbox', label: 'Hitbox', kind: 'hitbox', valueKind: 'single', editorOnly: true},
	{id: 'groundStorageSelectionBox', label: 'Ground Storage Selection', kind: 'selection', ownerKind: 'behavior', behaviorName: 'GroundStorable', family: 'behavior.selectionBox', fieldKey: 'selectionBox', valueKind: 'single'},
	{id: 'groundStorageCollisionBox', label: 'Ground Storage Collision', kind: 'collision', ownerKind: 'behavior', behaviorName: 'GroundStorable', family: 'behavior.collisionBox', fieldKey: 'collisionBox', valueKind: 'single'}
];

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function selectedVariantKey() {
	return Project?.vintage_story_data?.asset_context?.selected_variant_code || Project?.name || '*';
}

function hasProject() {
	return !!Project && typeof Project === 'object';
}

function isAnimationMode() {
	return !!globalThis.Modes?.animate || !!globalThis.Animator?.open;
}

function migrateInteractionBoxesPanelToOutliner() {
	migrateStoredPanelPosition('vintage_story_interaction_boxes', position => {
		if (position.attached_to !== 'element') return false;
		position.attached_to = 'outliner';
		position.attached_index = 1;
		position.sidebar_index = 9;
		return true;
	});
	migrateStoredPanelPosition('element', position => {
		if (position.open_tab !== 'vintage_story_interaction_boxes') return false;
		delete position.open_tab;
		return true;
	});
}

function ensureVintageData() {
	if (!hasProject()) return {interaction_boxes: []};
	let data = Project?.vintage_story_data || (Project.vintage_story_data = {});
	if (!Array.isArray(data.interaction_boxes)) {
		data.interaction_boxes = cloneInteractionBoxes(data.asset_context?.interaction_box_sources || []);
	}
	return data;
}

function isValidBoxValue(value) {
	return value && typeof value === 'object'
		&& ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]));
}

function clearObject3D(object) {
	if (!object) return;
	while (object.children.length) {
		let child = object.children.pop();
		child.geometry?.dispose?.();
	}
}

function overlayScene() {
	return Canvas?.scene || globalThis.scene;
}

function materialFor(kind, selected) {
	let color = kind === 'selection' ? 0x42b8ff : (kind === 'combined' ? 0xb86cff : (kind === 'hitbox' ? 0x9bdc28 : 0xffa23a));
	if (selected) color = 0xffffff;
	return new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: selected ? 1 : 0.85,
		depthTest: false
	});
}

function makeOverlayBox(box, selected) {
	let value = box.value;
	if (!isValidBoxValue(value)) return null;
	let x1 = Math.min(value.x1, value.x2) * 16;
	let y1 = Math.min(value.y1, value.y2) * 16;
	let z1 = Math.min(value.z1, value.z2) * 16;
	let x2 = Math.max(value.x1, value.x2) * 16;
	let y2 = Math.max(value.y1, value.y2) * 16;
	let z2 = Math.max(value.z1, value.z2) * 16;
	let size = [Math.max(0.001, x2 - x1), Math.max(0.001, y2 - y1), Math.max(0.001, z2 - z1)];
	let geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0], size[1], size[2]));
	let line = new THREE.LineSegments(geometry, materialFor(box.kind, selected));
	line.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
	let rotate_y = typeof value.rotateY === 'number' ? value.rotateY : box.assetRotateY?.value;
	if (typeof rotate_y === 'number') line.rotation.y = Math.degToRad(rotate_y);
	if (typeof value.rotateX === 'number') line.rotation.x = Math.degToRad(value.rotateX);
	if (typeof value.rotateZ === 'number') line.rotation.z = Math.degToRad(value.rotateZ);
	line.name = `Vintage Story ${box.label}`;
	line.renderOrder = 1000;
	line.no_export = true;
	return line;
}

function currentModelBounds() {
	let min = [Infinity, Infinity, Infinity];
	let max = [-Infinity, -Infinity, -Infinity];
	let found = false;
	let elements = globalThis.Cube?.all || globalThis.Outliner?.elements || [];
	elements.forEach(element => {
		let from = element.from || element.origin;
		let to = element.to;
		if (!Array.isArray(from) || !Array.isArray(to)) return;
		for (let i = 0; i < 3; i++) {
			min[i] = Math.min(min[i], from[i], to[i]);
			max[i] = Math.max(max[i], from[i], to[i]);
		}
		found = true;
	});
	return found ? {min, max} : null;
}

function findBehaviorIndexForTarget(target) {
	if (target.ownerKind !== 'behavior' || !target.behaviorName) return -1;
	let data = Project?.vintage_story_data;
	let boxes = Array.isArray(data?.interaction_boxes) ? data.interaction_boxes : [];
	let existing = boxes.find(box => box.ownerKind === 'behavior'
		&& String(box.behaviorName || '').toLowerCase() === String(target.behaviorName).toLowerCase()
		&& Number.isInteger(box.behaviorIndex)
		&& box.behaviorIndex >= 0);
	return Number.isInteger(existing?.behaviorIndex) ? existing.behaviorIndex : -1;
}

function sourceLabelForNewBox(target, behavior_index) {
	if (target.ownerKind === 'behavior') {
		let name = target.behaviorName || 'Behavior';
		let index = behavior_index >= 0 ? behavior_index : name;
		return `behaviors[${index}].properties.${target.fieldKey}`;
	}
	return `root.${target.fieldKey}`;
}

function makeNewBox(target, value) {
	let owner_kind = target.ownerKind || 'root';
	let behavior_index = findBehaviorIndexForTarget(target);
	let owner_path = owner_kind === 'behavior'
		? ['behaviors', behavior_index >= 0 ? behavior_index : -1, 'properties']
		: [];
	let source = target.editorOnly ? null : makeInteractionBoxSourceForNew(target.fieldKey, {
		ownerKind: owner_kind,
		ownerPath: owner_path,
		behaviorIndex: behavior_index >= 0 ? behavior_index : undefined,
		behaviorName: target.behaviorName,
		family: target.family || target.id,
		kind: target.kind,
		valueKind: target.valueKind,
		selectedVariantKey: selectedVariantKey(),
		arrayIndex: target.valueKind === 'array' ? 0 : null
	});
	if (source && owner_kind === 'behavior' && behavior_index < 0) {
		source.missingBehavior = true;
		source.createMissingBehavior = target.behaviorName === 'GroundStorable';
	}
	return {
		id: `new:${target.id}:${guid()}`,
		label: target.label,
		ownerKind: owner_kind,
		ownerPath: owner_path,
		behaviorIndex: behavior_index >= 0 ? behavior_index : undefined,
		behaviorName: target.behaviorName,
		kind: target.kind,
		family: target.family || target.id,
		fieldKey: target.fieldKey,
		valueKind: target.valueKind,
		variantMode: 'global',
		selectedVariantCode: selectedVariantKey(),
		inherited: false,
		exact: true,
		fallback: false,
		isByType: false,
		editTargetKey: null,
		arrayIndex: target.valueKind === 'array' ? 0 : null,
		value: clone(value),
		sourcePath: target.editorOnly ? 'editor.hitbox' : sourceLabelForNewBox(target, behavior_index),
		sourceMapPath: target.editorOnly ? 'editor.hitbox' : sourceLabelForNewBox(target, behavior_index),
		sourcePointer: source,
		editorOnly: !!target.editorOnly,
		warnings: source?.missingBehavior ? [`${target.behaviorName} behavior is not present yet. Save As Asset can create it.`] : [],
		missingBehavior: !!source?.missingBehavior,
		dirty: true
	};
}

export const VintageStoryInteractionBoxes = {
	selectedIndex: 0,
	visible: true,
	overlayGroup: null,
	vue: null,
	boxUndoActive: false,
	boxUndoOwned: false,

	getBoxes() {
		return ensureVintageData().interaction_boxes;
	},

	activeBoxes() {
		return this.getBoxes().filter(box => !box.deleted);
	},

	getSelectedBox() {
		return this.activeBoxes()[this.selectedIndex] || this.activeBoxes()[0] || null;
	},

	select(index) {
		this.selectedIndex = Math.max(0, index || 0);
		this.refreshOverlay();
		VintageStoryInteractionBoxHandles.setSelectedBox(this.getSelectedBox());
		this.vue?.$forceUpdate?.();
	},

	sourceLabel(box) {
		if (box?.editorOnly) return 'Editor-only overlay';
		return interactionBoxSourceLabel(box);
	},

	validationWarnings() {
		return validateVintageStoryInteractionBoxes(this.activeBoxes());
	},

	ensureEditTarget(box) {
		if (!box?.sourcePointer?.isByType || !box.sourcePointer.inherited || box.sourcePointer.editTargetKey) return true;
		let result = dialog?.showMessageBoxSync
			? dialog.showMessageBoxSync(currentwindow, {
				type: 'warning',
				noLink: true,
				title: 'Edit inherited interaction box?',
				message: `${box.label} is inherited from ${interactionBoxSourceLabel(box)}.`,
				buttons: [`Create override for ${box.sourcePointer.selectedVariantKey}`, 'Edit shared rule', 'Cancel'],
				cancelId: 2,
				defaultId: 0
			})
			: 0;
		if (result === 1) {
			this.editSharedRule(box);
			return true;
		}
		if (result === 2) return false;
		this.createOverride(box);
		return true;
	},

	beginBoxEdit(box = this.getSelectedBox()) {
		if (!box) return false;
		if (!this.boxUndoActive && typeof Undo !== 'undefined' && !Undo.current_save) {
			Undo.initEdit({vintage_story_interaction_boxes: true});
			this.boxUndoActive = true;
			this.boxUndoOwned = true;
		}
		if (!this.ensureEditTarget(box)) {
			this.cancelBoxEdit();
			return false;
		}
		if (!this.boxUndoActive) {
			this.boxUndoActive = true;
			this.boxUndoOwned = false;
		}
		return true;
	},

	finishBoxEdit(message = 'Edit interaction box') {
		if (this.boxUndoOwned && typeof Undo !== 'undefined' && Undo.current_save) {
			if (message) {
				Undo.finishEdit(message);
			} else {
				Undo.cancelEdit(true);
			}
		}
		this.boxUndoActive = false;
		this.boxUndoOwned = false;
		this.vue?.$forceUpdate?.();
	},

	cancelBoxEdit() {
		if (this.boxUndoOwned && typeof Undo !== 'undefined' && Undo.current_save) {
			Undo.cancelEdit(true);
		}
		this.boxUndoActive = false;
		this.boxUndoOwned = false;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
	},

	setBoxValueFromHandle(box, value) {
		if (!box || !value) return false;
		box.value = clone(value);
		box.dirty = true;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
		return true;
	},

	updateBoxValueLive(box = this.getSelectedBox()) {
		if (!box) return false;
		if (!this.boxUndoActive && !this.beginBoxEdit(box)) return false;
		box.dirty = true;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
		return true;
	},

	markDirty(box) {
		if (!box) return false;
		if (box.editorOnly) {
			box.dirty = true;
			this.refreshOverlay();
			this.vue?.$forceUpdate?.();
			return true;
		}
		if (!this.ensureEditTarget(box)) return false;
		box.dirty = true;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
		return true;
	},

	createOverride(box) {
		if (!box?.sourcePointer) return;
		box.sourcePointer = makeInteractionBoxEditSource(box, 'override');
		box.sourcePointer.inherited = false;
		box.sourcePointer.exact = true;
		box.sourcePointer.fallback = false;
		box.sourcePointer.matchedPattern = box.sourcePointer.selectedVariantKey;
		box.inherited = false;
		box.exact = true;
		box.fallback = false;
		box.matchedPattern = box.sourcePointer.selectedVariantKey;
		box.editTargetKey = box.sourcePointer.selectedVariantKey;
		box.dirty = true;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
	},

	editSharedRule(box) {
		if (!box?.sourcePointer) return;
		box.sourcePointer = makeInteractionBoxEditSource(box, 'shared');
		box.editTargetKey = box.sourcePointer.editTargetKey;
		box.dirty = true;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
	},

	deleteOverride(box = this.getSelectedBox()) {
		if (!box?.sourcePointer?.isByType) return;
		box.sourcePointer.deleteOverride = true;
		box.sourcePointer.selectedVariantKey = box.sourcePointer.selectedVariantKey || selectedVariantKey();
		box.deleted = true;
		box.dirty = true;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
	},

	deleteBox(box = this.getSelectedBox()) {
		if (!box) return;
		if (box.sourcePointer) box.sourcePointer.deleteBox = true;
		box.deleted = true;
		box.dirty = true;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
	},

	addBox(target_id = 'collisionbox', value = makeFullBlockInteractionBox()) {
		let target = INTERACTION_BOX_TARGETS.find(entry => entry.id === target_id) || INTERACTION_BOX_TARGETS[0];
		let boxes = this.getBoxes();
		boxes.push(makeNewBox(target, value));
		this.selectedIndex = this.activeBoxes().length - 1;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
	},

	duplicateBox(box = this.getSelectedBox()) {
		if (!box) return;
		let copy = clone(box);
		copy.id = `copy:${guid()}`;
		if (copy.editorOnly) {
			copy.sourcePointer = null;
			copy.sourcePath = 'editor.hitbox';
			copy.sourceMapPath = 'editor.hitbox';
		} else {
			copy.sourcePointer = makeInteractionBoxSourceForNew(copy.fieldKey || 'collisionbox', {
				ownerKind: copy.ownerKind || 'root',
				ownerPath: Array.isArray(copy.ownerPath) ? copy.ownerPath : [],
				behaviorIndex: copy.behaviorIndex,
				behaviorName: copy.behaviorName,
				family: copy.family,
				kind: copy.kind,
				valueKind: copy.valueKind,
				selectedVariantKey: selectedVariantKey(),
				arrayIndex: copy.valueKind === 'array' ? 0 : null
			});
		}
		if (copy.sourcePointer && copy.ownerKind === 'behavior' && !Number.isInteger(copy.behaviorIndex)) {
			copy.sourcePointer.missingBehavior = true;
			copy.sourcePointer.createMissingBehavior = copy.behaviorName === 'GroundStorable';
			copy.missingBehavior = true;
		}
		copy.inherited = false;
		copy.exact = true;
		copy.isByType = false;
		copy.dirty = true;
		delete copy.deleted;
		this.getBoxes().push(copy);
		this.selectedIndex = this.activeBoxes().length - 1;
		this.refreshOverlay();
		this.vue?.$forceUpdate?.();
	},

	setFullBlock(box = this.getSelectedBox()) {
		if (!box) return;
		box.value = makeFullBlockInteractionBox();
		this.markDirty(box);
	},

	setNoCollision(box = this.getSelectedBox()) {
		if (!box || box.kind !== 'collision' || !String(box.fieldKey || '').toLowerCase().includes('collision')) {
			this.addBox('collisionbox', makeNoCollisionInteractionBox());
			return;
		}
		box.value = makeNoCollisionInteractionBox();
		this.markDirty(box);
	},

	applyShapeBoundsToBox(box, value, create_override = false) {
		if (!box) return;
		if (create_override && box.sourcePointer?.isByType && box.sourcePointer.inherited) {
			this.createOverride(box);
		}
		box.value = clone(value);
		this.markDirty(box);
	},

	findOrAddBox(target_id, value) {
		let target = INTERACTION_BOX_TARGETS.find(entry => entry.id === target_id);
		let box = this.activeBoxes().find(entry => entry.fieldKey === target?.fieldKey && entry.ownerKind === (target?.ownerKind || 'root'));
		if (box) return box;
		this.addBox(target_id, value);
		return this.getSelectedBox();
	},

	setFromShapeBounds(box = this.getSelectedBox()) {
		let value = interactionBoxFromModelBounds(currentModelBounds());
		if (!value) {
			Blockbench?.showQuickMessage?.('No shape bounds are available.');
			return;
		}
		let warnings = validateBoxValue(value, []).join('\n') || 'Shape bounds are inside the usual 0..1 block range.';
		let has_inherited_bytype = !!(box?.sourcePointer?.isByType && box.sourcePointer.inherited);
		let apply = result => {
			let create_override = !!result.create_override;
			if (result.target === 'selected') {
				this.applyShapeBoundsToBox(box, value, create_override);
			} else if (result.target === 'collision') {
				this.applyShapeBoundsToBox(this.findOrAddBox('collisionbox', value), value, create_override);
			} else if (result.target === 'selection') {
				this.applyShapeBoundsToBox(this.findOrAddBox('selectionbox', value), value, create_override);
			} else if (result.target === 'both') {
				this.applyShapeBoundsToBox(this.findOrAddBox('collisionbox', value), value, create_override);
				this.applyShapeBoundsToBox(this.findOrAddBox('selectionbox', value), value, create_override);
			}
		};
		if (typeof Dialog === 'undefined') {
			apply({target: box ? 'selected' : 'both', create_override: true});
			return;
		}
		new Dialog({
			id: 'vintage_story_shape_bounds_boxes',
			title: 'Apply Shape Bounds',
			width: 420,
			form: {
				target: {type: 'select', label: 'Apply To', value: box ? 'selected' : 'both', options: {
					selected: 'Selected box',
					collision: 'Collision box',
					selection: 'Selection box',
					both: 'Collision and selection'
				}},
				create_override: {type: 'checkbox', label: 'Create ByType override for selected variant', value: has_inherited_bytype, condition: () => has_inherited_bytype},
				bounds_warning: {type: 'textarea', label: 'Bounds Check', value: warnings, readonly: true, height: 54}
			},
			onConfirm(result) {
				apply(result);
			}
		}).show();
	},

	copyCollisionToSelection() {
		let source = this.activeBoxes().find(box => box.kind === 'collision' && box.value);
		let target = this.activeBoxes().find(box => box.kind === 'selection');
		if (!source) return;
		if (!target) {
			this.addBox('selectionbox', source.value);
			return;
		}
		target.value = clone(source.value);
		this.markDirty(target);
	},

	copySelectionToCollision() {
		let source = this.activeBoxes().find(box => box.kind === 'selection' && box.value);
		let target = this.activeBoxes().find(box => box.kind === 'collision');
		if (!source) return;
		if (!target) {
			this.addBox('collisionbox', source.value);
			return;
		}
		target.value = clone(source.value);
		this.markDirty(target);
	},

	refreshOverlay() {
		if (!this.visible || isAnimationMode()) {
			if (this.overlayGroup) this.overlayGroup.visible = false;
			VintageStoryInteractionBoxHandles.clear();
			return;
		}
		let scene = overlayScene();
		if (!scene || !THREE) return;
		if (!this.overlayGroup) {
			this.overlayGroup = new THREE.Group();
			this.overlayGroup.name = 'Vintage Story Interaction Boxes';
			this.overlayGroup.no_export = true;
		}
		if (this.overlayGroup.parent !== scene) scene.add(this.overlayGroup);
		this.overlayGroup.visible = true;
		VintageStoryInteractionBoxHandles.clear();
		clearObject3D(this.overlayGroup);
		let selected = this.getSelectedBox();
		this.activeBoxes().forEach(box => {
			let overlay = makeOverlayBox(box, box === selected);
			if (overlay) this.overlayGroup.add(overlay);
		});
		VintageStoryInteractionBoxHandles.refresh(selected, this.overlayGroup);
		Canvas?.updateAllPositions?.();
		Validator.validate();
	},

	hideOverlay() {
		VintageStoryInteractionBoxHandles.cancelDrag();
		if (this.overlayGroup) this.overlayGroup.visible = false;
		VintageStoryInteractionBoxHandles.clear();
	},

	toggleOverlay(value) {
		this.visible = value !== undefined ? !!value : !this.visible;
		this.refreshOverlay();
	}
};

VintageStoryInteractionBoxHandles.setController(VintageStoryInteractionBoxes);

if (typeof Blockbench !== 'undefined') {
	Blockbench.on('create_undo_save', event => {
		if (!event.aspects?.vintage_story_interaction_boxes) return;
		event.save.vintage_story_interaction_boxes = cloneInteractionBoxes(Project?.vintage_story_data?.interaction_boxes || []);
		event.save.vintage_story_interaction_box_selected = VintageStoryInteractionBoxes.selectedIndex;
	});
	Blockbench.on('load_undo_save', event => {
		if (!Object.prototype.hasOwnProperty.call(event.save, 'vintage_story_interaction_boxes')) return;
		let data = ensureVintageData();
		data.interaction_boxes = cloneInteractionBoxes(event.save.vintage_story_interaction_boxes || []);
		VintageStoryInteractionBoxes.selectedIndex = Math.max(0, event.save.vintage_story_interaction_box_selected || 0);
		VintageStoryInteractionBoxes.boxUndoActive = false;
		VintageStoryInteractionBoxes.boxUndoOwned = false;
		VintageStoryInteractionBoxes.refreshOverlay();
		VintageStoryInteractionBoxes.vue?.$forceUpdate?.();
	});
	Blockbench.on('select_mode', event => {
		if (event.mode?.id === 'animate') VintageStoryInteractionBoxes.hideOverlay();
	});
	Blockbench.on('unselect_mode', event => {
		if (event.mode?.id === 'animate') VintageStoryInteractionBoxes.refreshOverlay();
	});
}

migrateInteractionBoxesPanelToOutliner();

Interface.definePanels(function() {
	let panel = new Panel('vintage_story_interaction_boxes', {
		icon: 'select_all',
		condition: () => hasProject() && !isAnimationMode() && (Format?.codec?.id === 'vintage_story_json' || !!Project?.vintage_story_data),
		default_position: {
			slot: 'right_bar',
			float_position: [0, 0],
			float_size: [320, 500],
			height: 400,
			attached_to: 'outliner',
			attached_index: 1,
			sidebar_index: 9
		},
		component: VintageStoryInteractionBoxesPanel
	});
	if (panel.position_data.attached_to === 'element') {
		panel.customizePosition({
			attached_to: 'outliner',
			attached_index: 1,
			sidebar_index: 9
		});
	}
	VintageStoryInteractionBoxes.vue = Interface.Panels.vintage_story_interaction_boxes.inside_vue;
});

new ValidatorCheck('vintage_story_interaction_boxes', {
	condition: () => !!Project?.vintage_story_data?.interaction_boxes?.length,
	update_triggers: [],
	run() {
		VintageStoryInteractionBoxes.validationWarnings().forEach(message => {
			this.warn({message});
		});
	}
});

if (typeof window !== 'undefined') {
	Object.assign(window, {VintageStoryInteractionBoxes});
}
