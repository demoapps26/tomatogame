# Clothed anatomical humans

These are complete MakeHuman human meshes with a continuous shoulder and neck,
real hands, open eyelids, separate textured eyeballs, skin photography and fitted
clothing. They replace the former procedurally assembled mannequin when the
factory in `src/human-asset.js` is selected. No part of the previous Lee
Perry-Smith scan is used or modified.

The worker wears `male_worksuit01` (denim overalls and T-shirt). The citizen wears
`male_casualsuit03` (shirt and jeans). Both use `shoes02`, `short02`, `eyebrow001`,
`low-poly` eyes, the brown iris material and `young_caucasian_male` skin. The base
mesh, phenotype morphs, game-engine skeleton and weights come from MPFB.

## License and provenance

All selected graphical assets are **CC0-1.0**. The individual core `.obj`,
`.mhclo` and `.mhmat` files explicitly state their September 2020 release to CC0,
with MakeHuman / Data Collection AB, Joel Palmius and Jonas Hauquier named as
right holders. The source archive was downloaded from the CC0 release of the
Makehuman-2 asset repository, and the same asset names and CC0 status are listed
in the official MakeHuman system-asset index preserved as `OFFICIAL-ASSET-INDEX.md`.

`LICENSE.md` is MPFB's explicit distinction between its GPL application and its
CC0 graphical output. `LICENSE.ASSETS.md` contains the complete CC0 waiver. No
MakeHuman or MPFB application code is copied into the game's runtime. MPFB is an
offline build tool. No third-party alternate hair materials or assets from its
community directories are included.

`manifest.json` pins the MPFB revision, source archive URL and SHA-256, original
file hashes and the generated geometry hash. The 404 MB collection archive and
Blender work files remain outside the repository; only selected originals and
small derived runtime files are retained.

## Reproduce

Use Blender 4.3 or newer and Node with the repository's existing dependencies.
Clone `https://github.com/makehumancommunity/mpfb2` outside this repository and
check out the `mpfbCommit` recorded in the manifest. Then, from the game root:

```sh
blender -b --factory-startup --python scripts/export-human-asset.py -- --mpfb /path/to/mpfb2/src --output /tmp/tomato-human-build
node scripts/pack-human-asset.mjs /tmp/tomato-human-build
```

The exporter creates an adult male phenotype, fits the licensed clothes through
MakeHuman's authored fitting data and transfers the authored skeleton weights.
It poses the arms into a relaxed neutral stance and bakes that neutral deformation
into the exported mesh and joint centres. It applies helper/clothing masks,
retains UVs and smooth normals, and normalizes the complete dressed figure to
1.80 m with +Z forward. Runtime bones use the exported joint centres, so rotations
are around actual anatomy rather than separated capsules.

Blender converts the original diffuse textures to JPEG and retains alpha-bearing
hair/eyebrow images and clothing normals as PNG. Skin keeps its original 2048
resolution; clothing channels are reduced to 1024. Original images are retained
unaltered under `source/`. Runtime geometry is quantized and gzip compressed.
There are 30,526 worker triangles or 27,388 citizen triangles, six draw meshes per
actor, and four normalized skin influences per vertex. Both variants together
produce a 7.50 MB JavaScript data module.

Each factory instance owns its geometry, materials, texture wrappers, skeleton
and bone texture. Immutable source image pixels can be shared. The public API is
`createDetailedHuman(options) -> { group, animate, setDrivingPose }`, plus
`humanAssetsReady()` and `getHumanAssetState()` for texture readiness. Joint Group
names retain the walking, aiming and seated-driver interfaces used by the game.
