"""
RhineLab · 管理面三维资产 v5（Blender 4.5）
==========================================
形体口径（用户确认）：
  · 主板：平放的水平长条托板，板面开一列**窄插槽**，四脚支起，前缘有光槽与铭牌凹位
  · 服务器：**薄的正方形磁盘卡**（像参考图里那张白色薄卡），竖直从上插入窄槽
      - 三种机型**外形轮廓不同**（不是只换贴图）：
          LCM = 圆角方卡 + 顶部中央半圆缺口
          OMC = 顶部两角 45° 切角（八边形感）+ 两个方缺口
          FS  = 更高更窄，顶边梳齿（6 齿）+ 两侧握持槽
      - 每张卡上部有**显著名称铭牌**（深色凹位，运行时贴服务名 + 路径）
      - 底缘有一条发光边（琥珀）表示运行状态，侧视也可见
坐标：米，Z 向上；卡面朝 ±Y（相机在 -Y），插入方向 -Z。
命名：
  BOARD_ROOT → GEO_Board_Slab / _Leg_* / _Guide_* / SOCKET_CAVITY_* / SOCKET_GLOW_*
               / GEO_Board_LightRail / GEO_Board_Plate
  SERVER_<KIND>_ROOT（原点 = 卡片最低点，插到位时落在槽底面）
     → GEO_Server_Card / GEO_Server_LabelSlot / GEO_Server_Strip / GEO_Server_Plug
       / GEO_Server_Notch_* / GEO_Server_Grip_*
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
        "slot_pitch": 0.420, "slot_count": 5,
        "slot_w": 0.380, "slot_t": 0.030, "slot_depth": 0.060,
        "bevel": 0.0035,
    },
    # 卡片：宽 w × 高 h × 厚 t；插入后露出高度 = h - insert
    "card": {
        "w": 0.340, "h": 0.360, "t": 0.018,
        "insert": 0.050,              # 插进槽里的深度
        "plug_w": 0.090, "plug_h": 0.040,
        "bevel": 0.0016,
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


def cyl(name, r, depth, loc, mat, axis='Y', seg=32):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    elif axis == 'Z':
        pass
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
    cutters = [((s["slot_w"], s["slot_t"], s["slot_depth"] * 2), (x, 0, top_z)) for x in slot_xs()]
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
        # 槽口两侧夹持凸台（视觉上"卡住"卡片）
        for side in (-1, 1):
            g = box("GEO_Board_Guide_%02d_%s" % (i, "A" if side < 0 else "B"),
                    (0.026, s["slot_t"] + 0.026, 0.020),
                    (x + side * (s["slot_w"] / 2 + 0.012), 0, top_z + 0.008),
                    M["body"], bevel=0.0016, seg=2)
            g.parent = root
        cav = box("SOCKET_CAVITY_%02d" % i,
                  (s["slot_w"] - 0.004, s["slot_t"] - 0.004, s["slot_depth"] - 0.002),
                  (x, 0, top_z - s["slot_depth"] / 2 - 0.001), M["dark"], bevel=0.001, seg=1)
        cav.parent = root
        for j in range(3):
            ct = box("GEO_Board_Contact_%02d_%d" % (i, j), (0.024, 0.010, 0.003),
                     (x - 0.05 + j * 0.05, 0, top_z - s["slot_depth"] + 0.004),
                     M["metal"], bevel=0.0004, seg=1)
            ct.parent = root
        glow = box("SOCKET_GLOW_%02d" % i, (0.024, 0.018, 0.003),
                   (x, s["slot_t"] / 2 + 0.026, top_z + 0.0015), M["accent"], bevel=0.0004, seg=1)
        glow.parent = root

    groove = box("GEO_Board_Groove", (s["w"] * 0.96, 0.026, 0.010),
                 (0, -s["d"] / 2 + 0.032, top_z - 0.006), M["dark"], bevel=0.001, seg=1)
    groove.parent = root
    rail = box("GEO_Board_LightRail", (s["w"] * 0.94, 0.013, 0.007),
               (0, -s["d"] / 2 + 0.032, top_z - 0.0035), M["accent"], bevel=0.0008, seg=1)
    rail.parent = root

    plate = box("GEO_Board_Plate", (0.840, 0.0020, 0.082),
                (-0.55, -s["d"] / 2 - 0.0012, top_z - 0.048), M["dark"], bevel=0.0)
    plate.parent = root

    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        sc = cyl("GEO_Board_Screw_%d" % i, 0.0075, 0.004,
                 (sx * (s["w"] / 2 - 0.045), sy * (s["d"] / 2 - 0.045), top_z + 0.0005),
                 M["metal"], axis='Z', seg=12)
        sc.parent = root
    return root


# ---------------------------------------------------------------- 薄方卡（三种轮廓）
def build_card(kind):
    M = mats()
    c = SPEC["card"]
    root = bpy.data.objects.new("SERVER_%s_ROOT" % kind, None)
    bpy.context.scene.collection.objects.link(root)

    W = c["w"]
    H = c["h"] if kind != "FS" else c["h"] * 1.10     # FS 更高
    if kind == "OMC":
        W = c["w"] * 1.02
    T = c["t"]

    # 卡片轮廓：先做方卡，再按机型挖轮廓特征
    bm = box_bm(W, T, H, 0, 0, H / 2.0)
    cutters = []

    if kind == "LCM":
        # 顶部中央半圆缺口（用两条斜切近似圆弧 + 中缝）
        cutters.append((0.070, T * 2, 0.070, 0, 0, H))          # 中央方缺口
        cutters.append((0.040, T * 2, 0.040, 0, 0, H - 0.020))  # 再收一刀，形成阶梯
    elif kind == "OMC":
        # 顶部两角 45° 切角
        for sx in (-1, 1):
            cb = box_bm(0.110, T * 2, 0.110)
            bmesh.ops.rotate(cb, verts=cb.verts,
                             matrix=Matrix.Rotation(math.radians(45), 3, 'Y'))
            bmesh.ops.translate(cb, vec=Vector((sx * (W / 2 - 0.005), 0, H - 0.005)), verts=cb.verts)
            # 直接作为几何差集：先转成 mesh 再交给 bool
            cm = bpy.data.meshes.new("_rot")
            cb.to_mesh(cm)
            cb.free()
            obj = bpy.data.objects.new("_rot", cm)
            bpy.context.scene.collection.objects.link(obj)
            tmp = bpy.data.meshes.new("_t")
            bm.to_mesh(tmp)
            tob = bpy.data.objects.new("_t", tmp)
            bpy.context.scene.collection.objects.link(tob)
            mod = tob.modifiers.new("b", 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.object = obj
            mod.solver = 'EXACT'
            dg = bpy.context.evaluated_depsgraph_get()
            nm = bpy.data.meshes.new_from_object(tob.evaluated_get(dg))
            bm.clear()
            bm.from_mesh(nm)
            for o in (tob, obj):
                bpy.data.objects.remove(o, do_unlink=True)
            for m2 in (tmp, cm, nm):
                bpy.data.meshes.remove(m2)
        # 两个方形缺口
        cutters.append((0.030, T * 2, 0.030, -0.070, 0, H))
        cutters.append((0.030, T * 2, 0.030, 0.070, 0, H))
    else:  # FS：顶边梳齿（挖 5 条缝）
        for i in range(5):
            x = -W / 2 + 0.042 + i * (W - 0.084) / 4.0
            cutters.append((0.020, T * 2, 0.060, x, 0, H))

    if cutters:
        bm = bool_cut(bm, [((a, b, cc), (dx, dy, dz)) for (a, b, cc, dx, dy, dz) in cutters])
    bevel_bm(bm, c["bevel"], 2)
    card = bm_to_obj(bm, "GEO_Server_Card", M["body"])
    card.parent = root

    fy = -T / 2.0

    # 底部插舌（进入窄槽）
    plug = box("GEO_Server_Plug", (c["plug_w"], T * 0.92, c["plug_h"]),
               (0, 0, -c["plug_h"] / 2 + 0.004), M["metal"], bevel=0.0012, seg=1)
    plug.parent = root

    # 显著名称铭牌：卡面上部整幅深色凹位（运行时贴服务名 + 类型 + 路径）
    label_h = 0.088 if kind != "FS" else 0.100
    label_w = W * 0.84
    label = box("GEO_Server_LabelSlot", (label_w, 0.0016, label_h),
                (0, fy - 0.0010, H - 0.070 - (0.0 if kind != "FS" else 0.012)),
                M["dark"], bevel=0.0)
    label.parent = root
    # 铭牌左侧琥珀竖条（品牌位）
    tick = box("GEO_Server_LabelTick", (0.006, 0.0022, label_h * 0.92),
               (-label_w / 2 + 0.012, fy - 0.0014, H - 0.070 - (0.0 if kind != "FS" else 0.012)),
               M["accent"], bevel=0.0)
    tick.parent = root

    # 底缘发光边（状态色，侧视可见）
    strip = box("GEO_Server_Strip", (W * 0.88, 0.004, 0.006),
                (0, fy - 0.0018, 0.026), M["accent"], bevel=0.0006, seg=1)
    strip.parent = root

    # 机型附加特征（侧视可分辨）
    if kind == "LCM":
        # 一条竖向细金线 + 底部小圆点
        v = box("GEO_Server_VBar", (0.005, 0.0022, H * 0.30),
                (W / 2 - 0.022, fy - 0.0014, H * 0.30), M["accent"], bevel=0.0)
        v.parent = root
        dot = cyl("GEO_Server_Led_0", 0.008, 0.004, (W / 2 - 0.022, fy - 0.0015, 0.070),
                  M["accent"], axis='Y', seg=16)
        dot.parent = root
    elif kind == "OMC":
        # 两排横向散热槽（左侧）
        for i in range(4):
            v = box("GEO_Server_Vent_%d" % i, (W * 0.34, 0.0022, 0.006),
                    (-W * 0.18, fy - 0.0014, 0.070 + i * 0.020), M["dark"], bevel=0.0)
            v.parent = root
        for i in range(2):
            d = cyl("GEO_Server_Led_%d" % i, 0.0075, 0.004,
                    (W / 2 - 0.030 - i * 0.024, fy - 0.0015, 0.070), M["accent"], axis='Y', seg=16)
            d.parent = root
    else:  # FS
        # 两侧握持槽（三条）
        for i in range(3):
            for sx in (-1, 1):
                g = box("GEO_Server_Grip_%d_%s" % (i, "L" if sx < 0 else "R"),
                        (0.008, T + 0.004, 0.020),
                        (sx * (W / 2 - 0.004), 0, 0.090 + i * 0.030), M["dark"], bevel=0.0006, seg=1)
                g.parent = root
        st2 = box("GEO_Server_Strip_B", (W * 0.5, 0.004, 0.005),
                  (0, fy - 0.0018, H - 0.148), M["accent"], bevel=0.0005, seg=1)
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
        ob.rotation_euler = (Vector((0, 0, 0.7)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
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
    cards = {k: build_card(k) for k in ("LCM", "OMC", "FS")}

    def set_hidden(objs, flag):
        for r in objs:
            r.hide_render = flag
            r.hide_viewport = flag
            for ch in r.children_recursive:
                ch.hide_render = flag
                ch.hide_viewport = flag

    set_hidden(list(cards.values()), True)
    build_floor()
    cam = setup_scene()

    render_view(os.path.join(PREVIEW_DIR, "board.png"), (2.30, -3.30, 2.10), (0, 0, 0.72), lens=52)

    # 三型并排（正脸，看轮廓差异 + 铭牌位）
    set_hidden(list(cards.values()), False)
    set_hidden([board], True)
    for (k, cd), x in zip(cards.items(), (-0.42, 0.0, 0.42)):
        cd.location = (x, 0, 0.0)
    render_view(os.path.join(PREVIEW_DIR, "servers.png"), (0.0, -1.75, 0.24), (0, 0, 0.185), lens=64)

    # 装配：三张卡插在主板上
    set_hidden([board], False)
    set_hidden(list(cards.values()), False)
    xs = slot_xs()
    top = SPEC["board"]["leg_h"] + SPEC["board"]["t"]
    for (k, cd), slot in zip(cards.items(), (xs[1], xs[2], xs[3])):
        cd.location = (slot, 0, top - SPEC["board"]["slot_depth"])
    render_view(os.path.join(PREVIEW_DIR, "assembly.png"), (2.35, -3.05, 2.00), (0, 0, 0.80), lens=54)
    render_view(os.path.join(PREVIEW_DIR, "assembly_side.png"), (3.40, -1.05, 1.05), (0, 0, 0.82), lens=58)

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
