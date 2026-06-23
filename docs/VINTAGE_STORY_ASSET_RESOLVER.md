# Vintage Story Asset Resolver

Vintage Story shape JSON files are only geometry assets. Items and blocks usually carry the runtime context that decides which shape is used, which texture aliases override the shape defaults, and which display transforms apply. Vintage Bench therefore has two Vintage Story open modes:

- Raw shape JSON: opens geometry directly and warns that display transforms usually need item/block asset context.
- Vintage Story asset JSON: opens an item/block definition, resolves a concrete variant, then opens the resolved shape with item/block texture and transform context attached.

## Asset Context Workflow

Use **Open Vintage Story Asset** for item/block files under `assets/<domain>/itemtypes` or `assets/<domain>/blocktypes`.

The workflow is:

1. Parse the asset JSON with the relaxed Vintage Story parser.
2. If the file contains multiple asset objects, ask which object to use.
3. Expand the asset `variantgroups`.
4. Show a variant chooser table.
5. Resolve the selected variant's shape, textures, display transforms, and source pointers.
6. Open the resolved shape JSON as the editable model.
7. Attach the selected item/block context to the project.

The variant chooser includes **Open without textures** next to the skipped/not allowed variant toggle. This still resolves the selected shape and transforms, but it does not import item/block texture overrides or try to load texture image files. Use this when a mod asset references texture domains that are not installed locally.

## JSON Parsing And Save Format

The parser accepts the relaxed style used by many Vintage Story assets: comments, trailing commas, single-quoted strings, unquoted object keys, and leading decimal literals.

Unknown fields are preserved in the parsed object and unaffected fields are kept when transform writeback runs. Formatting and comments are not currently preserved on writeback. Item/block files edited by Vintage Bench are serialized as normalized JSON.

## Variant Expansion

Variant expansion follows the Vintage Story source path used by `ModRegistryObjectTypeLoader` and `ResolvedVariant`:

- Variant group code parts are appended to the base asset code.
- Empty parts are skipped.
- Multiply groups are combined with the first group cycling fastest.
- Add groups create standalone variants.
- Selective multiply groups are supported for explicit `states`.
- `skipVariants` is applied before `allowedVariants`.
- `allowedVariants` keeps only matching variants when present.

`loadFromProperties` variant groups are detected and warned about, but this pass resolves explicit state lists only.

## By-Type Resolution

Vintage Bench resolves every `*ByType` map through the same core resolver:

- Exact keys matching the full concrete variant path win over wildcard keys.
- Wildcard keys use deterministic, case-insensitive `*` matching.
- More specific wildcard keys win over less specific wildcard keys.
- `*` is the fallback when no exact or more-specific wildcard key matches.
- Source order is used only as the deterministic tie-breaker for equally specific patterns.
- Keys starting with `@` are treated as regular expressions.

This applies to:

- `shapeByType`
- `texturesByType`
- `creativeinventoryByType`
- `attributesByType`
- `collisionboxByType`
- `collisionboxesByType`
- `selectionboxByType`
- `selectionboxesByType`
- `collisionSelectionBoxesByType`
- `rotateYByType`
- `guiTransformByType`
- `groundTransformByType`
- `tpHandTransformByType`
- `tpOffHandTransformByType`
- `fpHandTransformByType`
- `toolrackTransformByType`
- lowercase maps such as `attackpowerbytype`, `durabilitybytype`, and `tooltierbytype`
- `attributes.*TransformByType`
- nested transform maps such as `attributes.inFirePitPropsByType["pattern"].transform`
- custom or unknown `*ByType` maps handled by the generic resolver

Resolved asset variants include generic `byTypeSources` entries for matched maps. Each entry preserves the source map path, matched source path, target path, matched pattern, source index, and exact/inherited/fallback flags so named and custom maps keep addressable provenance.

Path variables such as `{type}` and `{metal}` are substituted from the selected variant states.

## Shape Resolution

Shape references are resolved from `shapeByType`, `shape`, `client.shapeByType`, `client.shape`, `shapeInventoryByType`, or `shapeInventory`.

Shape refs must be Vintage Story asset base paths, not filesystem paths. Absolute paths, Windows backslashes, empty path segments, and `..` traversal segments are invalid. Shape refs are always mapped under:

`<asset-root>/assets/<domain>/shapes/<base>.json`

`shape.alternates` entries are imported for the selected variant and validated against the same shapes folder. Missing alternates warn with their exact `shape.alternates[index]` JSON path. The Shape Alternatives panel can open an existing alternate shape or create a new alternate shape file from the current model and add it to the owning item/block asset.

The resolver searches asset roots in this order:

1. The current source file's asset root.
2. Configured mod/workspace asset root.
3. Configured additional asset roots.
4. Configured Vintage Story game asset root.

Shape base `item/tool/blade/falx` resolves to:

`<asset-root>/assets/<domain>/shapes/item/tool/blade/falx.json`

Domain-prefixed references such as `survival:item/tool/blade/falx` use the explicit domain.

Missing shapes produce warnings and do not crash the open flow.

## Texture Resolution

Texture aliases are collected from:

- Shape `textures`
- Shape face references such as `#falxblade`
- Item/block `textures`
- The selected item/block `texturesByType` entry

Direct item/block `textures` are merged with the selected `texturesByType` entry. Source pointers still track whether each alias came from `textures`, `texturesByType`, or the shape.

Texture paths resolve under:

`<asset-root>/assets/<domain>/textures/<base>.png`

Texture refs use the same asset-base safety rules as shape refs, but they resolve under `textures`, never `shapes`. Identical-looking base strings such as `block/clay/redclay` are kept separate by the resolver folder argument.

Unprefixed texture refs use the current asset object's domain. For a vanilla survival block opened from `assets/survival/blocktypes`, `block/clay/{color}clay` resolves under `assets/survival/textures`. For a mod asset opened from `assets/blushandbins`, the same unprefixed path resolves under `assets/blushandbins/textures`. Cross-domain refs must include the domain, such as `game:block/clay/{color}clay` or `blushlibrary:block/clay/{color}clay`.

CompositeTexture object refs are valid path-bearing refs:

```json
textures: {
  ceramic: { base: "block/clay/{color}clay" },
  label: { base: "block/transparent" }
}
```

The resolver substitutes variant placeholders before path lookup, so the blue variant resolves `block/clay/{color}clay` to `block/clay/blueclay`.

`.png`, `.jpg`, and `.jpeg` are checked. Missing texture files warn but do not block opening the model. A shape face reference such as `#blade` also warns when neither shape `textures`, root `textures`, nor selected `texturesByType` defines `blade`.

The Texture Manager panel lists the selected variant's resolved aliases and separates:

- Shape alias defaults
- Item/block `textures` overrides
- Item/block `texturesByType` overrides
- Missing aliases referenced by faces

Relinking a shape-owned alias writes an item/block `textures` override. Relinking an inherited `texturesByType` value creates an exact selected-variant override by default. Editing the shared wildcard or fallback rule requires choosing `Edit Shared Rule`.

## Transform Source Pointers

Every resolved transform keeps enough information for patch-safe writeback:

- Source file path
- Source object index
- Transform family path
- JSON key
- Matched by-type key
- Selected variant key
- Whether the value is exact or inherited
- Whether the matched rule was the `*` fallback
- Whether the source is under root or `attributes`

Examples:

- `root.guiTransformByType["blade-claymore-ruined"]`
- `root.groundTransformByType["*"]`
- `root.attributes.toolrackTransformByType["blade-blackguard-iron"]`
- `root.attributes.onAntlerMountTransformByType["*"]`

## Exact Vs Inherited Editing

When a transform resolves from an exact selected variant key, editing updates that exact key.

When a transform resolves from a wildcard or fallback rule, Vintage Bench does not silently edit the shared rule. The Display panel shows the source and offers:

- Create Variant Override
- Edit Shared Rule
- Delete Variant Override, when an exact override exists

The default mutation path for an inherited transform is a new key for the selected variant, for example:

`guiTransformByType["blade-falx-copper"]`

The inherited `*` or wildcard rule remains unchanged unless the user explicitly chooses to edit the shared rule.

## Save Behavior

Saving a Vintage Story asset-context session writes:

- Shape geometry to the resolved shape JSON.
- Alternate shape geometry to the opened alternate shape JSON.
- Display transform edits to the source item/block JSON.
- Shape alternate list edits to the source item/block JSON.
- Texture relinks and overrides to the source item/block JSON.

Display transforms are not written to shape JSON during asset-context saves.

Item/block-owned texture overrides are imported for preview and managed by the Texture Manager. Asset-context shape saves preserve the original shape `textures` and `textureSizes` entries instead of copying item/block texture overrides into the shape file.

If the item/block source file is under the configured Vintage Story game asset root, Vintage Bench warns before overwriting it. A later pass should add a fuller "Save As / Copy To Mod Workspace" flow for vanilla assets.

Save and export paths are folder-checked before writing:

- shapes must target `assets/<domain>/shapes`
- item assets must target `assets/<domain>/itemtypes`
- block assets must target `assets/<domain>/blocktypes`
- textures must target `assets/<domain>/textures`
- lang files must target `assets/<domain>/lang`

Generated asset JSON is rejected if any string contains an absolute filesystem path, a Windows backslash, or a path traversal segment.

## Raw Shape Mode

Opening a shape JSON directly still works for geometry editing. The Display panel shows:

> Display transforms are usually stored on item/block asset files, not on shape files. Open a Vintage Story item/block asset to edit display transforms in context.

A future pass can add asset-root search for "Find item/block assets that reference this shape".

## Limitations And TODOs

- `loadFromProperties` variant groups are warned about but not expanded.
- Formatting and comments are normalized on item/block writeback.
- Vanilla asset "copy to mod workspace" is warned about but not automated.
- The variant chooser resolves every row for accurate warnings; very large variant sets may need lazy resolution later.
