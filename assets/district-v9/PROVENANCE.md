# Selected Bistro district architecture

These are selected, fully modeled exterior buildings from the **Amazon
Lumberyard Bistro** scene distributed in **NVIDIA GameWorks RTXDI assets**.
The copy used here is supplied under the **MIT License**, copyright
**2023 NVIDIA GameWorks**. The complete notice is retained in
[`NVIDIA-MIT.txt`](NVIDIA-MIT.txt).

## Authoritative license and sources

- Official asset directory, pinned commit:
  <https://github.com/NVIDIAGameWorks/rtxdi-assets/tree/1da7b749ef0e3fb606ab46dde8e5bfbacd078a02/bistro>
- Official repository license at the same commit:
  <https://raw.githubusercontent.com/NVIDIAGameWorks/rtxdi-assets/1da7b749ef0e3fb606ab46dde8e5bfbacd078a02/LICENSE>
- Download mirror by Arseny Kapoulkine, pinned commit:
  <https://github.com/zeux/niagara_bistro/tree/2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e>
- Mirror license:
  <https://github.com/zeux/niagara_bistro/blob/2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e/LICENSE>

The official NVIDIA repository has a repository-wide MIT notice and no
separate license exception in the Bistro directory. Its MIT grant explicitly
allows use, modification, distribution, sublicensing and sale, provided the
copyright and permission notice accompany substantial copies. This adaptation
retains the original Amazon Lumberyard Bistro scene credit in addition to the
NVIDIA notice. It does **not** assert an independently verified Creative Commons
license for the ORCA release.

The mirror supplies the binary bytes directly, while the official NVIDIA
repository supplies Git LFS pointer records. The complete source geometry
buffer is **95,660,264 bytes**, SHA256
`5fb11a1d61aeb2537197aa97833ff950638c9d42451ee4fafbc9550f03918faa`.
It matches the official NVIDIA pointer exactly. All **74 selected DDS files**
also match the SHA256 and byte length in the corresponding official NVIDIA
LFS pointers. Every official pointer URL, pointer hash, source hash and output
hash is recorded in [`texture-manifest.json`](texture-manifest.json).
The full source buffer and original DDS files remain outside the repository;
they are unnecessary for running the game.

## Selection and retained original data

- `cafe`: original roots 113, 135, 60 and 15, comprising Paris Building 01's
  upper building, shopfront, balconies and awnings; **171,502 triangles**.
  Before game placement, its normalized dimensions are approximately
  **18.511 × 18.580 × 16.642 m** (width, depth, height).
- `townhouse`: original root 66, Paris Building 8 02; **36,479 triangles**.
  Its normalized dimensions are approximately **12.829 × 17.704 × 21.496 m**.

[`source-selected.bin.gz`](source-selected.bin.gz) contains exact original
selected bufferView bytes, compressed losslessly with gzip. It has no vertex
quantization or topology reduction. [`source-selected.json`](source-selected.json)
retains the corresponding original definitions and indices, material records,
and full original ancestor/world transforms. This small capture allows offline
rebuilding without retaining the complete scene. Source URLs, hashes and hashes
of the capture and game derivatives are in
[`source-manifest.json`](source-manifest.json).

## Adaptation for the game

Original ancestor transforms are baked into positions, normals and tangents.
Each variant is centered in X/Z and translated so its lowest vertex is at
Y=0. Positions and UV coordinates use unsigned 16-bit per-part range
quantization; normal and tangent components use signed 16-bit quantization.
Original topology, winding, tangent handedness, UV layout and surface detail are
retained. The runtime compressed geometry is
[`district-game.bin.gz`](district-game.bin.gz), described by
[`district-game.json`](district-game.json).

DDS BC7 textures are decoded with Pillow and downsampled channel by channel
with Lanczos filtering. Diffuse maps have a maximum dimension of 1024 pixels;
normal and specular-glossiness maps have a maximum dimension of 512 pixels.
Opaque diffuse maps use JPEG quality 88 with 4:4:4 chroma sampling; diffuse maps
used by MASK/BLEND materials use WebP quality 90 with lossless alpha. Normal and
specular-glossiness RGBA data use lossless WebP. No gamma conversion, repainting,
generated replacement imagery or branding is introduced. Diffuse/specular RGB
keeps its sRGB encoding, while normal vectors and glossiness alpha remain linear
data. The complete conversion settings and before/after hashes are recorded in
the texture manifest.

The 74 output maps total **10,598,514 bytes**: **10,074,931 bytes** used by the
cafe, plus **523,583 bytes** unique to the townhouse. Source DDS files total
675,384,712 bytes and are retained only in the external acquisition cache.
The original specular-glossiness material response is adapted through a local
physical-material shader adapter. Glass uses opaque reflective panes because
these selected buildings are exterior shells without modeled interiors.

The generated JavaScript data embeds the selected geometry and converted
textures for a completely offline game. Runtime instances own their geometries,
materials and texture objects independently; immutable image sources are shared.

## Rebuilding and verification

From the repository root, with the existing npm dependencies installed:

```sh
node scripts/pack-district-asset.mjs
```

This repacks from the committed lossless selected capture and converted maps
when the complete external source cache is absent. If a full source cache is
available, `TOMATO_DISTRICT_SOURCE` may point to the folder containing the
original `bistro.gltf` and `bistro.bin`; the original binary hash is verified
before use.

Acquiring or reconverting original texture sources additionally requires Python
and Pillow with DDS/BC7 and WebP support:

```sh
python3 scripts/convert-district-textures.py --gltf /path/to/bistro.gltf
node scripts/pack-district-asset.mjs
```

The conversion script downloads only maps referenced by the selected roots,
verifies every original against its official NVIDIA Git LFS pointer, and writes
the converted maps and provenance manifest. Changing texture output requires
repacking the JavaScript data afterwards.

Validation checked all 74 official source hashes and sizes, all converted file
hashes, image decoding and dimensions. Lossless data-map RGBA pixels match the
expected resized source exactly, and transparent diffuse alpha matches its
expected resized source exactly. Geometry bounds, finite attributes and
independent resource ownership are checked separately by the asset integration.
