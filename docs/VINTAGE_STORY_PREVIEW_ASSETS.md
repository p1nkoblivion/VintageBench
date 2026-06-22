# Vintage Story Preview Assets

Modified for Vintage Bench on 2026-06-22: this document records the first local asset-path setup for Vintage Story display previews.

## Asset Policy

Vintage Story game assets are used as local references only in this pass. They are not copied into the Vintage Bench repository because redistribution permission was not confirmed during this work.

Vintage Bench should load preview assets from the user's local Vintage Story data folder. On Windows this is usually:

`C:\Users\<username>\AppData\Roaming\Vintagestory`

The first-launch setup asks the user for this folder and stores it in the `vintage_story_assets_path` setting. The prompt is shown once when no path has been configured. Users can update the path later in Settings > Preview.

## Required Preview References

Expected source paths under the selected Vintage Story folder:

- `assets/game/shapes/entity/humanoid/seraph.json`
- `assets/survival/entities/nonliving/mannequin.json`
- `assets/survival/blocktypes/wood/mannequin.json`
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
- `js/display_mode/vintage_story_preview_assets.js` asset metadata and missing-file checks.
- Vintage Story display context metadata in `js/display_mode/vintage_story_display_transforms.js`.
- Safe placeholder preview holders in `js/display_mode/display_mode.js`.

Missing local assets do not crash the Display editor. The UI continues to open with placeholders and shows a short warning when an expected local asset is missing.

## TODOs

- Parse Vintage Story shape JSON for preview-only holders from the configured local path.
- Resolve texture paths through each loaded block/item/entity JSON file.
- Add a clear missing-asset warning in the Display editor.
- Add a developer-only cache folder for locally converted preview assets and keep it out of git.
