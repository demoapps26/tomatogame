"""Export the CC0 MakeHuman core assets to a compact, synchronous Three.js rig.

Run with Blender 4.3+: blender -b --factory-startup --python
scripts/export-human-asset.py -- --mpfb /path/to/mpfb2/src --output /tmp/human-v9
Only MPFB's asset output is distributed; its GPL Python application is a build tool.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--mpfb', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = Path(__file__).resolve().parent.parent
source = root / 'assets/human-v9/source'
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, args.mpfb)
# Cloud build machines may have a read-only user profile. Keep tool state local.
original_resource_path = bpy.utils.resource_path
bpy.utils.resource_path = lambda kind: str(output / 'blender-user') if kind == 'USER' else original_resource_path(kind)
bpy.utils.extension_path_user = lambda package, path='', create=False: str(output / 'mpfb-user' / path)
import mpfb
bpy.context.preferences.addons.new().module = 'mpfb'
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService

materials = {
    'skin': {'map': 'skins/young_caucasian_male/young_lightskinned_male_diffuse.png', 'roughness': .62},
    'worker': {'map': 'clothes/male_worksuit01/male_worksuit01_diffuse.png', 'normalMap': 'clothes/male_worksuit01/male_worksuit01_normal.png', 'aoMap': 'clothes/male_worksuit01/male_worksuit01_ao.png', 'roughness': .91},
    'citizen': {'map': 'clothes/male_casualsuit03/male_casualsuit03_diffuse.png', 'normalMap': 'clothes/male_casualsuit03/male_casualsuit03_normal.png', 'aoMap': 'clothes/male_casualsuit03/male_casualsuit03_ao.png', 'roughness': .9},
    'shoes': {'map': 'clothes/shoes02/shoes02_diffuse.png', 'roughness': .75},
    'eyes': {'map': 'eyes/materials/brown_eye.png', 'roughness': .16},
    'hair': {'map': 'hair/short02/short02_diffuse.png', 'roughness': .85, 'alphaTest': .32, 'doubleSided': True},
    'eyebrows': {'map': 'eyebrows/eyebrow001/eyebrow001.png', 'roughness': .92, 'alphaTest': .32, 'doubleSided': True},
}
# Convert/downsample textures through Blender; retain all original source pixels.
for material_id, definition in materials.items():
    for channel in ['map', 'normalMap', 'aoMap']:
        if channel not in definition:
            continue
        original = source / definition[channel]
        image = bpy.data.images.load(str(original), check_existing=False)
        image.colorspace_settings.name = 'sRGB' if channel == 'map' else 'Non-Color'
        max_size = 2048 if material_id == 'skin' else 1024
        ratio = min(1., max_size / max(image.size))
        if ratio < 1:
            image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
        has_alpha = material_id in ['hair', 'eyebrows']
        image.file_format = 'PNG' if has_alpha or channel == 'normalMap' else 'JPEG'
        filename = material_id + '-' + channel + ('.png' if image.file_format == 'PNG' else '.jpg')
        image.filepath_raw = str(output / filename)
        image.save(quality=92)
        definition[channel] = filename
        bpy.data.images.remove(image)

out = {'license': 'CC0-1.0', 'materials': materials, 'variants': {}}


def orient_bone(armature, name, direction):
    """Align a posed bone in armature space, preserving its head position."""
    bpy.context.view_layer.update()
    bone = armature.pose.bones[name]
    matrix = bone.matrix.copy()
    current = matrix.to_quaternion() @ Vector((0, 1, 0))
    rotation = current.rotation_difference(Vector(direction).normalized())
    matrix = rotation.to_matrix().to_4x4() @ matrix
    matrix.translation = bone.head
    bone.matrix = matrix
    bpy.context.view_layer.update()


for variant, garment in [('worker', 'male_worksuit01'), ('citizen', 'male_casualsuit03')]:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    macro = TargetService.get_default_macro_info_dict()
    macro.update(gender=1., age=.32, muscle=.55, weight=.48, height=.55, proportions=.6)
    macro['race'] = {'asian': 0., 'african': 0., 'caucasian': 1.}
    human = HumanService.create_human(macro_detail_dict=macro)
    HumanService.set_character_skin(str(source / 'skins/young_caucasian_male/young_caucasian_male.mhmat'), human, skin_type='MAKESKIN')
    armature = HumanService.add_builtin_rig(human, 'game_engine')
    objects = [(human, 'skin')]
    for asset, asset_type, material_id in [
        ('clothes/' + garment + '/' + garment + '.mhclo', 'Clothes', variant),
        ('clothes/shoes02/shoes02.mhclo', 'Clothes', 'shoes'),
        ('eyes/low-poly/low-poly.mhclo', 'Eyes', 'eyes'),
        ('hair/short02/short02.mhclo', 'Hair', 'hair'),
        ('eyebrows/eyebrow001/eyebrow001.mhclo', 'Eyebrows', 'eyebrows'),
    ]:
        obj = HumanService.add_mhclo_asset(str(source / asset), human, asset_type=asset_type, subdiv_levels=0)
        objects.append((obj, material_id))
    # Rest the arms beside the body rather than shipping the generator's A-pose.
    # The deformation is baked into the exported neutral mesh and joint centres.
    for suffix, side in [('l', 1), ('r', -1)]:
        orient_bone(armature, 'upperarm_' + suffix, (side * .048, .014, -.31))
        orient_bone(armature, 'lowerarm_' + suffix, (side * .015, -.024, -.25))
        orient_bone(armature, 'hand_' + suffix, (side * .004, -.012, -.1))
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = [(obj, material_id, obj.evaluated_get(depsgraph)) for obj, material_id in objects]
    floor = min((eval_obj.matrix_world @ vertex.co).z for _, _, eval_obj in evaluated for vertex in eval_obj.data.vertices)
    crown = max((eval_obj.matrix_world @ vertex.co).z for _, _, eval_obj in evaluated for vertex in eval_obj.data.vertices)
    scale = 1.8 / (crown - floor)

    def point(v):
        return [v.x * scale, (v.z - floor) * scale, -v.y * scale]

    def normal(v):
        v.normalize()
        return [v.x, v.z, -v.y]

    bone_names = [bone.name for bone in armature.data.bones]
    bones = []
    for bone in armature.data.bones:
        posed = armature.pose.bones[bone.name]
        bones.append({'name': bone.name, 'parent': bone_names.index(bone.parent.name) if bone.parent else -1,
                      'head': point(armature.matrix_world @ posed.head),
                      'tail': point(armature.matrix_world @ posed.tail)})
    parts = []
    support = []
    for obj, material_id, eval_obj in evaluated:
        mesh = eval_obj.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        mesh.calc_loop_triangles()
        matrix = eval_obj.matrix_world
        nmatrix = matrix.to_3x3().inverted().transposed()
        skin = []
        for vertex in mesh.vertices:
            influences = []
            for group in vertex.groups:
                name = obj.vertex_groups[group.group].name
                if name in bone_names and group.weight > .00001:
                    influences.append((bone_names.index(name), group.weight))
            influences.sort(key=lambda value: value[1], reverse=True)
            influences = influences[:4] or [(bone_names.index('head' if material_id in ['eyes','hair','eyebrows'] else 'pelvis'), 1.)]
            total = sum(weight for _, weight in influences)
            skin.append(([index for index, _ in influences] + [0] * (4 - len(influences)),
                         [weight / total for _, weight in influences] + [0.] * (4 - len(influences))))
        uv = mesh.uv_layers.active.data
        positions, normals, uvs, joint_indices, weights, indices = [], [], [], [], [], []
        lookup = {}
        for triangle in mesh.loop_triangles:
            for loop_index, vertex_index in zip(triangle.loops, triangle.vertices):
                vertex = mesh.vertices[vertex_index]
                texcoord = tuple(uv[loop_index].uv)
                n = tuple(mesh.corner_normals[loop_index].vector)
                key = (vertex_index, texcoord, n)
                if key not in lookup:
                    lookup[key] = len(positions) // 3
                    p = point(matrix @ vertex.co)
                    positions.extend(p)
                    normals.extend(normal(nmatrix @ Vector(n)))
                    uvs.extend(texcoord)
                    joint_indices.extend(skin[vertex_index][0])
                    weights.extend(skin[vertex_index][1])
                    # Support points follow the actual bound skin and shoe sole.
                    if material_id == 'shoes' and p[1] < .065:
                        support.append({'p': p, 'j': skin[vertex_index][0], 'w': skin[vertex_index][1]})
                indices.append(lookup[key])
        parts.append({'name': material_id, 'material': material_id, 'position': positions, 'normal': normals,
                      'uv': uvs, 'skinIndex': joint_indices, 'skinWeight': weights, 'indices': indices})
        eval_obj.to_mesh_clear()
    # A small spatial grid keeps useful sole samples without per-frame full-mesh traversal.
    grid = {}
    for entry in support:
        key = (round(entry['p'][0] / .035), round(entry['p'][2] / .045))
        if key not in grid or entry['p'][1] < grid[key]['p'][1]:
            grid[key] = entry
    out['variants'][variant] = {'bones': bones, 'parts': parts, 'support': list(grid.values()), 'height': 1.8}
    print('EXPORTED', variant, 'triangles', sum(len(part['indices']) // 3 for part in parts), 'vertices', sum(len(part['position']) // 3 for part in parts), 'support', len(grid), 'original_height', crown - floor)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / ('human-' + variant + '.blend')))
(output / 'human.json').write_text(json.dumps(out, separators=(',', ':')))
print('EXPORT COMPLETE', output)
