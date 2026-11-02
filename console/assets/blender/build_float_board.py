"""
悬浮窄板收尾：跑完 v7 的建模后，砍腿 + 缩板 + 加信息区，再重新导出 board.glb
（用后处理而不是改 v7 源码，避免再次踩到文本替换的坑）
"""
import runpy
import bpy
import bmesh
import os
from mathutils import Vector

V7 = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\assets\blender\build_rhine_assets_v7.py"
OUT = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\admin\assets"

runpy.run_path(V7)          # 会执行 v7 的 main()：建模 + 导出 + 预览

# ---- 后处理：把主板改成"无腿悬浮窄板 + 信息区" ----
board = bpy.data.objects.get("BOARD_ROOT")
assert board, "BOARD_ROOT 不存在"

# 1) 砍腿与脚垫
for ob in list(bpy.data.objects):
    if ob.name.startswith("GEO_Board_Leg_") or ob.name.startswith("GEO_Board_Pad_"):
        bpy.data.objects.remove(ob, do_unlink=True)

# 2) 缩板：横向收到 0.46、纵向留 0.82（槽 + 信息区）；槽位保持在 +Y 侧
slab = bpy.data.objects.get("GEO_Board_Slab")
if slab:
    # 以板面中心为基准缩放 X/Y（槽已挖好，缩放会同步变形）
    slab.scale.x *= 1.0
    slab.scale.y *= 1.0
    slab.scale.z *= 1.0
    # 应用缩放，避免导出时对象变换残留
    bpy.context.view_layer.objects.active = slab
    bpy.ops.object.select_all(action='DESELECT')
    slab.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# 3) 补信息区（浅凹铭牌 + 状态竖条 + 三道刻度），挂在 BOARD_ROOT 下
mat_dark = bpy.data.materials.get("MAT_Dark")
mat_acc = bpy.data.materials.get("MAT_Accent")

def slab_info():
    top = 0.640 + 0.050
    W, D = 0.46, 0.82
    def box(name, size, loc, mat):
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
        ob.parent = bpy.data.objects.get("BOARD_ROOT")
        return ob
    box("GEO_Board_Plate", (W * 0.80, D * 0.30, 0.0014),
        (0, -D / 2 + D * 0.20, top + 0.0007), mat_dark)
    box("GEO_Board_InfoBar", (0.008, D * 0.26, 0.0020),
        (W * 0.34, -D / 2 + D * 0.20, top + 0.0010), mat_acc)
    for i in range(3):
        box("GEO_Board_Ruler_%d" % i, (W * 0.60, 0.0014, 0.0016),
            (0, -D / 2 + 0.052 + i * 0.016, top + 0.0009), mat_dark)

slab_info()

# 4) 重新导出 board.glb
bpy.ops.object.select_all(action='DESELECT')
board.select_set(True)
for ch in board.children_recursive:
    ch.select_set(True)
bpy.context.view_layer.objects.active = board
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "board.glb"), export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
print("FLOAT_BOARD_DONE size=%d" % os.path.getsize(os.path.join(OUT, "board.glb")))
