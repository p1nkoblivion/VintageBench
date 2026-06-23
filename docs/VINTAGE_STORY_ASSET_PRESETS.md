# Vintage Story Asset Presets

## Purpose

Asset presets are starter templates for common Vintage Story block and item JSON layouts. They sit on top of the existing Save As Asset, asset-context, ByType, display transform, interaction box, attachment, validation, and lang systems.

Presets do not replace the advanced JSON fields. They provide source-backed defaults for common cases, then let users inspect and edit the generated asset JSON before saving or patching an existing asset.

## Files Inspected

- `js/vintagestory/vs_asset_generator.js`: Save As Asset config parsing, generated JSON output, transform output, interaction boxes, attachments, and validation.
- `js/vintagestory/vs_save_as_asset_workflow.js`: dialog fields, live preview, save order, and file picker behavior.
- `js/vintagestory/vs_asset_resolver.js`: asset context, source pointers, root/attribute transform writeback, and vanilla asset write warnings.
- `js/vintagestory/vs_variant_resolver.js`: variant expansion, wildcard matching, and source-order ByType behavior.
- `js/display_mode/vintage_story_display_transforms.js`: verified transform context ids and asset JSON field locations.
- `js/vintagestory/vs_interaction_boxes.js`: verified root and behavior-level box fields.
- `js/vintagestory/vs_entity_attachments.js`: `attachableToEntity` resolution and writeback.
- `js/vintagestory/vs_asset_workspace.js`: mod root/domain folder mapping and asset path conversion.
- `docs/VINTAGE_STORY_SAVE_AS_ASSET.md`, `docs/VINTAGE_STORY_INTERACTION_BOXES.md`, and `docs/VINTAGE_STORY_ATTACHMENTS.md`.
- Installed Vintage Story examples under the local game asset root, including blade/tool, shield, paper/lore, flowerpot, wearable attachment, and firepit-related item assets.

## Architecture

Preset definitions live in `js/vintagestory/vs_asset_presets.js`.

Each preset declares:

- `id`
- label and description
- compatible asset types
- required fields
- generated fields
- optional transforms
- root field patch
- attributes patch
- behavior patch
- validation rules
- experimental status

The registry exports helpers for:

- Save As Asset preset select options
- Save As Asset form prefill patches
- generated asset post-processing
- existing asset patch creation
- patch preview and conflict detection
- preset-specific validation warnings

The Preset Library UI lives in `js/vintagestory/vs_asset_preset_workflow.js`. It is available from Save As Asset and from an open Vintage Story asset context.

## Preset Library

The Preset Library shows:

- preset name
- asset type compatibility
- tags
- required fields
- fields the preset writes
- warnings for experimental presets
- generated JSON preview for Save As Asset
- patch preview for existing assets

When patching an existing asset, conflicts are reported before applying. Existing values are preserved unless the user explicitly enables overwrite. Unknown fields are not removed.

## Presets

### Decorative Block

Asset type: block.

Writes:

- `shape` or `shapeByType` through the normal Save As Asset flow
- `textures` or `texturesByType` through the normal texture controls
- `creativeinventory`
- `collisionbox`
- `selectionbox`
- optional lang entry

Default interaction boxes are full block collision and selection boxes. Users can still switch to no collision, shape bounds, or custom interaction boxes.

### Decorative Item

Asset type: item.

Writes:

- shape and texture fields through Save As Asset
- `creativeinventory`
- `guiTransform` or `guiTransformByType`
- `groundTransform` or `groundTransformByType`
- `tpHandTransform` or `tpHandTransformByType`

For variants, transform maps use the existing transform mode. The default is a `*` fallback map.

### Shelfable / Display Case Item

Asset type: item.

Writes verified attributes:

- `attributes.shelvable`
- `attributes.displaycaseable`

Writes configured transforms when present:

- `attributes.onshelfTransform` or `attributes.onshelfTransformByType`
- `attributes.onDisplayTransform` or `attributes.onDisplayTransformByType`

More detailed `displayable` and display case sizing fields remain manual because they need extra domain-specific inputs.

### Tool Rack Item

Asset type: item.

Writes:

- `attributes.rackable`
- `attributes.toolrackTransform` or `attributes.toolrackTransformByType`

When applied to an existing selected variant, the patch uses the selected variant code for the transform key so wildcard/fallback rules are not silently changed.

### Ground Storable Item

Asset type: item.

Writes verified `GroundStorable` behavior data:

```json
{
	"name": "GroundStorable",
	"properties": {
		"layout": "Quadrants",
		"selectionBox": {"x1": 0, "y1": 0, "z1": 0, "x2": 1, "y2": 0.1, "z2": 1},
		"collisionBox": {"x1": 0, "y1": 0, "z1": 0, "x2": 0, "y2": 0, "z2": 0}
	}
}
```

Writes configured transform data when present:

- `attributes.groundStorageTransform` or `attributes.groundStorageTransformByType`

Existing GroundStorable properties are preserved. The preset does not overwrite behavior-level `selectionBox` or `collisionBox` conflicts without explicit overwrite in the patch workflow.

### Antler Mount Item

Asset type: item.

Writes:

- `attributes.antlerMountable`
- `attributes.onAntlerMountTransform` or `attributes.onAntlerMountTransformByType`

### Attachable Entity Item

Asset type: item.

Writes one of:

- `attributes.attachableToEntity`
- `attributesByType["*"].attachableToEntity`
- `attributesByType["variant"].attachableToEntity`

Supported fields:

- `categoryCode`
- `attachedShapeBySlotCode`
- slot `base` paths

Absolute filesystem paths are rejected. Slot shape paths must be Vintage Story shape base paths.

### Simple Tool

Asset type: item.

Writes verified fields when values are provided:

- `tool`
- `durabilitybytype`
- standard item display transforms
- optional rack/ground-storage transforms

The preset does not invent tool behavior fields. Extra gameplay fields can be added through Advanced JSON or Generic ByType Maps.

### Simple Weapon

Asset type: item.

Writes verified blade-style stat fields when values are provided:

- `tool`
- `durabilitybytype`
- `attackpowerbytype`
- `attackRangebytype`
- standard item display transforms
- optional rack transform

The preset does not force blade-specific behavior names, animations, tags, or material rules into every weapon.

### Firepit / Forge Item

Asset type: item.

Status: experimental.

The preset only enables verified firepit/forge transform targets in the UI. Complex `inFirePitProps`, `inFirePitPropsByType`, and forge/firepit gameplay fields remain manual until their full structure is represented by dedicated controls.

## ByType Behavior

Presets use the existing ByType systems:

- variants are generated by the shared variant resolver
- `*` fallback maps are used by default for new variant assets
- exact selected variant keys are used when patching an existing asset context
- wildcard/fallback entries are not silently changed
- users must explicitly choose overwrite for existing conflicting fields

## Save As Asset Integration

`Save As Asset` includes:

- a `Starter Preset` selector
- a `Start From Preset` button
- live generated JSON preview
- preset-specific warnings
- normal shape, asset, and lang save order

Preset metadata is internal to the editor. It is not exported into game asset JSON.

## Existing Asset Patch Integration

When an asset context is open, `Apply Vintage Story Preset` opens the same Preset Library in patch mode.

Patch mode:

- reads the selected asset object from the source item/block JSON
- builds a minimal patch
- previews added fields and conflicts
- preserves unknown fields
- preserves unrelated variants
- warns before writing configured vanilla game assets

ByType transform patches use the selected variant code when available.

## Validation

Preset-specific validation adds warnings for:

- missing preset-required transforms
- missing `GroundStorable` behavior after Ground Storable preset generation
- missing attachment `categoryCode`
- missing attachment slots
- missing simple tool durability
- missing simple weapon durability, attack power, or attack range
- experimental preset usage

These warnings appear in the existing Save As Asset preview and validation flow. Structural errors, such as absolute filesystem paths where asset base paths are required, remain blocking errors.

## Limitations

- Presets cover common starter assets, not every Vintage Story field.
- Advanced behavior properties remain manual unless their field names and structures are verified.
- Collision and selection box drag handles are intentionally not part of this pass.
- No proprietary Vintage Story preview rigs or assets are bundled.
- Generated type declarations remain ignored and regenerated by the project scripts.
- Existing asset patching applies one selected preset at a time.
