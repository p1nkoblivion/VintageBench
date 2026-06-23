# Vintage Story Mod Export and Packaging

## Purpose

Vintage Bench can export the current Vintage Story asset-context session into a mod workspace and package that workspace as a Vintage Story content mod zip.

The exporter keeps the existing separation of ownership:

- shape geometry writes to `assets/<domain>/shapes/...`
- item/block asset JSON writes to `assets/<domain>/itemtypes/...` or `assets/<domain>/blocktypes/...`
- lang entries write to `assets/<domain>/lang/<language>.json`
- copied textures write to `assets/<domain>/textures/...`
- mod metadata writes to `modinfo.json`

Display transforms, interaction boxes, and attachment metadata are never written into shape JSON.

## Files Inspected

- `js/vintagestory/vs_asset_workspace.js`: existing mod root/domain and standard asset folder settings.
- `js/vintagestory/vs_save_as_asset_workflow.js`: Save As Asset paths, shape export, asset JSON save, lang merge, and workspace settings dialog.
- `js/vintagestory/vs_asset_generator.js`: asset base path conversion, lang key generation, texture path validation, and generated asset serialization.
- `js/vintagestory/vs_asset_resolver.js`: shape/texture path resolution, asset roots, source kind, and validation resolver behavior.
- `js/vintagestory/vs_asset_workflow.js`: asset-context session data and transform/box/attachment writeback helpers.
- `js/vintagestory/vs_entity_attachments.js`: attached shape source pointers and slot path resolution.
- `js/vintagestory/vs_interaction_boxes.js`: interaction box source pointers and validation.
- `js/lib/libs.ts` and existing zip exporters: JSZip is already part of the app dependency set.
- Local Vintage Story mod examples under `C:\Users\jorda\AppData\Roaming\VintagestoryData\Mods`, confirming `modinfo.json`, `assets/`, and optional `modicon.png` style loose-mod structure.

## Workspace Structure

The exporter targets the standard loose-mod layout:

```text
<mod root>/
  modinfo.json
  modicon.png
  assets/
    <domain>/
      blocktypes/
      itemtypes/
      shapes/
      textures/
      lang/
```

Packaged content mod zips keep the same root structure:

```text
modinfo.json
modicon.png
assets/
```

Code assets such as `src/`, `.dll`, and `.pdb` are excluded by default. They are only intended for a later explicit code-mod packaging option.

## Workspace Settings

`Vintage Story Workspace Settings` now includes:

- mod workspace root
- domain / modid
- mod type
- mod name
- author(s)
- version
- description
- dependencies
- website
- mod icon path
- shapes, textures, blocktypes, itemtypes, and lang folders
- Vintage Story data folder
- Vintage Story Mods folder
- package output folder
- backup-before-overwrite toggle
- game asset root
- additional asset roots

By default, packaged mod zips are suggested under `%APPDATA%/Vintagebench/ModExports`.
Vintage Bench keeps its own cache, backups, blob storage, and launch settings under `%APPDATA%/Vintagebench/boringstuff` so the export folder stays easy to find.

Defaults for new mod metadata follow the local project convention:

- author: `P1nkOblivion`
- dependencies: `game=`

The blank `game` dependency version is intentional.

## modinfo.json

Missing `modinfo.json` can be generated with:

```json
{
	"type": "content",
	"modid": "<domain>",
	"name": "<Mod Name>",
	"description": "<Description>",
	"authors": ["P1nkOblivion"],
	"version": "1.0.0",
	"dependencies": {
		"game": ""
	}
}
```

Existing `modinfo.json` files are parsed and preserved. Unknown fields remain intact. If an existing file uses casing such as `Modid`, `Name`, or `Version`, the exporter updates that existing key instead of discarding it.

Validation warns when `modinfo` modid does not match the workspace domain.

## Export Plan

`Export to Vintage Story Mod Workspace` builds an export plan before writing any files.

Plan entries can include:

- `modinfo.json`
- current shape JSON
- item/block asset JSON
- lang file update
- referenced textures to copy
- `modicon.png`

Each entry records:

- action: write, update, or copy
- source path
- target path
- whether the target already exists
- warnings
- errors
- generated preview data where useful

The user can copy the plan report before confirming. Files are not written until the user chooses `Export`.

## Shape Export

The current model is compiled with display transforms omitted. Shape export only writes shape geometry and shape-owned fields.

The exporter accepts either a raw shape object or compiled JSON text. Save paths are derived from Vintage Story asset bases such as:

```json
{ "base": "item/simpleitem" }
```

which writes:

```text
assets/<domain>/shapes/item/simpleitem.json
```

No absolute filesystem paths are written into asset JSON.

## Asset Export

The item/block asset JSON is read from the current asset context source file. Before planning, Vintage Bench runs the existing asset-context writeback helpers for:

- display transforms
- interaction boxes
- entity attachments

This keeps the exported item/block JSON aligned with current editor changes while preserving unknown fields.

If no asset context exists, the exporter asks the user to use Save As Asset or Open Vintage Story Asset first.

## Texture Copy

Texture export uses the resolved texture source data from the asset context.

For each texture alias:

- if the texture already resolves inside the workspace, it is left alone
- if the texture is a local file outside the workspace, it can be copied
- if the texture resolves from the configured game assets root, it is not copied by default
- missing textures are warnings

Copied textures are placed under:

```text
assets/<domain>/textures/<texture base>.png
```

Texture aliases are preserved. Asset JSON texture paths remain Vintage Story asset paths, not filesystem paths.

## Lang Export

Lang export uses the existing Save As Asset lang key generator:

- `item-simplewand`
- `block-flowerpot`
- variant entries when variant lang output is selected

Existing lang entries are preserved unless overwrite is explicitly requested by the caller. The export plan reports preserved keys.

## Validation

`Validate Vintage Story Mod Workspace` checks:

- `modinfo.json` exists and parses
- modinfo type is valid
- modid/domain mismatch
- `assets/<domain>` exists
- standard asset folders exist
- item/block assets parse
- shape references resolve
- texture references resolve
- attached shape references resolve
- ByType maps match at least one generated variant
- exact ByType keys targeting skipped/disallowed variants
- absolute filesystem paths in asset JSON
- display transforms found in shape JSON
- interaction boxes found in shape JSON

Validation groups messages by file/path where practical.

## Packaging

`Package Vintage Story Mod` validates the workspace, then creates:

```text
<modid>-<version>.zip
```

Included:

- `modinfo.json`
- `modicon.png`, if present
- `assets/**`

Excluded:

- `.git`
- `node_modules`
- generated type declarations
- Electron/build output
- editor temp files
- backups
- local config folders
- non-redistributable preview assets

The package report lists included and excluded files.

## Mods Folder Copy

If a Vintage Story Mods folder is configured, packaging offers to copy the generated zip there. It never writes to the Mods folder without explicit confirmation. Existing files require overwrite confirmation.

## Backups

When export overwrites existing workspace files and backups are enabled, Vintage Bench writes timestamped `.bak` copies before replacing the target file.

Backups are not included in packaged zips.

## Limitations

- Export currently requires an item/block asset context. Raw shape-only projects should use Save As Asset first.
- Texture copy is alias/source based; unresolved or missing textures are reported but not synthesized.
- Package validation is conservative and can warn about advanced valid assets that use resolver features not fully represented yet.
- Code mod packaging is intentionally not enabled by default.
- No entity rig or proprietary Vintage Story assets are bundled.
