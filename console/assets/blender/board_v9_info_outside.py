"""
V9：信息卡改为「插在主板外边」——平插在板前缘、向外探出
其他部件沿用 v8 的干净结构（板身/插槽/夹块/槽口灯/前缘光条/螺丝）
"""
import bpy
import bmesh
import os
from mathutils import Vector

OUT = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\admin\assets"

W, D, T = 0.460, 1.020, 0.050
LEG_H = 0.640
TOP = LEG_H + T
BAY_PITCH, BAY_COUNT = 0.195, 5
BAY_W, BAY_T, BAY_DEPTH = 0.400, 0.028, 0.055
BAY_Y0 = -0.360
CARD_W, CARD_D, CARD_T = 0.400, 0.200, 0.016
CARD_OUT = 0.135                 # 向板外探出的长度
CARD_Y = -D / 2 - CARD_OUT + CARD_D / 2   # 中心：一半在外，一半压住板缘
CARD_Z = TOP + 0.004


def wipe():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for ma in list(bpy.data.materials):
        bpy.data.materials.remove(ma)


def mat(name, color, rough=0.5, metal=0.0, emit=None, es=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = es
    return m


def bm_obj(bm, name, m):
    ob = bpy.data.objects.new(name, bpy.data.meshes.new(name))
    bpy.context.scene.collection.objects.link(ob)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.materials.append(m)
    return ob


def box_bm(sx, sy, sz, cx, cy, cz):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((cx, cy, cz)), verts=bm.verts)
    return bm


def bevel(bm, w, seg=2):
    if w > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=w,
                        offset_type='OFFSET', segments=seg, profile=0.5,
                        affect='EDGES', clamp_overlap=True)
    return bm


wipe()
M_BODY = mat("MAT_Body", (0.870, 0.852, 0.824), 0.62)      # 提粗糙度：治过曝
M_DARK = mat("MAT_Dark", (0.034, 0.032, 0.030), 0.80)
M_ACC = mat("MAT_Accent", (0.780, 0.545, 0.235), 0.34, emit=(1.0, 0.66, 0.26), es=3.4)
M_MET = mat("MAT_Metal", (0.630, 0.616, 0.592), 0.26, 0.92)

root = bpy.data.objects.new("BOARD_ROOT", None)
bpy.context.scene.collection.objects.link(root)

# 板身：只挖 5 条插槽（不再挖信息卡凹槽）
bm = box_bm(W, D, T, 0, 0, LEG_H + T / 2)
tmp = bpy.data.meshes.new("_tmp")
bm.to_mesh(tmp)
tob = bpy.data.objects.new("_tmp", tmp)
bpy.context.scene.collection.objects.link(tob)
made = []
for i in range(BAY_COUNT):
    y = BAY_Y0 + i * BAY_PITCH
    cb = box_bm(BAY_W, BAY_T, BAY_DEPTH * 2, 0, y, TOP)
    cm = bpy.data.meshes.new("_c%d" % i)
    cb.to_mesh(cm)
    cb.free()
    cob = bpy.data.objects.new("_c%d" % i, cm)
    bpy.context.scene.collection.objects.link(cob)
    made.append((cob, cm))
    md = tob.modifiers.new("b%d" % i, 'BOOLEAN')
    md.operation = 'DIFFERENCE'
    md.object = cob
    md.solver = 'EXACT'
dg = bpy.context.evaluated_depsgraph_get()
nm = bpy.data.meshes.new_from_object(tob.evaluated_get(dg))
bm.clear()
bm.from_mesh(nm)
bpy.data.objects.remove(tob, do_unlink=True)
for o, me in made:
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me)
for me in (tmp, nm):
    bpy.data.meshes.remove(me)
bevel(bm, 0.0030, 2)
slab = bm_obj(bm, "GEO_Board_Slab", M_BODY)
slab.parent = root

# 插槽内腔 / 夹块 / 槽口灯（灯贴在板面上，不缩放）
for i in range(BAY_COUNT):
    y = BAY_Y0 + i * BAY_PITCH
    cav = bm_obj(box_bm(BAY_W - 0.004, BAY_T - 0.004, BAY_DEPTH - 0.002, 0, y, TOP - BAY_DEPTH / 2 - 0.001), "BAY_%02d" % i, M_DARK)
    cav.parent = root
    for side, tag in ((-1, "A"), (1, "B")):
        g = bm_obj(bevel(box_bm(0.018, BAY_T + 0.026, 0.016, side * (BAY_W / 2 + 0.010), y, TOP + 0.006), 0.0012, 2),
                   "BAY_LIP_%02d_%s" % (i, tag), M_BODY)
        g.parent = root
    glow = bm_obj(box_bm(0.030, 0.016, 0.003, BAY_W / 2 + 0.034, y, TOP + 0.0015), "SOCKET_GLOW_%02d" % i, M_ACC)
    glow.parent = root

# ★ 信息卡：平插在板前缘、向板外探出（不嵌在板里）
card = bm_obj(bevel(box_bm(CARD_W, CARD_D, CARD_T, 0, CARD_Y, CARD_Z), 0.0016, 2), "GEO_InfoCard", M_DARK)
card.parent = root
# 卡上文字位的琥珀竖标（贴在卡面左侧，运行时 three.js 在旁边写节点名）
bar = bm_obj(box_bm(0.008, CARD_D * 0.86, 0.0022, -CARD_W / 2 + 0.014, CARD_Y, CARD_Z + CARD_T / 2), "GEO_InfoCardBar", M_ACC)
bar.parent = root
# 卡片外沿一条细光（状态）
edge = bm_obj(box_bm(CARD_W * 0.92, 0.004, 0.005, 0, CARD_Y - CARD_D / 2 + 0.004, CARD_Z), "GEO_InfoCardEdge", M_ACC)
edge.parent = root

# 前缘光条 + 螺丝
rail = bm_obj(box_bm(W * 0.92, 0.012, 0.006, 0, -D / 2 + 0.026, TOP - 0.0032), "GEO_Board_LightRail", M_ACC)
rail.parent = root
for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
    bm2 = bmesh.new()
    bmesh.ops.create_cone(bm2, cap_ends=True, segments=12, radius1=0.0072, radius2=0.0072, depth=0.004)
    bmesh.ops.translate(bm2, vec=Vector((sx * (W / 2 - 0.040), sy * (D / 2 - 0.040), TOP + 0.0005)), verts=bm2.verts)
    sc = bm_obj(bm2, "GEO_Board_Screw_%d" % i, M_MET)
    sc.parent = root

bpy.context.view_layer.update()
print("INFO_CARD_OUT y_from=%.3f y_to=%.3f (board front=%.3f)" % (CARD_Y - CARD_D / 2, CARD_Y + CARD_D / 2, -D / 2))
print("INFO_CARD_TOP z=%.3f" % (CARD_Z + CARD_T / 2))

bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for ch in root.children_recursive:
    ch.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "board.glb"), export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
print("BOARD_V9_OK size=%d" % os.path.getsize(os.path.join(OUT, "board.glb")))
