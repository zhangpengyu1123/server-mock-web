"""
RhineLab · 管理面三维资产 v4（Blender 4.5）
==========================================
按用户口径重构为「光盘式服务器卡」：
  · 长条主板：平放的水平托板，板面开 5 条**细长插槽**（光盘竖着插进去），四脚支起，
    前缘有光槽与铭牌凹位
  · 服务器：**圆盘卡**（像光盘/碟片），竖直插在细槽里，露出大半
    - 外缘一圈发光环（Rim）= 运行状态（琥珀=运行 / 青=部署中 / 灰=离线）
    - 圆面有同心环凹槽与中心轮毂：LCM=单环、OMC=双环、FS=分段环 —— 侧视图一眼分型
    - 圆面上部留铭牌凹位，three.js 运行时贴服务名（显著名称标识）
坐标：米，Z 向上；圆盘轴沿 Y（盘面朝 ±Y），插入方向 -Z。
命名：
  BOARD_ROOT → GEO_Board_Slab / _Leg_* / _Guide_* / SOCKET_CAVITY_* / SOCKET_GLOW_*
               / GEO_Board_LightRail / GEO_Board_Plate
  SERVER_<KIND>_ROOT（原点 = 圆盘最低点，插到位时落在板面上）
     → GEO_Server_Disc / GEO_Server_Rim(发光) / GEO_Server_Hub / GEO_Server_Groove_*
       / GEO_Server_Plug / GEO_Server_PlateSlot / GEO_Server_Strip
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

OUT_DIR = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\admin\assets"
PREVIEW_DIR = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\assets\preview"

SPEC = {
    "board": {
        "w": 2.40, "d": 0.86, "t": 0.050,
        "leg_h": 0.660, "leg": 0.062,
        "slot_pitch": 0.480, "slot_count": 4,
        "slot_w": 0.440, "slot_t": 0.036, "slot_depth": 0.062,
        "bevel": 0.0035,
    },
    "disc": {
        "r": 0.200,                 # 半径
        "t": 0.024,                 # 厚度（LCM）
        "plug_w": 0.120, "plug_t": 0.030, "plug_h": 0.070,
        "bevel": 0.0022,
    },
}


def wipe():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for ma in list(bpy.data.materials):
        bpy.data.materials.remove(ma)
    for ca in list(bpy.data.cameras):
        bpy.data.cameras.remove(ca)
    for li in list(bpy.data.lights):
        bpy.data.lights.remove(li)


def make_mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0):
    ma = bpy.data.materials.new(name)
    ma.use_nodes = True
    b = ma.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    ma.diffuse_color = (*color, 1.0)
    return ma


MATS = {}


def mats():
    if MATS:
        return MATS
    MATS["body"] = make_mat("MAT_Body", (0.868, 0.850, 0.822), rough=0.46)
    MATS["accent"] = make_mat("MAT_Accent", (0.780, 0.545, 0.235), rough=0.32,
                              emit=(1.0, 0.66, 0.26), emit_strength=3.6)
    MATS["dark"] = make_mat("MAT_Dark", (0.036, 0.034, 0.032), rough=0.76)
    MATS["metal"] = make_mat("MAT_Metal", (0.620, 0.606, 0.582), rough=0.24, metal=0.92)
    return MATS


def bm_to_obj(bm, name, mat):
    ob = bpy.data.objects.new(name, bpy.data.meshes.new(name))
    bpy.context.scene.collection.objects.link(ob)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def box_bm(sx, sy, sz, cx=0.0, cy=0.0, cz=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((cx, cy, cz)), verts=bm.verts)
    return bm


def bevel_bm(bm, width, seg=2):
    if width <= 0:
        return bm
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=width,
                    offset_type='OFFSET', segments=seg, profile=0.5,
                    affect='EDGES', clamp_overlap=True)
    return bm


def box(name, size, loc, mat, bevel=0.0, seg=2):
    bm = box_bm(*size, *loc)
    bevel_bm(bm, bevel, seg)
    return bm_to_obj(bm, name, mat)


def cyl(name, r, depth, loc, mat, axis='Y', seg=64, smooth=True, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg,
                          radius1=r, radius2=(r if r2 is None else r2), depth=depth)
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    elif axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    ob = bm_to_obj(bm, name, mat)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob


def ring(name, major_r, minor_r, loc, mat, seg_major=72, seg_minor=10):
    """环：用 torus（手动构造，避免 bpy.ops）"""
    bm = bmesh.new()
    verts = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        cx, cz = math.cos(a) * major_r, math.sin(a) * major_r
        ring_v = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            rr = minor_r * math.cos(b)
            yy = minor_r * math.sin(b)
            v = bm.verts.new((cx + math.cos(a) * rr, yy, cz + math.sin(a) * rr))
            ring_v.append(v)
        verts.append(ring_v)
    for i in range(seg_major):
        for j in range(seg_minor):
            a1 = verts[i][j]
            a2 = verts[(i + 1) % seg_major][j]
            b1 = verts[i][(j + 1) % seg_minor]
            b2 = verts[(i + 1) % seg_major][(j + 1) % seg_minor]
            bm.faces.new((a1, a2, b2, b1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    ob = bm_to_obj(bm, name, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def bool_cut(target_bm, cutters):
    tmp_t = bpy.data.meshes.new("_tmp")
    target_bm.to_mesh(tmp_t)
    t_obj = bpy.data.objects.new("_tmp", tmp_t)
    bpy.context.scene.collection.objects.link(t_obj)
    created = []
    for i, (size, loc) in enumerate(cutters):
        cb = box_bm(*size, *loc)
        cm = bpy.data.meshes.new("_cut%d" % i)
        cb.to_mesh(cm)
        cb.free()
        c_obj = bpy.data.objects.new("_cut%d" % i, cm)
        bpy.context.scene.collection.objects.link(c_obj)
        created.append((c_obj, cm))
        mod = t_obj.modifiers.new("bool%d" % i, 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = c_obj
        mod.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    ev = t_obj.evaluated_get(dg)
    new_me = bpy.data.meshes.new_from_object(ev)
    target_bm.clear()
    target_bm.from_mesh(new_me)
    bpy.data.objects.remove(t_obj, do_unlink=True)
    for c_obj, cm in created:
        bpy.data.objects.remove(c_obj, do_unlink=True)
        bpy.data.meshes.remove(cm)
    bpy.data.meshes.remove(tmp_t)
    bpy.data.meshes.remove(new_me)
    return target_bm


def slot_xs():
    s = SPEC["board"]
    n = s["slot_count"]
    span = (n - 1) * s["slot_pitch"]
    return [-span / 2 + i * s["slot_pitch"] for i in range(n)]


# ---------------------------------------------------------------- 主板（平放）
def build_board():
    M = mats()
    s = SPEC["board"]
    root = bpy.data.objects.new("BOARD_ROOT", None)
    bpy.context.scene.collection.objects.link(root)

    top_z = s["leg_h"] + s["t"]
    slab_z = s["leg_h"] + s["t"] / 2.0

    bm = box_bm(s["w"], s["d"], s["t"], 0, 0, slab_z)
    # 细长插槽：沿 X 长、沿 Y 窄，从上往下切穿一半板厚
    cutters = [((s["slot_w"], s["slot_t"], s["slot_depth"] * 2), (x, 0, top_z))
               for x in slot_xs()]
    bool_cut(bm, cutters)
    bevel_bm(bm, s["bevel"], 2)
    slab = bm_to_obj(bm, "GEO_Board_Slab", M["body"])
    slab.parent = root

    for tag, sx, sy in (("FL", -1, -1), ("FR", 1, -1), ("BL", -1, 1), ("BR", 1, 1)):
        leg = box("GEO_Board_Leg_%s" % tag, (s["leg"], s["leg"], s["leg_h"]),
                  (sx * (s["w"] / 2 - 0.09), sy * (s["d"] / 2 - 0.09), s["leg_h"] / 2),
                  M["body"], bevel=0.0024, seg=2)
        leg.parent = root
        pad = box("GEO_Board_Pad_%s" % tag, (s["leg"] * 1.1, s["leg"] * 1.1, 0.006),
                  (sx * (s["w"] / 2 - 0.09), sy * (s["d"] / 2 - 0.09), 0.003),
                  M["metal"], bevel=0.001, seg=1)
        pad.parent = root

    for i, x in enumerate(slot_xs()):
        # 槽两端小夹块（夹住圆盘边缘）
        for side in (-1, 1):
            g = box("GEO_Board_Guide_%02d_%s" % (i, "A" if side < 0 else "B"),
                    (0.024, s["slot_t"] + 0.028, 0.022),
                    (x + side * (s["slot_w"] / 2 + 0.010), 0, top_z + 0.009),
                    M["body"], bevel=0.0016, seg=2)
            g.parent = root
        # 槽内腔
        cav = box("SOCKET_CAVITY_%02d" % i,
                  (s["slot_w"] - 0.004, s["slot_t"] - 0.004, s["slot_depth"] - 0.002),
                  (x, 0, top_z - s["slot_depth"] / 2 - 0.001), M["dark"], bevel=0.001, seg=1)
        cav.parent = root
        # 槽底触点
        for j in range(3):
            ct = box("GEO_Board_Contact_%02d_%d" % (i, j), (0.026, 0.012, 0.003),
                     (x - 0.06 + j * 0.06, 0, top_z - s["slot_depth"] + 0.004),
                     M["metal"], bevel=0.0004, seg=1)
            ct.parent = root
        # 槽口指示灯（未占用呼吸）
        glow = box("SOCKET_GLOW_%02d" % i, (0.026, 0.020, 0.003),
                   (x, s["slot_t"] / 2 + 0.030, top_z + 0.0015), M["accent"], bevel=0.0004, seg=1)
        glow.parent = root

    # 前缘光槽 + 发光条
    groove = box("GEO_Board_Groove", (s["w"] * 0.96, 0.026, 0.010),
                 (0, -s["d"] / 2 + 0.032, top_z - 0.006), M["dark"], bevel=0.001, seg=1)
    groove.parent = root
    rail = box("GEO_Board_LightRail", (s["w"] * 0.94, 0.013, 0.007),
               (0, -s["d"] / 2 + 0.032, top_z - 0.0035), M["accent"], bevel=0.0008, seg=1)
    rail.parent = root

    # 前缘铭牌凹位（three.js 贴节点名）
    plate = box("GEO_Board_Plate", (0.840, 0.0020, 0.082),
                (-0.55, -s["d"] / 2 - 0.0012, top_z - 0.048), M["dark"], bevel=0.0)
    plate.parent = root

    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        sc = cyl("GEO_Board_Screw_%d" % i, 0.0075, 0.004,
                 (sx * (s["w"] / 2 - 0.045), sy * (s["d"] / 2 - 0.045), top_z + 0.0005),
                 M["metal"], axis='Z', seg=12, smooth=False)
        sc.parent = root
    return root


# ---------------------------------------------------------------- 光盘式服务器
def build_disc(kind):
    M = mats()
    d = SPEC["disc"]
    st = SPEC["board"]
    root = bpy.data.objects.new("SERVER_%s_ROOT" % kind, None)
    bpy.context.scene.collection.objects.link(root)

    R = d["r"]
    T = d["t"] if kind == "LCM" else (d["t"] * 1.15 if kind == "OMC" else d["t"] * 1.05)
    cz = R                       # 圆盘中心高度（原点在最低点）

    # 盘体（倒角圆柱）
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=R, radius2=R, depth=T)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector((0, 0, cz)), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6] +
                    [v for v in bm.verts], offset=0.0018, offset_type='OFFSET', segments=2,
                    profile=0.5, affect='EDGES', clamp_overlap=True)
    disc = bm_to_obj(bm, "GEO_Server_Disc", M["body"])
    for p in disc.data.polygons:
        p.use_smooth = True
    disc.parent = root

    fy = -T / 2.0     # 盘面（朝 -Y = 相机方向）
    by = T / 2.0

    # 外缘发光环 = 运行状态指示（任何角度都看得见）
    rim = ring("GEO_Server_Rim", R - 0.004, 0.0055, (0, 0, cz), M["accent"], seg_major=96, seg_minor=10)
    rim.parent = root

    # 中心轮毂 + 中心孔
    hub = cyl("GEO_Server_Hub", 0.030, T + 0.012, (0, 0, cz), M["metal"], axis='Y', seg=40)
    hub.parent = root
    hole = cyl("GEO_Server_Hole", 0.012, T + 0.020, (0, 0, cz), M["dark"], axis='Y', seg=32)
    hole.parent = root

    # 芯环（贴着中心的暗环，像光盘的导入区）
    core = ring("GEO_Server_Core", 0.058, 0.0022, (0, fy - 0.001, cz), M["dark"], seg_major=64, seg_minor=8)
    core.parent = root

    # 机型结构差异：LCM 单环 / OMC 双环（呼应原作"OO"）/ FS 分段环
    if kind == "LCM":
        g1 = ring("GEO_Server_Groove_A", 0.128, 0.0026, (0, fy - 0.001, cz), M["dark"], seg_major=80, seg_minor=8)
        g1.parent = root
        strip = ring("GEO_Server_Strip", 0.150, 0.0018, (0, fy - 0.0015, cz), M["accent"], seg_major=80, seg_minor=6)
        strip.parent = root
    elif kind == "OMC":
        for i, rg in enumerate((0.104, 0.140)):
            g = ring("GEO_Server_Groove_%s" % "AB"[i], rg, 0.0028, (0, fy - 0.001, cz), M["dark"], seg_major=80, seg_minor=8)
            g.parent = root
        strip = ring("GEO_Server_Strip", 0.122, 0.0016, (0, fy - 0.0015, cz), M["accent"], seg_major=80, seg_minor=6)
        strip.parent = root
    else:  # FS：分段环（12 段短弧）
        for i in range(12):
            a = 2 * math.pi * i / 12
            seg = box("GEO_Server_Groove_%02d" % i, (0.030, 0.0022, 0.005),
                      (math.cos(a) * 0.140, fy - 0.001, cz + math.sin(a) * 0.140), M["dark"], bevel=0.0004, seg=1)
            seg.rotation_euler = (0, -a + math.pi / 2, 0)
            seg.parent = root
        strip = ring("GEO_Server_Strip", 0.158, 0.0016, (0, fy - 0.0015, cz), M["accent"], seg_major=80, seg_minor=6)
        strip.parent = root

    # 盘面上部：铭牌凹位（three.js 写服务名）
    slot = box("GEO_Server_PlateSlot", (0.208, 0.0016, 0.062),
               (0, fy - 0.0012, cz + 0.082), M["dark"], bevel=0.0)
    slot.parent = root

    # 底部插舌（插进细槽，作为"插入"的物理交代）
    plug = box("GEO_Server_Plug", (d["plug_w"], d["plug_t"], d["plug_h"]),
               (0, 0, -d["plug_h"] / 2 + 0.006), M["metal"], bevel=0.0016, seg=1)
    plug.parent = root

    # 顶部取放缺口（一个小凹槽，暗示可以用手/夹具夹起）
    notch = box("GEO_Server_Notch", (0.052, T + 0.002, 0.020),
                (0, 0, cz + R - 0.008), M["dark"], bevel=0.0008, seg=1)
    notch.parent = root

    return root


# ---------------------------------------------------------------- 场景
def build_floor():
    M = mats()
    box("GEO_Floor", (18, 18, 0.02), (0, 1.2, -0.01), M["body"], bevel=0.0)
    for i in range(34):
        y = -2.0 + i * 0.18
        box("GEO_Floor_Rib_%02d" % i, (16.0, 0.022, 0.006), (0, y, 0.003), M["body"], bevel=0.0006, seg=1)


def look_at(cam, loc, target, lens=70.0):
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens


def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = 1500
    sc.render.resolution_y = 900
    sc.eevee.taa_render_samples = 64
    world = bpy.data.worlds.new("W")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.90, 0.876, 0.856, 1.0)
    bg.inputs[1].default_value = 1.0

    cam = bpy.data.objects.new("CAM", bpy.data.cameras.new("CAM"))
    sc.collection.objects.link(cam)
    sc.camera = cam

    def light(name, loc, energy, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.size = size
        ld.color = color
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        sc.collection.objects.link(ob)
        ob.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return ob

    light("KEY", (2.6, -3.2, 3.4), 1200, 3.4, (1.0, 0.98, 0.94))
    light("RIM", (-2.8, 2.6, 2.6), 640, 2.8, (1.0, 0.84, 0.62))
    light("FILL", (-2.4, -2.8, 1.6), 260, 4.0, (0.90, 0.94, 1.0))
    return cam


def render_view(path, loc, target, lens=60.0):
    cam = bpy.context.scene.camera
    look_at(cam, loc, target, lens)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDER " + os.path.basename(path))


def export_glb(root, path):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for ch in root.children_recursive:
        ch.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False)
    return os.path.getsize(path)


def main():
    wipe()
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0

    board = build_board()
    discs = {k: build_disc(k) for k in ("LCM", "OMC", "FS")}

    def set_hidden(objs, flag):
        for r in objs:
            r.hide_render = flag
            r.hide_viewport = flag
            for ch in r.children_recursive:
                ch.hide_render = flag
                ch.hide_viewport = flag

    set_hidden(list(discs.values()), True)
    build_floor()
    cam = setup_scene()

    # ① 主板（俯视 3/4，看得清 5 条细槽 + 前缘铭牌位）
    render_view(os.path.join(PREVIEW_DIR, "board.png"), (2.30, -3.30, 2.10), (0, 0, 0.72), lens=52)

    # ② 三种光盘卡（正脸，看环结构与尺寸差异）
    set_hidden(list(discs.values()), False)
    set_hidden([board], True)
    for (k, sr), x in zip(discs.items(), (-0.42, 0.0, 0.42)):
        sr.location = (x, 0, 0.0)
    render_view(os.path.join(PREVIEW_DIR, "servers.png"), (0.0, -1.55, 0.30), (0, 0, 0.185), lens=64)

    # ③ 装配：三张光盘插在主板上
    set_hidden([board], False)
    set_hidden(list(discs.values()), False)
    xs = slot_xs()
    top = SPEC["board"]["leg_h"] + SPEC["board"]["t"]
    for (k, sr), slot in zip(discs.items(), (xs[1], xs[2], xs[3])):
        sr.location = (slot, 0, top - SPEC["board"]["slot_depth"])
    render_view(os.path.join(PREVIEW_DIR, "assembly.png"), (2.35, -3.05, 2.00), (0, 0, 0.80), lens=54)

    # ④ 侧视（验证"一眼分型与状态"：圆环轮廓 + 边缘发光）
    render_view(os.path.join(PREVIEW_DIR, "assembly_side.png"), (3.30, -0.9, 0.95), (0, 0, 0.80), lens=58)

    for sr in discs.values():
        sr.location = (0, 0, 0)
    sizes = {}
    for k, sr in discs.items():
        sizes["server_%s.glb" % k.lower()] = export_glb(sr, os.path.join(OUT_DIR, "server_%s.glb" % k.lower()))
    sizes["board.glb"] = export_glb(board, os.path.join(OUT_DIR, "board.glb"))
    print("EXPORTED " + str(sizes))


try:
    main()
    print("BUILD_OK")
except Exception:
    import traceback
    traceback.print_exc()
    print("BUILD_FAIL")
