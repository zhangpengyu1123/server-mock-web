"""
补回主板正面信息卡（按 0.46 宽的新板尺寸重建），并去掉顶面那块多余人字板。
输出：board.glb（信息卡为竖立在 -Y 前立面的深色板，运行时由 three.js 写节点名）
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

# 砍腿 + 清理历代遗留铭牌
for ob in list(bpy.data.objects):
    if ob.name.startswith(("GEO_Board_Leg_", "GEO_Board_Pad_", "GEO_Board_Plate", "GEO_Board_InfoBar", "GEO_Board_Ruler_")):
        bpy.data.objects.remove(ob, do_unlink=True)

md = bpy.data.materials.get("MAT_Dark")
mc = bpy.data.materials.get("MAT_Accent")
TOP = 0.640 + 0.050
W, D = 0.460, 1.020
FRONT = -D / 2.0          # 板前立面（Blender -Y）


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


# —— 正面信息卡：竖立在前立面，深色板 + 左侧琥珀竖标 ——
add_box("GEO_Board_Plate", (W * 0.86, 0.0020, 0.104), (0, FRONT - 0.0012, TOP - 0.062), md)
add_box("GEO_Board_PlateTick", (0.006, 0.0024, 0.092), (-W * 0.40, FRONT - 0.0016, TOP - 0.062), mc)
# 信息卡下沿一道细光（状态色）
add_box("GEO_Board_PlateGlow", (W * 0.80, 0.0022, 0.004), (0, FRONT - 0.0016, TOP - 0.118), mc)

mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
bpy.context.view_layer.update()
for ob in board.children_recursive:
    if ob.type != 'MESH':
        continue
    for v in ob.data.vertices:
        w = ob.matrix_world @ v.co
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
print("FINAL_BOARD x=%.3f y=%.3f z=%.3f..%.3f" % (mx.x - mn.x, mx.y - mn.y, mn.z, mx.z))

bpy.ops.object.select_all(action='DESELECT')
board.select_set(True)
for ch in board.children_recursive:
    ch.select_set(True)
bpy.context.view_layer.objects.active = board
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "board.glb"), export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
print("BOARD_OK size=%d" % os.path.getsize(os.path.join(OUT, "board.glb")))
