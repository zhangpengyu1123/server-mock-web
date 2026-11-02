// W 端 · 管理面（独立平台）
//
// 与业务面是两个可独立安装的桌面应用：
//   · 它不提供任何业务面视图
//   · 它登录的是"目标 L 端节点"（地址在登录页填），拿到管理员会话后下发部署
//   · 因此它的 CSP 允许任意 http/https 目标；业务面只允许本机回环
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("window.__RHINE__ = { shell: 'tauri-admin', auth: 'login', apiBase: '' };");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("管理面启动失败");
}
