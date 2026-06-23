# Release Compliance Checklist

Run this before any public Vintage Bench binary build:

```sh
npm run test-release-compliance
npm run test-vintage-story-json
npm run build-electron
```

Vintage Bench is a modified fork of Blockbench distributed under GPL-3.0-or-later.

- GPL-3.0 license text must remain in `LICENSE.MD`.
- Original Blockbench notices must remain preserved in `NOTICE`, `README.md`, and the About dialog.
- Fork and modified-work notices must state that Vintage Bench is modified from Blockbench and include the modification date line.
- Binary packages must include `README.md`, `LICENSE.MD`, `NOTICE`, `SOURCE_CODE.md`, `THIRD_PARTY_NOTICES.md`, and `CHANGELOG.md`.
- Every binary release must identify the matching source tag or commit and link to the source repository.
- The About dialog must show GPL, no warranty, redistribution/modification rights, and the source link.
- Do not add an EULA or other terms that restrict GPL redistribution, modification, or source-code access rights.
- Do not bundle proprietary Vintage Story game assets. Preview references must be placeholders, original calibration backdrops, or user-provided/local runtime files.
- Generated declarations under `types/generated/` must remain reproducible from `npm run generate-types` rather than treated as hand-authored release source.
- User-created models, textures, animations, screenshots, mods, and other assets are not automatically GPL-licensed by using Vintage Bench.
