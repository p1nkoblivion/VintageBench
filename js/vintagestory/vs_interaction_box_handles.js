import { THREE } from '../lib/libs';
import { Pressing, canvasGridSize } from '../misc.js';

const BOX_COORDS = ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'];
const AXES = ['x', 'y', 'z'];
const MIN_BOX_SIZE = 1 / 1024;
const HANDLE_COLORS = {
	move: 0x9bdc28,
	face: 0xffa23a,
	corner: 0x42b8ff,
	hover: 0xffffff
};

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isValidBoxValue(value) {
	return value && typeof value === 'object'
		&& BOX_COORDS.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]));
}

function roundNumber(value) {
	return Math.round(value * 100000) / 100000;
}

function snapValue(value, step) {
	if (!Number.isFinite(value)) return 0;
	if (!step || !Number.isFinite(step) || step <= 0) return roundNumber(value);
	return roundNumber(Math.round(value / step) * step);
}

function eventUsesCtrl(event) {
	return !!(event?.ctrlOrCmd || event?.ctrlKey || event?.metaKey || Pressing?.overrides?.ctrl);
}

function eventUsesShift(event) {
	return !!(event?.shiftKey || Pressing?.overrides?.shift);
}

function blockSnapStep(event) {
	try {
		let world_step = canvasGridSize(eventUsesShift(event), eventUsesCtrl(event));
		if (Number.isFinite(world_step) && world_step > 0) return world_step / 16;
	} catch (err) {}
	return 1 / 16;
}

function makeMaterial(mode) {
	return new THREE.MeshBasicMaterial({
		color: HANDLE_COLORS[mode] || HANDLE_COLORS.face,
		transparent: true,
		opacity: mode === 'move' ? 0.95 : 0.9,
		depthTest: false,
		depthWrite: false
	});
}

function facePosition(value, coord) {
	let axis = coord[0];
	let position = {
		x: (value.x1 + value.x2) / 2,
		y: (value.y1 + value.y2) / 2,
		z: (value.z1 + value.z2) / 2
	};
	position[axis] = value[coord];
	return position;
}

function cornerPosition(value, x_coord, y_coord, z_coord) {
	return {
		x: value[x_coord],
		y: value[y_coord],
		z: value[z_coord]
	};
}

function worldPosition(block_position) {
	return new THREE.Vector3(
		block_position.x * 16,
		block_position.y * 16,
		block_position.z * 16
	);
}

function controlScaleAt(position) {
	let scale = Preview?.selected?.calculateControlScale?.(position);
	if (!Number.isFinite(scale) || scale <= 0) return 1;
	return Math.clamp ? Math.clamp(scale * 0.08, 0.18, 0.55) : Math.max(0.18, Math.min(0.55, scale * 0.08));
}

function descriptorLabel(descriptor) {
	if (descriptor.mode === 'move') return 'Move box';
	if (descriptor.mode === 'face') return `Resize ${descriptor.coord} face`;
	return `Resize ${descriptor.coords.join('/')} corner`;
}

function makeHandleObject(descriptor) {
	let size = controlScaleAt(descriptor.worldPosition);
	let geometry = descriptor.mode === 'corner'
		? new THREE.SphereGeometry(size * 0.62, 10, 8)
		: new THREE.BoxGeometry(size, size, size);
	let mesh = new THREE.Mesh(geometry, makeMaterial(descriptor.mode));
	mesh.position.copy(descriptor.worldPosition);
	mesh.name = `Vintage Story Interaction Box Handle: ${descriptorLabel(descriptor)}`;
	mesh.renderOrder = 1002;
	mesh.no_export = true;
	mesh.userData.vsInteractionHandle = descriptor;
	return mesh;
}

function handleDescriptorsForBox(box) {
	if (!isValidBoxValue(box?.value)) return [];
	let value = box.value;
	let descriptors = [{
		mode: 'move',
		coords: BOX_COORDS.slice(),
		blockPosition: {
			x: (value.x1 + value.x2) / 2,
			y: (value.y1 + value.y2) / 2,
			z: (value.z1 + value.z2) / 2
		}
	}];
	BOX_COORDS.forEach(coord => {
		descriptors.push({
			mode: 'face',
			axis: coord[0],
			coord,
			coords: [coord],
			blockPosition: facePosition(value, coord)
		});
	});
	['x1', 'x2'].forEach(x_coord => {
		['y1', 'y2'].forEach(y_coord => {
			['z1', 'z2'].forEach(z_coord => {
				descriptors.push({
					mode: 'corner',
					coords: [x_coord, y_coord, z_coord],
					blockPosition: cornerPosition(value, x_coord, y_coord, z_coord)
				});
			});
		});
	});
	return descriptors.map((descriptor, index) => Object.assign(descriptor, {
		id: `${box.id || 'box'}:${descriptor.mode}:${descriptor.coords.join(':')}:${index}`,
		boxId: box.id || '',
		worldPosition: worldPosition(descriptor.blockPosition)
	}));
}

function previewFromEvent(event) {
	let target = event?.target;
	if (target?.preview) return target.preview;
	if (target?.closest) {
		let canvas = target.closest('.preview canvas');
		if (canvas?.preview) return canvas.preview;
	}
	return Canvas?.getHoveredPreview?.() || Preview?.selected || null;
}

function updatePointerForPreview(event, preview, allow_outside = false) {
	if (!preview?.canvas || !preview?.camera || !preview?.raycaster) return null;
	let rect = preview.canvas.getBoundingClientRect();
	if (!allow_outside && (
		event.clientX < rect.left || event.clientX > rect.right ||
		event.clientY < rect.top || event.clientY > rect.bottom
	)) {
		return null;
	}
	let width = rect.width || preview.width || 1;
	let height = rect.height || preview.height || 1;
	let x = ((event.clientX - rect.left) / width) * 2 - 1;
	let y = -((event.clientY - rect.top) / height) * 2 + 1;
	preview.raycaster.setFromCamera({x, y}, preview.camera);
	return preview.raycaster;
}

function dragPointOnPlane(event, state) {
	let raycaster = updatePointerForPreview(event, state.preview, true);
	if (!raycaster) return null;
	return raycaster.ray.intersectPlane(state.dragPlane, new THREE.Vector3());
}

function makeDragPlane(preview, point) {
	let normal = new THREE.Vector3();
	preview.camera.getWorldDirection(normal).normalize();
	return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
}

function blockDeltaFromWorldDelta(delta) {
	return {
		x: delta.x / 16,
		y: delta.y / 16,
		z: delta.z / 16
	};
}

function constrainResize(value, coords) {
	AXES.forEach(axis => {
		let min_key = `${axis}1`;
		let max_key = `${axis}2`;
		if (!coords.includes(min_key) && !coords.includes(max_key)) return;
		if (value[min_key] > value[max_key] - MIN_BOX_SIZE) {
			if (coords.includes(min_key) && !coords.includes(max_key)) {
				value[min_key] = value[max_key] - MIN_BOX_SIZE;
			} else if (coords.includes(max_key) && !coords.includes(min_key)) {
				value[max_key] = value[min_key] + MIN_BOX_SIZE;
			} else {
				let center = (value[min_key] + value[max_key]) / 2;
				value[min_key] = center - MIN_BOX_SIZE / 2;
				value[max_key] = center + MIN_BOX_SIZE / 2;
			}
		}
	});
}

function applyHandleDelta(start_value, handle, delta, snap_step) {
	let next = clone(start_value);
	if (!isValidBoxValue(next)) return next;
	if (handle.mode === 'move') {
		AXES.forEach(axis => {
			let snapped_delta = snapValue(delta[axis], snap_step);
			next[`${axis}1`] = roundNumber(start_value[`${axis}1`] + snapped_delta);
			next[`${axis}2`] = roundNumber(start_value[`${axis}2`] + snapped_delta);
		});
		return next;
	}
	let coords = handle.coords || [];
	coords.forEach(coord => {
		let axis = coord[0];
		next[coord] = snapValue(start_value[coord] + delta[axis], snap_step);
	});
	constrainResize(next, coords);
	BOX_COORDS.forEach(coord => {
		next[coord] = roundNumber(next[coord]);
	});
	return next;
}

function setHandleHover(object, hover) {
	if (!object?.material?.color) return;
	let descriptor = object.userData?.vsInteractionHandle;
	object.material.color.setHex(hover ? HANDLE_COLORS.hover : (HANDLE_COLORS[descriptor?.mode] || HANDLE_COLORS.face));
}

export const VintageStoryInteractionBoxHandles = {
	selectedBoxId: '',
	overlayGroup: null,
	handleObjects: [],
	dragState: null,
	hoveredObject: null,
	controller: null,
	eventsInstalled: false,

	setController(controller) {
		this.controller = controller || null;
		this.installEventHandlers();
	},

	setSelectedBox(box) {
		this.selectedBoxId = box?.id || '';
		this.refresh(box);
	},

	refresh(box, overlayGroup = this.overlayGroup) {
		this.overlayGroup = overlayGroup || this.overlayGroup;
		this.clear();
		if (!box || !this.overlayGroup || !isValidBoxValue(box.value)) return;
		handleDescriptorsForBox(box).forEach(descriptor => {
			let object = makeHandleObject(descriptor);
			this.handleObjects.push(object);
			this.overlayGroup.add(object);
		});
	},

	hitTest(event) {
		if (!this.handleObjects.length || !event) return null;
		let preview = previewFromEvent(event);
		let raycaster = updatePointerForPreview(event, preview);
		if (!preview || !raycaster) return null;
		let intersections = raycaster.intersectObjects(this.handleObjects, false);
		if (!intersections.length) return null;
		let intersection = intersections[0];
		return {
			preview,
			object: intersection.object,
			point: intersection.point.clone(),
			handle: clone(intersection.object.userData.vsInteractionHandle)
		};
	},

	beginDrag(event, hit) {
		let handle_hit = hit?.handle ? hit : this.hitTest(event);
		if (!handle_hit?.handle) return false;
		let box = this.controller?.getSelectedBox?.();
		if (!box || !isValidBoxValue(box.value)) return false;
		if (!this.controller?.beginBoxEdit?.(box)) return false;
		let start_point = handle_hit.point || handle_hit.handle.worldPosition || new THREE.Vector3();
		this.dragState = {
			handle: handle_hit.handle,
			preview: handle_hit.preview,
			startBoxId: box.id || '',
			startValue: clone(box.value),
			startPoint: start_point.clone(),
			lastPoint: start_point.clone(),
			dragPlane: makeDragPlane(handle_hit.preview, start_point),
			snapStep: blockSnapStep(event),
			moved: false
		};
		this.attachDragListeners();
		return true;
	},

	updateDrag(event) {
		if (!this.dragState) return false;
		let box = this.controller?.getSelectedBox?.();
		if (!box || (box.id || '') !== this.dragState.startBoxId) return false;
		let point = dragPointOnPlane(event, this.dragState);
		if (!point) return false;
		let world_delta = point.clone().sub(this.dragState.startPoint);
		let block_delta = blockDeltaFromWorldDelta(world_delta);
		this.dragState.snapStep = blockSnapStep(event);
		let next_value = applyHandleDelta(this.dragState.startValue, this.dragState.handle, block_delta, this.dragState.snapStep);
		this.dragState.lastPoint = point;
		this.dragState.moved = true;
		this.controller?.setBoxValueFromHandle?.(box, next_value);
		return true;
	},

	endDrag() {
		if (!this.dragState) return false;
		let moved = !!this.dragState.moved;
		this.detachDragListeners();
		this.dragState = null;
		this.controller?.finishBoxEdit?.(moved ? 'Drag interaction box handle' : null);
		return true;
	},

	cancelDrag() {
		if (!this.dragState) return;
		this.detachDragListeners();
		this.dragState = null;
		this.controller?.cancelBoxEdit?.();
	},

	updateHover(event) {
		if (this.dragState) return;
		let hit = this.hitTest(event);
		if (hit?.object === this.hoveredObject) return;
		setHandleHover(this.hoveredObject, false);
		this.hoveredObject = hit?.object || null;
		setHandleHover(this.hoveredObject, true);
		let preview = hit?.preview || previewFromEvent(event);
		if (preview?.canvas) preview.canvas.style.cursor = hit ? 'move' : '';
	},

	handlePointerDown(event) {
		if (event.button !== 0 || event.defaultPrevented) return;
		let hit = this.hitTest(event);
		if (!hit) return;
		event.preventDefault();
		event.stopPropagation();
		this.beginDrag(event, hit);
	},

	handlePointerMove(event) {
		if (this.dragState) {
			event.preventDefault();
			event.stopPropagation();
			this.updateDrag(event);
			return;
		}
		this.updateHover(event);
	},

	handlePointerUp(event) {
		if (!this.dragState) return;
		event.preventDefault();
		event.stopPropagation();
		this.endDrag();
	},

	handleKeyDown(event) {
		if (event.key === 'Escape' && this.dragState) {
			event.preventDefault();
			this.cancelDrag();
		}
	},

	installEventHandlers() {
		if (this.eventsInstalled || typeof document === 'undefined') return;
		this._pointerDown = event => this.handlePointerDown(event);
		this._hoverMove = event => this.updateHover(event);
		document.addEventListener('pointerdown', this._pointerDown, true);
		document.addEventListener('pointermove', this._hoverMove, true);
		this.eventsInstalled = true;
	},

	attachDragListeners() {
		if (typeof document === 'undefined' || this._dragMove) return;
		this._dragMove = event => this.handlePointerMove(event);
		this._dragUp = event => this.handlePointerUp(event);
		this._dragKeyDown = event => this.handleKeyDown(event);
		document.addEventListener('pointermove', this._dragMove, true);
		document.addEventListener('pointerup', this._dragUp, true);
		document.addEventListener('keydown', this._dragKeyDown, true);
	},

	detachDragListeners() {
		if (typeof document === 'undefined') return;
		if (this._dragMove) document.removeEventListener('pointermove', this._dragMove, true);
		if (this._dragUp) document.removeEventListener('pointerup', this._dragUp, true);
		if (this._dragKeyDown) document.removeEventListener('keydown', this._dragKeyDown, true);
		this._dragMove = null;
		this._dragUp = null;
		this._dragKeyDown = null;
	},

	clear() {
		setHandleHover(this.hoveredObject, false);
		this.hoveredObject = null;
		this.handleObjects.forEach(object => {
			object.parent?.remove?.(object);
			object.geometry?.dispose?.();
			object.material?.dispose?.();
		});
		this.handleObjects = [];
	},

	dispose() {
		this.cancelDrag();
		this.clear();
		this.overlayGroup = null;
		this.selectedBoxId = '';
		if (typeof document !== 'undefined' && this.eventsInstalled) {
			document.removeEventListener('pointerdown', this._pointerDown, true);
			document.removeEventListener('pointermove', this._hoverMove, true);
			this.eventsInstalled = false;
		}
	}
};

export const __interactionBoxHandleTestables = {
	applyHandleDelta,
	blockDeltaFromWorldDelta,
	blockSnapStep,
	handleDescriptorsForBox,
	snapValue
};

if (typeof window !== 'undefined') {
	window.VintageStoryInteractionBoxHandles = VintageStoryInteractionBoxHandles;
}
