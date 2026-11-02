"""
修正主板尺寸（不缩放板身）：
 · 删除历代遗留的 GEO_Board_Plate（0.84 宽，撑爆包围盒的元凶）及其衍生件
 · 按 0.46 宽板重建信息区：铭牌 0.38×0.28（贴 -Y 侧）、右侧状态条、三道刻度
 · 重新导出，并打印最终包围盒
"""
import runpy
import bpy
import bmesh
import os
from mathutils import Vector

V7 = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\assets\blender\build_rhine_assets_v7.py"
OUT = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\admin\assets"

runpy.run_path(V7)

board = bpy.data.objects.get("BOARD_ROOT")
assert board

# 砍腿
for ob in list(bpy.data.objects):
    if ob.name.startswith("GEO_Board_Leg_") or ob.name.startswith("GEO_Board_Pad_"):
        bpy.data.objects.remove(ob, do_unlink=True)

# 删除历代遗留的铭牌/信息区（宽 0.84 的那块是元凶）
for ob in list(bpy.data.objects):
    if ob.name.startswith(("GEO_Board_Plate", "GEO_Board_InfoBar", "GEO_Board_Ruler_")):
        bpy.data.objects.remove(ob, do_unlink=True)

board.scale = (1.0, 1.0, 1.0)
md = bpy.data.materials.get("MAT_Dark")
mc = bpy.data.materials.get("MAT_Accent")

TOP = 0.640 + 0.050      # 板面上表面
W, D = 0.460, 1.020


def add_box(name, size, loc, mat):
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob.parent = board
    return ob


# 信息区：贴 -Y 侧（面向相机的一侧）
add_box("GEO_Board_Plate", (W * 0.82, D * 0.28, 0.0014), (0, -D / 2 + D * 0.17, TOP + 0.0007), md)
add_box("GEO_Board_InfoBar", (0.008, D * 0.24, 0.0020), (W * 0.36, -D / 2 + D * 0.17, TOP + 0.0010), mc)
for i in range(3):
    add_box("GEO_Board_Ruler_%d" % i, (W * 0.62, 0.0014, 0.0016),
            (0, -D / 2 + 0.030 + i * 0.016, TOP + 0.0009), md)

# 最终包围盒
mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
bpy.context.view_layer.update()
for ob in board.children_recursive:
    if ob.type != 'MESH':
        continue
    for v in ob.data.vertices:
        w = ob.matrix_world @ v.co
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
print("FINAL_BOARD x=%.3f y=%.3f z_h=%.3f..%.3f" % (mx.x - mn.x, mx.y - mn.y, mn.z, mx.z))

bpy.ops.object.select_all(action='DESELECT')
board.select_set(True)
for ch in board.children_recursive:
    ch.select_set(True)
bpy.context.view_layer.objects.active = board
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "board.glb"), export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
print("BOARD_OK size=%d" % os.path.getsize(os.path.join(OUT, "board.glb")))
