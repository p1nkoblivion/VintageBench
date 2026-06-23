export const VintageStoryInteractionBoxHandles = {
	selectedBoxId: '',
	overlayGroup: null,
	handleObjects: [],
	dragState: null,

	setSelectedBox(box) {
		this.selectedBoxId = box?.id || '';
		this.refresh(box);
	},

	refresh(box, overlayGroup = this.overlayGroup) {
		this.overlayGroup = overlayGroup || this.overlayGroup;
		this.clear();
		if (!box || !this.overlayGroup) return;
		// TODO: Add face/corner handle meshes to overlayGroup for the selected interaction box.
		// TODO: Use the selected preview camera raycaster for hit testing handle meshes.
		// TODO: Convert handle world-space deltas back to Vintage Story 0..1 box coordinates.
		// TODO: Wrap drag begin/update/end in Undo lifecycle and reuse the numeric editor's dirty path.
		// TODO: Snap moved coordinates to the current grid increment when Blockbench snapping is enabled.
	},

	hitTest(event) {
		// TODO: Return the hovered handle descriptor after preview raycast integration.
		return null;
	},

	beginDrag(event, handle) {
		if (!handle) return false;
		this.dragState = {
			handle,
			startEvent: event,
			startBoxId: this.selectedBoxId
		};
		return true;
	},

	updateDrag(event) {
		if (!this.dragState) return false;
		this.dragState.lastEvent = event;
		// TODO: Apply the active handle delta to the selected interaction box.
		return false;
	},

	endDrag() {
		if (!this.dragState) return false;
		this.dragState = null;
		return true;
	},

	cancelDrag() {
		this.dragState = null;
	},

	clear() {
		this.handleObjects.forEach(object => {
			object.parent?.remove?.(object);
			object.geometry?.dispose?.();
			object.material?.dispose?.();
		});
		this.handleObjects = [];
	},

	dispose() {
		this.clear();
		this.overlayGroup = null;
		this.dragState = null;
		this.selectedBoxId = '';
	}
};

if (typeof window !== 'undefined') {
	window.VintageStoryInteractionBoxHandles = VintageStoryInteractionBoxHandles;
}
