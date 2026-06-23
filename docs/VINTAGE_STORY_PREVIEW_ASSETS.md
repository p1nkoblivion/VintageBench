# Vintage Story Preview Assets

Modified for Vintage Bench on 2026-06-22: this document records the first local asset-path setup for Vintage Story display previews.

## Asset Policy

Vintage Story game assets are used as local references only in this pass. They are not copied into the Vintage Bench repository because redistribution permission was not confirmed during this work.

Vintage Bench should load preview assets from the user's local Vintage Story data folder. On Windows this is usually:

`C:\Users\<username>\AppData\Roaming\Vintagestory`

The first-launch setup asks the user for this folder and stores it in the `vintage_story_assets_path` setting. The prompt is shown once when no path has been configured. Users can update the path later in Settings > Preview.

## Required Preview References

Expected source paths under the selected Vintage Story folder:

- `assets/game/shapes/entity/humanoid/seraph.json` for the Seraph reference and attachment-slot marker preview
- `assets/survival/entities/nonliving/mannequin.json` for the armor stand entity reference, which resolves through `client.shape.base`
- `assets/survival/blocktypes/wood/mannequin.json` for the mannequin block reference
- `assets/survival/blocktypes/wood/displaycase.json`
- `assets/survival/blocktypes/wood/toolrack.json`
- `assets/survival/blocktypes/wood/moldrack.json`
- `assets/survival/blocktypes/wood/shelf.json`
- `assets/survival/blocktypes/wood/woodtyped/antlermount.json`
- `assets/survival/blocktypes/wood/woodtyped/scrollrack.json`
- `assets/survival/blocktypes/wood/trapcrate.json`
- `assets/survival/blocktypes/stone/generic/forge.json`
- `assets/survival/blocktypes/wood/table.json`
- `assets/survival/blocktypes/wood/firepit.json`
- `assets/survival/shapes/entity/humanoid/villageraccessories/held/tongsl.json`
- tongs item definitions under `assets/survival/itemtypes/tool/tongs*.json` for later texture/variant resolution

## Current Implementation State

This pass centralizes:

- `vintage_story_assets_path` setting and first-run folder prompt.
- `js/display_mode/vintage_story_preview_assets.js` asset metadata, root-contained local path resolution, JSON-like asset parsing, shape indirection, attachment-slot preview metadata, and texture resolution.
- `js/display_mode/vintage_story_asset_parser.js` conservative parser for shipped Vintage Story JSON-like files that use comments, unquoted keys, single-quoted strings, or trailing commas.
- Vintage Story display context metadata in `js/display_mode/vintage_story_display_transforms.js`.
- Local Vintage Story shape-to-preview conversion in `js/display_mode/display_mode.js`.

When a configured local asset resolves successfully, Vintage Bench builds a preview reference model from the resolved Vintage Story shape elements. Blocktype, itemtype, and entity files that point at a `shape.base` or `client.shape.base` are resolved into the matching `assets/<domain>/shapes/**/*.json` file.

Modified for Vintage Bench on 2026-06-22: preview texture lookup now follows the loaded shape data per face. Face values such as `#forge` and `#coal-dust` resolve through the shape's top-level `textures` map first, then fall back to texture maps supplied by the owning block/item/entity JSON. Shape-local texture paths resolve relative to the shape file's asset domain, so a shape at `assets/survival/shapes/block/stone/forge/forge.json` can correctly resolve `block/stone/forge/forge` and `block/stone/forge/coal-dust` under `assets/survival/textures/`.

Modified for Vintage Bench on 2026-06-22: preview shape conversion follows Vintage Story parent-child transform order. Each element applies `rotationOrigin`, rotation, scale, then `from - rotationOrigin`; child elements are parented below that translated anchor instead of being flattened as Blockbench-style sibling groups.

Missing local assets, unresolved shapes, or unresolved textures do not crash the Display editor. The UI continues to open with neutral placeholder geometry or neutral materials and shows a short warning for the first issue encountered.

Modified for Vintage Bench on 2026-06-23: Seraph, armor stand, mannequin, and attachment-slot previews load only from the user-selected Vintage Story asset root. Preview paths are resolved as candidates under that root; paths that would leave the configured root are ignored. No proprietary Vintage Story shape or texture files are bundled in the repository or copied into generated mods.

Attachment-slot preview uses the local Seraph shape's `attachmentpoints` data when it is available. Slot markers are editor-authored colored cuboids layered on the local Seraph reference. They do not move or export the user's current attached shape; the attached-shape viewport preview remains standalone for this pass.

Modified for Vintage Bench on 2026-06-22: GUI display previews use two bundled reference screenshots, `assets/inventory_full.png` and `assets/hud.png`. These are not copied Vintage Story shape or texture assets; they are calibration backdrops for the GUI item slot. The Display editor centers `guiTransform` on the blue highlighted slot in each image and scales the highlighted slot to 16 model units.

Current limitations:

- Shape variants are resolved with safe defaults such as `generic`, `complete`, `normal`, `wood`, `aged`, `square`, and firepit `extinct`; full Vintage Story variant/material resolution is not implemented yet.
- Animation poses, runtime attachment behavior, overlay textures, and renderer-specific effects are not previewed yet.
- GUI preview now aligns to the highlighted HUD and inventory slot backdrops, but final in-game camera, lighting, and raster-size matching still need validation.

## TODOs

- Add richer missing/unresolved asset warnings directly inside the Display panel.
- Add a developer-only cache folder for locally converted preview assets and keep it out of git.
- Add support for overlay texture composition and runtime renderer-specific material effects where the game uses more than plain face textures.
- Source exact vanilla default transform presets from live game/API behavior.
