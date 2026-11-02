// 打包便携发行版：dist/rhine-mock-console-<version>/
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONSOLE = join(ROOT, 'console');
const VERSION = '1.0.0';
const OUT = join(ROOT, 'dist');
const NAME = `rhine-mock-console-${VERSION}`;
const PKG = join(OUT, NAME);

const agentExe = join(CONSOLE, 'target', 'debug', 'rhine-agent.exe');
const deskExe = join(CONSOLE, 'desktop', 'business', 'target', 'debug', 'rhine-desktop-business.exe');
for (const f of [agentExe, deskExe]) {
  if (!existsSync(f)) { console.error('缺少产物: ' + f); process.exit(1); }
}

rmSync(PKG, { recursive: true, force: true });
mkdirSync(PKG, { recursive: true });
mkdirSync(join(PKG, 'data'), { recursive: true });

/* 可执行文件 */
copyFileSync(agentExe, join(PKG, 'rhine-agent.exe'));
copyFileSync(deskExe, join(PKG, 'Rhine 业务面.exe'));

/* 静态 UI（浏览器模式用） */
cpSync(join(CONSOLE, 'ui'), join(PKG, 'ui'), { recursive: true });

/* 数据种子 */
for (const f of ['agent.json', 'local.json']) {
  const src = join(CONSOLE, 'data', f);
  if (existsSync(src)) copyFileSync(src, join(PKG, 'data', f));
}
/* 文档与场景 */
cpSync(join(CONSOLE, 'docs'), join(PKG, 'docs'), { recursive: true });

/* 启动脚本 */
writeFileSync(join(PKG, '启动.cmd'), Buffer.from(`@echo off
setlocal
cd /d "%~dp0"
echo [1/2] 启动后端（9600 需登录 / 9601 免登录）...
set RHINE_UI=ui
set RHINE_DATA=data/agent.json
set RHINE_PORT=9600
set RHINE_AUTH=on
start "" /B rhine-agent.exe
timeout /t 1 /nobreak >nul
set RHINE_DATA=data/local.json
set RHINE_PORT=9601
set RHINE_AUTH=off
start "" /B rhine-agent.exe
timeout /t 2 /nobreak >nul
echo [2/2] 打开桌面业务面...
start "" "Rhine 业务面.exe"
echo.
echo   浏览器入口  http://127.0.0.1:9600/business/plane.html   admin / rhine-admin-2026
echo   免登录入口  http://127.0.0.1:9601/business/plane.html
echo   停止服务    taskkill /F /IM rhine-agent.exe
echo.
endlocal
`, 'utf8'));

writeFileSync(join(PKG, '停止.cmd'), Buffer.from(`@echo off
taskkill /F /IM rhine-agent.exe >nul 2>&1
taskkill /F /IM "Rhine 业务面.exe" >nul 2>&1
echo 已停止。
pause
`, 'utf8'));

writeFileSync(join(PKG, 'README.txt'), Buffer.from(`RHINE LAB · MOCK 控制台（便携版 ${VERSION}）

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
`, 'utf8'));

/* 统计 */
function dirSize(p) {
  let total = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const fp = join(p, e.name);
    total += e.isDirectory() ? dirSize(fp) : statSync(fp).size;
  }
  return total;
}
const size = dirSize(PKG);
console.log(`OK  ${PKG}`);
console.log(`    体积 ${(size / 1024 / 1024).toFixed(1)} MB`);
for (const e of readdirSync(PKG, { withFileTypes: true })) {
  const fp = join(PKG, e.name);
  console.log(`    ${e.isDirectory() ? '[dir] ' : '      '}${e.name}${e.isDirectory() ? '  ' + (dirSize(fp) / 1024 / 1024).toFixed(1) + ' MB' : '  ' + (statSync(fp).size / 1024).toFixed(0) + ' KB'}`);
}
