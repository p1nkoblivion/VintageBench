# Vintage Story Display Transforms

Modified for Vintage Bench on 2026-06-22: this document records the first Vintage Story display transform pass for the Blockbench fork.

## Files Inspected

- `js/display_mode/display_mode.js`
- `js/display_mode/DisplayModePanel.vue`
- `js/display_mode/display_references.ts`
- `js/formats/vintage_story_json.js`
- `js/io/project.ts`
- `C:\Users\jorda\OneDrive\Desktop\decompiles\VintagestoryLib\Vintagestory\Client\NoObf\GuiDialogTransformEditor.cs`
- `C:\Users\jorda\OneDrive\Desktop\decompiles\VintagestoryLib\Vintagestory\Client\NoObf\InventoryItemRenderer.cs`
- `C:\Users\jorda\AppData\Roaming\Vintagestory\assets\game\lang\en.json`
- Selected vanilla assets under `C:\Users\jorda\AppData\Roaming\Vintagestory\assets\survival`

## Current Display Editor Architecture

Blockbench keeps display transforms in `Project.display_settings`, keyed by display slot id. `DisplaySlot` now carries the Vintage Story-editable fields `rotation`, `translation`, `origin`, and uniform `scale` for the active Vintage Bench workflow. Legacy pivot fields remain on the class only for compatibility with older untouched modules and are not exposed in the Vintage Story Display panel.

The Display panel is `DisplayModePanel.vue`; slot switching, reference model switching, live preview transforms, presets, and the Display mode registration live in `display_mode.js`. The active UI has been replaced with Vintage Story sections and no longer exposes Minecraft-style left/right hand labels, head/frame slots, per-axis display scale, Java GUI light, or shelf-center behavior.

The Vintage Story JSON codec imports root transform keys and `attributes` transform keys into `Project.display_settings`, and export re-emits them through `js/display_mode/vintage_story_display_transforms.js`.

## Vintage Story Transform Editor Findings

The game transform editor uses `ModelTransform` values with these JSON fields:

- `translation: { x, y, z }`
- `rotation: { x, y, z }`
- `origin: { x, y, z }`
- `scale: number`
- `scaleXyz: { x, y, z }` only when the transform is non-uniform

The in-game editor exposes translation X/Y/Z, origin X/Y/Z, rotation X/Y/Z, uniform scale, and an X-axis flip. Its scale slider uses 25 to 600 percent. The editor writes only fields that differ from the default transform for the selected target.

Built-in transform keys found in `GuiDialogTransformEditor.cs`:

- `guiTransform`
- `fpHandTransform`
- `tpHandTransform`
- `tpOffHandTransform`
- `groundTransform`

Additional transform keys are stored under collectible/block `attributes`:

- `toolrackTransform`
- `onmoldrackTransform`
- `onDisplayTransform`
- `groundStorageTransform`
- `onshelfTransform`
- `onscrollrackTransform`
- `onAntlerMountTransform`
- `onTongTransform`
- `inTrapTransform`
- `inForgeTransform`
- `onOmokTransform`
- `infirepitTransform`

`InventoryItemRenderer.cs` confirms GUI, ground, third-person main hand, and third-person offhand render targets. It uses `TpOffHandTransform` for `HandTpOff`, falling back to `TpHandTransform`. `fpHandTransform` exists on collectible/block data, but no separate first-person offhand JSON key was found in the inspected game source.

## Vintage Story Display Structure

Vintage Bench should organize display contexts as:

- Hands
- Ground
- Shelf / Rack
- GUI
- Entity / Armor
- Other

UI label to JSON mapping:

| UI label | Internal slot | JSON location |
| --- | --- | --- |
| Thirdperson Mainhand | `tpHandTransform` | root `tpHandTransform` |
| Thirdperson Offhand | `tpOffHandTransform` | root `tpOffHandTransform` |
| Firstperson Mainhand | `fpHandTransform` | root `fpHandTransform` |
| Firstperson Offhand | `fpOffHandTransform` | aliases root `fpHandTransform`; no separate game key found |
| On tongs | `onTongTransform` | `attributes.onTongTransform` |
| Ground | `groundTransform` | root `groundTransform` |
| Placed on ground | `groundStorageTransform` | `attributes.groundStorageTransform` |
| On antler mount | `onAntlerMountTransform` | `attributes.onAntlerMountTransform` |
| On tool rack | `toolrackTransform` | `attributes.toolrackTransform` |
| On vertical rack | `onmoldrackTransform` | `attributes.onmoldrackTransform` |
| In display case | `onDisplayTransform` | `attributes.onDisplayTransform` |
| On shelf | `onshelfTransform` | `attributes.onshelfTransform` |
| On scroll rack | `onscrollrackTransform` | `attributes.onscrollrackTransform` |
| GUI | `guiTransform` | root `guiTransform` |
| Seraph preview | `seraphPreviewTransform` | preview-only TODO; no JSON key written |
| Armor stand preview | `armorStandPreviewTransform` | preview-only TODO; no JSON key written |
| Mannequin preview | `mannequinPreviewTransform` | preview-only TODO; no JSON key written |
| In traps | `inTrapTransform` | `attributes.inTrapTransform` |
| In forge | `inForgeTransform` | `attributes.inForgeTransform` |
| On omak tabletop | `onOmokTransform` | `attributes.onOmokTransform` |
| In firepit | `infirepitTransform` | `attributes.infirepitTransform` |

## Defaults

For this pass, default editable values are neutral unless imported data or a later sourced preset is available:

- `translation`: `[0, 0, 0]`
- `rotation`: `[0, 0, 0]`
- `origin`: `[0, 0, 0]`
- `scale`: `1`

The game has block/item default transform methods such as `BlockDefaultGui`, `ItemDefaultGui`, `BlockDefaultTp`, and `ItemDefaultTp`, but their method bodies were not available in the inspected decompile. TODO: derive exact default presets from API docs or a live game export pass.

## Import/Export Behavior

Root transform keys are imported into `Project.display_settings`. Attribute transform keys are imported from `root.attributes`. Unknown fields inside a transform object are preserved on the slot and re-emitted. `scaleXyz` imports as the X value for the uniform UI and is preserved as unsupported non-uniform data.

Export writes only Vintage Story keys. It does not write Minecraft `display` objects or Blockbench-only display metadata. Preview-only contexts are not exported.

The current implementation uses `js/display_mode/vintage_story_display_transforms.js` as the central mapping module. `fpOffHandTransform` is editor-only and aliases the single game `fpHandTransform` key because no separate first-person offhand key was found in the inspected Vintage Story source.

## UI and Preview Behavior

The Display editor exposes:

- Translation X/Y/Z
- Rotation X/Y/Z
- Origin X/Y/Z
- One uniform Scale field

Changing these fields updates the preview immediately through `DisplayMode.updateDisplayBase`. The transform gizmo also keeps display scale uniform. Reset uses neutral Vintage Story values until exact game defaults are sourced.

Preview references are Vintage Story-named: Seraph, Vintage Story armor stand, mannequin, tongs, ground, shelf/rack holders, GUI, trap, forge, Omok tabletop, and firepit. This pass does not bundle Vintage Story assets. The preview uses safe placeholder holder geometry and warns when the configured local Vintage Story asset path is missing required preview files.

## TODOs

- Replace placeholder preview rigs with local Vintage Story asset loading.
- Confirm exact default transform presets from `ModelTransform` API or live game export.
- Calibrate GUI preview against real Vintage Story inventory rendering.
- Add richer warnings for alias/preview-only contexts in the UI.
- Add in-game validation against real Vintage Story item/block JSON after the codec writes transforms.
