# Third-Party Notices

Vintage Bench is based on Blockbench.

## Blockbench

Original project: https://github.com/JannisX11/blockbench

Original Blockbench copyright notices are retained from the original project
and its contributors. Blockbench source code is licensed under the GNU General
Public License version 3. See LICENSE.MD.

## Bundled Libraries and Assets

Vintage Bench includes third-party JavaScript, Electron, icon, and UI
dependencies inherited from Blockbench. Dependency license information is
preserved in package metadata, bundled library notices, and upstream source
files where provided.

Before publishing a binary release, regenerate or review dependency license
data from package-lock.json and include any additional notices required by
new dependencies.

## Vintage Story Model Creator References

The Vintage Story model creator source trees used during planning were
inspected as references only. Their code is not copied into Vintage Bench in
this cleanup pass.

## Vintage Story Assets

Vintage Bench does not bundle proprietary Vintage Story game assets. Vintage
Story preview references resolve files from a user-selected local Vintage Story
installation at runtime. Bundled preview imagery is limited to placeholders,
original UI calibration backdrops, or assets inherited from Blockbench with
their existing notices.

## Generated Declarations

Generated declaration output under types/generated/ is intentionally excluded
from source control and release packages. It can be regenerated from the
included source tree with `npm run generate-types`.
