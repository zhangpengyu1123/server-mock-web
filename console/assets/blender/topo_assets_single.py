# -*- coding: utf-8 -*-
"""
RHINE LAB · 拓扑资产 · 单文件版（v3）
把站点/组/网元/5 种组件全部放进一个场景，导出 topo_all.glb。
运行时按对象名（TOPO_SITE / TOPO_GROUP / TOPO_NE / TOPO_COMP_*）取用。
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

BODY   = lambda: mat("MAT_TopoBody",   (0.870, 0.850, 0.820), 0.60)
BODY2  = lambda: mat("MAT_TopoBody2",  (0.780, 0.756, 0.720), 0.66)
DARK   = lambda: mat("MAT_TopoDark",   (0.060, 0.056, 0.050), 0.52)
LINE   = lambda: mat("MAT_TopoLine",   (0.360, 0.340, 0.315), 0.80)
PLATE  = lambda: mat("MAT_TopoPlate",  (0.105, 0.100, 0.092), 0.72)
ACCENT = lambda: mat("MAT_TopoAccent", (1.0, 0.66, 0.26), 0.35, emit=(1.0, 0.66, 0.26), strength=3.0)

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

def join(objs, name, offset=(0, 0, 0)):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    ob.location = offset
    return ob

ALL = []

# ---------------------------------------------------------------- 站点平台
def build_site(offset):
    p = []
    p.append(box("site_slab", 1.62, 1.18, 0.075, (0,0,0.0375), BODY(), bevel=0.012))
    p.append(box("site_inner", 1.46, 1.02, 0.012, (0,0,0.0775), BODY2(), bevel=0.006))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box("site_foot", 0.10, 0.10, 0.030, (sx*0.66, sy*0.48, -0.015), DARK(), bevel=0.004))
    p.append(box("site_bar", 1.30, 0.016, 0.008, (0,-0.575,0.079), ACCENT()))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box("site_tick", 0.20, 0.006, 0.004, (sx*0.62, sy*0.44, 0.0805), LINE()))
    ALL.append(join(p, "TOPO_SITE", offset))

# ---------------------------------------------------------------- 网元组托板
def build_group(offset):
    p = []
    p.append(box("group_base", 2.10, 0.72, 0.060, (0,0,0.030), BODY(), bevel=0.010))
    for i in range(3):
        x = (i - 1) * 0.62
        p.append(box("group_slot", 0.52, 0.020, 0.012, (x,0,0.066), DARK()))
        p.append(box("group_slot_bar", 0.52, 0.008, 0.004, (x,0.10,0.067), ACCENT()))
    for sx in (-1, 1):
        p.append(box("group_cap", 0.030, 0.72, 0.090, (sx*1.05,0,0.045), BODY2(), bevel=0.006))
    ALL.append(join(p, "TOPO_GROUP", offset))

# ---------------------------------------------------------------- 网元立卡
def build_ne(offset):
    p = []
    p.append(box("ne_body", 0.360, 0.050, 0.480, (0,0,0.240), BODY(), bevel=0.008))
    p.append(box("ne_topbar", 0.330, 0.058, 0.012, (0,0,0.472), ACCENT()))
    p.append(box("ne_label", 0.290, 0.008, 0.150, (0,-0.027,0.300), PLATE()))
    for i, z in enumerate((0.230, 0.200)):
        p.append(box("ne_line", 0.240, 0.006, 0.004, (0,-0.030,z), LINE()))
    for i in range(4):
        p.append(box("ne_rib", 0.006, 0.040, 0.300, (0.176,0,0.250+i*0.012), BODY2()))
    p.append(box("ne_plug", 0.280, 0.036, 0.045, (0,0,-0.018), DARK(), bevel=0.004))
    ALL.append(join(p, "TOPO_NE", offset))

# ---------------------------------------------------------------- 组件：主控板
def build_ctrl(offset):
    p = [box("pcb", 0.22, 0.22, 0.020, (0,0,0.010), BODY(), bevel=0.004),
         box("pcb_top", 0.16, 0.16, 0.010, (0,0,0.026), BODY2(), bevel=0.003)]
    for side in (-1, 1):
        for i in range(5):
            p.append(box("pin", 0.010, 0.018, 0.014, ((i-2)*0.032, side*0.088, 0.030), DARK()))
    p.append(box("core", 0.072, 0.072, 0.012, (0,0,0.036), ACCENT(), bevel=0.002))
    ALL.append(join(p, "TOPO_COMP_CTRL", offset))

# ---------------------------------------------------------------- 组件：交换板
def build_switch(offset):
    p = [box("pcb", 0.22, 0.22, 0.020, (0,0,0.010), BODY(), bevel=0.004)]
    for i in range(3):
        off = (i - 1) * 0.030
        p.append(box("port_ns", 0.040, 0.012, 0.010, (off,0,0.026), DARK()))
        p.append(box("port_ew", 0.012, 0.040, 0.010, (0,off,0.026), DARK()))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box("led", 0.016, 0.016, 0.008, (sx*0.086, sy*0.086, 0.024), ACCENT()))
    ALL.append(join(p, "TOPO_COMP_SWITCH", offset))

# ---------------------------------------------------------------- 组件：业务板
def build_service(offset):
    p = [box("pcb", 0.22, 0.22, 0.020, (0,0,0.010), BODY(), bevel=0.004)]
    for i in range(6):
        p.append(box("fin", 0.012, 0.150, 0.052, ((i-2.5)*0.030, 0, 0.046), BODY2(), bevel=0.002))
    p.append(box("rail", 0.200, 0.012, 0.006, (0,-0.098,0.024), ACCENT()))
    ALL.append(join(p, "TOPO_COMP_SERVICE", offset))

# ---------------------------------------------------------------- 组件：电源
def build_power(offset):
    p = [box("base", 0.22, 0.22, 0.022, (0,0,0.011), BODY(), bevel=0.004),
         cyl("cap", 0.052, 0.090, (0,0,0.070), BODY2()),
         cyl("cap_top", 0.056, 0.010, (0,0,0.118), DARK()),
         torus("ring", 0.060, 0.006, (0,0,0.040), ACCENT())]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box("term", 0.018, 0.018, 0.010, (sx*0.086, sy*0.086, 0.026), DARK()))
    ALL.append(join(p, "TOPO_COMP_POWER", offset))

# ---------------------------------------------------------------- 组件：风扇
def build_fan(offset):
    p = [box("frame", 0.22, 0.22, 0.018, (0,0,0.009), BODY(), bevel=0.004),
         torus("shroud", 0.086, 0.010, (0,0,0.024), BODY2())]
    for i in range(4):
        a = i * math.pi / 2
        blade = box("blade", 0.070, 0.026, 0.006,
                    (math.cos(a)*0.042, math.sin(a)*0.042, 0.026), BODY2(), bevel=0.002)
        blade.rotation_euler = (0, 0, a + 0.35)
        p.append(blade)
    p.append(cyl("hub", 0.026, 0.016, (0,0,0.028), DARK()))
    p.append(torus("ring", 0.078, 0.004, (0,0,0.020), ACCENT()))
    ALL.append(join(p, "TOPO_COMP_FAN", offset))

def main():
    os.makedirs(OUT, exist_ok=True)
    clean()
    # 摆开，避免重叠（运行时按对象取用，位置会被覆盖）
    build_site((0, 0, 0))
    build_group((0, 3, 0))
    build_ne((0, 6, 0))
    build_ctrl((2, 0, 0))
    build_switch((2, 1, 0))
    build_service((2, 2, 0))
    build_power((2, 3, 0))
    build_fan((2, 4, 0))

    path = os.path.join(OUT, "topo_all.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                              export_apply=True, export_yup=True)
    print("EXPORTED topo_all.glb %d bytes, objects=%d" % (os.path.getsize(path), len(ALL)))
    print("TOPO_SINGLE_OK")

try:
    main()
except Exception:
    traceback.print_exc()
    print("TOPO_SINGLE_FAIL")
