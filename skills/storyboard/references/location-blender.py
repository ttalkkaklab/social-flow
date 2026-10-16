"""Build immutable location meshes or render a bound camera with Blender."""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
job = json.load(open(args[0], encoding='utf-8'))
m = job['manifest']
out = job['output']
os.makedirs(out, exist_ok=True)


def material(color):
    mat = bpy.data.materials.new(color)
    srgb = [int(color[i:i+2], 16)/255 for i in (1, 3, 5)]
    rgb = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb]
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*rgb, 1)
    node.inputs['Roughness'].default_value = 0.65
    return mat


def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


def camera(spec):
    cam = bpy.data.objects.get('location-camera')
    if cam is None:
        cam = bpy.data.objects.new('location-camera', bpy.data.cameras.new('location-camera'))
        bpy.context.collection.objects.link(cam)
    cam.location = spec['position']
    aim(cam, spec['target'])
    cam.data.lens = spec['lensMm']
    cam.data.sensor_width = 36
    cam.data.sensor_fit = 'HORIZONTAL'
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = spec['width']
    bpy.context.scene.render.resolution_y = spec['height']
    bpy.context.scene.render.resolution_percentage = 100
    return cam


if job['action'] == 'build':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for spec in m['objects']:
        if spec['kind'] == 'box':
            bpy.ops.mesh.primitive_cube_add(size=1)
        elif spec['kind'] == 'cylinder':
            bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.5, depth=1)
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.5)
        obj = bpy.context.object
        obj.name = spec['id']
        obj.hide_render = not spec.get('visible', True)
        obj.hide_viewport = not spec.get('visible', True)
        obj['locationId'] = spec['id']
        obj.location = spec['position']
        obj.dimensions = spec['size']
        obj.rotation_euler = [math.radians(x) for x in spec.get('rotation', [0, 0, 0])]
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(material(spec['color']))
        bevel = obj.modifiers.new('soft edges', 'BEVEL')
        bevel.width = min(min(spec['size'])/8, 0.035)
        bevel.segments = 3
        obj.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    world = bpy.data.worlds.new('Location world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.24, 0.28, 0.34, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.45
    bpy.context.scene.world = world
    for name, position, energy, size in [('key', [0, -1, 5], 1100, 5), ('fill', [-4, -3, 3], 550, 4)]:
        lamp = bpy.data.lights.new(name, 'AREA')
        lamp.energy = energy
        lamp.shape = 'DISK'
        lamp.size = size
        ob = bpy.data.objects.new(name, lamp)
        bpy.context.collection.objects.link(ob)
        ob.location = position
        aim(ob, [0, 0, 0])
    camera(next(iter(m['cameras'].values())))
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.samples = 16
    bpy.context.scene.cycles.use_denoising = True
    bpy.context.scene.view_settings.view_transform = 'AgX'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'source.blend'))
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'preview.glb'), export_format='GLB', export_extras=True, export_cameras=False, export_lights=False)
else:
    bpy.ops.wm.open_mainfile(filepath=job['blend'])
    state = m['states'][job['stateId']]
    for oid, patch in state.get('objects', {}).items():
        ob = bpy.data.objects[oid]
        if 'position' in patch:
            ob.location = patch['position']
        if 'rotation' in patch:
            ob.rotation_euler = [math.radians(x) for x in patch['rotation']]
        if 'visible' in patch:
            ob.hide_render = not patch['visible']
    for ob in bpy.data.objects:
        if ob.type == 'LIGHT':
            ob.data.energy *= state['light']
    bpy.context.scene.world.node_tree.nodes['Background'].inputs[1].default_value *= state['light']
    bpy.context.scene.render.image_settings.file_format = 'PNG'
    for name, spec in job['cameras'].items():
        camera(spec)
        bpy.context.scene.render.filepath = os.path.join(out, name + '.png')
        bpy.ops.render.render(write_still=True)
print('LOCATION_RENDER_OK')
