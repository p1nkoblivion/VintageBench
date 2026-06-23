# Source Code

Vintage Bench is distributed under the GNU General Public License version 3
as a modified fork of Blockbench.

The complete corresponding source code for this fork is available at:

https://github.com/p1nkoblivion/VintageBench

For binary releases, use the release tag or exact commit named in the release
notes to obtain the matching source code. The source includes the scripts and
build files needed to generate, install, run, and modify this version, except
for system libraries and generally available tools that are not part of the
program.

Binary release artifacts must include LICENSE.MD, NOTICE, SOURCE_CODE.md,
THIRD_PARTY_NOTICES.md, and the matching release tag or commit reference.

Generated Type Declarations
---------------------------

Generated declarations under types/generated/ are not tracked or packaged as
release source. They are reproducible from the included source and build
scripts with:

```sh
npm run generate-types
```

Manually maintained declaration files under types/custom/ and the generation
scripts/configuration remain part of the source tree.
