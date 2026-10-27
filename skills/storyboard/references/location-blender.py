"""Build immutable location meshes or render a bound camera with Blender."""
import json
import math
import os
import sys

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

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


def apply_state(state_id):
    """Reset every set object before applying a complete endpoint state."""
    state = m['states'][state_id]
    for base in m['objects']:
        spec = {**base, **state.get('objects', {}).get(base['id'], {})}
        ob = bpy.data.objects[base['id']]
        ob.location = spec['position']
        ob.rotation_euler = [math.radians(x) for x in
                             spec.get('rotation', [0, 0, 0])]
        ob.hide_render = not spec.get('visible', True)
    for name, energy in [('key', 1100), ('fill', 550)]:
        bpy.data.lights[name].energy = energy * state['light']
    background = bpy.context.scene.world.node_tree.nodes['Background']
    background.inputs[1].default_value = 0.45 * state['light']


def proxy_part(parent, name, position, size, mat, sphere=False):
    if sphere:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8,
                                           radius=0.5)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.object
    ob.name = name
    ob.parent = parent
    ob.location = position
    ob.dimensions = size
    ob.data.materials.append(mat)
    return ob


def build_actors():
    """Make rigid body proxies with a separate head and visible facing cues."""
    result = {}
    for actor in (job.get('blocking') or {}).get('actors', []):
        h = actor['height']
        root = bpy.data.objects.new('actor-' + actor['id'], None)
        bpy.context.collection.objects.link(root)
        mat = material(actor['color'])
        for name, x in [('L', .105), ('R', -.105)]:
            proxy_part(root, name + '-leg', [x*h, 0, .24*h],
                       [.13*h, .16*h, .48*h], mat)
            proxy_part(root, name + '-foot', [x*h, -.045*h, .035*h],
                       [.14*h, .25*h, .07*h], mat)
            proxy_part(root, name + '-arm', [x*2.05*h, 0, .61*h],
                       [.09*h, .12*h, .32*h], mat)
        proxy_part(root, 'torso', [0, 0, .65*h],
                   [.34*h, .20*h, .35*h], mat, sphere=True)
        head = bpy.data.objects.new('head-' + actor['id'], None)
        bpy.context.collection.objects.link(head)
        head.parent = root
        head.location = [0, 0, .91*h]
        head.rotation_mode = 'QUATERNION'
        proxy_part(head, 'head-mesh', [0, 0, 0],
                   [.18*h, .17*h, .18*h], mat, sphere=True)
        proxy_part(head, 'nose', [0, -.105*h, 0],
                   [.045*h, .065*h, .035*h], mat)
        result[actor['id']] = (root, head)
    return result


def poses(phase):
    return {a['id']: a.get('end', a['start']) if phase == 'end'
            else a['start']
            for a in (job.get('blocking') or {}).get('actors', [])}


def place_actors(actors, pose, state_id):
    objects = {o['id']: {**o, **m['states'][state_id].get(
        'objects', {}).get(o['id'], {})} for o in m['objects']}
    for aid, (root, head) in actors.items():
        p = pose[aid]
        root.location = p['position']
        root.rotation_euler = [0, 0, math.radians(p['rotationZDeg'])]
        head.rotation_quaternion = (1, 0, 0, 0)
        target_id = p.get('gazeTarget')
        target = None
        if target_id in actors:
            other_root, other_head = actors[target_id]
            target = Vector(pose[target_id]['position']) + Vector(
                [0, 0, other_head.location.z])
        elif target_id in objects:
            target = Vector(bpy.data.objects[target_id].location)
        if target is not None:
            origin = Vector(p['position']) + Vector([0, 0, head.location.z])
            direction = target - origin
            if direction.length > 1e-6:
                world = direction.to_track_quat('-Y', 'Z')
                head.rotation_quaternion = (
                    root.rotation_euler.to_quaternion().inverted() @ world)


def linear_keys():
    # Blender 4.x actions and Blender 5.x layered actions expose curves differently.
    for ob in bpy.context.scene.objects:
        if not ob.animation_data or not ob.animation_data.action:
            continue
        action = ob.animation_data.action
        if hasattr(action, 'fcurves'):
            curves = action.fcurves
        else:
            curves = [curve for layer in action.layers
                      for strip in layer.strips
                      for bag in strip.channelbags for curve in bag.fcurves]
        for curve in curves:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'


def render_previz(actors):
    """Render the same set, camera and blocking used by the still references."""
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = job['frameEnd']
    scene.render.fps = job['fps']
    scene.render.fps_base = 1
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.use_stamp = False
    scene.render.film_transparent = False
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True
    scene.display.render_aa = '8'
    for ob in scene.objects:
        if ob.type == 'MESH' and ob.get('locationId'):
            ob.data.materials.clear()
            ob.data.materials.append(material('#999999'))
    start_state = job['stateId']
    end_state = job.get('endStateId', start_state)
    for frame, state_id in [(1, start_state), (scene.frame_end, end_state)]:
        scene.frame_set(frame)
        apply_state(state_id)
        for base in m['objects']:
            ob = bpy.data.objects[base['id']]
            for data_path in ['location', 'rotation_euler', 'hide_render']:
                ob.keyframe_insert(data_path=data_path, frame=frame)
    # Gaze samples must read the same object trajectories the final clip renders.
    linear_keys()
    first = job['camera']
    last = {**first, **first.get('end', {})}
    opening, ending = poses('start'), poses('end')
    # Sample the target point each frame so gaze and camera aiming share the path.
    for frame in range(1, scene.frame_end + 1):
        scene.frame_set(frame)
        t = (frame - 1) / max(1, scene.frame_end - 1)
        c = {**first, **{k: [a + (b-a)*t for a, b in zip(first[k], last[k])]
                        for k in ['position', 'target']}}
        c['lensMm'] = first['lensMm'] + (last['lensMm']-first['lensMm'])*t
        cam = camera(c)
        for data_path in ['location', 'rotation_euler']:
            cam.keyframe_insert(data_path=data_path, frame=frame)
        cam.data.keyframe_insert(data_path='lens', frame=frame)
        current = {}
        for aid, p in opening.items():
            q = ending[aid]
            current[aid] = {**(q if t == 1 else p),
                            'position': [a + (b-a)*t for a, b in
                                         zip(p['position'], q['position'])],
                            'rotationZDeg': p['rotationZDeg'] +
                            (q['rotationZDeg']-p['rotationZDeg'])*t}
        place_actors(actors, current, end_state if t == 1 else start_state)
        for root, head in actors.values():
            for data_path in ['location', 'rotation_euler']:
                root.keyframe_insert(data_path=data_path, frame=frame)
            head.keyframe_insert(data_path='rotation_quaternion', frame=frame)
    linear_keys()
    scene['locationFingerprint'] = job['fingerprint']
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'previz.blend'))
    ims = scene.render.image_settings
    if hasattr(ims, 'media_type'):
        ims.media_type = 'VIDEO'
    ims.file_format = 'FFMPEG'
    ims.color_mode = 'RGB'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'
    scene.render.ffmpeg.audio_codec = 'NONE'
    scene.render.filepath = os.path.join(out, 'motion-')
    bpy.ops.render.render(animation=True)
    videos = [name for name in os.listdir(out)
              if name.startswith('motion-') and name.endswith('.mp4')]
    if len(videos) != 1:
        raise RuntimeError('Expected one complete location previz video')
    os.replace(os.path.join(out, videos[0]), os.path.join(out, 'previz.mp4'))
    if hasattr(ims, 'media_type'):
        ims.media_type = 'IMAGE'
    ims.file_format = 'PNG'
    for name, frame in [('start', 1), ('middle', (scene.frame_end+1)//2),
                        ('end', scene.frame_end)]:
        scene.frame_set(frame)
        scene.render.filepath = os.path.join(out, name + '.png')
        bpy.ops.render.render(write_still=True)


def spatial_report(actors, phase, spec, state_id):
    """Measure authored geometry, never infer real-world truth from a render."""
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    pose = poses(phase)
    meshes = [o for o in scene.objects if o.type == 'MESH' and not o.hide_render]

    def owner(obj):
        while obj.parent:
            obj = obj.parent
        return obj.name.removeprefix('actor-')

    def obstruction(origin, target, exclude):
        delta = target - origin
        if delta.length < 1e-6:
            return None
        hits = []
        for obj in meshes:
            if owner(obj) in exclude:
                continue
            evaluated = obj.evaluated_get(depsgraph)
            inverse = evaluated.matrix_world.inverted()
            local_origin = inverse @ origin
            local_target = inverse @ target
            ray = local_target - local_origin
            if ray.length < 1e-8:
                continue
            hit, point, _, _ = evaluated.ray_cast(
                local_origin, ray.normalized(), distance=ray.length)
            if hit:
                distance = (evaluated.matrix_world @ point - origin).length
                if distance < delta.length - 1e-5:
                    hits.append((distance, owner(obj)))
        return min(hits)[1] if hits else None

    rows = []
    for aid, (root, head) in actors.items():
        height = next(a['height'] for a in job['blocking']['actors']
                      if a['id'] == aid)
        eye = head.matrix_world.translation.copy()
        samples = []
        for name, offset in [('head', (0, 0, .91)),
                             ('chest', (0, 0, .65)),
                             ('hips', (0, 0, .48)),
                             ('left', (.22, 0, .61)),
                             ('right', (-.22, 0, .61))]:
            point = root.matrix_world @ (Vector(offset) * height)
            ndc = world_to_camera_view(scene, scene.camera, point)
            blocker = obstruction(scene.camera.location, point, {aid})
            samples.append({'name': name, 'world': list(point),
                            'screen': [ndc.x, ndc.y], 'depth': ndc.z,
                            'inFrame': 0 <= ndc.x <= 1 and 0 <= ndc.y <= 1
                            and scene.camera.data.clip_start <= ndc.z
                            <= scene.camera.data.clip_end,
                            'blockedBy': blocker})
        target_id = pose[aid].get('gazeTarget')
        target = None
        if target_id in actors:
            target = actors[target_id][1].matrix_world.translation
        elif target_id and bpy.data.objects.get(target_id):
            target = bpy.data.objects[target_id].matrix_world.translation
        gaze = None
        if target is not None:
            gaze = {'target': target_id, 'distanceMetres': (target-eye).length,
                    'blockedBy': obstruction(eye, target, {aid, target_id})}
        rows.append({'id': aid, 'height': height, **pose[aid],
                     'eyePosition': list(eye), 'gaze': gaze,
                     'cameraSamples': samples})
    distances = [{'from': a['id'], 'to': b['id'],
                  'floorOriginDistanceMetres':
                  (Vector(a['position'])-Vector(b['position'])).length}
                 for i, a in enumerate(rows) for b in rows[i+1:]]
    objects = []
    for base in m['objects']:
        obj = bpy.data.objects[base['id']]
        objects.append({'id': base['id'], 'label': base['label'],
                        'position': list(obj.matrix_world.translation),
                        'dimensions': list(obj.dimensions),
                        'rotationDeg': [math.degrees(v) for v in obj.rotation_euler],
                        'visible': not obj.hide_render})
    return {'phase': phase, 'stateId': state_id, 'camera': spec,
            'actors': rows, 'objects': objects, 'actorDistances': distances}


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
    actors = build_actors()
    if job['action'] == 'previz':
        render_previz(actors)
    else:
        bpy.context.scene.render.use_stamp = False
        bpy.context.scene.render.image_settings.file_format = 'PNG'
        reports = {}
        for name, spec in job['cameras'].items():
            phase = 'end' if name.startswith('end') else 'start'
            state_id = job.get('endStateId', job['stateId']) if phase == 'end' else job['stateId']
            apply_state(state_id)
            place_actors(actors, poses(phase), state_id)
            camera(spec)
            bpy.context.scene.render.filepath = os.path.join(out, name + '.png')
            bpy.ops.render.render(write_still=True)
            reports[name] = spatial_report(actors, phase, spec, state_id)
        report = {'version': 1, 'units': 'metres', 'up': 'Z',
                  'fingerprint': job.get('fingerprint'),
                  'provenance': m['provenance'], 'views': reports,
                  'limits': ['Authored proxy geometry, not measured reality.',
                             'Opaque mesh ray intersections; transparency is ignored.',
                             'Five actor sample points, not silhouette visibility percentages.',
                             'Screen coordinates use bottom-left origin.',
                             'Gaze tests target centres; no field-of-view or perception claim.']}
        with open(os.path.join(out, 'spatial.json'), 'w', encoding='utf-8') as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
print('LOCATION_RENDER_OK')
