#!/usr/bin/env python3
"""Acquire and format-convert only the selected, licensed Bistro maps.

Requires Pillow with DDS/BC7 and WebP support; no game runtime dependency.
The upstream scene and full binary remain in the external /tmp source cache.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
import json
from pathlib import Path
import struct
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from PIL import Image, features


PIN = "2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e"
BASE = "https://raw.githubusercontent.com/zeux/niagara_bistro/" + PIN + "/"
UPSTREAM_PIN = "1da7b749ef0e3fb606ab46dde8e5bfbacd078a02"
UPSTREAM_BASE = "https://raw.githubusercontent.com/NVIDIAGameWorks/rtxdi-assets/" + UPSTREAM_PIN + "/bistro/"
VARIANTS = {"cafe": [113, 135, 60, 15], "townhouse": [66]}


def digest(data):
    return sha256(data).hexdigest()


def selected_materials(gltf, roots):
    materials = set()

    def visit(node_id):
        node = gltf["nodes"][node_id]
        if "mesh" in node:
            for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
                materials.add(primitive["material"])
        for child in node.get("children", []):
            visit(child)

    for root in roots:
        visit(root)
    return materials


def collect_texture_uses(gltf):
    uses = {}

    def collect(value, material_id, variant, key=""):
        if isinstance(value, dict):
            if key.endswith("Texture") and "index" in value:
                use = uses.setdefault(value["index"], {"roles": set(), "materials": set(), "variants": set()})
                use["roles"].add(key)
                use["materials"].add(material_id)
                use["variants"].add(variant)
            for child_key, item in value.items():
                collect(item, material_id, variant, child_key)
        elif isinstance(value, list):
            for item in value:
                collect(item, material_id, variant, key)

    for variant, roots in VARIANTS.items():
        for material_id in selected_materials(gltf, roots):
            collect(gltf["materials"][material_id], material_id, variant)
    return uses


def acquire(uri, cache):
    target = cache / uri
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        error = None
        for attempt in range(4):
            try:
                request = Request(BASE + uri, headers={"User-Agent": "TomatoRepublic-licensed-asset-converter/1.0"})
                with urlopen(request, timeout=120) as response:
                    data = response.read()
                if data[:4] != b"DDS ":
                    raise ValueError("Source is not a DDS file: " + uri)
                temporary = target.with_suffix(target.suffix + ".download")
                temporary.write_bytes(data)
                temporary.replace(target)
                return target
            except (URLError, OSError, ValueError) as exception:
                error = exception
                time.sleep(min(3, attempt + 1))
        raise RuntimeError("Cannot acquire " + uri) from error
    return target


def resize_channels(image, maximum):
    width, height = image.size
    if max(width, height) <= maximum:
        return image
    scale = maximum / max(width, height)
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    # Resize data channels independently: an unrelated glossiness/alpha channel
    # must never premultiply normal vectors or specular RGB during resampling.
    return Image.merge(image.mode, tuple(channel.resize(size, Image.Resampling.LANCZOS) for channel in image.split()))


def verify_official_pointer(uri, cache):
    """Bind mirror bytes to the exact officially MIT-licensed NVIDIA asset."""
    pointer_file = cache / "official-pointers" / (uri + ".txt")
    pointer_file.parent.mkdir(parents=True, exist_ok=True)
    if not pointer_file.exists():
        request = Request(UPSTREAM_BASE + uri, headers={"User-Agent": "TomatoRepublic-licensed-asset-converter/1.0"})
        with urlopen(request, timeout=60) as response:
            pointer = response.read()
        if not pointer.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
            raise ValueError("Official source is not a Git LFS pointer: " + uri)
        pointer_file.write_bytes(pointer)
    pointer = pointer_file.read_bytes()
    properties = dict(line.split(" ", 1) for line in pointer.decode().strip().splitlines())
    official_sha = properties["oid"].removeprefix("sha256:")
    source = (cache / uri).read_bytes()
    if digest(source) != official_sha or len(source) != int(properties["size"]):
        raise ValueError("Mirror DDS does not match the official NVIDIA asset: " + uri)
    return {
        "officialPointerUrl": UPSTREAM_BASE + uri,
        "officialPointerSha256": digest(pointer),
        "officialSourceSha256": official_sha,
        "officialSourceBytes": int(properties["size"]),
        "officialSourceMatch": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gltf", type=Path, default=Path("/tmp/bistro-bistro.gltf"))
    parser.add_argument("--cache", type=Path, default=Path("/tmp/tomato-district-v9/source"))
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "assets/district-v9")
    parser.add_argument("--workers", type=int, default=6)
    arguments = parser.parse_args()
    if not features.check("webp"):
        raise RuntimeError("Pillow requires WebP support")
    gltf = json.loads(arguments.gltf.read_text())
    uses = collect_texture_uses(gltf)
    sources = {}
    for texture_id, use in uses.items():
        definition = gltf["textures"][texture_id]
        image_id = definition.get("extensions", {}).get("MSFT_texture_dds", {}).get("source", definition.get("source"))
        uri = gltf["images"][image_id]["uri"]
        source = sources.setdefault(uri, {"textures": [], "roles": set(), "materials": set(), "variants": set()})
        source["textures"].append(texture_id)
        for key in ("roles", "materials", "variants"):
            source[key].update(use[key])
    print(json.dumps({"stage": "acquire", "textures": len(uses), "uniqueSources": len(sources)}), flush=True)
    with ThreadPoolExecutor(max_workers=max(1, min(6, arguments.workers))) as executor:
        tasks = {executor.submit(acquire, uri, arguments.cache): uri for uri in sources}
        done = 0
        for task in as_completed(tasks):
            uri = tasks[task]
            task.result()
            done += 1
            if done % 10 == 0 or done == len(tasks):
                print(json.dumps({"stage": "acquire", "complete": done, "total": len(tasks)}), flush=True)

    official_proofs = {}
    with ThreadPoolExecutor(max_workers=max(1, min(6, arguments.workers))) as executor:
        tasks = {executor.submit(verify_official_pointer, uri, arguments.cache): uri for uri in sources}
        for task in as_completed(tasks):
            official_proofs[tasks[task]] = task.result()
    print(json.dumps({"stage": "official-source-verified", "files": len(official_proofs)}), flush=True)

    output_textures = arguments.output / "textures"
    output_textures.mkdir(parents=True, exist_ok=True)
    entries = []
    file_entries = []
    for uri, use in sorted(sources.items()):
        source_file = arguments.cache / uri
        source_data = source_file.read_bytes()
        source_sha = digest(source_data)
        source_image = Image.open(source_file).convert("RGBA")
        source_size = list(source_image.size)
        source_extrema = source_image.getextrema()
        source_alpha = list(source_extrema[3])
        roles = sorted(use["roles"])
        if "normalTexture" in roles:
            kind, maximum, color_space = "normal", 512, "linear"
        elif any(role in roles for role in ("specularGlossinessTexture", "metallicRoughnessTexture", "occlusionTexture")):
            kind, maximum, color_space = "specular-glossiness", 512, "sRGB RGB / linear alpha"
        else:
            kind, maximum, color_space = "diffuse", 1024, "sRGB"
        alpha_materials = [material_id for material_id in sorted(use["materials"]) if gltf["materials"][material_id].get("alphaMode", "OPAQUE") != "OPAQUE"]
        image = resize_channels(source_image, maximum)
        if kind == "diffuse" and not alpha_materials:
            extension, mime = ".jpg", "image/jpeg"
            image = image.convert("RGB")
            settings = {"quality": 88, "subsampling": 0, "optimize": True, "progressive": True}
            encoding = "JPEG quality=88, 4:4:4; unused opaque-material alpha omitted"
        elif kind == "diffuse":
            extension, mime = ".webp", "image/webp"
            settings = {"quality": 90, "method": 6, "exact": True}
            encoding = "WebP quality=90; lossless alpha preserved for MASK/BLEND material"
        else:
            extension, mime = ".webp", "image/webp"
            settings = {"lossless": True, "method": 6, "exact": True}
            encoding = "lossless WebP RGBA; every data channel retained"
        filename = Path(uri).stem + "-" + source_sha[:10] + extension
        relative = "textures/" + filename
        target = arguments.output / relative
        image.save(target, **settings)
        result_data = target.read_bytes()
        dxgi = struct.unpack_from("<I", source_data, 128)[0] if source_data[84:88] == b"DX10" else None
        record = {
            "uri": relative,
            "mime": mime,
            "bytes": len(result_data),
            "sha256": digest(result_data),
            "width": image.width,
            "height": image.height,
            "kind": kind,
            "roles": roles,
            "colorSpace": color_space,
            "inputUri": uri,
            "sourceUrl": BASE + uri,
            "sourceSha256": source_sha,
            "sourceBytes": len(source_data),
            "sourceWidth": source_size[0],
            "sourceHeight": source_size[1],
            "sourceDxgiFormat": dxgi,
            "sourceAlphaRange": source_alpha,
            "alphaMaterials": alpha_materials,
            "variants": sorted(use["variants"]),
            "changes": "DDS BC7 decoded using Pillow; no gamma/color conversion; channels independently downsampled with Lanczos to max " + str(maximum) + "; " + encoding,
            **official_proofs[uri],
        }
        file_entries.append(record)
        for texture_id in sorted(use["textures"]):
            entries.append({"texture": texture_id, **record})
        print(json.dumps({"stage": "convert", "complete": len(file_entries), "total": len(sources), "bytes": len(result_data), "file": filename}), flush=True)

    manifest = {
        "sourceRepository": "https://github.com/zeux/niagara_bistro",
        "sourceCommit": PIN,
        "upstreamRepository": "https://github.com/NVIDIAGameWorks/rtxdi-assets",
        "upstreamCommit": UPSTREAM_PIN,
        "license": "MIT",
        "copyright": "Copyright (c) 2023 NVIDIA GameWorks",
        "originalSceneCredit": "Amazon Lumberyard Bistro",
        "sourceGltfSha256": digest(arguments.gltf.read_bytes()),
        "officialSourceMatch": True,
        "officialSourceVerification": "Every downloaded DDS SHA256 and byte length matches the Git LFS pointer at the pinned, MIT-licensed NVIDIA GameWorks commit.",
        "conversion": "Technical format conversion only; RGB/alpha channels and their transfer encoding preserved. JPEG diffuse is sRGB; normal maps are linear; source specular RGB is sRGB and glossiness alpha linear. Runtime converts glossiness to roughness as required.",
        "variants": VARIANTS,
        "uniqueFiles": len(file_entries),
        "outputBytes": sum(record["bytes"] for record in file_entries),
        "sourceBytes": sum(record["sourceBytes"] for record in file_entries),
        "textures": sorted(entries, key=lambda entry: entry["texture"]),
        "files": file_entries,
    }
    (arguments.output / "texture-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"stage": "complete", "files": manifest["uniqueFiles"], "outputBytes": manifest["outputBytes"], "sourceBytes": manifest["sourceBytes"]}), flush=True)


if __name__ == "__main__":
    main()
