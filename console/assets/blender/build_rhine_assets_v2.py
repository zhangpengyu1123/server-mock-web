"""
RhineLab · 管理面三维资产 v2（Blender 4.5 / bpy + bmesh）
=======================================================
通用「长条主板」× 1 + 「服务器模块」× 3（LCM / OMC / FS）

单位：米（1 BU = 1 m），Z 向上，主板正面朝 -Y。
命名约定（three.js 侧按名字找）：
  BOARD_ROOT
    GEO_Board_Body         主体（正面 6 个插槽）
    GEO_Board_Fin_00..NN   背面散热鳍片
    GEO_Board_Strip        底部暖杏金导光条（MAT_Accent，运行时驱动）
    GEO_Board_TopLine      顶部细金线
    GEO_Board_RailL/R      左右侧轨
    GEO_Board_Foot_L/R     两只脚
    SOCKET_00..05          槽内腔（MAT_Dark）
    RIM_00..05             槽口框（MAT_Dark）
    CONTACT_00..05         槽内金属触点（MAT_Metal）
  SERVER_<KIND>_ROOT
    GEO_Server_Body / _Lip / _Strip / _Vent_* / _Latch / _Handle / _Led
材质：
  MAT_Body 暖象牙白陶瓷 | MAT_Accent 暖杏金(自发光) | MAT_Dark 近黑哑光 | MAT_Metal 浅灰金属
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
        "w": 1.80, "d": 0.085, "h": 0.700,
        "z0": 0.070,                 # 主体底边离地
        "foot_h": 0.070, "foot_w": 0.11,
        "bevel": 0.0030,
        "slot_cols": [-0.560, 0.0, 0.560],
        "slot_rows": [0.240, 0.520],
        "slot_w": 0.470, "slot_h": 0.215,
        "recess": 0.055,             # 槽深
        "fin_count": 24, "fin_t": 0.0042, "fin_h": 0.580, "fin_d": 0.026,
        "rail_w": 0.026,             # 左右侧轨宽
    },
    "server": {"w": 0.452, "d": 0.082, "h": 0.202, "lip": 0.020, "bevel": 0.0022},
}


# ---------------------------------------------------------------- 基础工具
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
    bsdf = ma.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    ma.diffuse_color = (*color, 1.0)
    return ma


MATS = {}


def mats():
    if MATS:
        return MATS
    MATS["body"] = make_mat("MAT_Body", (0.860, 0.842, 0.812), rough=0.50)
    MATS["accent"] = make_mat("MAT_Accent", (0.780, 0.545, 0.235), rough=0.36,
                              emit=(1.0, 0.66, 0.26), emit_strength=2.4)
    MATS["dark"] = make_mat("MAT_Dark", (0.040, 0.038, 0.036), rough=0.74)
    MATS["metal"] = make_mat("MAT_Metal", (0.600, 0.585, 0.560), rough=0.28, metal=0.9)
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


def bevel_bm(bm, width, segments=2):
    if width <= 0:
        return bm
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=width,
                    offset_type='OFFSET', segments=segments, profile=0.5,
                    affect='EDGES', clamp_overlap=True)
    return bm


def box(name, size, loc, mat, bevel=0.0, seg=2):
    bm = box_bm(*size, *loc)
    bevel_bm(bm, bevel, seg)
    return bm_to_obj(bm, name, mat)


def cyl(name, r, depth, loc, mat, axis='Y', seg=14):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    elif axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm_to_obj(bm, name, mat)


def bool_cut(target_bm, cutters):
    """用 bpy 的 Boolean 修改器挖槽（EXACT），不依赖 GUI context。"""
    tmp_t = bpy.data.meshes.new("_tmp")
    target_bm.to_mesh(tmp_t)
    t_obj = bpy.data.objects.new("_tmp", tmp_t)
    bpy.context.scene.collection.objects.link(t_obj)
    for i, (size, loc) in enumerate(cutters):
        cb = box_bm(*size, *loc)
        cm = bpy.data.meshes.new("_cut%d" % i)
        cb.to_mesh(cm)
        cb.free()
        c_obj = bpy.data.objects.new("_cut%d" % i, cm)
        bpy.context.scene.collection.objects.link(c_obj)
        mod = t_obj.modifiers.new("bool%d" % i, 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = c_obj
        mod.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    ev = t_obj.evaluated_get(dg)
    new_me = bpy.data.meshes.new_from_object(ev)
    target_bm.clear()
    target_bm.from_mesh(new_me)
    for ob in [t_obj] + [bpy.data.objects.get("_cut%d" % i) for i in range(len(cutters))]:
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
    for me in [tmp_t, new_me]:
        bpy.data.meshes.remove(me)
    for i in range(len(cutters)):
        me = bpy.data.meshes.get("_cut%d" % i)
        if me:
            bpy.data.meshes.remove(me)
    return target_bm


# ---------------------------------------------------------------- 主板
def build_board():
    M = mats()
    s = SPEC["board"]
    root = bpy.data.objects.new("BOARD_ROOT", None)
    bpy.context.scene.collection.objects.link(root)
    zc = s["z0"] + s["h"] / 2.0
    fy = -s["d"] / 2.0            # 正面 -Y 平面

    # 主体 + 6 个插槽（切穿正面 30mm）
    bm = box_bm(s["w"], s["d"], s["h"], 0, 0, zc)
    cutters = []
    for cx in s["slot_cols"]:
        for cz in s["slot_rows"]:
            cutters.append(((s["slot_w"], s["recess"] * 2, s["slot_h"]), (cx, fy, cz)))
    bool_cut(bm, cutters)
    bevel_bm(bm, s["bevel"], 2)
    body = bm_to_obj(bm, "GEO_Board_Body", M["body"])
    body.parent = root

    # 槽内腔（深色，退进去 24mm）
    for i, cx in enumerate(s["slot_cols"]):
        for j, cz in enumerate(s["slot_rows"]):
            k = i * 2 + j
            cav = box("SOCKET_%02d" % k,
                      (s["slot_w"] - 0.006, s["recess"] - 0.006, s["slot_h"] - 0.006),
                      (cx, fy + s["recess"] / 2.0 - 0.002, cz), M["dark"], bevel=0.0012, seg=1)
            cav.parent = root
            # 槽底金属触点
            for t in range(3):
                ct = box("CONTACT_%02d_%d" % (k, t),
                         (s["slot_w"] * 0.22, 0.003, 0.006),
                         (cx - s["slot_w"] * 0.24 + t * s["slot_w"] * 0.24,
                          fy + 0.006, cz - s["slot_h"] * 0.30), M["metal"], bevel=0.0006, seg=1)
                ct.parent = root
            # 空槽指示灯（琥珀，运行时按槽位占用/服务状态驱动）
            glow = box("SOCKET_GLOW_%02d" % k,
                       (s["slot_w"] * 0.86, 0.004, 0.006),
                       (cx, fy + s["recess"] - 0.010, cz - s["slot_h"] * 0.44),
                       M["accent"], bevel=0.0006, seg=1)
            glow.parent = root
            # 槽口细框（正面 +0.5mm，形成"卡槽"边界）
            rim = box("RIM_%02d" % k,
                      (s["slot_w"] + 0.008, 0.0025, s["slot_h"] + 0.008),
                      (cx, fy - 0.0012, cz), M["dark"], bevel=0.0)
            rim.parent = root

    # 背面鳍片
    fin_gap = s["w"] * 0.90 / (s["fin_count"] - 1)
    for i in range(s["fin_count"]):
        x = -s["w"] * 0.45 + i * fin_gap
        f = box("GEO_Board_Fin_%02d" % i,
                (s["fin_t"], s["fin_d"], s["fin_h"]),
                (x, s["d"] / 2.0 + s["fin_d"] / 2.0 - 0.003, zc + 0.015),
                M["body"], bevel=0.0007, seg=1)
        f.parent = root

    # 左右侧轨
    for tag, sx in (("L", -1), ("R", 1)):
        rail = box("GEO_Board_Rail%s" % tag,
                   (s["rail_w"], s["d"] + 0.012, s["h"] + 0.004),
                   (sx * (s["w"] / 2.0 - s["rail_w"] / 2.0 + 0.006), 0, zc),
                   M["body"], bevel=0.0018, seg=2)
        rail.parent = root

    # 底部导光条（正面下缘，长条）
    strip = box("GEO_Board_Strip", (s["w"] * 0.94, 0.008, 0.013),
                (0, fy - 0.005, s["z0"] + 0.026), M["accent"], bevel=0.0012, seg=1)
    strip.parent = root

    # 顶部细金线
    tl = box("GEO_Board_TopLine", (s["w"] * 0.70, 0.003, 0.004),
             (0, fy - 0.0015, s["z0"] + s["h"] - 0.016), M["accent"], bevel=0.0)
    tl.parent = root

    # 脚
    for tag, x in (("L", -s["w"] * 0.33), ("R", s["w"] * 0.33)):
        foot = box("GEO_Board_Foot_%s" % tag,
                   (s["foot_w"], s["d"] * 1.5, s["foot_h"]),
                   (x, 0, s["foot_h"] / 2.0), M["body"], bevel=0.0022, seg=2)
        foot.parent = root

    # 四角螺丝
    for i, (x, z) in enumerate([(-s["w"] * 0.42, s["z0"] + 0.045),
                                (s["w"] * 0.42, s["z0"] + 0.045),
                                (-s["w"] * 0.42, s["z0"] + s["h"] - 0.045),
                                (s["w"] * 0.42, s["z0"] + s["h"] - 0.045)]):
        sc = cyl("GEO_Board_Screw_%d" % i, 0.0065, 0.004, (x, fy - 0.001, z), M["metal"], axis='Y', seg=12)
        sc.parent = root

    return root


# ---------------------------------------------------------------- 服务器模块
def build_server(kind):
    M = mats()
    s = SPEC["server"]
    root = bpy.data.objects.new("SERVER_%s_ROOT" % kind, None)
    bpy.context.scene.collection.objects.link(root)
    fy = -s["d"] / 2.0

    body = box("GEO_Server_Body", (s["w"], s["d"], s["h"]), (0, 0, 0), M["body"], bevel=s["bevel"], seg=2)
    body.parent = root

    # 前面板凸缘：让模块看起来"卡在槽里"
    lip = box("GEO_Server_Lip", (s["w"] + 0.006, s["lip"], s["h"] + 0.006),
              (0, fy - s["lip"] / 2.0 + 0.004, 0), M["body"], bevel=0.0016, seg=2)
    lip.parent = root

    # 面板与凸缘之间的暗缝
    seam = box("GEO_Server_Seam", (s["w"] + 0.002, 0.0022, s["h"] + 0.002),
               (0, fy - 0.0012, 0), M["dark"], bevel=0.0)
    seam.parent = root

    lif = fy - s["lip"] + 0.001     # 面板实际前表面 y

    if kind == "LCM":
        st = box("GEO_Server_Strip", (s["w"] * 0.50, 0.005, 0.012),
                 (0, lif - 0.003, -s["h"] * 0.10), M["accent"], bevel=0.001, seg=1)
        st.parent = root
        led = cyl("GEO_Server_Led", 0.0105, 0.005, (s["w"] * 0.33, lif - 0.002, s["h"] * 0.22),
                  M["accent"], axis='Y', seg=16)
        led.parent = root
        # 左上角小铭牌凹槽
        pl = box("GEO_Server_Plate", (s["w"] * 0.20, 0.0018, 0.010),
                 (-s["w"] * 0.26, lif - 0.001, s["h"] * 0.24), M["dark"], bevel=0.0)
        pl.parent = root

    elif kind == "OMC":
        for i, x in enumerate((-s["w"] * 0.34, -s["w"] * 0.22)):
            st = box("GEO_Server_Strip_%d" % i, (0.026, 0.005, 0.010),
                     (x, lif - 0.003, s["h"] * 0.25), M["accent"], bevel=0.001, seg=1)
            st.parent = root
        for i in range(6):
            v = box("GEO_Server_Vent_%d" % i, (s["w"] * 0.40, 0.003, 0.007),
                    (s["w"] * 0.10, lif - 0.0015, -s["h"] * 0.30 + i * 0.021),
                    M["dark"], bevel=0.0005, seg=1)
            v.parent = root

    else:  # FS
        st = box("GEO_Server_Strip", (s["w"] * 0.84, 0.005, 0.009),
                 (0, lif - 0.003, -s["h"] * 0.30), M["accent"], bevel=0.001, seg=1)
        st.parent = root
        # 竖鳍（把手）
        for i in range(5):
            v = box("GEO_Server_Vent_%d" % i, (0.005, 0.008, s["h"] * 0.30),
                    (-s["w"] * 0.28 + i * 0.013, lif - 0.004, s["h"] * 0.14),
                    M["dark"], bevel=0.0005, seg=1)
            v.parent = root
        # 右侧两个小方灯
        for i in range(2):
            led = box("GEO_Server_Led_%d" % i, (0.014, 0.005, 0.008),
                      (s["w"] * 0.30 + i * 0.022, lif - 0.002, s["h"] * 0.24), M["accent"], bevel=0.0006, seg=1)
            led.parent = root

    # 共用：顶部解锁杆 + 把手
    latch = box("GEO_Server_Latch", (s["w"] * 0.26, 0.009, 0.007),
                (s["w"] * 0.27, fy + 0.014, s["h"] / 2.0 + 0.002), M["metal"], bevel=0.0008, seg=1)
    latch.parent = root
    handle = box("GEO_Server_Handle", (s["w"] * 0.20, 0.010, 0.009),
                 (-s["w"] * 0.29, fy + 0.012, s["h"] / 2.0 + 0.004), M["metal"], bevel=0.001, seg=1)
    handle.parent = root

    return root


# ---------------------------------------------------------------- 地面 / 灯光 / 相机
def build_floor():
    M = mats()
    # 地面：暖灰白，轻微台阶纹（用一排薄板模拟参考图里的"散热片地面"）
    floor = box("GEO_Floor", (14, 14, 0.02), (0, 1.6, -0.01), M["body"], bevel=0.0)
    # 地面细肋（很有参考图的味道）
    for i in range(26):
        y = -1.2 + i * 0.16
        f = box("GEO_Floor_Rib_%02d" % i, (13.0, 0.02, 0.006), (0, y, 0.003), M["body"], bevel=0.0006, seg=1)
    return floor


def look_at(cam, loc, target, lens=70.0):
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens


def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = 1400
    sc.render.resolution_y = 900
    sc.render.film_transparent = False
    sc.eevee.taa_render_samples = 64
    world = bpy.data.worlds.new("W")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.90, 0.876, 0.856, 1.0)
    bg.inputs[1].default_value = 1.0

    cam_data = bpy.data.cameras.new("CAM")
    cam = bpy.data.objects.new("CAM", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    def light(name, kind, loc, energy, size=2.0, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
            ld.shape = 'SQUARE'
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        sc.collection.objects.link(ob)
        d = Vector((0, 0, 0.4)) - Vector(loc)
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return ob

    light("KEY", 'AREA', (2.6, -3.2, 3.0), 900, size=3.0, color=(1.0, 0.98, 0.94))
    light("RIM", 'AREA', (-2.8, 2.2, 2.2), 520, size=2.4, color=(1.0, 0.84, 0.62))
    light("FILL", 'AREA', (-2.2, -2.6, 1.2), 200, size=4.0, color=(0.90, 0.94, 1.0))
    return cam


def render_view(path, loc, target, lens=70.0):
    cam = bpy.context.scene.camera
    look_at(cam, loc, target, lens)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDER " + os.path.basename(path))


# ---------------------------------------------------------------- 导出
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


# ---------------------------------------------------------------- 主流程
def main():
    wipe()
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0

    board = build_board()
    servers = {k: build_server(k) for k in ("LCM", "OMC", "FS")}

    def set_hidden(objs, flag):
        # Empty 的 hide 不传播给子对象，必须逐个设置
        for r in objs:
            r.hide_render = flag
            r.hide_viewport = flag
            for ch in r.children_recursive:
                ch.hide_render = flag
                ch.hide_viewport = flag

    set_hidden(list(servers.values()), True)

    floor = build_floor()
    cam = setup_scene()

    # ① 主板单体（3/4 视角，能看清 6 个槽与背面鳍片）
    render_view(os.path.join(PREVIEW_DIR, "board.png"), (2.55, -2.85, 1.62), (0, 0, 0.44), lens=72)

    # ② 三种服务器模块并排
    set_hidden(list(servers.values()), False)
    xs = (-0.62, 0.0, 0.62)
    for (k, sr), x in zip(servers.items(), xs):
        sr.location = (x, 0, 0.34)
    set_hidden([board], True)
    render_view(os.path.join(PREVIEW_DIR, "servers.png"), (0.0, -1.55, 0.62), (0, 0, 0.34), lens=78)

    # ③ 装配：主板 + 3 台服务器插在槽里
    set_hidden([board], False)
    board.location = (0, 0, 0)
    slots = [(-0.560, 0.520), (0.0, 0.520), (0.560, 0.520)]
    for (k, sr), (sx, sz) in zip(servers.items(), slots):
        sr.location = (sx, -0.019, sz)
    render_view(os.path.join(PREVIEW_DIR, "assembly.png"), (2.35, -3.05, 1.55), (0.05, 0, 0.42), lens=70)

    # 导出（归零位置）
    for sr in servers.values():
        sr.location = (0, 0, 0)
    sizes = {}
    for k, sr in servers.items():
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
