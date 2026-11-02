#!/usr/bin/env node
/* v5 → v7：把插槽从"沿 X 一排"改成"沿 Y 一排（面贴面并排）"，
   铭牌上移到卡面上部（45° 俯视时每张卡露出的是上缘一条），保持三种顶部轮廓差异。 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'console/assets/blender/build_rhine_assets_v5.py';
let t = readFileSync(SRC, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  const isRe = from instanceof RegExp;
  const hit = isRe ? from.test(t) : t.includes(from);
  if (!hit) { log.push('MISS ' + tag); if (isRe) from.lastIndex = 0; return; }
  t = isRe ? t.replace(from, () => to) : t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 主板：沿 Y 排列的平行窄槽（面贴面），放 5 张卡 */
rep(/"slot_pitch": 0\.420, "slot_count": 5,\n        "slot_w": 0\.380, "slot_t": 0\.030, "slot_depth": 0\.060,/,
`"slot_pitch": 0.082, "slot_count": 5,      # 沿深度 Y 并排，面贴面
        "slot_w": 0.360, "slot_t": 0.026, "slot_depth": 0.055,`, 'board slot spec');

/* 2) 槽心坐标：从沿 X 改为沿 Y */
rep(/def slot_xs\(\):\n    s = SPEC\["board"\]\n    n = s\["slot_count"\]\n    span = \(n - 1\) \* s\["slot_pitch"\]\n    return \[-span \/ 2 \+ i \* s\["slot_pitch"\] for i in range\(n\)\]/,
`def slot_ys():
    """插槽沿深度 Y 排开：卡片面贴面并排（像刀片卡插在背板上）"""
    s = SPEC["board"]
    n = s["slot_count"]
    span = (n - 1) * s["slot_pitch"]
    return [-span / 2 + i * s["slot_pitch"] for i in range(n)]`, 'slot_ys');

/* 3) 主板挖槽：沿 Y 的平行槽（长边沿 X） */
rep(/    cutters = \[\(\(s\["slot_w"\], s\["slot_t"\], s\["slot_depth"\] \* 2\), \(x, 0, top_z\)\) for x in slot_xs\(\)\]/,
    `    cutters = [((s["slot_w"], s["slot_t"], s["slot_depth"] * 2), (0, y, top_z)) for y in slot_ys()]`, 'board cutters');

/* 4) 槽内腔/夹块/触点/仓灯：改为沿 Y 定位 */
rep(/    for i, x in enumerate\(slot_xs\(\)\):\n        # 槽口两侧夹持凸台（视觉上"卡住"卡片）\n        for side in \(-1, 1\):\n            g = box\("GEO_Board_Guide_%02d_%s" % \(i, "A" if side < 0 else "B"\),\n                    \(0\.026, s\["slot_t"\] \+ 0\.026, 0\.020\),\n                    \(x \+ side \* \(s\["slot_w"\] \/ 2 \+ 0\.012\), 0, top_z \+ 0\.008\),\n                    M\["body"\], bevel=0\.0016, seg=2\)\n            g\.parent = root\n        cav = box\("SOCKET_CAVITY_%02d" % i,\n                  \(s\["slot_w"\] - 0\.004, s\["slot_t"\] - 0\.004, s\["slot_depth"\] - 0\.002\),\n                  \(x, 0, top_z - s\["slot_depth"\] \/ 2 - 0\.001\), M\["dark"\], bevel=0\.001, seg=1\)\n        cav\.parent = root\n        for j in range\(3\):\n            ct = box\("GEO_Board_Contact_%02d_%d" % \(i, j\), \(0\.024, 0\.010, 0\.003\),\n                     \(x - 0\.05 \+ j \* 0\.05, 0, top_z - s\["slot_depth"\] \+ 0\.004\),\n                     M\["metal"\], bevel=0\.0004, seg=1\)\n            ct\.parent = root\n        glow = box\("SOCKET_GLOW_%02d" % i, \(0\.024, 0\.018, 0\.003\),\n                   \(x, s\["slot_t"\] \/ 2 \+ 0\.026, top_z \+ 0\.0015\), M\["accent"\], bevel=0\.0004, seg=1\)\n        glow\.parent = root/,
`    for i, y in enumerate(slot_ys()):
        # 槽两端夹块（沿 X 两端夹住卡片）
        for side in (-1, 1):
            g = box("GEO_Board_Guide_%02d_%s" % (i, "A" if side < 0 else "B"),
                    (0.020, s["slot_t"] + 0.030, 0.018),
                    (side * (s["slot_w"] / 2 + 0.010), y, top_z + 0.007),
                    M["body"], bevel=0.0014, seg=2)
            g.parent = root
        cav = box("SOCKET_CAVITY_%02d" % i,
                  (s["slot_w"] - 0.004, s["slot_t"] - 0.004, s["slot_depth"] - 0.002),
                  (0, y, top_z - s["slot_depth"] / 2 - 0.001), M["dark"], bevel=0.001, seg=1)
        cav.parent = root
        # 槽底触点（沿 X 三个）
        for j in range(3):
            ct = box("GEO_Board_Contact_%02d_%d" % (i, j), (0.024, 0.008, 0.003),
                     (-0.05 + j * 0.05, y, top_z - s["slot_depth"] + 0.004),
                     M["metal"], bevel=0.0004, seg=1)
            ct.parent = root
        # 仓口灯（并排一侧，指示空槽）
        glow = box("SOCKET_GLOW_%02d" % i, (0.030, 0.014, 0.003),
                   (s["slot_w"] / 2 + 0.030, y, top_z + 0.0015), M["accent"], bevel=0.0004, seg=1)
        glow.parent = root`, 'board slots loop');

/* 5) 卡片铭牌：移到卡面上部（45° 俯视露出的一条），并加顶缘状态灯 */
rep(/    # 显著名称铭牌：卡面上部整幅深色凹位（运行时贴服务名 \+ 类型 \+ 路径）\n    label_h = 0\.088 if kind != "FS" else 0\.100\n    label_w = W \* 0\.84\n    label = box\("GEO_Server_LabelSlot", \(label_w, 0\.0016, label_h\),\n                \(0, fy - 0\.0010, H - 0\.070 - \(0\.0 if kind != "FS" else 0\.012\)\),\n                M\["dark"\], bevel=0\.0\)\n    label\.parent = root/,
`    # 显著铭牌：贴在卡面**上部**——面贴面并排时，45° 俯视每张卡露出的正是这条
    label_h = 0.070 if kind != "FS" else 0.078
    label_w = W * 0.86
    label_z = H - 0.052
    label = box("GEO_Server_LabelSlot", (label_w, 0.0016, label_h),
                (0, fy - 0.0010, label_z), M["dark"], bevel=0.0)
    label.parent = root`, 'card label top');

rep(/    tick = box\("GEO_Server_LabelTick", \(0\.006, 0\.0022, label_h \* 0\.92\),\n               \(-label_w \/ 2 \+ 0\.012, fy - 0\.0014, H - 0\.070 - \(0\.0 if kind != "FS" else 0\.012\)\),\n               M\["accent"\], bevel=0\.0\)\n    tick\.parent = root/,
`    tick = box("GEO_Server_LabelTick", (0.006, 0.0022, label_h * 0.92),
               (-label_w / 2 + 0.012, fy - 0.0014, label_z), M["accent"], bevel=0.0)
    tick.parent = root
    # 顶缘状态灯条（并排时从上方也能看到每张卡的状态）
    topstrip = box("GEO_Server_Strip_Top", (W * 0.82, 0.005, 0.004),
                   (0, 0, H - 0.004), M["accent"], bevel=0.0004, seg=1)
    topstrip.parent = root`, 'card top strip');

/* 6) 预览：装配位置改成沿 Y 的槽；侧视改为沿 X 看过去（能看到整叠） */
rep(/    xs = slot_xs\(\)\n    top = SPEC\["board"\]\["leg_h"\] \+ SPEC\["board"\]\["t"\]\n    for \(k, cd\), slot in zip\(cards\.items\(\), \(xs\[1\], xs\[2\], xs\[3\]\)\):\n        cd\.location = \(slot, 0, top - SPEC\["board"\]\["slot_depth"\]\)/,
`    ys = slot_ys()
    top = SPEC["board"]["leg_h"] + SPEC["board"]["t"]
    for (k, cd), slot in zip(cards.items(), (ys[1], ys[2], ys[3])):
        cd.location = (0, slot, top - SPEC["board"]["slot_depth"])`, 'assembly positions');

writeFileSync('console/assets/blender/build_rhine_assets_v7.py', t, 'utf8');
console.log(log.join('\n'));
