# W 端 · 两个独立桌面应用

> 关键区分：**业务面与管理面不是同一个应用的两个页签，而是两个可独立安装的桌面程序。**
> 管理面是"独立平台"，它里面没有任何业务面视图；业务面里也没有任何管理面入口。

```
desktop/
├─ business/    Rhine Business      W 端业务面（本机，免登录）
└─ admin/       Rhine Fleet Control W 端管理面（独立平台，登录后管 L 端）
```

| | 业务面 `business/` | 管理面 `admin/` |
| --- | --- | --- |
| 登录 | **不需要**（本机自用） | **需要**（管理员，登录到目标 L 端节点） |
| 连什么 | 本机 mock 引擎 `127.0.0.1:9601` | 远端 L 端 agent（登录页填地址） |
| 界面 | `ui/business/` | `ui/admin/` |
| CSP | 只允许回环 | 允许任意 http/https 目标 |
| 与对方的交集 | 无 | 管理对象**恰好**也在跑业务面 |

## 为什么两个 crate

两者依赖不同、发布节奏不同、权限面也不同：
- 管理面要连任意远端节点，业务面**只允许本机**——把两个 CSP 分开写，等于把最小权限落在配置层；
- 运维机上可能只装管理面，测试机上只装业务面；
- 打包体积与图标、签名、更新通道都可以分开管。

## 构建

```bash
cargo install tauri-cli --version "^2"      # 只需一次

cd console/desktop/business && cargo tauri dev     # 业务面（先起本地引擎）
cd console/desktop/admin    && cargo tauri dev     # 管理面（登录页填 L 端地址）
```

`cargo tauri build` 出 msi/nsis。`bundle.icon` 现在留空是为了先跑通 `cargo check`，
出包前用 `cargo tauri icon <png>` 生成 `icons/` 并填回配置。

## 业务面的本地引擎

两种接法，按需要选：

**A. 外置 agent（当前默认，最简单）**
```bash
# 先起一个免登录的本地引擎
RHINE_AUTH=off RHINE_PORT=9601 RHINE_UI=ui RHINE_DATA=data/local.json \
  cargo run -p rhine-agent
```
Tauri 窗口通过 `window.__RHINE__.apiBase = http://127.0.0.1:9601` 连它。

**B. 内嵌 sidecar（发布形态）**
把 `rhine-agent.exe` 作为 Tauri sidecar 一起打包，在 `setup` 里以
`RHINE_AUTH=off` 拉起，退出时收掉。需要：
```toml
# business/Cargo.toml
[build-dependencies]
tauri-build = { version = "2", features = [] }
[dependencies]
tauri-plugin-shell = "2"
```
并在 `tauri.conf.json` 的 `bundle.externalBin` 里登记二进制。
这条路要改 `build.rs` 之外的打包脚本，属于发布链路，等界面定了再做。

## 管理面的登录语义

管理面登录的是**目标节点**，不是本地账号：
1. 填目标地址（如 `http://10.0.0.21:9600`）；
2. 用该节点上的**管理员**账号登录 → 拿到该节点的 HttpOnly 会话；
3. 若账号是业务用户（operator），登录会被前端拦下并提示"该账号不是管理员"，
   后端 `/api/admin/*` 也会 403 —— 双保险。

地址存在 `localStorage.rhine.admin.base`，下次打开自动填回。
