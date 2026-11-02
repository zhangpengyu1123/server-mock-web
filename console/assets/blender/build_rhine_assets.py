"""
RhineLab · 管理面三维资产（Blender 4.5 / bpy + bmesh）
=====================================================
通用「长条主板」1 种 + 「服务器模块」3 种（LCM / OMC / FS）。

单位：米（1 BU = 1 m），Z 向上，主板正面朝 -Y。
验收：audit_mesh（boundary/nonmanifold/normals）+ 预览渲染；导出 GLB 供 three.js 加载。

命名约定（three.js 侧按名字找）：
  主板  BOARD_ROOT → GEO_Board_Body / GEO_Board_Fins / GEO_Board_Strip / GEO_Board_Foot_L/R / SOCKET_00..05 / RIM_00..05
  服务器 SERVER_<KIND>_ROOT → GEO_Server_Body / GEO_Server_Strip / GEO_Server_Vent / GEO_Server_Latch
材质：
  MAT_Body    暖象牙白陶瓷（rough 0.52 / metal 0）
  MAT_Accent  暖杏金（emissive，JS 运行时驱动亮度）
  MAT_Dark    近黑哑光（插槽内腔 / 通风口）
  MAT_Metal   浅灰金属（螺丝 / 引脚）
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

OUT_DIR = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\admin\assets"
PREVIEW_DIR = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\assets\preview"

# ---------------------------------------------------------------- 规格（米）
SPEC = {
    "board": {
        "w": 1.80,          # X 长
        "d": 0.090,         # Y 厚
        "h": 0.720,         # Z 高
        "z0": 0.045,        # 底边离地（脚高）
        "foot_h": 0.045,
        "foot_w": 0.10,
        "bevel": 0.0035,
        "slot_cols": [-0.560, 0.0, 0.560],
        "slot_rows": [0.225, 0.525],
        "slot_w": 0.470,
        "slot_h": 0.215,
        "slot_recess": 0.020,
        "fin_count": 26,
        "fin_t": 0.0045,
        "fin_h": 0.600,
        "fin_d": 0.030,
    },
    "server": {"w": 0.455, "d": 0.086, "h": 0.205, "lip": 0.028, "bevel": 0.0025},
}


# ---------------------------------------------------------------- 基础工具
def wipe():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for ma in list(bpy.data.materials):
        bpy.data.materials.remove(ma)


def make_mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0):
    ma = bpy.data.materials.get(name)
    if ma:
        return ma
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
    MATS["body"] = make_mat("MAT_Body", (0.855, 0.833, 0.800), rough=0.52, metal=0.0)
    MATS["accent"] = make_mat("MAT_Accent", (0.760, 0.520, 0.212), rough=0.35,
                              emit=(0.98, 0.62, 0.22), emit_strength=1.6)
    MATS["dark"] = make_mat("MAT_Dark", (0.045, 0.042, 0.038), rough=0.72)
    MATS["metal"] = make_mat("MAT_Metal", (0.560, 0.545, 0.520), rough=0.30, metal=0.85)
    return MATS


def new_obj(name, collection=None):
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def bm_to_obj(bm, name, mat, collection=None):
    ob = new_obj(name, collection)
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


def bool_cut(target_bm, cutter_boxes):
    """从 target 里挖掉若干长方体（用 bmesh boolean，headless 安全）。"""
    for (size, loc) in cutter_boxes:
        cb = box_bm(*size, *loc)
        bmesh.ops.reverse_faces(cb, faces=cb.faces)
        # 把 cutter 作为临时 mesh
        cm = bpy.data.meshes.new("_cut")
        cb.to_mesh(cm)
        cb.free()
        cutter_obj = bpy.data.objects.new("_cut", cm)
        bpy.context.scene.collection.objects.link(cutter_obj)
        tmp_t = bpy.data.meshes.new("_tmp")
        target_bm.to_mesh(tmp_t)
        target_obj = bpy.data.objects.new("_tmp", tmp_t)
        bpy.context.scene.collection.objects.link(target_obj)
        mod = target_obj.modifiers.new("bool", 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter_obj
        mod.solver = 'EXACT'
        dg = bpy.context.evaluated_depsgraph_get()
        ev = target_obj.evaluated_get(dg)
        new_me = bpy.data.meshes.new_from_object(ev)
        target_bm.clear()
        target_bm.from_mesh(new_me)
        bpy.data.objects.remove(target_obj, do_unlink=True)
        bpy.data.objects.remove(cutter_obj, do_unlink=True)
        bpy.data.meshes.remove(tmp_t)
        bpy.data.meshes.remove(cm)
        bpy.data.meshes.remove(new_me)
    return target_bm


# ---------------------------------------------------------------- 主板
def build_board():
    M = mats()
    s = SPEC["board"]
    root = bpy.data.objects.new("BOARD_ROOT", None)
    bpy.context.scene.collection.objects.link(root)

    zc = s["z0"] + s["h"] / 2.0

    # 主体：正面挖 6 个插槽（3 列 × 2 行）
    bm = box_bm(s["w"], s["d"], s["h"], 0.0, 0.0, zc)
    cutters = []
    for cx in s["slot_cols"]:
        for cz in s["slot_rows"]:
            cutters.append(((s["slot_w"], s["slot_recess"] * 3, s["slot_h"]),
                            (cx, -s["d"] / 2.0, cz)))
    bool_cut(bm, cutters)
    bevel_bm(bm, s["bevel"], 2)
    body = bm_to_obj(bm, "GEO_Board_Body", M["body"])
    body.parent = root

    # 背面散热鳍片（沿 X 等距）
    fin_gap = s["w"] * 0.92 / (s["fin_count"] - 1)
    for i in range(s["fin_count"]):
        x = -s["w"] * 0.46 + i * fin_gap
        f = box("GEO_Board_Fin_%02d" % i,
                (s["fin_t"], s["fin_d"], s["fin_h"]),
                (x, s["d"] / 2.0 + s["fin_d"] / 2.0 - 0.002, zc + 0.02),
                M["body"], bevel=0.0008, seg=1)
        f.parent = root

    # 插槽内腔（深色）
    for i, cx in enumerate(s["slot_cols"]):
        for j, cz in enumerate(s["slot_rows"]):
            k = i * 2 + j
            cav = box("SOCKET_%02d" % k,
                      (s["slot_w"] - 0.012, s["slot_recess"] * 0.9, s["slot_h"] - 0.012),
                      (cx, -s["d"] / 2.0 + s["slot_recess"] * 0.35, cz),
                      M["dark"], bevel=0.001, seg=1)
            cav.parent = root
            # 插槽口框（深色细边，视觉上"卡槽"感）
            rim = box("RIM_%02d" % k,
                      (s["slot_w"] + 0.012, 0.004, s["slot_h"] + 0.012),
                      (cx, -s["d"] / 2.0 - 0.002, cz),
                      M["dark"], bevel=0.0008, seg=1)
            rim.parent = root

    # 底部暖杏金导光条（正面下缘）
    strip = box("GEO_Board_Strip",
                (s["w"] * 0.96, 0.010, 0.016),
                (0.0, -s["d"] / 2.0 - 0.006, s["z0"] + 0.030),
                M["accent"], bevel=0.0015, seg=1)
    strip.parent = root

    # 顶部一道细金线
    top_line = box("GEO_Board_TopLine",
                   (s["w"] * 0.72, 0.004, 0.005),
                   (0.0, -s["d"] / 2.0 - 0.002, s["z0"] + s["h"] - 0.020),
                   M["accent"], bevel=0.0)
    top_line.parent = root

    # 两只脚
    for side, x in (("L", -s["w"] * 0.34), ("R", s["w"] * 0.34)):
        foot = box("GEO_Board_Foot_%s" % side,
                   (s["foot_w"], s["d"] * 1.25, s["foot_h"]),
                   (x, 0.0, s["foot_h"] / 2.0),
                   M["body"], bevel=0.002, seg=1)
        foot.parent = root

    # 四角螺丝
    for i, (x, z) in enumerate([(-s["w"] * 0.44, s["z0"] + 0.05),
                                (s["w"] * 0.44, s["z0"] + 0.05),
                                (-s["w"] * 0.44, s["z0"] + s["h"] - 0.05),
                                (s["w"] * 0.44, s["z0"] + s["h"] - 0.05)]):
        bm2 = bmesh.new()
        bmesh.ops.create_cone(bm2, cap_ends=True, segments=10, radius1=0.007,
                              radius2=0.007, depth=0.004)
        bmesh.ops.rotate(bm2, verts=bm2.verts,
                         matrix=__import__("mathutils").Matrix.Rotation(math.radians(90), 3, 'X'))
        bmesh.ops.translate(bm2, vec=Vector((x, -s["d"] / 2.0 - 0.001, z)), verts=bm2.verts)
        sc = bm_to_obj(bm2, "GEO_Board_Screw_%d" % i, M["metal"])
        sc.parent = root

    return root


# ---------------------------------------------------------------- 服务器模块
def build_server(kind):
    M = mats()
    s = SPEC["server"]
    root = bpy.data.objects.new("SERVER_%s_ROOT" % kind, None)
    bpy.context.scene.collection.objects.link(root)

    body = box("GEO_Server_Body", (s["w"], s["d"], s["h"]), (0, 0, 0), M["body"], bevel=s["bevel"], seg=2)
    body.parent = root

    # 前面板（-Y）细节：三种机型不同
    front_y = -s["d"] / 2.0
    if kind == "LCM":
        # 单条宽导光条 + 一个圆形指示灯
        st = box("GEO_Server_Strip", (s["w"] * 0.52, 0.006, 0.014),
                 (0.0, front_y - 0.003, -s["h"] * 0.06), M["accent"], bevel=0.001, seg=1)
        st.parent = root
        bm2 = bmesh.new()
        bmesh.ops.create_cone(bm2, cap_ends=True, segments=16, radius1=0.012,
                              radius2=0.012, depth=0.006)
        bmesh.ops.rotate(bm2, verts=bm2.verts,
                         matrix=__import__("mathutils").Matrix.Rotation(math.radians(90), 3, 'X'))
        bmesh.ops.translate(bm2, vec=Vector((s["w"] * 0.34, front_y - 0.003, s["h"] * 0.22)), verts=bm2.verts)
        led = bm_to_obj(bm2, "GEO_Server_Led", M["accent"])
        led.parent = root
    elif kind == "OMC":
        # 两个小方灯（左右）+ 百叶通风口
        for i, x in enumerate((-s["w"] * 0.34, -s["w"] * 0.20)):
            st = box("GEO_Server_Strip_%d" % i, (0.030, 0.006, 0.012),
                     (x, front_y - 0.003, s["h"] * 0.24), M["accent"], bevel=0.001, seg=1)
            st.parent = root
        # 百叶
        for i in range(5):
            v = box("GEO_Server_Vent_%d" % i, (s["w"] * 0.42, 0.004, 0.008),
                    (s["w"] * 0.06, front_y - 0.002, -s["h"] * 0.30 + i * 0.026),
                    M["dark"], bevel=0.0006, seg=1)
            v.parent = root
    else:  # FS
        # 通长导光条 + 鳍片把手
        st = box("GEO_Server_Strip", (s["w"] * 0.86, 0.006, 0.010),
                 (0.0, front_y - 0.003, -s["h"] * 0.28), M["accent"], bevel=0.001, seg=1)
        st.parent = root
        for i in range(4):
            h = box("GEO_Server_Vent_%d" % i, (0.006, 0.010, s["h"] * 0.34),
                    (-s["w"] * 0.30 + i * 0.014, front_y - 0.004, s["h"] * 0.16),
                    M["dark"], bevel=0.0006, seg=1)
            h.parent = root

    # 顶部解锁杆（所有机型共用）
    latch = box("GEO_Server_Latch", (s["w"] * 0.30, 0.010, 0.008),
                (s["w"] * 0.28, front_y + 0.012, s["h"] / 2.0 + 0.002), M["metal"], bevel=0.0008, seg=1)
    latch.parent = root

    # 把手（顶面前缘一道细杆）
    handle = box("GEO_Server_Handle", (s["w"] * 0.22, 0.012, 0.010),
                 (-s["w"] * 0.30, front_y + 0.010, s["h"] / 2.0 + 0.004), M["metal"], bevel=0.001, seg=1)
    handle.parent = root

    return root


# ---------------------------------------------------------------- 导出 / 渲染
def export_glb(root, path):
    for ob in bpy.context.scene.objects:
        ob.select_set(False)
    root.select_set(True)
    for ch in root.children_recursive:
        ch.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )
    return os.path.getsize(path)


def setup_scene_render():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = 1200
    sc.render.resolution_y = 800
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("W")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.906, 0.878, 0.855, 1.0)
    bg.inputs[1].default_value = 1.15

    cam_data = bpy.data.cameras.new("CAM")
    cam_data.lens = 70
    cam = bpy.data.objects.new("CAM", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0.95, -2.35, 1.15)
    cam.rotation_euler = (math.radians(74), 0, math.radians(22))
    bpy.context.scene.camera = cam

    def add_light(name, kind, loc, energy, size=2.0, rot=(0, 0, 0), color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        ob.rotation_euler = rot
        bpy.context.scene.collection.objects.link(ob)
        return ob

    add_light("KEY", 'AREA', (1.6, -2.2, 2.4), 420, size=2.4,
              rot=(math.radians(52), 0, math.radians(34)))
    add_light("RIM", 'AREA', (-1.8, 1.6, 1.6), 260, size=2.0,
              rot=(math.radians(118), 0, math.radians(-32)), color=(1.0, 0.86, 0.66))
    add_light("FILL", 'AREA', (-1.2, -2.0, 0.7), 90, size=3.0,
              rot=(math.radians(80), 0, math.radians(-20)), color=(0.9, 0.94, 1.0))
    return cam


def render_to(path, cam_loc, cam_rot):
    cam = bpy.context.scene.camera
    cam.location = cam_loc
    cam.rotation_euler = cam_rot
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- 主流程
def main():
    wipe()
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    board = build_board()
    servers = {}
    for kind in ("LCM", "OMC", "FS"):
        sroot = build_server(kind)
        # 先摆到主板上做装配预览（槽位 00 / 02 / 04 → 三行位置示意）
        servers[kind] = sroot

    cam = setup_scene_render()

    # 单独渲染：主板
    for kind, sroot in servers.items():
        sroot.hide_render = True
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "board.png")
    render_to(os.path.join(PREVIEW_DIR, "board.png"),
              (1.05, -2.45, 1.20), (math.radians(72), 0, math.radians(23)))

    # 单独渲染：三台服务器模块（并排）
    board.hide_render = True
    xs = (-0.60, 0.0, 0.60)
    for (kind, sroot), x in zip(servers.items(), xs):
        sroot.hide_render = False
        sroot.location = (x, 0.0, 0.42)
    render_to(os.path.join(PREVIEW_DIR, "servers.png"),
              (0.0, -1.35, 0.72), (math.radians(78), 0, 0))

    # 导出
    sizes = {}
    bpy.ops.object.select_all(action='DESELECT')
    for kind, sroot in servers.items():
        sroot.location = (0, 0, 0)
    for kind, sroot in servers.items():
        sizes["server_%s.glb" % kind.lower()] = export_glb(sroot, os.path.join(OUT_DIR, "server_%s.glb" % kind.lower()))
    sizes["board.glb"] = export_glb(board, os.path.join(OUT_DIR, "board.glb"))

    print("EXPORTED " + str(sizes))


# Blender 内核 exec 时 __name__ 不是 "__main__"，所以无条件执行并显式回传结果
try:
    main()
    print("BUILD_OK")
except Exception:
    import traceback
    traceback.print_exc()
    print("BUILD_FAIL")
