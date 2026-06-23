# Vintage Story Asset Fixture Suite

This directory contains synthetic Vintage Story fixtures that are safe to commit.
They are intentionally small and exist to exercise Vintage Bench import, resolver,
save, validation, and export/package behavior without depending on proprietary
game or mod assets.

`manifest.json` maps fixture scenarios to the files that cover them. The
`synthetic_mod` folder is a tiny content-mod workspace using the `synthetic`
domain. The `package_workspace` folder is a ready-made workspace fixture for
export/package validation.

Real game or mod fixtures can be placed under `local_real/` for manual testing.
That folder is ignored by git except for its README and ignore marker.
