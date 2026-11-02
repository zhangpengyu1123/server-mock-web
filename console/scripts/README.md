# console/scripts

开发/交付期工具脚本（一次性补丁脚本已归档到 `console/assets/_patches/`）。

| 脚本 | 用途 |
|---|---|
| `verify-all.mjs` | **全量回归**：按目标清单逐条断言业务面能力（37 项），末行输出 `37/37 通过` |
| `make-dist.mjs` | 打包便携发行版到 `dist/rhine-mock-console-<ver>/`（含 exe、ui、data、docs、启动/停止脚本） |
| `make-scenes.mjs` | 由当前导出的场景派生三套教学场景到 `console/ui/business/scenes/` |
| `seed-audit.mjs` | 造审计数据（多规则 + 不同延迟/状态码），用于截图与演示 |
| `test-variants.mjs` | 多规则匹配的接口自测（断言 201/500/200 与延迟） |
| `check-desktop.mjs` | 通过 WebView2 远程调试端口（9222）读取桌面壳里业务面的实际渲染状态（标题/当前视图/配色 token/导航与卡片数） |
| `check-titlebar.mjs` | 校验桌面壳自绘标题栏：`is-tauri`、拖动区、3 个窗口按钮、`invoke` 可用性、minimize 实测 |
| `shot-desktop.mjs` | 通过 CDP 截取桌面壳画面（无交互桌面时的取证手段） |
| `click-close.mjs` | 模拟点击自绘标题栏的「×」，验证窗口真的关闭 |
| seed-demo-rules.mjs | 给 `/nemp/v1/ne/register` 配 4 条规则 + 3 个字段行为，并造审计流量 |
| clean-scene.mjs | 导出→过滤（时间戳映射 / 任务 / 命中）→导入，用于演示前重置 |
| etch-three-addons.mjs | 拉取 three.js 与 addons 到 `console/ui/vendor/`（离线环境一次性） |

用法（在仓库根目录执行）：

```powershell
node console/scripts/make-dist.mjs
node console/scripts/seed-audit.mjs
node console/scripts/test-variants.mjs
node console/scripts/seed-demo-rules.mjs
node console/scripts/clean-scene.mjs

# 桌面壳取证（需先 set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222）
node console/scripts/check-desktop.mjs
```
