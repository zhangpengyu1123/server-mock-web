# -*- coding: utf-8 -*-
"""
RHINE LAB · 组件级拓扑资产（v2）
五种组件造型，统一 0.22 见方、米白 + 黑墨 + 琥珀：
  topo_comp_ctrl     主控板：双层基板 + 两排引脚 + 中心琥珀核
  topo_comp_switch   交换板：四向端口槽（十字）
  topo_comp_service  业务板：竖向散热片阵列
  topo_comp_power    电源：底座 + 立式圆柱电容 + 琥珀环
  topo_comp_fan      风扇：圆环 + 扇叶 + 中心轴
导出到 console/ui/business/assets/
"""
import bpy, math, os, traceback

OUT = r"C:\Users\zpy1\Documents\Server-Mock-Web\console\ui\business\assets"

def clean():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)

def mat(name, color, rough=0.62, emit=None, strength=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = strength
    return m

BODY  = lambda: mat("MAT_TopoBody",  (0.870, 0.850, 0.820), 0.60)
BODY2 = lambda: mat("MAT_TopoBody2", (0.780, 0.756, 0.720), 0.66)
DARK  = lambda: mat("MAT_TopoDark",  (0.060, 0.056, 0.050), 0.52)
ACCENT= lambda: mat("MAT_TopoAccent",(1.0, 0.66, 0.26), 0.35, emit=(1.0, 0.66, 0.26), strength=3.0)

def box(name, w, d, h, center, material, bevel=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = ob.modifiers.new(name="bev", type='BEVEL')
        mod.width = bevel; mod.segments = segs; mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.data.materials.append(material)
    return ob

def cyl(name, radius, depth, center, material, rot=(0,0,0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=center)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = rot
    ob.data.materials.append(material)
    return ob

def torus(name, major, minor, center, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=center)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = rot
    ob.data.materials.append(material)
    return ob

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    return ob

def export(name):
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                              export_apply=True, export_yup=True)
    print(f"EXPORTED {name}.glb {os.path.getsize(path)} bytes")

# ---------------------------------------------------------------- 主控板
def build_ctrl():
    clean()
    p = []
    p.append(box("pcb", 0.22, 0.22, 0.020, (0,0,0.010), BODY(), bevel=0.004))
    p.append(box("pcb_top", 0.16, 0.16, 0.010, (0,0,0.026), BODY2(), bevel=0.003))
    # 两排引脚
    for side in (-1, 1):
        for i in range(5):
            x = (i - 2) * 0.032
            p.append(box(f"pin_{side}_{i}", 0.010, 0.018, 0.014, (x, side*0.088, 0.030), DARK()))
    # 中心琥珀核
    p.append(box("core", 0.072, 0.072, 0.012, (0,0,0.036), ACCENT(), bevel=0.002))
    export_join(p, "TOPO_COMP_CTRL", "topo_comp_ctrl")

# ---------------------------------------------------------------- 交换板
def build_switch():
    clean()
    p = []
    p.append(box("pcb", 0.22, 0.22, 0.020, (0,0,0.010), BODY(), bevel=0.004))
    # 十字端口槽
    for i in range(3):
        off = (i - 1) * 0.030
        p.append(box(f"port_ns_{i}", 0.040, 0.012, 0.010, (off, 0, 0.026), DARK()))
        p.append(box(f"port_ew_{i}", 0.012, 0.040, 0.010, (0, off, 0.026), DARK()))
    # 四角琥珀点
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box(f"led_{sx}_{sy}", 0.016, 0.016, 0.008, (sx*0.086, sy*0.086, 0.024), ACCENT()))
    export_join(p, "TOPO_COMP_SWITCH", "topo_comp_switch")

# ---------------------------------------------------------------- 业务板
def build_service():
    clean()
    p = []
    p.append(box("pcb", 0.22, 0.22, 0.020, (0,0,0.010), BODY(), bevel=0.004))
    # 竖向散热片阵列
    for i in range(6):
        x = (i - 2.5) * 0.030
        p.append(box(f"fin_{i}", 0.012, 0.150, 0.052, (x, 0, 0.046), BODY2(), bevel=0.002))
    p.append(box("rail", 0.200, 0.012, 0.006, (0, -0.098, 0.024), ACCENT()))
    export_join(p, "TOPO_COMP_SERVICE", "topo_comp_service")

# ---------------------------------------------------------------- 电源
def build_power():
    clean()
    p = []
    p.append(box("base", 0.22, 0.22, 0.022, (0,0,0.011), BODY(), bevel=0.004))
    # 立式电容
    p.append(cyl("cap", 0.052, 0.090, (0, 0, 0.070), BODY2()))
    p.append(cyl("cap_top", 0.056, 0.010, (0, 0, 0.118), DARK()))
    # 琥珀环
    p.append(torus("ring", 0.060, 0.006, (0, 0, 0.040), ACCENT()))
    # 四个端子
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box(f"term_{sx}_{sy}", 0.018, 0.018, 0.010, (sx*0.086, sy*0.086, 0.026), DARK()))
    export_join(p, "TOPO_COMP_POWER", "topo_comp_power")

# ---------------------------------------------------------------- 风扇
def build_fan():
    clean()
    p = []
    p.append(box("frame", 0.22, 0.22, 0.018, (0,0,0.009), BODY(), bevel=0.004))
    p.append(torus("shroud", 0.086, 0.010, (0, 0, 0.024), BODY2()))
    # 扇叶：四片绕中心旋转
    for i in range(4):
        a = i * math.pi / 2
        blade = box(f"blade_{i}", 0.070, 0.026, 0.006,
                    (math.cos(a) * 0.042, math.sin(a) * 0.042, 0.026), BODY2(), bevel=0.002)
        blade.rotation_euler = (0, 0, a + 0.35)
        p.append(blade)
    p.append(cyl("hub", 0.026, 0.016, (0, 0, 0.028), DARK()))
    p.append(torus("ring", 0.078, 0.004, (0, 0, 0.020), ACCENT()))
    export_join(p, "TOPO_COMP_FAN", "topo_comp_fan")

def export_join(parts, name, glb):
    join(parts, name)
    export(glb)

def main():
    os.makedirs(OUT, exist_ok=True)
    build_ctrl(); build_switch(); build_service(); build_power(); build_fan()
    print("COMP_ASSETS_OK")

try:
    main()
except Exception:
    traceback.print_exc()
    print("COMP_ASSETS_FAIL")
