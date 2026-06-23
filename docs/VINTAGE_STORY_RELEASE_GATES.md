# Vintage Story Release Gates

Modified for Vintage Bench on 2026-06-23: this document records the release blocker checklist for public beta and v1.0 labels.

## Required Before Public Beta

The release gate is automated by:

```powershell
npm run test-release-blockers
npm run test-vintage-story-json
npm run test-release-compliance
npm run build-electron
```

`test-release-blockers` verifies:

- Simple item create -> export/package -> reopen from zip.
- Simple block create -> export/package -> reopen from zip.
- Complex blade-style asset open -> resolve variant -> save -> reopen.
- Unknown fields survive round-trip serialization.
- Asset JSON does not contain absolute paths, Windows backslashes, or path traversal.
- Shape JSON does not receive asset-only transforms, boxes, or attachment data.
- ByType fallback edits create exact overrides by default; shared fallback edits require explicit targeting.
- Existing workspace files are marked as overwrites in the export plan, and the UI path writes only from the export-plan confirmation.
- Package zip root contains `modinfo.json` and `assets/`.
- Package excludes internal/generated/local files and non-redistributable preview paths.
- Validation diagnostics include severity, file path, JSON path, variant code when relevant, problem statement, reason, suggested fix, and blocking scope.
- GPL/source/About notices remain present and clean.
- Generated declarations remain reproducible from source through `npm run generate-types`.

## Required Before v1.0

The v1.0 readiness portion of the release gate checks that these systems exist and remain wired:

- Interaction box drag handles.
- Shape alternates.
- Texture manager.
- Asset explorer.
- Verified starter presets for decorative blocks/items, shelf/display/rack/ground/firepit/antler use, simple tools/weapons, and attachable entity items.

## Known Limitations

These limitations must remain visible until replaced by stronger implementation or test coverage:

- Automated tests verify package structure and JSON behavior, but they do not launch Vintage Story for an in-game render/load proof.
- Display previews approximate editor placement; final in-game lighting, camera framing, and renderer-specific effects still need live validation.
- Entity/rig preview assets are loaded only from the user's local Vintage Story asset root. Vintage Bench does not bundle proprietary Vintage Story rig, mannequin, or texture assets.
- Attachment-slot markers can be previewed from local Seraph data, but attached shapes are not fully posed onto the entity rig yet.
- Advanced JSON preserves unknown and behavior-specific fields, but not every Vintage Story behavior has dedicated form controls.
- Generated declarations under `types/generated/` are treated as reproducible build output, not hand-authored source.
