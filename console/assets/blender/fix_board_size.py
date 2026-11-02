"""
诊断 + 修复主板尺寸（无头干净进程跑）
1) 跑 v7 建模（内部会 wipe）
2) 打印 BOARD_ROOT 每个子对象的世界包围盒（谁把宽度撑到 1.22 一目了然）
3) 把整个 BOARD_ROOT 等比归一到目标尺寸（X=0.46, Y=1.02）
4) 重新导出 board.glb，并打印归一的实测值
"""
import runpy
import bpy
import os
from mathutils import Vector

V7 = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\assets\blender\build_rhine_assets_v7.py"
OUT = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\admin\assets"

TARGET_X = 0.460
TARGET_Y = 1.020

runpy.run_path(V7)          # 建模 + 导出 + 预览渲染

board = bpy.data.objects.get("BOARD_ROOT")
assert board, "BOARD_ROOT 不存在"

# 砍腿（悬浮）
for ob in list(bpy.data.objects):
    if ob.name.startswith("GEO_Board_Leg_") or ob.name.startswith("GEO_Board_Pad_"):
        bpy.data.objects.remove(ob, do_unlink=True)


def bbox_of(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        if ob.type != 'MESH':
            continue
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


bpy.context.view_layer.update()
children = [c for c in board.children_recursive if c.type == 'MESH']

# —— 诊断：逐个对象打印 X 跨度，找出异常大的 ——
rows = []
for c in children:
    mn, mx = bbox_of([c])
    rows.append((mx.x - mn.x, c.name, round(mn.x, 3), round(mx.x, 3)))
rows.sort(reverse=True)
print("TOP_WIDTH_OBJECTS")
for w, name, a, b in rows[:8]:
    print("  %7.3f  %-28s x=[%.3f, %.3f]" % (w, name, a, b))

mn, mx = bbox_of(children)
cur_x = mx.x - mn.x
cur_y = mx.y - mn.y
print("BOARD_BBOX_BEFORE x=%.3f y=%.3f" % (cur_x, cur_y))

# —— 归一：整体缩放到目标尺寸（通过 BOARD_ROOT 的 node scale，导出后 three.js 也吃得到）——
if cur_x > 0.001 and cur_y > 0.001:
    board.scale = (TARGET_X / cur_x, TARGET_Y / cur_y, 1.0)
bpy.context.view_layer.update()

mn2, mx2 = bbox_of(children)
print("BOARD_SCALE_APPLIED (%.4f, %.4f, 1.0)" % (board.scale.x, board.scale.y))
print("BOARD_BBOX_AFTER_LOCAL x=%.3f y=%.3f（未乘 scale）" % (mx2.x - mn2.x, mx2.y - mn2.y))
print("BOARD_BBOX_AFTER_WORLD x=%.3f y=%.3f" % ((mx2.x - mn2.x) * board.scale.x, (mx2.y - mn2.y) * board.scale.y))

# —— 重新导出 ——
bpy.ops.object.select_all(action='DESELECT')
board.select_set(True)
for ch in board.children_recursive:
    ch.select_set(True)
bpy.context.view_layer.objects.active = board
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "board.glb"), export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
print("BOARD_FIXED size=%d" % os.path.getsize(os.path.join(OUT, "board.glb")))
