# Vintage Story Save As Asset

## Purpose

`Save As Asset` is a guided generator for creating a starter Vintage Story block or item asset JSON from the shape currently open in Vintage Bench.

Vintage Story shapes are only model geometry. Item and block asset JSON files own runtime context such as `code`, `variantgroups`, `shape`, `textures`, `texturesByType`, creative inventory, stack size, attributes, and display transforms. This workflow saves both files:

- the current shape JSON to a user-chosen `assets/<domain>/shapes/.../*.json` path
- a generated block/item asset JSON to a user-chosen `assets/<domain>/blocktypes/.../*.json` or `assets/<domain>/itemtypes/.../*.json` path

## Inspected Modules

- `js/formats/vintage_story_json.js`: current Vintage Story shape import/export flow and `compileVintageStoryShape`.
- `js/vintagestory/vs_asset_resolver.js`: asset roots, by-type resolution, path/domain handling, transform source pointers.
- `js/vintagestory/vs_variant_resolver.js`: variant expansion and wildcard behavior.
- `js/vintagestory/vs_asset_workflow.js`: Open Vintage Story Asset flow and project asset-context attachment.
- `js/display_mode/vintage_story_display_transforms.js`: display transform mapping and JSON serialization.
- `js/interface/form.ts`, `js/interface/dialog.ts`, `js/file_system.ts`: dialog fields and save-file picker behavior.
- `GuiDialogTransformEditor.cs`: confirmed root and attribute transform names exposed by the Vintage Story transform editor.
- Vintage Story runtime/source references confirmed storage/display flags under `attributes`: shelf, tool rack, mold rack, display case, bookshelf, scroll rack, antler mount, omok table, and crock placement.
- Installed Vintage Story asset examples inspected:
  - `blocktypes/clay/raw/flowerpot.json`: `attributes.shelvable`, `onshelfTransform`, `onTongTransform`, `displayable.shelf`, and placeholder texture paths such as `block/clay/{color}clay`.
  - `itemtypes/lore/paper.json`: `scrollrackable`, `displaycaseable`, `shelvable`, `groundStorageTransform`, `onscrollrackTransform`, and root hand/ground/gui transforms.
  - `itemtypes/lore/lore.json`: by-type attribute flags and shelf/scroll/ground storage transform maps.
  - `itemtypes/tool/shield.json`: `rackable`, `moldrackable`, `antlerMountable`, and rack/mold/antler transform maps.
  - `itemtypes/omokpiece.json`: `omokpiece` and `onOmokTransform`.

## Workflow

1. Open or create a Vintage Story shape.
2. Configure `File -> Vintage Story Workspace Settings` if the mod root/domain are not already known.
3. Choose `File -> Save As Asset`.
4. Fill in asset type, preset, domain, code, display name, shape save path, variants, textures, optional fields, and display transform options.
5. Review the live variant preview and generated JSON preview.
6. Click `Save`.
7. Choose the asset JSON save path.
8. Vintage Bench saves the shape first, then the asset JSON, then lang entries if enabled.
9. The generated asset context is attached to the current project so future display transform saves target the asset JSON.
10. Use `Export to Vintage Story Mod Workspace` when the asset should be copied into a full mod folder with `modinfo.json`, textures, lang entries, and optional packaging.

## Workspace Settings

Vintage Story asset paths are relative to `assets/<domain>/`, not the local filesystem. The workspace setup stores:

- Mod root
- Domain / modid
- Shapes folder
- Textures folder
- Blocktypes folder
- Itemtypes folder
- Lang folder
- Optional game asset root
- Optional additional asset roots

Given:

`assets/mycoolmod/shapes/block/clay/flowerpot.json`

the generated asset writes:

```json
{
	"shape": {"base": "block/clay/flowerpot"}
}
```

Given:

`assets/mycoolmod/textures/block/clay/redclay.png`

the generated texture reference writes:

```json
{
	"base": "block/clay/redclay"
}
```

## Shape Path

The shape path must resolve to a Vintage Story asset base path. For example:

`assets/mycoolmod/shapes/block/clay/flowerpot.json`

becomes:

```json
{
	"shape": {"base": "block/clay/flowerpot"}
}
```

No absolute filesystem paths are written into generated asset JSON. Shape base fields also reject Windows backslashes, `..` path traversal, and `assets/<domain>/shapes` filesystem-style prefixes. If the selected shape path is outside `assets/<domain>/shapes`, the dialog reports a blocking validation error before writing.

## Interaction Boxes

Blocks and some item behaviors store collision and selection data in item/block asset JSON, not in shape JSON. The generator can include starter interaction boxes:

- Do not include
- Full block collision + selection
- No collision
- Use current shape bounds
- Use Interaction Boxes panel

`Use current shape bounds` converts the current 16-unit model bounds into Vintage Story `0..1` block-space box coordinates. `Use Interaction Boxes panel` writes configured root boxes to the generated asset and writes behavior boxes only when the target behavior exists in the generated asset.

For `GroundStorable` behavior boxes, the generator can add the behavior when it is missing:

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

The behavior target policy offers:

- Add `GroundStorable` if missing.
- Use an existing behavior only.
- Keep behavior boxes editor-only.

Only verified `GroundStorable` preset fields are exposed: `layout`, `ctrlKey`, `selectionBox`, and `collisionBox`. Existing behavior properties are preserved. Existing `selectionBox` or `collisionBox` values are not overwritten by custom panel boxes; the preview warns and skips that write.

## Asset Path

The asset JSON save dialog suggests:

- blocks: `assets/<domain>/blocktypes/<code>.json`
- items: `assets/<domain>/itemtypes/<code>.json`

Existing files and configured vanilla game-asset paths require explicit confirmation before writing.

Asset save targets are validated before writing: block assets must be under `assets/<domain>/blocktypes`, item assets must be under `assets/<domain>/itemtypes`, and generated lang files must be under `assets/<domain>/lang`.

## Variants

Variant groups are entered one per line:

```text
color: red, blue, fire
size: small, large
```

The generator uses the existing Vintage Story variant resolver so preview codes follow the same expansion logic used by asset-context loading.

`Allowed Variants` and `Skip Variants` are stored as `allowedVariants` and `skipVariants`. The preview table shows every generated variant, its state values, and whether it is included, skipped, or not allowed.

## Textures

### Use Model Defaults

Texture aliases are written as a `textures` object when a Vintage Story asset path is known:

```json
{
	"textures": {
		"outside": {"base": "block/clay/redclay"}
	}
}
```

Aliases are preserved without the leading `#`.

### Define By Type

Entries use this compact format:

```text
* | outside | block/clay/{color}clay
flowerpot-red | outside | block/clay/redclay
```

Generated output:

```json
{
	"texturesByType": {
		"*": {
			"outside": {"base": "block/clay/{color}clay"}
		}
	}
}
```

Placeholders such as `{color}`, `{type}`, and `{metal}` are preserved for Vintage Story to resolve by variant state.

Texture bases are validated as Vintage Story asset base paths and resolve under `assets/<domain>/textures`. They are not shape paths, even when the base string looks similar to a shape base.

Asset-context sessions can also use the Texture Manager panel to relink missing texture aliases, copy texture files into the workspace, and convert workspace files to Vintage Story asset-base paths. Relinking a shape default creates an item/block `textures` override; relinking an inherited `texturesByType` fallback creates an exact selected-variant override unless the shared rule is explicitly selected.

## Shape Alternatives

The direct `shape` field can include Vintage Story `shape.alternates` entries for item-state visuals such as bow charge states. Save As Asset accepts one alternate base per line, and asset-context sessions expose them in the Shape Alternatives panel.

The panel can:

- list resolved alternates for the selected variant
- open an alternate shape JSON
- create a new alternate shape file from the current model
- add the new alternate to the owning item/block asset
- warn when an alternate base does not resolve under `assets/<domain>/shapes`

When an alternate shape is opened, normal shape save/export targets that alternate shape file instead of the main shape.

## Optional Fields

Supported starter fields:

- `maxStackSize`
- `creativeinventory`
- `creativeinventoryByType`
- `class`
- `entityclass`
- `behaviors`
- `attributes.shelvable`
  - `true`
  - `"Halves"`
  - `"SingleCenter"`
- `attributes.rackable`
- `attributes.moldrackable`
- `attributes.displaycaseable`
- `attributes.bookshelveable`
- `attributes.scrollrackable`
- `attributes.antlerMountable`
- `attributes.omokpiece`
- `attributes.crockable`

The generator intentionally does not invent unverified behavior fields.
By-type attribute flags such as `bookshelveableByType` exist in vanilla assets, but this starter generator does not author those yet.
Structured display attributes such as `attributes.displayable.shelf` and `attributes.displaycase.minHeight` are also real Vintage Story fields; they need size/category/min-height inputs and remain manual for this pass.

## Presets

Starter presets can turn on verified groups of fields without requiring users to know every attribute name. Current presets include:

- Decorative Block
- Decorative Item
- Shelfable Item
- Display Case Item
- Rackable / Tool Rack Item
- Ground Storable Item
- Antler Mount Item
- Firepit Item
- Simple Tool
- Simple Weapon
- Attachable Entity Item

Presets only generate source-backed fields. Advanced behavior details can be supplied in the behavior JSON or advanced extras fields.
Preset behavior, patching rules, and validation are documented in `docs/VINTAGE_STORY_ASSET_PRESETS.md`.

## Mod Workspace Export

Save As Asset creates the shape and item/block asset files. The separate mod export workflow copies the active asset context into a complete Vintage Story mod workspace and can package it as a zip. See `docs/VINTAGE_STORY_MOD_EXPORT_PACKAGING.md`.

## Generic ByType Maps

The `Advanced ByType Maps` field supports reusable Vintage Story by-type authoring:

```text
attackpowerbytype | *-copper | 3.75
durabilitybytype | *-steel | 2125
attributes.inFirePitPropsByType | *-raw | { transform: { scale: 0.9 } }
```

The left side is the exact field path to create, the middle is the exact/wildcard pattern, and the right side is a relaxed Vintage Story JSON value.

## Advanced JSON

The generator includes controlled advanced fields:

- Root extras JSON
- Attributes extras JSON
- Behaviors JSON

These fields are for valid Vintage Story fields that do not yet have polished controls, such as tool stats, firepit props, custom behavior properties, or complex displayable metadata.

## Lang Entries

Save As Asset can update or create `assets/<domain>/lang/<language>.json`.

For a block:

```json
{
	"block-flowerpot": "Flower Pot"
}
```

For an item:

```json
{
	"item-simplewand": "Simple Wand"
}
```

For variants, the generator can create one starter entry per included variant, such as `block-flowerpot-red`.

## Display Transforms

The workflow can include current Display editor transforms in the asset JSON. Each transform type has its own checkbox so users can include only the placements they have intentionally configured.

Root-owned transform fields:

- `guiTransform`
- `fpHandTransform`
- `tpHandTransform`
- `tpOffHandTransform`
- `groundTransform`

Attribute-owned transform fields:

- `attributes.toolrackTransform`
- `attributes.onmoldrackTransform`
- `attributes.onDisplayTransform`
- `attributes.groundStorageTransform`
- `attributes.onshelfTransform`
- `attributes.onscrollrackTransform`
- `attributes.onAntlerMountTransform`
- `attributes.onTongTransform`
- `attributes.inTrapTransform`
- `attributes.inForgeTransform`
- `attributes.onOmokTransform`
- `attributes.infirepitTransform`
- `attributes.inFirePitProps.transform`

Without variants, transforms can be written as direct fields:

```json
{
	"guiTransform": {
		"translation": {"x": 0, "y": 0, "z": 0},
		"scale": 1.25
	}
}
```

With variants, the default is `*ByType` with a `*` fallback:

```json
{
	"guiTransformByType": {
		"*": {
			"translation": {"x": 0, "y": 0, "z": 0},
			"scale": 1.25
		}
	}
}
```

Attribute-owned transforms are written under `attributes`, for example:

```json
{
	"attributes": {
		"toolrackTransformByType": {
			"*": {"scale": 0.75}
		}
	}
}
```

Nested attribute-owned transforms keep their surrounding property object intact, for example:

```json
{
	"attributes": {
		"inFirePitPropsByType": {
			"*": {
				"transform": {"scale": 0.9}
			}
		}
	}
}
```

First-person main hand writes the real root `fpHandTransform` or `fpHandTransformByType` key. First-person offhand remains an editor alias for `fpHandTransform` because Vintage Story does not expose a separate first-person offhand JSON key in the inspected sources.

## Flowerpot Example

Input:

- Block
- Code: `flowerpot`
- Variant group: `color: red, blue, fire`
- Max Stack Size: `64`
- Creative inventory: `general: *`
- Texture Mode: Define By Type
- Texture alias: `outside`
- Texture base: `block/clay/{color}clay`

Output:

```json
{
	"code": "flowerpot",
	"variantgroups": [
		{"code": "color", "states": ["red", "blue", "fire"]}
	],
	"shape": {"base": "block/clay/flowerpot"},
	"texturesByType": {
		"*": {
			"outside": {"base": "block/clay/{color}clay"}
		}
	},
	"maxStackSize": 64,
	"creativeinventory": {
		"general": ["*"]
	}
}
```

## Limitations

- One current shape is saved and referenced. Variant-specific shape files are a later pass.
- Complex behavior authoring has an advanced JSON list, but not dedicated per-behavior forms.
- Complex `creativeinventoryStacks` generation is not included.
- Texture picking is path-based; unresolved aliases can be relinked or copied into the workspace with the Texture Manager.
- The output is normalized JSON, not formatting-preserving relaxed JSON.
- Visual collision/selection box editing is handled by the Interaction Boxes panel with numeric fields, overlays, and selected-box drag handles.
- Shape alternates are listed/opened/created, but there is no full item-state animation timeline yet.
