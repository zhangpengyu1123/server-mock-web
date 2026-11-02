// W 端 · 业务面（免登录）
//
// 它只连本机的 mock 引擎（默认 127.0.0.1:9601，以 RHINE_AUTH=off 运行的 agent 或内嵌引擎）。
// 不含任何管理面代码：管理面是另一个独立应用（../admin）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn api_base() -> String {
    std::env::var("RHINE_LOCAL_API").unwrap_or_else(|_| "http://127.0.0.1:9601".to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let script = format!(
                    "window.__RHINE__ = {{ apiBase: {:?}, shell: 'tauri-business', auth: 'none' }};",
                    api_base()
                );
                let _ = win.eval(&script);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("业务面启动失败");
}
