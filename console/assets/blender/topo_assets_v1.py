# -*- coding: utf-8 -*-
"""
RHINE LAB · 业务面拓扑资产（v1）
四件：站点平台 / 网元组托板 / 网元模块（立卡）/ 组件芯片
风格：米白档案纸质感 + 黑墨刻线 + 琥珀信号光
导出到 console/ui/business/assets/*.glb（glTF：Blender Y → -Z）
"""
import bpy, bmesh, math, os, traceback
from mathutils import Vector

OUT = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\business\assets"

# ---------------------------------------------------------------- 基础工具
def refresh():
    bpy.context.view_layer.update()

def clean():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)

def mat(name, color, rough=0.62, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return m

BODY   = lambda: mat("MAT_TopoBody",  (0.870, 0.850, 0.820), 0.60)
BODY2  = lambda: mat("MAT_TopoBody2", (0.800, 0.776, 0.741), 0.66)
DARK   = lambda: mat("MAT_TopoDark",  (0.052, 0.049, 0.045), 0.52)
LINE   = lambda: mat("MAT_TopoLine",  (0.360, 0.340, 0.315), 0.80)
ACCENT = lambda: mat("MAT_TopoAccent", (1.0, 0.66, 0.26), 0.35, 0.0, emit=(1.0, 0.66, 0.26), emit_strength=3.2)

def mesh_box(name, w, d, h, center=(0, 0, 0), material=None, bevel=0.0, segs=2):
    """以中心点建方块；w=x, d=z(blender 深度→gltf -z), h=y(高度)"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = ob.modifiers.new(name="bev", type='BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if material:
        ob.data.materials.append(material)
    return ob

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    return ob

def export(name):
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False,
        export_apply=True, export_yup=True,
    )
    size = os.path.getsize(path)
    print(f"EXPORTED {name}.glb {size} bytes")

# ---------------------------------------------------------------- 1. 站点平台
def build_site():
    clean()
    bpy.context.scene.unit_settings.scale_length = 1.0
    parts = []
    # 大托板
    parts.append(mesh_box("site_slab", 1.62, 1.18, 0.075, (0, 0, 0.0375), BODY(), bevel=0.012))
    # 内凹区（略低一层，形成"档案凹槽"）
    parts.append(mesh_box("site_inner", 1.46, 1.02, 0.012, (0, 0, 0.0775), BODY2(), bevel=0.006))
    # 四条短脚
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(mesh_box(f"site_foot_{sx}_{sy}", 0.10, 0.10, 0.030,
                                  (sx * 0.66, sy * 0.48, -0.015), DARK(), bevel=0.004))
    # 前缘琥珀光条
    parts.append(mesh_box("site_bar", 1.30, 0.016, 0.008, (0, -0.575, 0.079), ACCENT()))
    # 四角刻线（黑墨短线）
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(mesh_box(f"site_tick_{sx}_{sy}", 0.20, 0.006, 0.004,
                                  (sx * 0.62, sy * 0.44, 0.0805), LINE()))
    ob = join(parts, "TOPO_SITE")
    export("topo_site")

# ---------------------------------------------------------------- 2. 网元组托板
def build_group():
    clean()
    parts = []
    parts.append(mesh_box("group_base", 2.10, 0.72, 0.060, (0, 0, 0.030), BODY(), bevel=0.010))
    # 3 条卡槽凹槽
    for i in range(3):
        x = (i - 1) * 0.62
        parts.append(mesh_box(f"group_slot_{i}", 0.52, 0.020, 0.012, (x, 0, 0.066), DARK()))
        parts.append(mesh_box(f"group_slot_bar_{i}", 0.52, 0.008, 0.004, (x, 0.10, 0.067), ACCENT()))
    # 两端封板
    for sx in (-1, 1):
        parts.append(mesh_box(f"group_cap_{sx}", 0.030, 0.72, 0.090, (sx * 1.05, 0, 0.045), BODY2(), bevel=0.006))
    ob = join(parts, "TOPO_GROUP")
    export("topo_group")

# ---------------------------------------------------------------- 3. 网元模块（立卡）
def build_ne():
    clean()
    parts = []
    # 卡体（竖直立卡：宽 0.36，厚 0.05，高 0.48）
    parts.append(mesh_box("ne_body", 0.360, 0.050, 0.480, (0, 0, 0.240), BODY(), bevel=0.008))
    # 顶缘琥珀光带
    parts.append(mesh_box("ne_topbar", 0.330, 0.058, 0.012, (0, 0, 0.472), ACCENT()))
    # 正面标签凹槽
    parts.append(mesh_box("ne_label", 0.290, 0.008, 0.150, (0, -0.027, 0.300), DARK()))
    # 正面刻线（两行）
    for i, z in enumerate((0.230, 0.200)):
        parts.append(mesh_box(f"ne_line_{i}", 0.240, 0.006, 0.004, (0, -0.030, z), LINE()))
    # 侧面散热筋
    for i in range(4):
        parts.append(mesh_box(f"ne_rib_{i}", 0.006, 0.040, 0.300, (0.176, 0, 0.250 + i * 0.012), BODY2()))
    # 底部插入端（略窄，像卡口）
    parts.append(mesh_box("ne_plug", 0.280, 0.036, 0.045, (0, 0, -0.018), DARK(), bevel=0.004))
    ob = join(parts, "TOPO_NE")
    export("topo_ne")

# ---------------------------------------------------------------- 4. 组件芯片
def build_comp():
    clean()
    parts = []
    parts.append(mesh_box("comp_body", 0.22, 0.22, 0.075, (0, 0, 0.0375), BODY(), bevel=0.008))
    parts.append(mesh_box("comp_pad", 0.14, 0.14, 0.008, (0, 0, 0.0795), BODY2(), bevel=0.003))
    parts.append(mesh_box("comp_bar", 0.150, 0.010, 0.005, (0, 0.085, 0.081), ACCENT()))
    parts.append(mesh_box("comp_notch", 0.030, 0.030, 0.010, (-0.075, -0.075, 0.080), DARK()))
    ob = join(parts, "TOPO_COMP")
    export("topo_comp")

# ---------------------------------------------------------------- main
def main():
    os.makedirs(OUT, exist_ok=True)
    for fn in (build_site, build_group, build_ne, build_comp):
        fn()
    print("TOPO_ASSETS_OK")

try:
    main()
except Exception:
    traceback.print_exc()
    print("TOPO_ASSETS_FAIL")
