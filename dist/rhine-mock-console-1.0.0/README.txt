RHINE LAB · MOCK 控制台（便携版 1.0.0）

一、启动
  双击「启动.cmd」
  - 自动拉起两个后端实例：9600（需登录）/ 9601（免登录）
  - 自动打开桌面业务面（Rhine 业务面.exe）
  - 想用浏览器：http://127.0.0.1:9600/business/plane.html   账号 admin / rhine-admin-2026

二、停止
  双击「停止.cmd」，或任务管理器结束 rhine-agent.exe

三、内容
  rhine-agent.exe        后端（Rust / axum）：业务面 API + mock 引擎
  Rhine 业务面.exe       桌面应用（Tauri 2 + WebView2），已内嵌整套 UI
  ui/                    静态前端（浏览器模式使用）
  data/                  数据文件（agent.json / local.json，可备份替换）
  docs/                  演示手册 + 逐幕脚本 + 16 张截图

四、场景
  页面内「MOCK 管理 → 场景快照」可一键载入：基线 / 双站点共部署 / 故障演练，
  也可导出为 JSON 带到别的机器导入复现。

五、常见问题
  1) 端口被占用：先「停止.cmd」，再启动
  2) 桌面窗口白屏：确认 9601 已在监听（启动.cmd 会等待 2 秒）
  3) 需要重置数据：删除 data 下对应 json 后重启（会重新生成种子数据）
