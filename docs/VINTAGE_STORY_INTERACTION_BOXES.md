# Vintage Story Interaction Boxes

## Purpose

Vintage Story shape JSON defines visual cuboid geometry. Collision, selection, and combined interaction boxes are item/block asset behavior data. Vintage Bench keeps these boxes in asset context and does not write them into shape JSON.

The Interaction Boxes panel is a visual editor for these asset-owned boxes. It imports boxes when a Vintage Story asset variant is opened, renders non-exported viewport overlays, lets users edit numeric bounds, and writes changes back to the item/block asset JSON.

## Files Inspected

- `js/vintagestory/vs_asset_resolver.js`: variant context, ByType resolution, source pointers.
- `js/vintagestory/vs_asset_workflow.js`: asset-context attachment and asset JSON writeback.
- `js/vintagestory/vs_variant_resolver.js`: wildcard and variant expansion behavior.
- `js/vintagestory/vs_asset_generator.js`: Save As Asset output and validation.
- `js/vintagestory/vs_interaction_box_handles.js`: drag-handle lifecycle extension point.
- `js/formats/vintage_story_json.js`: shape save flow and asset writeback hook.
- `js/display_mode/display_mode.js`: panel registration and viewport object patterns.
- Installed Vintage Story examples:
  - `blocktypes/mechanics/angledgears.json`: `collisionSelectionBoxesByType`.
  - `blocktypes/legacy/crate.json`: `collisionboxesByType` and `selectionboxesByType`.
  - `blocktypes/glass/pane.json`: lowercase legacy `collisionselectionboxByType`.
  - `itemtypes/tool/blade.json`: `GroundStorable` behavior `selectionBox` and `collisionBox`.

## Supported Fields

Root block fields:

- `collisionbox`
- `collisionboxes`
- `collisionboxByType` plus case variants found in vanilla assets
- `collisionboxesByType` plus case variants found in vanilla assets
- `selectionbox`
- `selectionboxes`
- `selectionboxByType` plus case variants found in vanilla assets
- `selectionboxesByType` plus case variants found in vanilla assets
- `collisionSelectionBox`
- `collisionSelectionBoxes`
- `collisionSelectionBoxByType`
- `collisionSelectionBoxesByType`
- lowercase legacy combined-box spellings found in vanilla assets

Behavior property fields:

- `behaviors[].properties.selectionBox`
- `behaviors[].properties.collisionBox`
- `behaviors[].properties.selectionBoxes`
- `behaviors[].properties.collisionBoxes`
- matching `*ByType` variants where present

The resolver preserves the exact key casing from the source file when writing back.

## Data Model

Each resolved box stores:

- owner kind: root or behavior
- owner path, such as `root` or `behaviors[0].properties`
- family and source field key
- selected variant code
- matched ByType pattern
- exact, inherited, and fallback flags
- array index for multi-box fields
- source pointer for writeback
- box value
- validation warnings

Box coordinates are Vintage Story block-space values, usually `0..1`, not 16-unit shape-space values.

## ByType Editing

ByType maps use the existing Vintage Story resolver behavior: first matching wildcard/source-order entry wins.

If a selected variant resolves from an exact ByType key, editing updates that exact key.

If a selected variant resolves from a wildcard or `*` fallback, editing defaults to creating an exact override for the selected variant. The shared rule is not edited unless the user chooses **Edit Shared Rule**.

Example:

```json
selectionboxByType: {
	"*": { "x1": 0, "y1": 0, "z1": 0, "x2": 1, "y2": 0.5, "z2": 1 }
}
```

Editing `flowerpot-red` creates:

```json
selectionboxByType: {
	"*": { "x1": 0, "y1": 0, "z1": 0, "x2": 1, "y2": 0.5, "z2": 1 },
	"flowerpot-red": { "x1": 0.1, "y1": 0, "z1": 0.1, "x2": 0.9, "y2": 0.45, "z2": 0.9 }
}
```

Array-valued inherited boxes copy the full inherited array before applying the edited array index, avoiding sparse JSON arrays.

## Panel Behavior

The panel provides:

- Box list with source labels.
- Overlay visibility toggle.
- Add, duplicate, and delete box actions.
- Root targets for collision, selection, and combined boxes.
- Ground Storage Selection and Ground Storage Collision targets for `GroundStorable`.
- Full Block helper.
- No Collision helper.
- From Shape Bounds helper with apply-to-selected/collision/selection/both choices.
- Copy Collision To Selection.
- Copy Selection To Collision.
- Numeric editing for `x1`, `y1`, `z1`, `x2`, `y2`, `z2`.
- Optional numeric `rotateX`, `rotateY`, and `rotateZ`.
- Create Override, Edit Shared Rule, and Delete Override actions for ByType sources.

Viewport overlays are Three.js line boxes marked `no_export`. They are visual aids only and are not shape elements.

Drag handles are not active yet. `vs_interaction_box_handles.js` now owns selected-box handle state, hit-test stubs, drag lifecycle stubs, and TODOs for raycasting, block-space delta conversion, snapping, and Undo integration. The panel text says numeric editing is active and drag handles are planned.

## Save Behavior

Regular shape save writes:

- current shape geometry to the resolved shape JSON
- dirty display transforms to the source item/block JSON
- dirty interaction boxes to the source item/block JSON

Interaction boxes are never written to shape JSON.

If the source item/block file is under the configured Vintage Story game asset root, Vintage Bench asks before overwriting it.

Unknown fields and unrelated asset fields are preserved by parsing the existing asset document, patching the source pointer location, and serializing the updated document.

## Save As Asset

Save As Asset can include starter interaction boxes:

- Do not include
- Full block collision + selection
- No collision
- Use current shape bounds
- Use Interaction Boxes panel

For `Use current shape bounds`, Vintage Bench converts current model bounds from 16-unit shape space to Vintage Story `0..1` block space.

For `Use Interaction Boxes panel`, root boxes are written to the generated asset. Ground Storage Selection and Ground Storage Collision boxes target:

```json
{
	"name": "GroundStorable",
	"properties": {
		"selectionBox": {"x1": 0, "y1": 0, "z1": 0, "x2": 1, "y2": 0.1, "z2": 1},
		"collisionBox": {"x1": 0, "y1": 0, "z1": 0, "x2": 0, "y2": 0, "z2": 0}
	}
}
```

If the generated asset does not already contain `GroundStorable`, Save As Asset can add it automatically. The generated behavior may include verified `layout` values (`Quadrants`, `SingleCenter`, `Halves`, `WallHalves`, `Messy12`) and verified `ctrlKey: true`. Existing `GroundStorable` properties are preserved. Existing `selectionBox` or `collisionBox` values are not overwritten; the preview shows a warning and the conflicting panel box is skipped.

## Validation

Warnings include:

- missing box coordinate fields
- `x1 > x2`, `y1 > y2`, or `z1 > z2`
- zero-size boxes
- values outside the usual `0..1` range
- values far outside normal block space
- ByType patterns that match no variants
- exact ByType patterns targeting skipped/disallowed variants
- wildcard/fallback ByType rules that affect multiple variants
- GroundStorable behavior with missing `selectionBox` or `collisionBox`
- behavior-level panel box whose target behavior is missing
- interaction box fields found in raw shape JSON
- disabled collision with full-cube selection
- multiple collision boxes without selection boxes
- behavior box source pointer without a matching behavior in Save As Asset generation

Warnings do not block editing unless a save workflow separately requires confirmation.

## Limitations

- Drag handles are architecture-only in this pass; numeric editing and visual overlays are implemented.
- Variant object inline fields are not separately edited yet.
- Behavior boxes are supported when they can be addressed through source pointers. Automatic missing-behavior creation is intentionally limited to verified `GroundStorable` selection/collision boxes.
- Formatting and comments are not preserved on item/block asset writeback; files are serialized as normalized JSON.
