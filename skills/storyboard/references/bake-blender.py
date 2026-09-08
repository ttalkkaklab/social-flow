#!/usr/bin/env python3
"""bake-blender.py — bake a mesh recipe (mesh-objects.md) into a frame sheet with Blender Cycles.

  python3 bake-blender.py --recipe slides/assets/s4-supply.json --out slides/assets/s4-supply-obj \\
      --segs 1:4000,2:5600 --fps 30 --samples 64
  python3 bake-blender.py --recipe slides/assets/s4-supply.json --probe          # device · s/frame · forecast
  python3 bake-blender.py --recipe slides/assets/s4-supply.json --preview 2:0.5 --out .work/obj
  python3 bake-blender.py --selftest

The recipe is the same JSON the HTML mesh lane reads (camera, nodes, states, groups, bindings,
lighting). This script builds that scene in Blender, poses it at every output frame with the
same easing and motion windows the browser runtime uses, renders each frame with Cycles on a
transparent film over a shadow-catcher floor, and writes the sheet + sidecar contract that
`h.object` and `check-slide.js` already understand (rendered-object.md §3):

  <out>.png          the sheet — one cell per frame, alpha carries the object and its shadow
  <out>.js           window.SLIDE_OBJECTS[id] = {file, cell, cols, n, ranges, ink, renderer:"blender", …}
  <out>-preview.png  the last frame on an ink ground

Frames per group = round(fps × segment ms / 1000), so the object moves at the final capture
rate. Boundary frames are shared between neighbouring groups (the state rule). `--segs`
takes the measured narration lengths; without it the recipe's `durationMs` plan is used.
The cells are cropped to the union of every frame's ink (plus a margin) unless `--no-crop`,
which keeps the sheet inside the checker's 160-megapixel cap for a two-group cut at 30 fps.
The first and last frame of every group render first; a sheet that would blow the cap stops there.

Needs: Blender 4.2+ on this machine ($BLENDER, /Applications/Blender.app, or `blender` on
PATH) and numpy + Pillow for the outer process (the same as bake-object.py). Blender's own
Python runs the inner scene build; nothing is installed into it. Cycles uses the first GPU
backend it finds (Metal · OptiX · CUDA · HIP · oneAPI) and falls back to CPU with a warning.
The first render after an install compiles GPU kernels once (about two minutes on Metal);
`--probe` reports that separately from the steady per-frame time.

Not carried over from the runtime: `contactShadows` and `lighting.shadowOpacity` (Cycles traces
the real shadow) and GLB `clips` (refused — pose parts with `bindings` instead).
"""
import argparse, glob, hashlib, json, math, os, re, shutil, subprocess, sys, tempfile, time

try:
    import bpy  # noqa: F401  — present only when Blender runs this file as --python
    INSIDE_BLENDER = True
except ImportError:
    INSIDE_BLENDER = False

SHEET_PIXEL_CAP = 160_000_000      # object-sheet.js refuses a larger PNG (640 MB decoded per Chrome tab)
INK_ALPHA = 8                      # bake-object.py's ink threshold
SHADOW_FLOOR = 0.06                # alpha below this is the catcher's faint ambient veil, cut before cropping (§5 of blender-objects.md)
CROP_MARGIN = 8
FPS_ALLOWED = (15, 24, 30)

# ── math shared by the planner (outer) and the poser (inside Blender) ─────────────────────
# Ported from mesh-contract.js and Three.js so a frame here is the pose the browser runtime
# would compute at the same (group, progress). Three.js Euler order XYZ, quaternion (w, x, y, z).

def quat_from_euler_deg(x, y, z):
    a, b, c = (math.radians(v) / 2 for v in (x, y, z))
    c1, c2, c3, s1, s2, s3 = math.cos(a), math.cos(b), math.cos(c), math.sin(a), math.sin(b), math.sin(c)
    return (c1 * c2 * c3 - s1 * s2 * s3, s1 * c2 * c3 + c1 * s2 * s3,
            c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3)

def slerp(qa, qb, t):
    if t <= 0: return qa
    if t >= 1: return qb
    cos_half = sum(p * q for p, q in zip(qa, qb))
    if cos_half < 0:
        qb = tuple(-v for v in qb); cos_half = -cos_half
    if cos_half >= 1: return qa
    sqr_sin = 1 - cos_half * cos_half
    if sqr_sin <= 2.220446049250313e-16:
        s = 1 - t
        out = [s * p + t * q for p, q in zip(qa, qb)]
        n = math.sqrt(sum(v * v for v in out)) or 1
        return tuple(v / n for v in out)
    sin_half = math.sqrt(sqr_sin); half = math.atan2(sin_half, cos_half)
    ra, rb = math.sin((1 - t) * half) / sin_half, math.sin(t * half) / sin_half
    return tuple(p * ra + q * rb for p, q in zip(qa, qb))

def lerp3(a, b, u):
    return tuple(p + (q - p) * u for p, q in zip(a, b))

def ease(u, name):
    u = max(0.0, min(1.0, u))
    return u if name == "linear" else u * u * u * (u * (u * 6 - 15) + 10)

def sample_recipe(recipe, group, progress):
    groups = recipe["groups"]
    index = max(0, min(len(groups) - 1, group - 1))
    lo, hi = groups[index].get("motionWindow") or [0, 1]
    raw = 0 if group < 1 else 1 if group > len(groups) else (progress - lo) / (hi - lo)
    return recipe["states"][index], recipe["states"][index + 1], ease(raw, groups[index].get("ease"))

def pose_for(recipe, state, node_id):
    base = next((n.get("pose") or {} for n in recipe["nodes"] if n["id"] == node_id), {})
    over = (state.get("pose") or {}).get(node_id) or {}
    return {"position": over.get("position") or base.get("position") or [0, 0, 0],
            "rotation": over.get("rotation") or base.get("rotation") or [0, 0, 0],
            "scale": over.get("scale") or base.get("scale") or [1, 1, 1]}

# Three.js is Y-up, Blender is Z-up: (x, y, z) → (x, −z, y), the glTF importer's own conversion,
# so recipe poses and imported GLB parts share one frame of reference.
def to_blender_pos(v): return (v[0], -v[2], v[1])
def to_blender_scale(v): return (v[0], v[2], v[1])
def to_blender_quat(q): return (q[0], q[1], -q[3], q[2])

LOCAL_GLB = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*\.glb$")   # mesh-contract.js LOCAL_GLB

def check_sources(recipe, recipe_dir):
    """The mesh lane's file rules, which this CLI would otherwise skip: a source is a bare .glb
    filename beside the recipe, and its real path stays inside that directory. os.path.join keeps an
    absolute second argument as-is, so without this an absolute source would open anywhere."""
    for node in recipe.get("nodes", []):
        source = node.get("source")
        if not source: continue
        if not LOCAL_GLB.match(source):
            sys.exit(f"node {node.get('id')!r}: source must be a local .glb filename beside the recipe, got {source!r}")
        real = os.path.realpath(os.path.join(recipe_dir, source))
        if not real.startswith(os.path.realpath(recipe_dir) + os.sep):
            sys.exit(f"node {node.get('id')!r}: {source} resolves outside the recipe directory")
        if not os.path.isfile(real):
            sys.exit(f"node {node.get('id')!r}: {source} is missing beside the recipe")

def frame_plan(recipe, segs_ms, fps):
    """Frames per group, shared boundaries, and (group, progress) for every sheet frame."""
    ranges, start = {}, 0
    for g in sorted(segs_ms):
        n = max(2, int(round(fps * segs_ms[g] / 1000)))
        ranges[g] = [start, start + n]; start += n
    n = start + 1
    frames = []
    for i in range(n):
        for g in sorted(ranges):
            a, b = ranges[g]
            if a <= i <= b:
                frames.append((g, (i - a) / (b - a))); break
    return n, ranges, frames

def parse_segs(text, recipe):
    if not text or text == "auto":
        return {g["group"]: int(g["durationMs"]) for g in recipe["groups"]}
    out = {}
    for tok in text.replace(",", " ").split():
        g, ms = tok.split(":")
        if int(g) in out: sys.exit(f"--segs names group {g} twice")
        out[int(g)] = int(ms)
    want = [g["group"] for g in recipe["groups"]]
    if sorted(out) != want: sys.exit(f"--segs must cover groups {want}, got {sorted(out)}")
    if any(v < 200 for v in out.values()): sys.exit("--segs values are milliseconds ≥ 200")
    return out

def zone_width(recipe_dir):
    """The slide zone the object must fit, read from the episode's scenes.js window.FORMAT."""
    scenes = os.path.join(os.path.dirname(os.path.dirname(recipe_dir)), "scenes.js")
    portrait, landscape = 728, 1728
    try:
        head = open(scenes, encoding="utf-8").read(400)
    except OSError:
        return portrait
    return landscape if "youtube-long-16x9" in head else portrait

def sheet_dims(cell, cols, n):
    rows = (n + cols - 1) // cols
    return cell[0] * cols, cell[1] * rows

def remap_alpha(alpha, floor):
    """Drop the shadow catcher's faint veil: alpha ≤ floor becomes 0, the rest rescales to 0–1.
    The object (alpha ≈ 1) and the shadow core keep their weight; the ambient tail that the
    world light leaves across the whole visible floor goes, so the crop hugs the real shadow."""
    if floor <= 0: return alpha
    out = (alpha - floor) / (1 - floor)
    return out.clip(0, 1)

# ── Blender side ──────────────────────────────────────────────────────────────────────────
def hex_to_linear(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)

def inner_main(job_path):
    import bmesh
    from mathutils import Quaternion, Vector
    job = json.load(open(job_path, encoding="utf-8"))
    say = lambda *a: print("⟫", *a, flush=True)
    if job["mode"] == "capacity":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.refresh_devices()
        backend, names = None, []
        for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            try: prefs.compute_device_type = kind
            except TypeError: continue
            gpus = [d for d in prefs.devices if d.type != "CPU"]
            if gpus: backend, names = kind, [d.name for d in gpus]; break
        # Capacity mode uses only refresh_devices and compute_device_type, which every supported Blender
        # has, so it answers even on an install too old to bake — reporting that is its whole job.
        say("capacity", json.dumps({"blender": bpy.app.version_string, "backend": backend or "CPU",
                                     "devices": names or ["CPU"], "tooOld": bpy.app.version < (4, 2)}))
        return
    # The scene build uses the Khronos PBR Neutral view transform (4.2), the Principled Coat inputs
    # (4.0) and cycles.denoising_use_gpu (3.5). An older Blender throws a traceback deep inside instead.
    if bpy.app.version < (4, 2):
        sys.exit(f"bake-blender.py needs Blender 4.2 or newer, found {bpy.app.version_string}")
    recipe = job["recipe"]; recipe_dir = job["recipe_dir"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene

    # render settings
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.refresh_devices()
    backend, names = None, []
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try: prefs.compute_device_type = kind
        except TypeError: continue
        gpus = [d for d in prefs.devices if d.type != "CPU"]
        if gpus:
            backend = kind; names = [d.name for d in gpus]
            for d in prefs.devices: d.use = d.type != "CPU"
            break
    if backend: sc.cycles.device = "GPU"
    else:
        prefs.compute_device_type = "NONE"; sc.cycles.device = "CPU"; names = ["CPU"]
    say("device", backend or "CPU", "·", " / ".join(names))
    sc.cycles.samples = job["samples"]; sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True; sc.cycles.denoiser = "OPENIMAGEDENOISE"; sc.cycles.denoising_use_gpu = bool(backend)
    sc.cycles.seed = 0; sc.cycles.use_animated_seed = False
    sc.cycles.caustics_reflective = sc.cycles.caustics_refractive = False
    sc.render.use_persistent_data = True
    sc.render.resolution_x, sc.render.resolution_y = job["cell"]; sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"; sc.render.image_settings.compression = 30
    sc.view_settings.view_transform = job["view"]; sc.view_settings.look = "None"
    lighting = recipe.get("lighting") or {}
    light = float(job["light"])
    exposure = float(lighting.get("exposure", 1.05))
    if exposure <= 0: sys.exit("lighting.exposure must be greater than 0")   # the contract allows 0; log2 does not
    sc.view_settings.exposure = math.log2(exposure)

    # world — a lit room like the runtime's RoomEnvironment: brighter overhead, warm grey floor.
    # Three.js's room is emissive panels in the tens of units under environmentIntensity, so the
    # recipe's `environment` is scaled up here to land the same fill on the object.
    world = bpy.data.worlds.new("studio"); sc.world = world; world.use_nodes = True
    wn, wl = world.node_tree.nodes, world.node_tree.links
    bg = wn["Background"]
    coord = wn.new("ShaderNodeTexCoord"); split = wn.new("ShaderNodeSeparateXYZ")
    span = wn.new("ShaderNodeMapRange"); span.inputs["From Min"].default_value = -1; span.inputs["From Max"].default_value = 1
    ramp = wn.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.42, 0.40, 0.38, 1); ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.04, 1)
    mid = ramp.color_ramp.elements.new(0.5); mid.color = (0.80, 0.80, 0.83, 1)
    wl.new(coord.outputs["Generated"], split.inputs["Vector"]); wl.new(split.outputs["Z"], span.inputs["Value"])
    wl.new(span.outputs["Result"], ramp.inputs["Fac"]); wl.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = lighting.get("environment", 0.8 if recipe.get("style") == "photoreal3d" else 0.55) * 11.0 * light

    # camera — vertical fov like PerspectiveCamera, looking down local −Z with +Y up
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera")); sc.collection.objects.link(cam); sc.camera = cam
    pos = Vector(to_blender_pos(recipe["camera"]["position"])); target = Vector(to_blender_pos(recipe["camera"]["target"]))
    cam.location = pos; cam.rotation_mode = "QUATERNION"; cam.rotation_quaternion = (target - pos).to_track_quat("-Z", "Y")
    cam.data.sensor_fit = "VERTICAL"; cam.data.angle_y = math.radians(recipe["camera"]["fov"])
    cam.data.clip_start, cam.data.clip_end = 0.01, 200

    # lights — key with a soft disc, fill and rim without shadows (the runtime's three directionals).
    # The multipliers were measured against the Three.js runtime's frame of the same recipe
    # (lit-pixel mean 186·144·107 on the zhuge-liang cart, 2026-09-07); --light scales all four.
    def sun(name, from_pos, color, strength, shadow, angle_deg):
        light = bpy.data.lights.new(name, "SUN"); light.energy = strength; light.color = color[:3]
        light.angle = math.radians(angle_deg); light.use_shadow = shadow
        o = bpy.data.objects.new(name, light); sc.collection.objects.link(o)
        o.rotation_mode = "QUATERNION"; o.rotation_quaternion = (-Vector(from_pos)).to_track_quat("-Z", "Y")
        return o
    # The key's angular size sets how sharp a contact shadow reads: 4 degrees is a soft overcast edge,
    # around 1 degree is a hard sun. recipe.blender.keyAngle picks it (blender-objects.md §5).
    key_angle = float((recipe.get("blender") or {}).get("keyAngle", 4.0))
    if not 0.05 <= key_angle <= 20: sys.exit("blender.keyAngle is degrees, 0.05-20")
    sun("key", to_blender_pos(lighting.get("keyPosition") or [-3, 5, 6]), hex_to_linear(lighting.get("keyColor") or "#fff1df"),
        lighting.get("key", 2.5) * 3.8 * light, True, key_angle)
    sun("fill", to_blender_pos([4, 2, 3]), hex_to_linear("#b9d6ff"), lighting.get("fill", 0.9) * 1.6 * light, False, 20.0)
    sun("rim", to_blender_pos([1, 4, -4]), (1, 1, 1, 1), lighting.get("rim", 1.5) * 1.7 * light, False, 10.0)

    # floor — the shadow catcher; its shadow lands in the alpha channel
    floor = bpy.data.objects.new("floor", bpy.data.meshes.new("floor")); sc.collection.objects.link(floor)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30); bm.to_mesh(floor.data); bm.free()
    floor.location.z = recipe.get("floorY", -1.4); floor.is_shadow_catcher = True

    # materials for procedural parts
    def material_for(spec):
        m = spec.get("material") or {}
        mat = bpy.data.materials.new(spec["id"]); mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = hex_to_linear(m.get("color") or "#c9d8e6")
        bsdf.inputs["Roughness"].default_value = m.get("roughness", 0.3)
        bsdf.inputs["Metallic"].default_value = m.get("metalness", 0.12)
        bsdf.inputs["Coat Weight"].default_value = m.get("clearcoat", 0.3)
        bsdf.inputs["Coat Roughness"].default_value = 0.25
        finish = m.get("finish")
        if finish in ("wood", "linen"):
            coord = nodes.new("ShaderNodeTexCoord"); tex = nodes.new("ShaderNodeTexNoise" if finish == "linen" else "ShaderNodeTexWave")
            if finish == "wood":
                tex.wave_type = "BANDS"; tex.bands_direction = "X"
                tex.inputs["Scale"].default_value = 9; tex.inputs["Distortion"].default_value = 3.2
                tex.inputs["Detail"].default_value = 3; tex.inputs["Detail Roughness"].default_value = 0.6
                depth, span = 0.0025, 0.16
            else:
                tex.inputs["Scale"].default_value = 180; tex.inputs["Detail"].default_value = 2
                depth, span = 0.0012, 0.08
            links.new(coord.outputs["Object"], tex.inputs["Vector"])
            ramp = nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (1 - span, 1 - span, 1 - span, 1)
            links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
            mix = nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs["Factor"].default_value = 1
            mix.inputs[6].default_value = bsdf.inputs["Base Color"].default_value
            links.new(ramp.outputs["Color"], mix.inputs[7]); links.new(mix.outputs[2], bsdf.inputs["Base Color"])
            bump = nodes.new("ShaderNodeBump"); bump.inputs["Distance"].default_value = depth
            links.new(tex.outputs["Fac"], bump.inputs["Height"]); links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    def smooth(obj, cap_axis=None):
        for p in obj.data.polygons:
            p.use_smooth = cap_axis is None or abs(p.normal[cap_axis]) < 0.99

    def make_geometry(spec):
        g = spec["geometry"]; kind, size = g["type"], g["size"]
        mesh = bpy.data.meshes.new(spec["id"]); obj = bpy.data.objects.new(spec["id"], mesh); sc.collection.objects.link(obj)
        bm = bmesh.new()
        if kind == "roundedBox":
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=(size[0], size[2], size[1]), verts=bm.verts)
        elif kind == "sphere":
            bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=size[0])
        elif kind == "cylinder":
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=64, radius1=size[1], radius2=size[0], depth=size[2])
        elif kind != "torus":
            sys.exit(f"unsupported geometry type {kind!r} — mesh-contract.js allows roundedBox, sphere, cylinder, torus")
        bm.to_mesh(mesh); bm.free()
        if kind == "torus":
            bpy.ops.mesh.primitive_torus_add(major_radius=size[0], minor_radius=size[1], major_segments=96, minor_segments=20)
            tor = bpy.context.active_object; mesh_t = tor.data
            obj.data = mesh_t; bpy.data.objects.remove(tor); bpy.data.meshes.remove(mesh)
            obj.data.transform(Quaternion((1, 0, 0), math.radians(90)).to_matrix().to_4x4())
        if kind == "roundedBox":
            bev = obj.modifiers.new("bevel", "BEVEL")
            bev.width = min(g.get("bevel") or min(size) * 0.12, min(size) / 2 - 1e-4); bev.segments = 5; bev.harden_normals = True
            smooth(obj)
        elif kind == "cylinder": smooth(obj, cap_axis=2)
        else: smooth(obj)
        obj.data.materials.append(material_for(spec))
        return obj

    def apply_microrelief(objects):
        for o in objects:
            for slot in getattr(o, "material_slots", []):
                mat = slot.material
                if not mat or not mat.use_nodes: continue
                depth = mat.get("socialFlowMicrorelief")
                if not isinstance(depth, (int, float)) or not 0 < depth <= 0.03: continue
                nodes, links = mat.node_tree.nodes, mat.node_tree.links
                bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
                if not bsdf or bsdf.inputs["Normal"].is_linked or not bsdf.inputs["Base Color"].is_linked: continue
                source = bsdf.inputs["Base Color"].links[0].from_socket
                bump = nodes.new("ShaderNodeBump"); bump.inputs["Distance"].default_value = float(depth)
                links.new(source, bump.inputs["Height"]); links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # nodes
    targets, asset_objects, baselines = {}, {}, {}
    for spec in recipe["nodes"]:
        if spec.get("source"):
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=os.path.join(recipe_dir, spec["source"]))
            imported = [o for o in bpy.data.objects if o not in before]
            node = bpy.data.objects.new(spec["id"], None); sc.collection.objects.link(node)
            for o in imported:
                if o.parent is None:
                    o.parent = node; o.matrix_parent_inverse.identity()
            asset_objects[spec["id"]] = imported
            apply_microrelief(imported)
        elif spec.get("geometry"):
            node = make_geometry(spec)
        else:
            node = bpy.data.objects.new(spec["id"], None); sc.collection.objects.link(node)
        if spec.get("parent"):
            node.parent = targets[spec["parent"]]; node.matrix_parent_inverse.identity()
        node.rotation_mode = "QUATERNION"
        targets[spec["id"]] = node
    for b in recipe.get("bindings") or []:
        pool = asset_objects[b["asset"]]
        # Exact name, or the .001-style duplicate the importer adds — not any name that merely starts
        # with it, which would silently pose lid.handle when the recipe asked for lid.
        part = next((o for o in pool if o.name == b["node"]), None) or \
               next((o for o in pool if re.fullmatch(re.escape(b["node"]) + r"\.\d{3}", o.name)), None)
        if part is None: sys.exit(f"GLB node missing: {b['asset']}/{b['node']}")
        part.rotation_mode = "QUATERNION"
        targets[b["id"]] = part
        baselines[b["id"]] = (tuple(part.location), tuple(part.rotation_quaternion), tuple(part.scale))
    for state in recipe["states"]:
        if state.get("clips"): sys.exit("GLB clips are not supported by the Blender bake; pose parts with bindings instead")
    # recipe.blender.materials — Blender-only colour overrides by material-name prefix (imported GLB
    # materials keep their glTF names, duplicates get .001). A Hue/Saturation node sits between the
    # base colour and the BSDF; the browser lane ignores this block (blender-objects.md §5).
    overrides = ((recipe.get("blender") or {}).get("materials") or {})
    for prefix, rule in overrides.items():
        hit = 0
        for mat in bpy.data.materials:
            # glTF keeps the authored name and suffixes duplicates .001, .002 — match those two, not any
            # name that merely starts with the prefix (which would catch metal_rough for "metal").
            if not mat.use_nodes or not (mat.name == prefix or re.fullmatch(re.escape(prefix) + r"\.\d{3}", mat.name)): continue
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not bsdf: continue
            hsv = nodes.new("ShaderNodeHueSaturation")
            hsv.inputs["Hue"].default_value = float(rule.get("hue", 0.5))
            hsv.inputs["Saturation"].default_value = float(rule.get("saturation", 1.0))
            hsv.inputs["Value"].default_value = float(rule.get("value", 1.0))
            base = bsdf.inputs["Base Color"]
            if base.is_linked:
                source = base.links[0].from_socket; links.remove(base.links[0]); links.new(source, hsv.inputs["Color"])
            else:
                hsv.inputs["Color"].default_value = tuple(base.default_value)
            links.new(hsv.outputs["Color"], base); hit += 1
        say("materials", f"{prefix}: {hit} material(s) adjusted {json.dumps(rule)}")
        if not hit: sys.exit(f"blender.materials key '{prefix}' matched no material (exact name or a .001 duplicate)")
    recipe_ids = {n["id"] for n in recipe["nodes"]}

    def pose_at(group, progress):
        src, dst, u = sample_recipe(recipe, group, progress)
        for node_id, obj in targets.items():
            if node_id in recipe_ids:
                p, q = pose_for(recipe, src, node_id), pose_for(recipe, dst, node_id)
                loc = to_blender_pos(lerp3(p["position"], q["position"], u))
                rot = to_blender_quat(slerp(quat_from_euler_deg(*p["rotation"]), quat_from_euler_deg(*q["rotation"]), u))
                scl = to_blender_scale(lerp3(p["scale"], q["scale"], u))
            else:
                base_loc, base_rot, base_scl = baselines[node_id]
                a, b = (src.get("pose") or {}).get(node_id) or {}, (dst.get("pose") or {}).get(node_id) or {}
                if not a and not b:
                    loc, rot, scl = base_loc, base_rot, base_scl
                else:
                    pa = to_blender_pos(a["position"]) if a.get("position") else base_loc
                    pb = to_blender_pos(b["position"]) if b.get("position") else base_loc
                    ra = to_blender_quat(quat_from_euler_deg(*a["rotation"])) if a.get("rotation") else base_rot
                    rb = to_blender_quat(quat_from_euler_deg(*b["rotation"])) if b.get("rotation") else base_rot
                    sa = to_blender_scale(a["scale"]) if a.get("scale") else base_scl
                    sb = to_blender_scale(b["scale"]) if b.get("scale") else base_scl
                    loc, rot, scl = lerp3(pa, pb, u), slerp(ra, rb, u), lerp3(sa, sb, u)
            obj.location = loc; obj.rotation_quaternion = rot; obj.scale = scl
            if job.get("debug"): say("pose", node_id, "loc", [round(v, 3) for v in loc], "rot", [round(v, 3) for v in rot], "scale", [round(v, 3) for v in scl])
        bpy.context.view_layer.update()

    def render(path):
        sc.render.filepath = path
        t = time.time(); bpy.ops.render.render(write_still=True); return time.time() - t

    def alpha_bbox(path):
        """[x0, y0, x1, y1] of alpha > INK_ALPHA in a rendered PNG, or None — via Blender's own image reader."""
        import numpy as np
        img = bpy.data.images.load(path)
        w, h = img.size
        buf = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(buf); bpy.data.images.remove(img)
        alpha = remap_alpha(buf.reshape(h, w, 4)[::-1, :, 3], job["shadow_floor"])   # Blender rows run bottom-up
        ys, xs = np.nonzero(alpha > INK_ALPHA / 255)
        if not len(xs): return None
        return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]

    def union(boxes):
        boxes = [b for b in boxes if b]
        if not boxes: return None
        return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]

    def fit_report(box):
        """The cell the crop would make from this ink box, whether the sheet fits the cap, and whether
        the object would fit the slide's safe zone (check-slide.js refuses a placement that spills out)."""
        W, H = job["cell"]; m = CROP_MARGIN
        if not box: return {"inkBox": None, "fits": False, "reason": "every endpoint frame is empty"}
        cw, ch = min(W, box[2] + m) - max(0, box[0] - m), min(H, box[3] + m) - max(0, box[1] - m)
        cw += cw & 1; ch += ch & 1
        sw, sh = sheet_dims([cw, ch], job["cols"], job["n"])
        edge = [side for side, hit in (("left", box[0] <= 0), ("top", box[1] <= 0), ("right", box[2] >= W), ("bottom", box[3] >= H)) if hit]
        zone, ink_w = job["zone"], box[2] - box[0]
        report = {"inkBox": box, "cellEstimate": [cw, ch], "sheetPixelsEstimate": sw * sh,
                  "fits": sw * sh <= job["cap"], "touchesEdge": edge, "zoneWidth": zone,
                  "fitsZone": ink_w <= zone}
        if not report["fitsZone"]:
            report["zoneScale"] = round(zone / ink_w, 3)
            report["cellSuggestion"] = [int(W * zone / ink_w) & ~1, int(H * zone / ink_w) & ~1]
        return report

    def render_endpoints():
        """The first and last frame of every group — the extremes of the motion — before anything else,
        so a sheet that would blow the cap or clip at the canvas edge stops in seconds, not after the bake."""
        boxes, done = [], {}
        for i in job["endpoints"]:
            g, prog = job["frames"][i]; pose_at(g, prog)
            path = os.path.join(job["frames_dir"], f"f{i:04d}.png")
            done[i] = render(path); boxes.append(alpha_bbox(path))
        report = fit_report(union(boxes))
        say("bounds", json.dumps(report))
        return done, report

    os.makedirs(job["frames_dir"], exist_ok=True)
    if job["mode"] == "probe":
        pose_at(1, 0)
        first = render(os.path.join(job["frames_dir"], "probe-0.png"))
        steady = render(os.path.join(job["frames_dir"], "probe-1.png"))
        _, report = render_endpoints()
        say("probe", json.dumps({"backend": backend or "CPU", "devices": names, "blender": bpy.app.version_string,
                                  "firstFrameSeconds": round(first, 2), "secondsPerFrame": round(steady, 2), **report}))
        return
    if job["mode"] == "preview":
        g, prog = job["preview"]
        pose_at(g, prog)
        t = render(os.path.join(job["frames_dir"], "preview.png"))
        say("preview", f"group {g} progress {prog} in {t:.2f}s")
        return
    plan = job["frames"]
    done, report = render_endpoints()
    if not report["fits"]:
        say("abort", f"the sheet would be {report.get('sheetPixelsEstimate', 0) / 1e6:.0f} Mpx against the {job['cap'] // 1_000_000} Mpx cap "
                     f"(cell about {report.get('cellEstimate')}) — frame the object tighter, raise the key light so the shadow is shorter, lower --fps, or split the cut")
        sys.exit(1)
    if not report["fitsZone"]:
        say("abort", f"the object's ink is {report['inkBox'][2] - report['inkBox'][0]}px wide against the {report['zoneWidth']}px slide zone — "
                     f"h.object could not place it. Re-render smaller: --cell {report['cellSuggestion'][0]} {report['cellSuggestion'][1]}")
        sys.exit(1)
    if report.get("touchesEdge"):
        say("warn", f"ink touches the canvas edge on the {', '.join(report['touchesEdge'])} — the object or its shadow is clipped there; enlarge --cell or pull the camera back")
    times = []
    for i, (g, prog) in enumerate(plan):
        if i in done:
            times.append(done[i]); continue
        pose_at(g, prog)
        times.append(render(os.path.join(job["frames_dir"], f"f{i:04d}.png")))
        say("frame", f"{i + 1}/{len(plan)}", f"{times[-1]:.2f}s")
    say("done", json.dumps({"backend": backend or "CPU", "devices": names, "blender": bpy.app.version_string,
                             "secondsPerFrame": round(sum(times[1:]) / max(1, len(times) - 1), 2)}))

# ── outer process ─────────────────────────────────────────────────────────────────────────
def lane_advice(backend, ram_gb, cores, cap=SHEET_PIXEL_CAP):
    """Which object lane this machine should use, and how many render tabs its memory allows.

    The two lanes trade opposite resources. The browser mesh lane draws every frame with WebGL on
    SwiftShader (Chrome runs headless with --disable-gpu for determinism), so it costs CPU at capture
    time — 1.1-2.6 fps measured — and almost no memory or disk. The Blender bake spends GPU minutes
    once and then plays a PNG sheet, so capture runs 6-7 fps, but a decoded sheet at the cap is
    cap x 4 bytes in every Chrome tab that holds it."""
    # A render tab holds the whole decoded sheet (cap x 4 bytes) plus Chrome's own page and compositor.
    # Budgeting a tenth of the machine's memory for that decode gives 2 tabs on a 16 GB mini and 4 on a
    # 128 GB laptop, which is where the renderer's own ceiling sits anyway.
    tab_gb = cap * 4 / 1e9
    jobs = max(1, min(4, int(ram_gb * 0.1 // tab_gb) if tab_gb else 4))
    gpu = backend not in (None, "", "CPU")
    if not backend:
        return {"lane": "mesh", "jobs": jobs, "bakeMinutesPerCut": None,
                "reason": "Blender is not installed, so the browser mesh lane is the only object lane"}
    if ram_gb < 8:
        return {"lane": "mesh", "jobs": 1, "bakeMinutesPerCut": None,
                "reason": f"{ram_gb:.0f} GB of memory cannot hold a decoded sheet ({tab_gb:.1f} GB a tab) beside Chrome"}
    if not gpu:
        return {"lane": "blender-unattended", "jobs": jobs,
                "bakeMinutesPerCut": round(350 * 20 / 60),
                "reason": f"Cycles has no GPU backend here, so a cut bakes in tens of seconds a frame on {cores} cores — "
                          "an overnight bake for autoproduce, not an interactive one; use the mesh lane while authoring"}
    return {"lane": "blender", "jobs": jobs, "bakeMinutesPerCut": None,
            "reason": f"Cycles renders on {backend}; run --probe on the recipe for this machine's seconds a frame, "
                      f"and render the slide with --jobs {jobs} so the decoded sheet ({tab_gb:.1f} GB a tab) fits memory"}

def find_blender(explicit=None):
    candidates = [explicit, os.environ.get("BLENDER"), "/Applications/Blender.app/Contents/MacOS/Blender",
                  os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender"),
                  shutil.which("blender"), "/opt/homebrew/bin/blender", "/usr/local/bin/blender", "/usr/bin/blender", "/snap/bin/blender"]
    candidates += sorted(glob.glob("C:/Program Files/Blender Foundation/Blender */blender.exe"), reverse=True)
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK): return c
    return None

def run_blender(blender, job):
    fd, job_path = tempfile.mkstemp(prefix="bake-blender-", suffix=".json"); os.close(fd)
    json.dump(job, open(job_path, "w", encoding="utf-8"))
    cmd = [blender, "--background", "--factory-startup", "--python", os.path.abspath(__file__), "--", "--inner", job_path]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    tail, result, aborted = [], {}, None
    for line in proc.stdout:
        line = line.rstrip("\n"); tail.append(line); tail = tail[-40:]
        if line.startswith("⟫ "):
            body = line[2:]
            for key in ("probe", "done", "capacity"):
                if body.startswith(key + " "): result = json.loads(body[len(key) + 1:])
            if body.startswith("abort "): aborted = body[6:]
            print(body, flush=True)
    proc.wait(); os.unlink(job_path)
    if aborted: sys.exit("bake stopped early — " + aborted)
    if proc.returncode != 0 or not result and job["mode"] != "preview":
        sys.exit("Blender stopped:\n" + "\n".join(tail))
    return result

def forecast_line(result, n, samples):
    spf = result["secondsPerFrame"]; total = n * spf
    return (f"Blender {result['blender']} · {result['backend']} {' / '.join(result['devices'])} · {samples} samples · "
            f"{spf:.2f}s/frame · {n} frames ≈ {total / 60:.1f} min (first frame after install adds kernel compile, "
            f"measured {result['firstFrameSeconds']:.0f}s)")

def assemble(frames_dir, n, out, cols, crop, shadow_floor=SHADOW_FLOOR):
    import numpy as np
    from PIL import Image
    files = [os.path.join(frames_dir, f"f{i:04d}.png") for i in range(n)]
    W = H = None; union = None
    def load(f):
        im = np.asarray(Image.open(f).convert("RGBA")).copy()
        im[..., 3] = (remap_alpha(im[..., 3] / 255.0, shadow_floor) * 255 + 0.5).astype(np.uint8)
        return im
    for f in files:
        a = load(f)[..., 3]
        if W is None: H, W = a.shape
        ys, xs = np.nonzero(a > INK_ALPHA)
        if len(xs):
            box = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
            union = box if union is None else [min(union[0], box[0]), min(union[1], box[1]), max(union[2], box[2]), max(union[3], box[3])]
    if union is None: sys.exit("every frame is empty — check the camera and floorY")
    if crop:
        x0, y0 = max(0, union[0] - CROP_MARGIN), max(0, union[1] - CROP_MARGIN)
        x1, y1 = min(W, union[2] + CROP_MARGIN), min(H, union[3] + CROP_MARGIN)
        x1 += (x1 - x0) & 1; y1 += (y1 - y0) & 1
        x1, y1 = min(W, x1), min(H, y1)
    else:
        x0, y0, x1, y1 = 0, 0, W, H
    cell = [x1 - x0, y1 - y0]
    sw, sh = sheet_dims(cell, cols, n)
    if sw * sh > SHEET_PIXEL_CAP:
        sys.exit(f"sheet {sw}×{sh} = {sw * sh / 1e6:.0f} Mpx exceeds the {SHEET_PIXEL_CAP // 1_000_000} Mpx cap of object-sheet.js — "
                 f"frame the object tighter (camera), lower --fps, or split the cut")
    sheet = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    last = None
    for i, f in enumerate(files):
        im = Image.fromarray(load(f), "RGBA").crop((x0, y0, x1, y1))
        sheet.paste(im, ((i % cols) * cell[0], (i // cols) * cell[1])); last = im
    # Write through a temp name and rename: a rebake takes about a minute to encode this PNG, and a
    # reviewer reading <out>.png during that window gets a truncated file, or a sheet whose geometry
    # disagrees with the sidecar still on disk. os.replace is atomic within a filesystem.
    sheet.save(out + ".part.png", optimize=True); os.replace(out + ".part.png", out + ".png")
    bg = Image.new("RGBA", tuple(cell), (0x13, 0x22, 0x38, 255)); bg.alpha_composite(last); bg.convert("RGB").save(out + "-preview.png")
    ink = [union[0] - x0, union[1] - y0, union[2] - x0, union[3] - y0]
    return cell, ink, [x0, y0], [W, H], (sw, sh)

def selftest():
    import numpy as np
    checks = []
    ok = lambda name, cond: checks.append((name, bool(cond)))
    near = lambda a, b, tol=1e-6: all(abs(p - q) <= tol for p, q in zip(a, b))
    # Three.js references (node + three@0.180: Quaternion.setFromEuler XYZ, Quaternion.slerp)
    ok("euler z 83.5", near(quat_from_euler_deg(0, 0, 83.5), (0.746057375, 0, 0, 0.665881666)))
    ok("euler xyz", near(quat_from_euler_deg(30, -45, 10), (0.89763566, 0.205991123, -0.389077678, -0.020891155)))
    ok("euler wide", near(quat_from_euler_deg(170, 20, -95), (0.185526708, 0.65163643, 0.733538174, 0.053586858)))
    ok("slerp short arc", near(slerp(quat_from_euler_deg(0, 0, 0), quat_from_euler_deg(0, 0, 83.5), 0.37), (0.963874919, 0, 0, 0.266355291)))
    ok("slerp flipped", near(slerp(quat_from_euler_deg(170, 20, -95), quat_from_euler_deg(-160, 10, 80), 0.6), (0.257800322, -0.215865658, 0.939357349, 0.067444657)))
    ok("axis swap", to_blender_pos([1, 2, 3]) == (1, -3, 2) and to_blender_scale([1, 2, 3]) == (1, 3, 2) and to_blender_quat((0.5, 1, 2, 3)) == (0.5, 1, -3, 2))
    recipe = {"nodes": [{"id": "a", "pose": {"position": [1, 0, 0]}}], "states": [{}, {"pose": {"a": {"position": [2, 0, 0]}}}, {}],
              "groups": [{"group": 1, "durationMs": 4000, "ease": "smoother", "motionWindow": [0.25, 0.75]}, {"group": 2, "durationMs": 5600, "ease": "linear"}]}
    ok("pose defaults", pose_for(recipe, {}, "a") == {"position": [1, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]})
    ok("ease smoother mid", abs(sample_recipe(recipe, 1, 0.5)[2] - 0.5) < 1e-9 and sample_recipe(recipe, 1, 0.2)[2] == 0 and sample_recipe(recipe, 1, 0.9)[2] == 1)
    ok("ease linear", abs(sample_recipe(recipe, 2, 0.3)[2] - 0.3) < 1e-9)
    n, ranges, frames = frame_plan(recipe, {1: 4000, 2: 5600}, 30)
    ok("plan counts", n == 289 and ranges == {1: [0, 120], 2: [120, 288]})
    ok("plan boundary shared", frames[120] == (1, 1.0) and frames[121][0] == 2 and frames[0] == (1, 0.0) and frames[288] == (2, 1.0))
    ok("plan minimum two frames", frame_plan(recipe, {1: 200, 2: 200}, 15)[1] == {1: [0, 3], 2: [3, 6]})
    ok("segs parse", parse_segs("2:5600,1:4000", recipe) == {1: 4000, 2: 5600} and parse_segs("auto", recipe) == {1: 4000, 2: 5600})
    ok("sheet cap", sheet_dims([900, 640], 9, 289)[0] * sheet_dims([900, 640], 9, 289)[1] > SHEET_PIXEL_CAP and
       sheet_dims([760, 600], 9, 289)[0] * sheet_dims([760, 600], 9, 289)[1] <= SHEET_PIXEL_CAP)
    a1 = lane_advice("METAL", 128, 16); a2 = lane_advice("METAL", 16, 10)
    ok("advice picks blender on a gpu machine", a1["lane"] == "blender" and a1["jobs"] == 4 and a2["jobs"] == 2)
    ok("advice falls back without blender", lane_advice(None, 128, 16)["lane"] == "mesh")
    ok("advice refuses the sheet on a small machine", lane_advice("METAL", 6, 8)["lane"] == "mesh")
    ok("advice sends a cpu-only machine overnight", lane_advice("CPU", 64, 32)["lane"] == "blender-unattended")
    tmp_src = tempfile.mkdtemp(prefix="bake-blender-src-")
    open(os.path.join(tmp_src, "ok.glb"), "wb").write(b"glTF")
    def refuses(nodes):
        try: check_sources({"nodes": nodes}, tmp_src); return False
        except SystemExit: return True
    ok("source rules match the mesh lane",
       refuses([{"id": "a", "source": "../up.glb"}]) and refuses([{"id": "a", "source": "/abs/x.glb"}])
       and refuses([{"id": "a", "source": "missing.glb"}]) and not refuses([{"id": "a", "source": "ok.glb"}]))
    shutil.rmtree(tmp_src, ignore_errors=True)
    ok("zone width from scenes.js", zone_width("/nonexistent/slides/assets") == 728)
    ok("hex linear", near(hex_to_linear("#ffffff"), (1, 1, 1, 1)) and abs(hex_to_linear("#808080")[0] - 0.2158605) < 1e-5)
    veil = remap_alpha(np.array([0.0, 0.03, 0.06, 0.53, 1.0]), 0.06)
    ok("shadow floor remap", near(veil, (0, 0, 0, 0.5, 1.0), 1e-9) and (remap_alpha(np.array([0.2]), 0) == 0.2).all())
    # crop + assemble on synthetic frames
    from PIL import Image
    tmp = tempfile.mkdtemp(prefix="bake-blender-selftest-")
    for i in range(4):
        a = np.zeros((60, 80, 4), np.uint8); a[20:40, 10 + i * 5:30 + i * 5] = (200, 120, 60, 255); Image.fromarray(a, "RGBA").save(os.path.join(tmp, f"f{i:04d}.png"))
    cell, ink, origin, canvas, dims = assemble(tmp, 4, os.path.join(tmp, "obj"), 3, True)
    ok("crop cell", cell == [52, 36] and origin == [2, 12] and ink == [8, 8, 43, 28] and canvas == [80, 60] and dims == (156, 72))
    ok("sheet files", os.path.getsize(os.path.join(tmp, "obj.png")) > 0 and os.path.exists(os.path.join(tmp, "obj-preview.png")))
    shutil.rmtree(tmp, ignore_errors=True)
    failed = [n for n, c in checks if not c]
    for name, cond in checks: print(("ok   " if cond else "FAIL ") + name)
    print(f"{len(checks) - len(failed)}/{len(checks)} passed")
    sys.exit(1 if failed else 0)

def outer_main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--recipe", help="mesh recipe JSON (mesh-objects.md); GLB sources sit beside it")
    ap.add_argument("--out", help="output path without extension — <out>.png · <out>.js · <out>-preview.png")
    ap.add_argument("--segs", default="auto", help='"1:4000,2:5600" measured narration ms per group, or auto = the recipe plan')
    ap.add_argument("--fps", type=int, default=30, choices=FPS_ALLOWED)
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--view", default="Khronos PBR Neutral", choices=["Khronos PBR Neutral", "AgX", "Filmic", "Standard"],
                    help="Blender view transform — PBR Neutral keeps authored material colours, AgX/Filmic are softer")
    ap.add_argument("--light", type=float, default=1.0, help="multiplier on the recipe's key/fill/rim/environment strengths")
    ap.add_argument("--cell", type=int, nargs=2, default=[760, 600], metavar=("W", "H"), help="render canvas per frame before cropping")
    ap.add_argument("--cols", type=int, default=9)
    ap.add_argument("--zone", type=int, help="slide safe-zone width in px (default: the format's — 728 portrait, 1728 landscape)")
    ap.add_argument("--no-crop", action="store_true", help="keep the full canvas as the cell")
    ap.add_argument("--shadow-floor", type=float, default=SHADOW_FLOOR, help="alpha below this is the catcher's ambient veil and is cut (0 keeps everything)")
    ap.add_argument("--keep-frames", action="store_true", help="leave the per-frame PNGs in <out>-frames/")
    ap.add_argument("--blender", help="Blender executable (default: $BLENDER, /Applications, PATH)")
    ap.add_argument("--probe", action="store_true", help="report device, s/frame and the forecast; render nothing else")
    ap.add_argument("--preview", metavar="G:PROGRESS", help="render one frame, e.g. 2:0.5, to <out>.png")
    ap.add_argument("--capacity", action="store_true",
                    help="report this machine's render capacity and which object lane suits it; needs no recipe")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--debug", action="store_true", help="print every target's pose per frame (⟫ pose …)")
    a = ap.parse_args()
    if a.selftest: selftest()
    if a.capacity:
        ram_gb = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9 if hasattr(os, "sysconf") else 0
        cores = os.cpu_count() or 1
        blender = find_blender(a.blender)
        found = {}
        if blender:
            frames_dir = tempfile.mkdtemp(prefix="bake-blender-capacity-")
            found = run_blender(blender, {"mode": "capacity", "frames_dir": frames_dir})
            shutil.rmtree(frames_dir, ignore_errors=True)
        # An install too old to bake advises the mesh lane exactly as a missing one does.
        usable = blender and not found.get("tooOld")
        advice = lane_advice(found.get("backend") if usable else None, ram_gb, cores)
        if found.get("tooOld"):
            advice["reason"] = (f"Blender {found.get('blender')} is installed but the bake needs 4.2 or newer "
                                "(view transform, Principled coat inputs) — use the browser mesh lane, or upgrade Blender")
        out = {"blender": found.get("blender"), "executable": blender or None,
               "tooOld": bool(found.get("tooOld")),
               "backend": found.get("backend") if blender else None, "devices": found.get("devices"),
               "ramGB": round(ram_gb, 1), "cores": cores, "sheetPixelCap": SHEET_PIXEL_CAP, **advice}
        print(f"{advice['lane']} lane — {advice['reason']}")
        print(json.dumps(out, ensure_ascii=False))
        return
    if not a.recipe: ap.error("--recipe is required")
    if a.samples < 8 or a.samples > 1024: ap.error("--samples 8–1024")
    blender = find_blender(a.blender)
    if not blender: sys.exit("Blender not found — brew install --cask blender, or set BLENDER to the executable")
    recipe_path = os.path.abspath(a.recipe)
    recipe = json.load(open(recipe_path, encoding="utf-8"))
    recipe_dir = os.path.dirname(recipe_path)
    check_sources(recipe, recipe_dir)
    segs = parse_segs(a.segs, recipe)
    n, ranges, frames = frame_plan(recipe, segs, a.fps)
    frames_dir = tempfile.mkdtemp(prefix="bake-blender-frames-")
    if a.light <= 0 or a.light > 8: ap.error("--light 0–8")
    if a.shadow_floor < 0 or a.shadow_floor >= 0.5: ap.error("--shadow-floor 0–0.5")
    endpoints = sorted({i for r in ranges.values() for i in r})
    job = {"recipe": recipe, "recipe_dir": recipe_dir, "cell": a.cell, "samples": a.samples, "frames_dir": frames_dir,
           "frames": frames, "endpoints": endpoints, "n": n, "cols": a.cols, "cap": SHEET_PIXEL_CAP if not a.no_crop else 10**12,
           "zone": a.zone or zone_width(recipe_dir),
           "mode": "bake", "view": a.view, "light": a.light, "shadow_floor": a.shadow_floor, "debug": a.debug}
    if a.probe:
        job["mode"] = "probe"
        result = run_blender(blender, job); shutil.rmtree(frames_dir, ignore_errors=True)
        line = forecast_line(result, n, a.samples)
        fit = (f"sheet ≈ {result.get('sheetPixelsEstimate', 0) / 1e6:.0f} Mpx from a {result.get('cellEstimate')} cell — "
               + ("fits the cap" if result.get("fits") else f"over the {SHEET_PIXEL_CAP // 1_000_000} Mpx cap: frame tighter, shorten the shadow, lower --fps or split")
               + ("" if result.get("fitsZone") else f"; ink {result['inkBox'][2] - result['inkBox'][0]}px wide over the {result['zoneWidth']}px slide zone — use --cell {result['cellSuggestion'][0]} {result['cellSuggestion'][1]}")
               + (f"; ink touches the {', '.join(result['touchesEdge'])} edge (clipped — enlarge --cell)" if result.get("touchesEdge") else ""))
        print(line); print(fit)
        print(json.dumps({**result, "frames": n, "fps": a.fps, "samples": a.samples, "estimatedMinutes": round(n * result["secondsPerFrame"] / 60, 1),
                          "forecast": line, "fit": fit}, ensure_ascii=False))
        return
    if not a.out: ap.error("--out is required")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    if a.preview:
        g, prog = a.preview.split(":"); job["mode"] = "preview"; job["preview"] = [int(g), float(prog)]
        run_blender(blender, job)
        shutil.move(os.path.join(frames_dir, "preview.png"), a.out + ".png"); shutil.rmtree(frames_dir, ignore_errors=True)
        print("preview →", a.out + ".png"); return
    t0 = time.time()
    try: result = run_blender(blender, job)
    except SystemExit:
        shutil.rmtree(frames_dir, ignore_errors=True); raise
    cell, ink, origin, canvas, dims = assemble(frames_dir, n, a.out, a.cols, not a.no_crop, a.shadow_floor)
    # A <out>-frames directory from an earlier --keep-frames run would outlive this bake and mislead a
    # reviewer into reading stale frames (it happened, 2026-09-07); it goes unless refreshed now.
    shutil.rmtree(a.out + "-frames", ignore_errors=True)
    if a.keep_frames: shutil.move(frames_dir, a.out + "-frames")
    else: shutil.rmtree(frames_dir, ignore_errors=True)
    ident = os.path.basename(a.out); out_abs = os.path.abspath(a.out)
    asset_dir = os.path.basename(os.path.dirname(out_abs))
    rel_file = os.path.join(asset_dir, ident + ".png")
    rel_recipe = os.path.relpath(recipe_path, os.path.dirname(os.path.dirname(out_abs)))
    meta = {"file": rel_file, "renderer": "blender", "recipe": rel_recipe,
            "recipeSha256": hashlib.sha256(open(recipe_path, "rb").read()).hexdigest(),
            "engine": "cycles", "samples": a.samples, "fps": a.fps, "view": a.view, "light": a.light, "shadowFloor": a.shadow_floor,
            "segs": {str(g): ms for g, ms in segs.items()},
            "cell": cell, "cols": a.cols, "n": n, "ranges": {str(g): r for g, r in ranges.items()}, "ink": ink,
            "canvas": canvas, "crop": origin, "blender": result["blender"], "backend": result["backend"],
            "secondsPerFrame": result["secondsPerFrame"]}
    with open(a.out + ".js.tmp", "w", encoding="utf-8") as f:
        f.write("// written by bake-blender.py — do not edit. The slide reads it with <script src> and h.object(rg, id) places it.\n")
        f.write("window.SLIDE_OBJECTS = Object.assign(window.SLIDE_OBJECTS || {}, " + json.dumps({ident: meta}, ensure_ascii=False) + ");\n")
    os.replace(a.out + ".js.tmp", a.out + ".js")
    print(f"sheet {dims[0]}×{dims[1]} · {n} frames · cell {cell[0]}×{cell[1]} · {os.path.getsize(a.out + '.png') // 1024} KB → {a.out}.png")
    print("ink bbox (cell pixels)", ink, "· crop origin", origin, "of", canvas, f"· {time.time() - t0:.0f}s total")
    print("two lines for the slide:")
    print(f'  <script src="{os.path.join(asset_dir, ident + ".js")}"></script>   (after scenes.js)')
    print(f'  h.object(1, "{ident}", {{ x: {728 - ink[2]}, y: 0, slot: true }})   (x against the 728px portrait zone — x+{ink[0]} ≥ 0, x+{ink[2]} ≤ zone width)')

if __name__ == "__main__":
    if INSIDE_BLENDER and "--inner" in sys.argv:
        inner_main(sys.argv[sys.argv.index("--inner") + 1])
    else:
        outer_main()
