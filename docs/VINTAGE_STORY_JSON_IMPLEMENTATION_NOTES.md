# Vintage Story JSON Implementation Notes

## Scope

This pass implements Vintage Story shape JSON creation, import, export, and save/open wiring for the Vintage Bench fork. It does not reintroduce removed Minecraft, Bedrock, mesh, or web-version features.

## Files/modules inspected

- `js/main.ts`: currently registers the generic format and the legacy Blockbench project codec.
- `js/formats/generic.ts`: defines the only visible new-model option. It is still named "Generic Model" before this pass.
- `js/formats/bbmodel.js`: contains the original Blockbench project serializer, currently repurposed to `.json`. It is still needed internally for backups, edit sessions, and detached tabs, but it is not a Vintage Story shape JSON codec.
- `js/io/io.js`: contains model file loading and the smart-save action. Smart-save still writes `Codecs.project` to `Project.save_path`, which must be changed so user saves write Vintage Story JSON.
- `js/io/codec.js`: defines codec registration, file dialogs, save-path tracking, and recent-project handling.
- `js/io/project.ts`: defines `ModelProject`, texture resolution defaults, project save/export paths, and project-level serializable properties.
- `js/texturing/textures.js`: defines `Texture`, placeholder texture loading through `loadEmpty()`, texture file paths, UV dimensions, and saved texture properties.
- `js/outliner/types/cube.js`: defines `Cube`, `CubeFace`, cuboid bounds, origin, rotation, face UVs, face texture UUIDs, and face enabled state.
- `js/outliner/types/group.js`: defines parent/child hierarchy groups, origins, rotations, children, and outliner behavior.
- `js/outliner/abstract/face.ts`: confirms shared face serialization includes UV and texture references.
- `js/auto_backup.ts`, `js/desktop.js`, `js/edit_sessions.js`, `js/io/project.ts`: use `Codecs.project` for internal app state, so the old Blockbench project codec should remain internal instead of being deleted.

## Current Vintage Bench storage assumptions

- Cuboids are `Cube` instances with `from`, `to`, `origin`, `rotation`, `shade`, and six `CubeFace` entries.
- Face data uses Blockbench directions `north`, `east`, `south`, `west`, `up`, `down`.
- `CubeFace.texture` stores a texture UUID, not a texture code. The Vintage Story codec must map UUIDs to shape texture codes such as `#texture`.
- Texture width and height live on `Project.texture_width` and `Project.texture_height`; per-texture UV size lives on `Texture.uv_width` and `Texture.uv_height`.
- Outliner hierarchy can contain `Cube` and `Group` nodes. Groups are useful for Vintage Story parent/child organization and should not be removed.
- The old Blockbench internal project serializer writes `meta`, `elements`, `groups`, `outliner`, `textures`, display data, animations, editor state, and other Blockbench-only data. This is not valid Vintage Story shape JSON.

## Save/open integration points

- The new Vintage Story codec should be registered after the internal project codec so `Formats.free.codec` points at Vintage Story JSON for user-facing save/export.
- `Codecs.project` should only load JSON with a Blockbench `meta` object. It should not claim general `.json` files.
- `loadModelFile()` already routes JSON to codecs by extension and codec condition; a Vintage Story JSON codec can plug into this safely.
- `export_over` must use the active format codec for `Project.save_path` instead of always writing `Codecs.project`.
- Save/Open/Import dialogs should use `.json` and the Vintage Story codec name for user-visible model files.

## VSMC2 JSON format findings

Primary reference inspected:

- `C:\Users\jorda\OneDrive\Desktop\DEV BADDIE\BLOCKBENCH\VintageBench\.resources\vsmc2-main\vsmc2-main\VSModelCreatorProto\Assets\Scripts\JSON\Definitions\Shape.cs`
- `...\ShapeElement.cs`
- `...\ShapeElementFace.cs`
- `...\AttachmentPoint.cs`
- `...\ShapeEditorSettings.cs`
- `...\ShapeAccessor.cs`
- `...\Editing\ShapeLoader.cs`
- `...\Editing\ShapeHolder.cs`
- `...\Editing\TextureManager\TextureManager.cs`
- `...\Editing\TextureManager\LoadedTexture.cs`
- `...\autosaves\0.json`

Secondary reference inspected only for corroboration:

- `C:\Users\jorda\OneDrive\Desktop\DEV BADDIE\BLOCKBENCH\VintageBench\.resources\vsmodelcreator-master\vsmodelcreator-master\src\at\vintagestory\modelcreator\io\Exporter.java`
- `...\Importer.java`

### Reference licensing

No top-level license file was found for VSMC2. The repository contains licenses for some bundled third-party assets, but not a clear license grant for the VSMC2 source code itself. The older Java model creator also has no clear top-level license in the inspected copy. For GPL-3.0 safety, this pass uses the references only to understand behavior and JSON structure. No reference source code or assets should be copied.

### Root shape object

VSMC2 writes formatted lower-camel JSON with null/default values omitted. Common root fields:

- `editor`: editor settings, commonly `{ "allAngles": true }`.
- `textures`: object mapping texture codes to Vintage Story asset paths without `.png`, for example `{ "texture": "" }` or `{ "sulfur1": "block/stone/rock/sulfur1" }`.
- `elements`: root element array.
- `animations`: animation array, present in the schema but out of editing scope for this pass.
- `textureWidth`: root texture atlas width, default `16`.
- `textureHeight`: root texture atlas height, default `16`.
- `textureSizes`: optional object mapping texture codes to `[width, height]`.

VSMC2 new-shape defaults:

- `textureWidth = 16`
- `textureHeight = 16`
- `textures = { "texture": "" }`
- one starter element named `Cube` from `[0, 0, 0]` to `[1, 1, 1]`
- all six faces enabled with `uv: [0, 0, 1, 1]` and `texture: "#texture"`

### Elements

Common VSMC2 element fields:

- `name`
- `from`: `[x, y, z]`
- `to`: `[x, y, z]`
- `shade`
- `gradientShade`
- `faces`
- `rotationOrigin`: pivot/origin `[x, y, z]`
- `rotationX`, `rotationY`, `rotationZ`
- `scaleX`, `scaleY`, `scaleZ`
- `climateColorMap`, `seasonColorMap`
- `renderPass`, `zOffset`, `disableRandomDrawOffset`
- `children`
- `attachmentpoints`
- `stepParentName`
- `renderInEditor`
- `autoUnwrap`, `uv`, `unwrapMode`, `unwrapRotation`

Parent/child hierarchy is recursive through `children`. VSMC2 sample files may use zero-size elements with empty `faces` as parent/origin nodes. Vintage Bench should import those as hierarchy groups when safe and export groups as zero-size Vintage Story elements with children.

### Faces

Face directions are `north`, `east`, `south`, `west`, `up`, `down`.

Common face fields:

- `texture`: texture code reference such as `#texture`.
- `uv`: `[u1, v1, u2, v2]`.
- `rotation`: UV rotation in degrees.
- `enabled`: when false, the face exists but is disabled.
- `autoUv`, `snapUv`/`snapUV`: editor UV flags.
- `glow`
- `reflectiveMode`
- `windMode`
- `windData`
- `frostable`

VSMC2 may also serialize derived/editor fields such as `rotationIndex`. Unknown face fields should be preserved and re-emitted when possible.

### Coordinates and transforms

- Vintage Story shape units use the same 16-unit model grid convention as the existing cuboid editor.
- Element bounds are written directly as `from` and `to` arrays.
- Pivot/origin is `rotationOrigin`.
- Rotation is stored as degrees in separate `rotationX`, `rotationY`, and `rotationZ` fields.
- VSMC2 composes local transforms around `rotationOrigin`, then X/Y/Z rotations, then scale, then translation. Complex transform edge cases should remain TODO until validated against the game.

### Texture behavior

- Root `textures` maps texture codes to Vintage Story asset paths. Paths are logical asset references, not necessarily local files.
- Root `textureSizes` overrides per-texture UV dimensions; otherwise VSMC2 falls back to root `textureWidth` and `textureHeight`.
- Face texture values use `#code` references.
- Missing texture references should warn and create placeholder references rather than crash.

### Unsupported or preserved data

For this pass:

- Animations are preserved as raw JSON but not edited.
- Attachment points are preserved as raw JSON but not edited.
- Root, element, face, and texture unknown fields should be preserved where safe.
- If a field cannot be mapped or preserved, import should warn instead of silently dropping it.

## Implementation risks and assumptions

- The internal Blockbench project codec remains required for backups, edit sessions, and detached tabs.
- Existing cuboid tools expect face textures by UUID, while Vintage Story JSON uses texture codes. The codec must handle this mapping deterministically.
- Placeholder textures are required for Vintage Story asset paths that do not resolve to local image files.
- Rotated nested element behavior is documented from VSMC2 but only basic import/export is in scope for this pass.
- A real in-game validation pass is still needed after this initial codec implementation.

## Implemented Vintage Bench mapping

- `js/formats/vintage_story_json.js` is the central Vintage Story JSON codec module.
- `js/formats/generic.ts` now exposes the single create-new option as `Vintage Story Model`.
- `js/main.ts` registers the Vintage Story JSON codec after the internal project serializer, so `Formats.free.codec` points at Vintage Story JSON for user save/open.
- `js/formats/bbmodel.js` keeps the old Blockbench project serializer only for internal project/session data and only loads JSON with a `meta` object.
- `js/io/io.js` saves through the active format codec, so main Save writes Vintage Story JSON to `.json`.
- `js/io/project.ts`, `js/outliner/types/cube.js`, `js/outliner/types/group.js`, and `js/texturing/textures.js` now have hidden `vintage_story`/`vintage_story_data` properties for raw-field preservation.

## Supported fields in this pass

- Root: `editor`, `textures`, `textureWidth`, `textureHeight`, `textureSizes`, `elements`, `animations` preservation.
- Elements: `name`, `from`, `to`, `shade`, `rotationOrigin`, `rotationX`, `rotationY`, `rotationZ`, `faces`, `children`.
- Faces: `texture`, `uv`, `rotation`, `enabled`.
- Textures: texture code, logical Vintage Story texture path, per-texture UV size through `textureSizes`.
- Hierarchy: recursive Vintage Story `children` map to outliner groups/cubes. Zero-size parent elements with children and no enabled faces import as groups. Vintage Story elements that have both geometry and children import as a group with a marked self-geometry cube; export folds that pair back into one Vintage Story element.

## Preserved but not editable yet

- Root unknown fields.
- Root `animations` array.
- Element unknown fields such as `renderPass`, `attachmentpoints`, `stepParentName`, `scaleX`, `scaleY`, `scaleZ`, unwrap metadata, climate/season maps, and render flags.
- Face unknown fields such as `glow`, `windMode`, `windData`, `reflectiveMode`, `frostable`, `autoUv`, `snapUv`, and VSMC2 editor fields such as `rotationIndex`.
- Non-string texture values are preserved as raw JSON on the texture metadata.

## Unsupported or lossy in this pass

- Animation editing is not implemented. Imported animation JSON is preserved and re-emitted only as raw JSON.
- Attachment point and locator editing is not implemented. Imported attachment point JSON is preserved on the owning element.
- Non-cube/non-group outliner nodes are warned and skipped during Vintage Story export.
- Elements with both geometry and children are represented with an extra self-geometry cube in the outliner because Blockbench cubes cannot directly parent children.
- Complex nested rotation/scale validation against the actual game remains TODO.
- Texture asset path resolution is not implemented beyond placeholder references; logical Vintage Story paths are preserved.

## Test fixtures and manual checks

Fixtures added under `test/fixtures/vintage_story_json/`:

- `default_cube.json`
- `nested_rotated_cube.json`
- `preserved_unknown_fields.json`
- `parent_geometry_child.json`

Automated helper test:

- `npm run test-vintage-story-json`

Manual runtime checks:

1. Run `npm run build-electron`.
2. Run `npm run electron`.
3. Create a new `Vintage Story Model`.
4. Confirm the starter cube and placeholder `texture` reference exist.
5. Save as `.json` and confirm the output has Vintage Story root fields, not Blockbench `meta`.
6. Open each fixture JSON and confirm cubes/groups appear in the outliner.
7. Save/export each fixture and confirm unknown fields, disabled faces, texture references, and hierarchy remain in the output JSON.
