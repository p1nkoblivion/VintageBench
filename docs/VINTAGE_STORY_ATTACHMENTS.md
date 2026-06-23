# Vintage Story Entity Attachments

Vintage Story item and block assets can define alternate shapes for entity attachment slots. These are item/block asset data, not shape JSON data. Vintage Bench keeps the main shape, attached shapes, and asset-owned attachment metadata separate.

## Files Inspected

- `js/vintagestory/vs_asset_resolver.js`: selected variant context, asset root shape resolution, and runtime resolved object generation.
- `js/vintagestory/vs_variant_resolver.js`: source-order ByType matching, wildcard matching, placeholder substitution, and runtime ByType object expansion.
- `js/vintagestory/vs_asset_workflow.js`: asset open, session metadata, and asset JSON writeback after shape save.
- `js/vintagestory/vs_asset_generator.js`: Save As Asset JSON generation and validation.
- `js/vintagestory/vs_interaction_boxes.js`: source-pointer and inherited-edit pattern reused for attachments.
- Local Vintage Story examples under `C:\Users\jorda\AppData\Roaming\Vintagestory\assets`, including `survival/itemtypes/tool/blade.json`, `survival/itemtypes/tool/bow.json`, `survival/itemtypes/wearable/animal/hooved.json`, and `survival/blocktypes/metal/lantern.json`.

## Supported Fields

The resolver supports these verified fields:

- `attributes.attachableToEntity`
- `attributes.attachableToEntityByType`
- `attributesByType["pattern"].attachableToEntity`
- `attributesByType["pattern"].attachableToEntityByType`
- `attachableToEntity.categoryCode`
- `attachableToEntity.categoryCodeByType`
- `attachableToEntity.attachedShapeBySlotCode`
- `attachableToEntity.attachedShapeBySlotCodeByType`
- `attachedShapeBySlotCode["slotCode"].base`

Unknown fields inside `attachableToEntity` and slot entries are preserved in the resolved value and writeback payload.

## Resolution

Vintage Bench resolves the selected variant first. Attachment data is then resolved using the same source-order ByType behavior used elsewhere in Vintage Story asset context:

1. Start with `attributes.attachableToEntity`, if present.
2. Overlay `attributes.attachableToEntityByType` when a key matches the selected variant.
3. Resolve `attributesByType` for the selected variant.
4. Overlay matched `attachableToEntity`.
5. Overlay matched nested `attachableToEntityByType`.
6. Resolve inner `categoryCodeByType` and `attachedShapeBySlotCodeByType`.
7. Substitute variant placeholders such as `{type}`, `{metal}`, or `{color}`.

Each resolved attachment keeps:

- selected variant code and states
- matched pattern
- whether the source is exact, wildcard, or fallback
- source pointer for writeback
- category code
- slot codes
- slot shape refs
- resolved attached shape paths
- missing shape warnings

## Attached Shape Paths

Slot shape references resolve through the same shape path resolver as main shapes. A slot ref such as:

```json
{ "base": "item/wearable/hooved/elk/weaponr-falx" }
```

resolves under:

```text
assets/<domain>/shapes/item/wearable/hooved/elk/weaponr-falx.json
```

Domain prefixes are respected. Missing attached shapes warn but do not crash.

## Entity Attachments Panel

The `Entity Attachments` panel appears when an asset context is open. It shows:

- selected variant
- current shape target
- matched attachment source
- `categoryCode`
- attached slots
- slot shape base paths
- resolved file paths
- missing-shape status

Actions:

- add slot
- remove slot
- choose shape file and convert it to an asset base path
- open attached shape
- create exact variant override
- edit shared rule intentionally
- delete exact override

## Opening Attached Shapes

`Open Attached Shape` loads the selected slot shape as the current editable model while keeping the parent asset context active. The session target becomes:

```text
Attached Shape: <slotCode>
```

Saving geometry writes to the attached shape JSON path. Attachment metadata still writes to the item/block asset JSON. Attachment data is never written into shape JSON.

## Exact vs Inherited Editing

If attachment data is inherited from a wildcard or fallback ByType rule, edits prompt before writeback:

- create exact override for the selected variant
- edit shared wildcard/fallback rule
- cancel

The default is to create an exact override so editing `attributesByType["*"]` or `attributesByType["blade-falx-*"]` does not silently affect other variants.

## Save As Asset

Save As Asset can generate starter attachment data:

- global `attributes.attachableToEntity`
- `attributesByType["*"].attachableToEntity`
- exact `attributesByType["variant"].attachableToEntity`

The wizard supports:

- category code
- slot code
- slot shape base path

It rejects absolute filesystem paths in generated asset JSON.

Example:

```json
{
	"code": "attachable",
	"attributesByType": {
		"*": {
			"attachableToEntity": {
				"categoryCode": "toolholding",
				"attachedShapeBySlotCode": {
					"frontrightside": { "base": "item/wearable/hooved/elk/weaponr-falx" }
				}
			}
		}
	}
}
```

## Validation

Warnings are added for:

- missing `categoryCode`
- empty slot code
- absolute filesystem path in slot shape reference
- empty slot shape path
- missing attached shape file
- ByType attachment pattern that matches no variants
- exact ByType key targeting skipped/disallowed variants
- wildcard/fallback rules affecting multiple variants

## Limitations

- Attached shape preview is standalone through the normal viewport; no bundled entity rig is included.
- Drag handles are intentionally out of scope for this pass.
- Unknown attachment fields are preserved but not all are edited through dedicated controls.
- The panel edits one resolved attachment context for the selected variant at a time.
