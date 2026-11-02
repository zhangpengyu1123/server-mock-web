# console/scripts

开发/交付期工具脚本（一次性补丁脚本已归档到 `console/assets/_patches/`）。

| 脚本 | 用途 |
|---|---|
| `make-dist.mjs` | 打包便携发行版到 `dist/rhine-mock-console-<ver>/`（含 exe、ui、data、docs、启动/停止脚本） |
| `make-scenes.mjs` | 由当前导出的场景派生三套教学场景到 `console/ui/business/scenes/` |
| `seed-audit.mjs` | 造审计数据（多规则 + 不同延迟/状态码），用于截图与演示 |
| `test-variants.mjs` | 多规则匹配的接口自测（断言 201/500/200 与延迟） |
| `fetch-three-addons.mjs` | 拉取 three.js 与 addons 到 `console/ui/vendor/`（离线环境一次性） |

用法（在仓库根目录执行）：

```powershell
node console/scripts/make-dist.mjs
node console/scripts/seed-audit.mjs
node console/scripts/test-variants.mjs
```
