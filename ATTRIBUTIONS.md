# Asset provenance and licences

The game code and notices for Three.js remain in `THIRD_PARTY_NOTICES.txt`.
The seven ambientCG surface sets and the Rooitou Park lighting environment
are released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
They can be included in the offline game and in commercial distributions.
Attribution is retained here for provenance even where CC0 does not require it.
The scanned character head has a separate CC BY 3.0 licence, described below.

## Surface maps

Original colour, OpenGL normal and roughness JPEGs are included without pixel
changes. All are 1024 × 1024, except Concrete 034, which is 1024 × 512.
`createPhotoTextures` applies repeats and colour-space settings at runtime; it
does not replace or modify the source images.

| Game material | Asset and creator        | Original source                     | Verified mirror                                                                                                                                                     |
| ------------- | ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asphalt       | Asphalt 031 · ambientCG  | https://ambientcg.com/a/Asphalt031  | [null3d-engine/sample-assets](https://github.com/null3d-engine/sample-assets/tree/edc978a96ceb2af50a16973ccf61389c3bf95556/sources/materials/ambientcg/Asphalt031)  |
| Concrete      | Concrete 034 · ambientCG | https://ambientcg.com/a/Concrete034 | [null3d-engine/sample-assets](https://github.com/null3d-engine/sample-assets/tree/edc978a96ceb2af50a16973ccf61389c3bf95556/sources/materials/ambientcg/Concrete034) |
| Plaster       | Plaster 001 · ambientCG  | https://ambientcg.com/a/Plaster001  | [null3d-engine/sample-assets](https://github.com/null3d-engine/sample-assets/tree/edc978a96ceb2af50a16973ccf61389c3bf95556/sources/materials/ambientcg/Plaster001)  |
| Soil          | Ground 037 · ambientCG   | https://ambientcg.com/a/Ground037   | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Ground037)                                       |

| Wood | Wood 051 · ambientCG | https://ambientcg.com/a/Wood051 | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Wood051) |
| Ceramic tiles | Tiles 139 · ambientCG | https://ambientcg.com/a/Tiles139 | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Tiles139) |
| Clothing fabric | Fabric 061 · ambientCG | https://ambientcg.com/a/Fabric061 | [Tiddybub/3d-assets](https://github.com/Tiddybub/3d-assets/tree/11ff7082e566a6278553bf7623980cb93dd41e27/materials/Fabric061) |

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

## Scanned character head — CC BY 3.0

**Infinite, 3D Head Scan**, by **Lee Perry-Smith / Infinite-Realities**, based on
[Triplegangers](http://www.triplegangers.com/), is licensed under the
[Creative Commons Attribution 3.0 Unported licence](https://creativecommons.org/licenses/by/3.0/).
This scanned head is **not CC0**.

- Source mirror: https://github.com/mrdoob/three.js/tree/2bd920c3a604a3b847d9187b0a1c21e33807ecb3/examples/models/gltf/LeePerrySmith
- Original licence notice: `assets/head-scan/LeePerrySmith_License.txt`.
- Original files: `LeePerrySmith.glb`, `Map-COL.jpg` and `Infinite-Level_02_Tangent_SmoothUV.jpg`.
- Adaptation for this game: placement, scaling and integration into procedural
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
