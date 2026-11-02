"""
RhineLab · 管理面三维资产 v6（Blender 4.5）— 横插平躺卡
=====================================================
口径（用户确认）：
  · 主板：平放的水平长条托板（四脚支起），板面开 **6 个朝天开口的插仓**（2 排 × 3 列），
          插仓前缘开口，卡片从**前方水平横插**进去；前缘有光槽与铭牌凹位
  · 服务器：**薄的正方形磁盘卡**，平躺横插，卡面朝上
      - 三种机型**平面轮廓不同**（45° 俯视一眼分型）：
          LCM = 圆角方盘 + 前缘中央取放缺口
          OMC = 前缘两角 45° 切角（六边形感）+ 两条横向散热槽
          FS  = 略窄长 + 前缘梳齿（6 齿）+ 两侧握持槽
      - 卡面靠前缘有**显著名称铭牌**（深色凹位，运行时贴服务名/路径）
      - 前缘一条琥珀发光边 = 运行状态（正视/侧视都可见）
坐标：米，Z 向上；卡面朝 +Z，插入方向 -Y（从前方推入）。
命名：
  BOARD_ROOT → GEO_Board_Slab / _Leg_* / BAY_* / BAY_LIP_* / SOCKET_GLOW_*
               / GEO_Board_LightRail / GEO_Board_Plate
  SERVER_<KIND>_ROOT（原点 = 卡片后端中点，插到位时后缘落在插仓后壁）
     → GEO_Server_Card / GEO_Server_LabelSlot / GEO_Server_Strip / GEO_Server_Grip_*
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
        "w": 2.40, "d": 0.96, "t": 0.050,
        "leg_h": 0.640, "leg": 0.064,
        "bay_cols": 3, "bay_rows": 2,
        "bay_pitch_x": 0.520, "bay_pitch_y": 0.420,
        "bay_w": 0.400, "bay_d": 0.360, "bay_depth": 0.026,
        "bevel": 0.0035,
    },
    "card": {
        "w": 0.360, "d": 0.320, "t": 0.016,
        "bevel": 0.0014,
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
    MATS["body"] = make_mat("MAT_Body", (0.870, 0.852, 0.824), rough=0.44)
    MATS["accent"] = make_mat("MAT_Accent", (0.780, 0.545, 0.235), rough=0.32,
                              emit=(1.0, 0.66, 0.26), emit_strength=3.8)
    MATS["dark"] = make_mat("MAT_Dark", (0.034, 0.032, 0.030), rough=0.78)
    MATS["metal"] = make_mat("MAT_Metal", (0.630, 0.616, 0.592), rough=0.24, metal=0.92)
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


def cyl(name, r, depth, loc, mat, axis='Z', seg=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    ob = bm_to_obj(bm, name, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def bool_cut_obj(target_bm, cutters):
    """cutters: [(size3, loc3, rot_y_radians_or_None)]"""
    tmp = bpy.data.meshes.new("_tmp")
    target_bm.to_mesh(tmp)
    tob = bpy.data.objects.new("_tmp", tmp)
    bpy.context.scene.collection.objects.link(tob)
    created = []
    for i, (size, loc, rot) in enumerate(cutters):
        cb = box_bm(*size, *loc)
        if rot:
            bmesh.ops.rotate(cb, verts=cb.verts, matrix=Matrix.Rotation(rot, 3, 'Z'))
        cm = bpy.data.meshes.new("_c%d" % i)
        cb.to_mesh(cm)
        cb.free()
        cob = bpy.data.objects.new("_c%d" % i, cm)
        bpy.context.scene.collection.objects.link(cob)
        created.append((cob, cm))
        m = tob.modifiers.new("b%d" % i, 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = cob
        m.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    nm = bpy.data.meshes.new_from_object(tob.evaluated_get(dg))
    target_bm.clear()
    target_bm.from_mesh(nm)
    bpy.data.objects.remove(tob, do_unlink=True)
    for o, m2 in created:
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(m2)
    for m3 in (tmp, nm):
        bpy.data.meshes.remove(m3)
    return target_bm


def bay_centers():
    s = SPEC["board"]
    out = []
    for r in range(s["bay_rows"]):
        y = (r - (s["bay_rows"] - 1) / 2.0) * s["bay_pitch_y"]
        for c in range(s["bay_cols"]):
            x = (c - (s["bay_cols"] - 1) / 2.0) * s["bay_pitch_x"]
            out.append((x, y))
    return out


# ---------------------------------------------------------------- 主板（平放 + 朝天插仓）
def build_board():
    M = mats()
    s = SPEC["board"]
    root = bpy.data.objects.new("BOARD_ROOT", None)
    bpy.context.scene.collection.objects.link(root)
    top = s["leg_h"] + s["t"]
    slab_z = s["leg_h"] + s["t"] / 2.0

    # 板体：挖 6 个朝天插仓（前缘留 0.03 壁，形成"从前方插入"的开口感）
    bm = box_bm(s["w"], s["d"], s["t"], 0, 0, slab_z)
    cutters = [((s["bay_w"], s["bay_d"], s["bay_depth"] * 2), (x, y, top), None)
               for (x, y) in bay_centers()]
    bool_cut_obj(bm, cutters)
    bevel_bm(bm, s["bevel"], 2)
    slab = bm_to_obj(bm, "GEO_Board_Slab", M["body"])
    slab.parent = root

    for tag, sx, sy in (("FL", -1, -1), ("FR", 1, -1), ("BL", -1, 1), ("BR", 1, 1)):
        leg = box("GEO_Board_Leg_%s" % tag, (s["leg"], s["leg"], s["leg_h"]),
                  (sx * (s["w"] / 2 - 0.10), sy * (s["d"] / 2 - 0.12), s["leg_h"] / 2),
                  M["body"], bevel=0.0024, seg=2)
        leg.parent = root
        pad = box("GEO_Board_Pad_%s" % tag, (s["leg"] * 1.1, s["leg"] * 1.1, 0.006),
                  (sx * (s["w"] / 2 - 0.10), sy * (s["d"] / 2 - 0.12), 0.003),
                  M["metal"], bevel=0.001, seg=1)
        pad.parent = root

    # 插仓内腔 + 仓口灯 + 导轨唇边
    for i, (x, y) in enumerate(bay_centers()):
        cav = box("BAY_%02d" % i,
                  (s["bay_w"] - 0.006, s["bay_d"] - 0.006, s["bay_depth"] - 0.002),
                  (x, y, top - s["bay_depth"] / 2 - 0.001), M["dark"], bevel=0.0012, seg=1)
        cav.parent = root
        # 前后导轨（薄唇，示意卡片顺着滑进去）
        for sy in (-1, 1):
            lip = box("BAY_LIP_%02d_%s" % (i, "F" if sy < 0 else "B"),
                      (s["bay_w"] + 0.020, 0.014, 0.010),
                      (x, y + sy * (s["bay_d"] / 2 + 0.006), top + 0.004),
                      M["body"], bevel=0.0008, seg=1)
            lip.parent = root
        # 仓口指示灯（空仓呼吸）
        glow = box("SOCKET_GLOW_%02d" % i, (0.030, 0.014, 0.003),
                   (x, y + s["bay_d"] / 2 + 0.024, top + 0.0015), M["accent"], bevel=0.0004, seg=1)
        glow.parent = root

    # 前缘光槽 + 发光条
    groove = box("GEO_Board_Groove", (s["w"] * 0.96, 0.028, 0.010),
                 (0, -s["d"] / 2 + 0.030, top - 0.006), M["dark"], bevel=0.001, seg=1)
    groove.parent = root
    rail = box("GEO_Board_LightRail", (s["w"] * 0.94, 0.014, 0.007),
               (0, -s["d"] / 2 + 0.030, top - 0.0035), M["accent"], bevel=0.0008, seg=1)
    rail.parent = root

    plate = box("GEO_Board_Plate", (0.860, 0.0020, 0.074),
                (-0.62, -s["d"] / 2 - 0.0012, top - 0.040), M["dark"], bevel=0.0)
    plate.parent = root

    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        sc = cyl("GEO_Board_Screw_%d" % i, 0.0075, 0.004,
                 (sx * (s["w"] / 2 - 0.05), sy * (s["d"] / 2 - 0.05), top + 0.0005),
                 M["metal"], axis='Z', seg=12)
        sc.parent = root
    return root


# ---------------------------------------------------------------- 平躺薄方盘卡
def build_card(kind):
    M = mats()
    c = SPEC["card"]
    root = bpy.data.objects.new("SERVER_%s_ROOT" % kind, None)
    bpy.context.scene.collection.objects.link(root)

    W, D, T = c["w"], c["d"], c["t"]
    if kind == "LCM":
        W, D = c["w"] * 0.94, c["d"] * 0.94
    elif kind == "FS":
        W, D = c["w"] * 0.86, c["d"] * 1.02

    # 平躺卡体（原点 = 后缘中点，卡片沿 +Y 延伸？统一：原点在几何中心下方）
    bm = box_bm(W, D, T, 0, 0, T / 2.0)
    cuts = []
    if kind == "LCM":
        # 前缘中央取放缺口
        cuts.append(((0.070, 0.060, T * 3), (0, -D / 2 + 0.020, T / 2.0), None))
    elif kind == "OMC":
        # 前缘两角 45° 切角
        for sx in (-1, 1):
            cuts.append(((0.090, 0.090, T * 3), (sx * (W / 2 - 0.010), -D / 2 + 0.010, T / 2.0),
                         math.radians(45)))
        # 后缘一个定位缺口
        cuts.append(((0.040, 0.030, T * 3), (0, D / 2 - 0.008, T / 2.0), None))
    else:  # FS：前缘梳齿
        for i in range(6):
            x = -W / 2 + 0.030 + i * (W - 0.060) / 5.0
            cuts.append(((0.016, 0.045, T * 3), (x, -D / 2 + 0.014, T / 2.0), None))
    if cuts:
        bm = bool_cut_obj(bm, cuts)
    bevel_bm(bm, c["bevel"], 2)
    card = bm_to_obj(bm, "GEO_Server_Card", M["body"])
    card.parent = root

    top_z = T

    # 卡面靠前缘的显著铭牌（运行时贴服务名 + 类型 + 路径）
    lab_w = W * 0.80
    lab_d = D * 0.26
    lab_y = -D / 2 + D * 0.20
    label = box("GEO_Server_LabelSlot", (lab_w, lab_d, 0.0012),
                (0, lab_y, top_z + 0.0006), M["dark"], bevel=0.0)
    label.parent = root
    tick = box("GEO_Server_LabelTick", (0.007, lab_d * 0.9, 0.0018),
               (-lab_w / 2 + 0.012, lab_y, top_z + 0.0009), M["accent"], bevel=0.0)
    tick.parent = root

    # 前缘发光边（状态色；正视/侧视都看得到）
    strip = box("GEO_Server_Strip", (W * 0.90, 0.005, 0.006),
                (0, -D / 2 + 0.0025, top_z * 0.55), M["accent"], bevel=0.0005, seg=1)
    strip.parent = root

    # 机型附加结构（俯视可分辨）
    if kind == "LCM":
        # 后缘一道细金线 + 四角小圆点
        line = box("GEO_Server_Led_0", (W * 0.6, 0.004, 0.0016),
                   (0, D / 2 - 0.014, top_z + 0.0009), M["accent"], bevel=0.0)
        line.parent = root
    elif kind == "OMC":
        # 两条横向散热槽 + 右后角双灯
        for i in range(2):
            v = box("GEO_Server_Vent_%d" % i, (W * 0.62, 0.007, 0.0016),
                    (0, -D * 0.10 + i * 0.030, top_z + 0.0009), M["dark"], bevel=0.0)
            v.parent = root
        for i in range(2):
            d = cyl("GEO_Server_Led_%d" % i, 0.0065, 0.0016,
                    (W / 2 - 0.030 - i * 0.022, D / 2 - 0.026, top_z + 0.0009),
                    M["accent"], axis='Z', seg=14)
            d.parent = root
    else:  # FS
        # 两侧握持槽（三条）
        for i in range(3):
            for sx in (-1, 1):
                g = box("GEO_Server_Grip_%d_%s" % (i, "L" if sx < 0 else "R"),
                        (0.010, D * 0.22, 0.0016),
                        (sx * (W / 2 - 0.004), -D * 0.10 + i * 0.026, top_z + 0.0009),
                        M["dark"], bevel=0.0)
                g.parent = root
        st2 = box("GEO_Server_Strip_B", (W * 0.5, 0.005, 0.0016),
                  (0, D / 2 - 0.030, top_z + 0.0009), M["accent"], bevel=0.0)
        st2.parent = root

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
    bg.inputs[0].default_value = (0.895, 0.872, 0.852, 1.0)
    bg.inputs[1].default_value = 0.92

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
        ob.rotation_euler = (Vector((0, 0, 0.7)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return ob

    light("KEY", (2.4, -2.6, 3.6), 900, 3.0, (1.0, 0.98, 0.94))
    light("RIM", (-2.6, 2.4, 2.4), 420, 2.6, (1.0, 0.84, 0.62))
    light("FILL", (-2.2, -2.4, 1.4), 180, 4.0, (0.90, 0.94, 1.0))
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
    cards = {k: build_card(k) for k in ("LCM", "OMC", "FS")}

    def set_hidden(objs, flag):
        for r in objs:
            r.hide_render = flag
            r.hide_viewport = flag
            for ch in r.children_recursive:
                ch.hide_render = flag
                ch.hide_viewport = flag

    top = SPEC["board"]["leg_h"] + SPEC["board"]["t"]

    set_hidden(list(cards.values()), True)
    build_floor()
    cam = setup_scene()

    # ① 主板：斜上 45°（用户指明的视角）
    render_view(os.path.join(PREVIEW_DIR, "board.png"), (2.30, -2.40, 2.05), (0, 0, top - 0.06), lens=46)

    # ② 三种卡：同一 45° 视角看平面轮廓
    set_hidden(list(cards.values()), False)
    set_hidden([board], True)
    for i, (k, cd) in enumerate(cards.items()):
        cd.location = (-0.46 + i * 0.46, 0, 0)
    render_view(os.path.join(PREVIEW_DIR, "servers.png"), (0.55, -1.05, 1.15), (0, 0, 0.02), lens=52)

    # ③ 装配：卡横插进仓（露出卡面）
    set_hidden([board], False)
    set_hidden(list(cards.values()), False)
    centers = bay_centers()
    for (k, cd), (x, y) in zip(cards.items(), (centers[0], centers[2], centers[4])):
        cd.location = (x, y, top - 0.004)
    render_view(os.path.join(PREVIEW_DIR, "assembly.png"), (2.55, -2.75, 2.30), (0, 0, top - 0.04), lens=44)
    render_view(os.path.join(PREVIEW_DIR, "assembly_side.png"), (3.60, -0.30, 1.05), (0, 0, top - 0.02), lens=52)

    for cd in cards.values():
        cd.location = (0, 0, 0)
    sizes = {}
    for k, cd in cards.items():
        sizes["server_%s.glb" % k.lower()] = export_glb(cd, os.path.join(OUT_DIR, "server_%s.glb" % k.lower()))
    sizes["board.glb"] = export_glb(board, os.path.join(OUT_DIR, "board.glb"))
    print("EXPORTED " + str(sizes))


try:
    main()
    print("BUILD_OK")
except Exception:
    import traceback
    traceback.print_exc()
    print("BUILD_FAIL")
