# Asset provenance and licences

The notices for Three.js, fflate and the NVIDIA Bistro assets are retained in
`THIRD_PARTY_NOTICES.txt` and incorporated into the standalone HTML.
The seven ambientCG surface sets and the Rooitou Park lighting environment
are released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
They can be included in the offline game and in commercial distributions.
Attribution is retained here for provenance even where CC0 does not require it.
The current complete MakeHuman characters use CC0 graphical assets. The legacy
scanned character head retains its separate CC BY 3.0 licence, described below.

## Surface maps

Original colour, OpenGL normal and roughness JPEGs are included without pixel
changes. All are 1024 × 1024, except Concrete 034, which is 1024 × 512.
`createPhotoTextures` applies repeats and colour-space settings at runtime; it
does not replace or modify the source images.

| Game material   | Asset and creator        | Original source                     | Verified mirror                                                                                                                                                     |
| --------------- | ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asphalt         | Asphalt 031 · ambientCG  | https://ambientcg.com/a/Asphalt031  | [null3d-engine/sample-assets](https://github.com/null3d-engine/sample-assets/tree/edc978a96ceb2af50a16973ccf61389c3bf95556/sources/materials/ambientcg/Asphalt031)  |
| Concrete        | Concrete 034 · ambientCG | https://ambientcg.com/a/Concrete034 | [null3d-engine/sample-assets](https://github.com/null3d-engine/sample-assets/tree/edc978a96ceb2af50a16973ccf61389c3bf95556/sources/materials/ambientcg/Concrete034) |
| Plaster         | Plaster 001 · ambientCG  | https://ambientcg.com/a/Plaster001  | [null3d-engine/sample-assets](https://github.com/null3d-engine/sample-assets/tree/edc978a96ceb2af50a16973ccf61389c3bf95556/sources/materials/ambientcg/Plaster001)  |
| Soil            | Ground 037 · ambientCG   | https://ambientcg.com/a/Ground037   | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Ground037)                                       |
| Wood            | Wood 051 · ambientCG     | https://ambientcg.com/a/Wood051     | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Wood051)                                         |
| Ceramic tiles   | Tiles 139 · ambientCG    | https://ambientcg.com/a/Tiles139    | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Tiles139)                                        |
| Clothing fabric | Fabric 061 · ambientCG   | https://ambientcg.com/a/Fabric061   | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Fabric061)                                       |

The null3d mirror's README lists the individual ambientCG assets and their
CC0-1.0 licences. The Tiddybub mirror includes a `SOURCE.md` identifying the
ambientCG origin and CC0-1.0 licence for each material. Original map names and
SHA-256 hashes are recorded in `assets/photo-manifest.json`.

## Photographed lighting environment

**Rooitou Park**, Poly Haven / HDRI Haven, CC0-1.0.

- Original asset: https://polyhaven.com/a/rooitou_park
- File: `assets/rooitou-park-1k.hdr`, 1024 × 512 RGBE HDR.
- Mirror: https://github.com/pmndrs/drei-assets/blob/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/rooitou_park_1k.hdr
- The mirror's README credits its HDRIs to HDRI Haven, now Poly Haven.

The lighting pipeline processes this original radiance map into reflections and
sky lighting. It does not add the photographed park's geometry to the city.

## Legacy scanned character head — CC BY 3.0

**Infinite, 3D Head Scan**, by **Lee Perry-Smith / Infinite-Realities**, based on
[Triplegangers](http://www.triplegangers.com/), is licensed under the
[Creative Commons Attribution 3.0 Unported licence](https://creativecommons.org/licenses/by/3.0/).
This scanned head is **not CC0**. It was used in previous releases and remains
preserved in the source distribution; current MakeHuman characters do not use it.

- Source mirror: https://github.com/mrdoob/three.js/tree/2bd920c3a604a3b847d9187b0a1c21e33807ecb3/examples/models/gltf/LeePerrySmith
- Original licence notice: `assets/head-scan/LeePerrySmith_License.txt`.
- Original files: `LeePerrySmith.glb`, `Map-COL.jpg` and `Infinite-Level_02_Tangent_SmoothUV.jpg`.
- Adaptation in previous releases: placement, scaling and integration into procedural
  characters; material settings adapted. The distributed source GLB and JPEG
  bytes are unchanged.
- Packed by `scripts/pack-head-scan.mjs` into `src/head-scan-data.js`; attribution
  and the licence link are retained in its exported metadata.

## Packaging

`assets/CC0-1.0.txt` contains the full licence. The original JPEG/HDR files and
`assets/photo-manifest.json` are retained for review. Run
`node scripts/pack-photo-assets.mjs` after changing a source file; it embeds the
original bytes into `src/photo-assets-data.js` so both the game and its assets
work without network access. The generated JS is intentionally not hand-edited.

## Detailed sports car — CC BY 4.0

**Car Concept**, model and textures by **Eric Chadwick / Darmstadt Graphics
Group GmbH**, © 2024, is licensed under the
[Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/).
This detailed vehicle is **not CC0**.

- Authoritative source: [Khronos glTF Sample Assets, CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/15cd02d304e54cb42a4db4eefe719f76190f4b68/Models/CarConcept).
- The source documentation identifies the starting public-domain model as
  **Free Concept Car 004**, by **Unity Fan**. Eric Chadwick / DGG's optimized
  CarConcept model and textures have their own CC BY 4.0 attribution above.
- The original `CarConcept.glb`, source README, authoritative legal metadata,
  full CC BY 4.0 licence and original Khronos logo notice are retained in
  `assets/new-realism/`. The original source bytes are unchanged.
- Game adaptation: only the Carmine material variant is used; license-plate
  and steering-emblem meshes and logo-bearing emissive/sidewall maps are
  omitted. Dense windshield wipers and hidden under-hood/pedal geometry are
  omitted; the game adds two simpler wiper blades. Front wheels are returned
  to straight ahead, while steering, wheel rotation and stationary brake
  calipers are animated separately.
- Positions, normals and UVs are quantized to 16 bits and compressed for
  offline packaging; curved bodywork, interior geometry and the retained
  surface maps remain from the licensed original. Paint, glass and light
  materials are adapted to the game's rendering and maintenance system.
- `scripts/pack-vehicle-asset.mjs` produces the retained compact geometry and
  metadata plus `src/vehicle-asset-data.js`. It requires no online conversion
  service. Source URLs, versions and SHA-256 hashes are in
  `assets/new-realism/source-manifest.json`.

The bundled synchronous geometry decompressor uses **fflate 0.8.2**, by
**Arjun Barrett**, under the MIT licence. Its full notice is retained in
`THIRD_PARTY_NOTICES.txt` and incorporated into the standalone HTML. The
original notice is also stored as `assets/new-realism/fflate-MIT.txt`.

## Curved wood and velvet lounge chair — CC0

**SheenChair**, model and textures by **Eric Chadwick / Wayfair, LLC**, © 2020,
is released under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

- Authoritative source: [Khronos glTF Sample Assets, SheenChair](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/15cd02d304e54cb42a4db4eefe719f76190f4b68/Models/SheenChair).
- The unchanged original GLB, README, legal metadata and SHA-256 manifest are
  retained in `assets/new-realism/chair/`. The full CC0 text is in `assets/CC0-1.0.txt`.
- Adaptation: the Mango/Brown geometry and five original material maps are
  retained; the product-label mesh and unused black/peacock variants are
  omitted. The model is centered on the floor, with 16-bit position, normal
  and UV storage, a muted game fabric tint and adjusted material response.
- `scripts/pack-furniture-asset.mjs` creates the compact retained geometry and
  metadata and `src/furniture-asset-data.js`, without online conversion.

## Detailed Bistro architecture — MIT

Selected exterior buildings and their material maps come from **Amazon
Lumberyard Bistro**, distributed in **NVIDIA GameWorks RTXDI assets** under the
**MIT License**, **Copyright (c) 2023 NVIDIA GameWorks**.

- Authoritative asset source: [NVIDIA GameWorks RTXDI assets, Bistro](https://github.com/NVIDIAGameWorks/rtxdi-assets/tree/1da7b749ef0e3fb606ab46dde8e5bfbacd078a02/bistro).
- Authoritative [MIT license at the same revision](https://raw.githubusercontent.com/NVIDIAGameWorks/rtxdi-assets/1da7b749ef0e3fb606ab46dde8e5bfbacd078a02/LICENSE).
- Download mirror: [Arseny Kapoulkine / zeux, niagara_bistro](https://github.com/zeux/niagara_bistro/tree/2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e), with the same NVIDIA MIT notice. The source geometry buffer and all 74 selected DDS images match the hashes and byte counts in the official NVIDIA Git LFS pointers.
- The complete MIT notice is preserved in `assets/district-v9/NVIDIA-MIT.txt`,
  `THIRD_PARTY_NOTICES.txt` and the standalone HTML. This distribution relies on
  the NVIDIA repository's MIT terms; it does not claim a separate verified
  Creative Commons license for the ORCA release.
- Selection: Paris Building 01's main structure, ground floor, balconies and
  awnings form the `cafe` variant; Paris Building 8 02 forms `townhouse`.
  The game places four exterior buildings near the headquarters in medium/high
  image quality. These shells have no visitable interior.
- Adaptation: original ancestor transforms are baked; each building is centered
  and grounded. Original topology, smooth normals, UVs and tangent handedness
  are retained, with 16-bit runtime attribute storage and gzip compression.
  DDS material maps are decoded and reduced to 1024 pixels for diffuse maps and
  512 for normal/specular-glossiness data; alpha and data channels are retained.
  A local shader adapter preserves the original specular/glossiness response.
  Glass uses reflective opaque panes, and selected plaster materials can be tinted.
- Exact selected source geometry is retained losslessly with the source and
  output hashes, texture conversion details and license evidence in
  `assets/district-v9/`. `scripts/pack-district-asset.mjs` rebuilds the embedded
  data offline from that capture. See `assets/district-v9/PROVENANCE.md`.

## Complete MakeHuman characters — CC0

The complete clothed worker and citizen use **MakeHuman / MPFB graphical
assets**, released under **CC0 1.0 Universal**. Credit is retained to the
**MakeHuman team / Data Collection AB, Joel Palmius and Jonas Hauquier**.
The individual selected core assets explicitly record their September 2020
CC0 release and these right holders.

- Base mesh, phenotype morphs, skeleton and weights: [MPFB2](https://github.com/makehumancommunity/mpfb2/tree/b1a2dc98776da9d1eea751b159d42cf61778fe2e).
- Selected system asset release: [Makehuman-2 CC0 asset archive](https://github.com/Makehuman-2/MH2_Asset_Repository_CCO/releases/download/CC0/mh_system_CC0.zip), verified against the official MakeHuman system-asset index preserved locally.
- Worker outfit: `male_worksuit01`; citizen outfit: `male_casualsuit03`.
  Both use `shoes02`, `short02`, `eyebrow001`, the low-poly eyeballs, brown iris
  material and `young_caucasian_male` skin. Their heads and textures are separate
  from the legacy Lee Perry-Smith scan.
- MPFB's `LICENSE.md` explicitly separates its GPLv3 application code from its
  CC0 graphical assets and output. MPFB is used only as an offline build tool;
  its application code is not copied into the game's runtime. The game uses
  selected CC0 assets rather than third-party community asset packs.
- Adaptation: an adult phenotype is generated, clothes are fitted using the
  authored fitting data, skeleton weights are transferred, a relaxed neutral
  stance is baked and each dressed figure is normalized to 1.80 m. Runtime
  walking, aiming and seated poses use the exported joints. UVs and normals
  are retained; original skin imagery is retained at 2048 pixels and clothing
  channels are reduced to 1024. Runtime geometry uses quantization and gzip.
- Selected unchanged originals, full CC0 waiver, MPFB's licensing statement,
  source archive hash and file hashes are retained in `assets/human-v9/`.
  `scripts/export-human-asset.py` and `scripts/pack-human-asset.mjs` reproduce the
  data using Blender and MPFB, as documented in `assets/human-v9/README.md`.
