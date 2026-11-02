"""
RhineLab · 管理面三维资产 v3（Blender 4.5）
==========================================
形体按用户口径重构：
  · 长条主板 = 平放的水平托板（带插槽、导轨、前缘光槽、铭牌位），四脚支起
  · 服务器   = 像磁盘/卡匣一样从上方插入的竖直模块，露出板面
               三种机型结构不同（LCM / OMC / FS），顶部各有**铭牌位**与把手
  · 铭牌（MAT_Label）在运行时由 three.js 用 canvas 贴图写上服务名/节点名 —— 这就是"显著名称标识"

坐标：米，Z 向上；主板平铺在 XY 平面，插槽沿 X 排布。
命名（three.js 按名字找）：
  BOARD_ROOT
    GEO_Board_Slab        平板主体（上面挖 6 个插槽）
    GEO_Board_Leg_*       四脚
    GEO_Board_Guide_*     插槽导轨
    SOCKET_CAVITY_*       槽内腔（暗）
    SOCKET_GLOW_*         槽口指示灯（琥珀，未占用时呼吸）
    GEO_Board_LightRail   前缘光槽（流线灯载体）
    GEO_Board_Plate       前缘铭牌（MAT_Label，运行时写节点名）
  SERVER_<KIND>_ROOT         原点 = 插头底面（插到位时该点落在板面上）
    GEO_Server_Body / _Plug / _TopPlate(MAT_Label) / _Handle
    GEO_Server_Strip / _Led_* / _Vent_* / _Fin_*
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
        "w": 2.40, "d": 0.92, "t": 0.050,
        "leg_h": 0.660, "leg": 0.062,
        "socket_pitch": 0.372, "socket_count": 6,
        "socket_w": 0.340, "socket_d": 0.150, "socket_depth": 0.045,
        "rail_w": 0.012, "rail_h": 0.024, "rail_len": 0.230,
        "bevel": 0.0035,
    },
    "server": {
        "w": 0.300, "d": 0.086, "h_body": 0.470,
        "plug_w": 0.262, "plug_d": 0.060, "plug_h": 0.130,
        "bevel": 0.0024,
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
    MATS["body"] = make_mat("MAT_Body", (0.862, 0.844, 0.815), rough=0.48)
    MATS["accent"] = make_mat("MAT_Accent", (0.780, 0.545, 0.235), rough=0.34,
                              emit=(1.0, 0.66, 0.26), emit_strength=3.4)
    MATS["dark"] = make_mat("MAT_Dark", (0.038, 0.036, 0.034), rough=0.76)
    MATS["metal"] = make_mat("MAT_Metal", (0.600, 0.585, 0.560), rough=0.26, metal=0.9)
    MATS["label"] = make_mat("MAT_Label", (0.930, 0.918, 0.900), rough=0.40)
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


def cyl(name, r, depth, loc, mat, axis='Z', seg=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    elif axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm_to_obj(bm, name, mat)


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


# ---------------------------------------------------------------- 主板（平放）
def socket_xs():
    s = SPEC["board"]
    n = s["socket_count"]
    span = (n - 1) * s["socket_pitch"]
    return [-span / 2 + i * s["socket_pitch"] for i in range(n)]


def build_board():
    M = mats()
    s = SPEC["board"]
    root = bpy.data.objects.new("BOARD_ROOT", None)
    bpy.context.scene.collection.objects.link(root)

    top_z = s["leg_h"] + s["t"]          # 板面上表面
    slab_z = s["leg_h"] + s["t"] / 2.0   # 板中心

    # 平板 + 6 个插槽（从上表面往下挖）
    bm = box_bm(s["w"], s["d"], s["t"], 0, 0, slab_z)
    cutters = [((s["socket_w"], s["socket_d"], s["socket_depth"] * 2),
                (x, 0, top_z)) for x in socket_xs()]
    bool_cut(bm, cutters)
    bevel_bm(bm, s["bevel"], 2)
    slab = bm_to_obj(bm, "GEO_Board_Slab", M["body"])
    slab.parent = root

    # 四脚
    for tag, sx, sy in (("FL", -1, -1), ("FR", 1, -1), ("BL", -1, 1), ("BR", 1, 1)):
        leg = box("GEO_Board_Leg_%s" % tag,
                  (s["leg"], s["leg"], s["leg_h"]),
                  (sx * (s["w"] / 2 - 0.09), sy * (s["d"] / 2 - 0.09), s["leg_h"] / 2),
                  M["body"], bevel=0.0024, seg=2)
        leg.parent = root
        # 脚底金属垫
        pad = box("GEO_Board_Pad_%s" % tag, (s["leg"] * 1.1, s["leg"] * 1.1, 0.006),
                  (sx * (s["w"] / 2 - 0.09), sy * (s["d"] / 2 - 0.09), 0.003),
                  M["metal"], bevel=0.001, seg=1)
        pad.parent = root

    # 每个槽：导轨 + 内腔 + 槽口灯
    for i, x in enumerate(socket_xs()):
        # 两条导轨（沿 Y 方向，夹住插卡）
        for side in (-1, 1):
            rail = box("GEO_Board_Guide_%02d_%s" % (i, "A" if side < 0 else "B"),
                       (s["rail_w"], s["rail_len"], s["rail_h"]),
                       (x + side * (s["socket_w"] / 2 + s["rail_w"] / 2), 0, top_z + s["rail_h"] / 2 - 0.002),
                       M["body"], bevel=0.0016, seg=1)
            rail.parent = root
        # 槽内腔
        cav = box("SOCKET_CAVITY_%02d" % i,
                  (s["socket_w"] - 0.004, s["socket_d"] - 0.004, s["socket_depth"] - 0.002),
                  (x, 0, top_z - s["socket_depth"] / 2 - 0.001), M["dark"], bevel=0.001, seg=1)
        cav.parent = root
        # 槽底触点
        for j in range(3):
            ct = box("GEO_Board_Contact_%02d_%d" % (i, j),
                     (0.030, 0.010, 0.003),
                     (x - 0.08 + j * 0.08, 0.02, top_z - s["socket_depth"] + 0.004),
                     M["metal"], bevel=0.0004, seg=1)
            ct.parent = root
        # 槽口指示灯（未占用时呼吸，占用后压暗）
        glow = box("SOCKET_GLOW_%02d" % i, (0.020, 0.030, 0.003),
                   (x + s["socket_w"] / 2 + s["rail_w"] * 2.2, s["socket_d"] / 2 - 0.03, top_z + 0.0015),
                   M["accent"], bevel=0.0004, seg=1)
        glow.parent = root

    # 前缘光槽：一条内凹长槽 + 发光条（流线灯载体）
    groove = box("GEO_Board_Groove", (s["w"] * 0.96, 0.024, 0.010),
                 (0, -s["d"] / 2 + 0.030, top_z - 0.006), M["dark"], bevel=0.001, seg=1)
    groove.parent = root
    rail = box("GEO_Board_LightRail", (s["w"] * 0.94, 0.012, 0.007),
               (0, -s["d"] / 2 + 0.030, top_z - 0.0035), M["accent"], bevel=0.0008, seg=1)
    rail.parent = root

    # 前缘铭牌凹位（three.js 在此贴节点名/版本）
    plate = box("GEO_Board_Plate", (0.840, 0.0020, 0.082),
                (-0.55, -s["d"] / 2 - 0.0012, top_z - 0.048), M["dark"], bevel=0.0)
    plate.parent = root
    # 铭牌左侧一道金线
    tick = box("GEO_Board_PlateTick", (0.006, 0.002, 0.056),
               (-0.962, -s["d"] / 2 - 0.0015, top_z - 0.045), M["accent"], bevel=0.0)
    tick.parent = root

    # 四角螺丝
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        sc = cyl("GEO_Board_Screw_%d" % i, 0.0075, 0.004,
                 (sx * (s["w"] / 2 - 0.045), sy * (s["d"] / 2 - 0.045), top_z + 0.0005),
                 M["metal"], axis='Z', seg=12)
        sc.parent = root

    return root


# ---------------------------------------------------------------- 服务器（竖直卡匣）
def build_server(kind):
    M = mats()
    s = SPEC["server"]
    root = bpy.data.objects.new("SERVER_%s_ROOT" % kind, None)
    bpy.context.scene.collection.objects.link(root)

    body_bottom = s["plug_h"]                     # 插头之上开始
    body_h = s["h_body"]
    cz = body_bottom + body_h / 2.0
    top = body_bottom + body_h

    # 插头（插进槽里，原点在底面）
    plug = box("GEO_Server_Plug", (s["plug_w"], s["plug_d"], s["plug_h"]), (0, 0, s["plug_h"] / 2),
               M["metal"], bevel=0.0016, seg=1)
    plug.parent = root
    # 插头下端倒角唇
    lip = box("GEO_Server_PlugLip", (s["plug_w"] * 0.98, s["plug_d"] * 0.98, 0.008),
              (0, 0, 0.004), M["dark"], bevel=0.001, seg=1)
    lip.parent = root

    # 机身：三种机型宽度/结构不同
    if kind == "LCM":
        bw, bd = s["w"], s["d"]
    elif kind == "OMC":
        bw, bd = s["w"] * 0.98, s["d"] * 1.25          # 略厚：双面百叶
    else:  # FS
        bw, bd = s["w"] * 1.04, s["d"] * 1.15          # 略宽：侧鳍
    body = box("GEO_Server_Body", (bw, bd, body_h), (0, 0, cz), M["body"], bevel=s["bevel"], seg=2)
    body.parent = root

    fy = -bd / 2.0      # 前表面 -Y
    tx = bw / 2.0

    if kind == "LCM":
        # 竖向格栅（前脸）+ 单列指示灯 + 顶部一圈金环
        for i in range(7):
            v = box("GEO_Server_Vent_%d" % i, (bw * 0.62, 0.004, 0.006),
                    (0, fy - 0.002, body_bottom + 0.085 + i * 0.028), M["dark"], bevel=0.0005, seg=1)
            v.parent = root
        strip = box("GEO_Server_Strip", (0.008, 0.005, body_h * 0.62),
                    (tx - 0.016, fy - 0.0025, cz), M["accent"], bevel=0.0006, seg=1)
        strip.parent = root
        ring = box("GEO_Server_Led_0", (bw * 0.5, 0.010, 0.008),
                   (0, fy - 0.001, top - 0.030), M["accent"], bevel=0.0008, seg=1)
        ring.parent = root

    elif kind == "OMC":
        # 双面百叶（左右侧）+ 两个方灯
        for side, sx in (("L", -1), ("R", 1)):
            for i in range(5):
                v = box("GEO_Server_Vent_%s%d" % (side, i), (0.004, bd * 0.52, bd * 0.06),
                        (sx * (tx + 0.002), 0, body_bottom + 0.10 + i * 0.075), M["dark"], bevel=0.0005, seg=1)
                v.parent = root
        for i, dx in enumerate((-0.045, -0.015)):
            led = box("GEO_Server_Led_%d" % i, (0.020, 0.005, 0.014),
                      (dx, fy - 0.0025, top - 0.032), M["accent"], bevel=0.0006, seg=1)
            led.parent = root
        # 前脸一条细金线
        st = box("GEO_Server_Strip", (bw * 0.86, 0.004, 0.005),
                 (0, fy - 0.002, body_bottom + 0.06), M["accent"], bevel=0.0005, seg=1)
        st.parent = root

    else:  # FS
        # 侧面横向鳍片（散热片感）+ 前脸宽灯条
        for side, sx in (("L", -1), ("R", 1)):
            for i in range(9):
                f = box("GEO_Server_Fin_%s%d" % (side, i), (0.016, bd * 0.88, 0.008),
                        (sx * (tx + 0.007), 0, body_bottom + 0.055 + i * 0.050), M["body"], bevel=0.0008, seg=1)
                f.parent = root
        st = box("GEO_Server_Strip", (bw * 0.90, 0.005, 0.009),
                 (0, fy - 0.0025, body_bottom + 0.055), M["accent"], bevel=0.0007, seg=1)
        st.parent = root
        for i in range(2):
            led = box("GEO_Server_Led_%d" % i, (0.014, 0.005, 0.010),
                      (tx * 0.42 - i * 0.026, fy - 0.0025, top - 0.030), M["accent"], bevel=0.0005, seg=1)
            led.parent = root

    # 前脸铭牌凹位（three.js 会在这里贴 canvas 文字 = 显著名称标识）
    plate_slot = box("GEO_Server_PlateSlot", (bw * 0.86, 0.0016, 0.132),
                     (0, fy - 0.0008, top - 0.088), M["dark"], bevel=0.0)
    plate_slot.parent = root
    # 竖向状态光条（贴着铭牌左侧）
    vbar = box("GEO_Server_VBar", (0.007, 0.004, 0.132),
               (-bw * 0.44, fy - 0.002, top - 0.088), M["accent"], bevel=0.0005, seg=1)
    vbar.parent = root

    # 顶部铭牌（运行时写服务名）
    plate = box("GEO_Server_TopPlate", (bw * 0.80, bd * 0.62, 0.0022),
                (0, 0.0, top + 0.0011), M["label"], bevel=0.0)
    plate.parent = root

    # 把手（顶面前后各一根立柱 + 横杆）
    for sy in (-1, 1):
        post = cyl("GEO_Server_HandlePost_%s" % ("F" if sy < 0 else "B"), 0.007, 0.085,
                   (0, sy * (bd / 2 - 0.016), top + 0.042), M["metal"], axis='Z', seg=10)
        post.parent = root
    bar = box("GEO_Server_Handle", (bw * 0.62, 0.014, 0.012),
              (0, 0, top + 0.086), M["metal"], bevel=0.001, seg=2)
    bar.parent = root

    return root


# ---------------------------------------------------------------- 地面 / 相机
def build_floor():
    M = mats()
    floor = box("GEO_Floor", (16, 16, 0.02), (0, 1.2, -0.01), M["body"], bevel=0.0)
    for i in range(30):
        y = -1.6 + i * 0.18
        box("GEO_Floor_Rib_%02d" % i, (14.0, 0.022, 0.006), (0, y, 0.003), M["body"], bevel=0.0006, seg=1)
    return floor


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
        ob.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return ob

    light("KEY", (2.2, -3.0, 3.4), 1100, 3.2, (1.0, 0.98, 0.94))
    light("RIM", (-2.6, 2.4, 2.4), 600, 2.6, (1.0, 0.84, 0.62))
    light("FILL", (-2.4, -2.6, 1.6), 240, 4.0, (0.90, 0.94, 1.0))
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
    servers = {k: build_server(k) for k in ("LCM", "OMC", "FS")}

    def set_hidden(objs, flag):
        for r in objs:
            r.hide_render = flag
            r.hide_viewport = flag
            for ch in r.children_recursive:
                ch.hide_render = flag
                ch.hide_viewport = flag

    set_hidden(list(servers.values()), True)
    build_floor()
    cam = setup_scene()

    # ① 主板单体（俯视 3/4，看得清插槽排列与前缘铭牌位）
    render_view(os.path.join(PREVIEW_DIR, "board.png"), (2.35, -3.30, 2.05), (0, 0, 0.70), lens=52)

    # ② 三种服务器（竖直卡匣，结构差异）
    set_hidden(list(servers.values()), False)
    set_hidden([board], True)
    for (k, sr), x in zip(servers.items(), (-0.34, 0.0, 0.34)):
        sr.location = (x, 0, 0.0)
    render_view(os.path.join(PREVIEW_DIR, "servers.png"), (0.55, -1.35, 0.95), (0, 0, 0.28), lens=62)

    # ③ 装配：三台插在主板上（从上方插入后的状态）
    set_hidden([board], False)
    set_hidden(list(servers.values()), False)
    xs = socket_xs()
    for (k, sr), slot in zip(servers.items(), (xs[1], xs[2], xs[3])):
        sr.location = (slot, 0, SPEC["board"]["leg_h"] + SPEC["board"]["t"])
    render_view(os.path.join(PREVIEW_DIR, "assembly.png"), (2.55, -3.05, 2.25), (0, 0, 0.82), lens=54)

    # 导出（归零）
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
