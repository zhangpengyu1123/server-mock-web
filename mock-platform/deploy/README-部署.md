# 部署架构建议 · BLACKBOX TERMINAL

> 面向：把这个 mock 平台放到 Linux 虚拟机上，并从本地（Windows）访问。
> 结论先行，后面是不选其他方案的理由、访问方式、命令、运维和演进路径。

---

## 0. 一句话结论

**它是一个纯静态站点（1.54 MB / 39 个文件，零依赖、零构建、无数据库、无后端）**，
所以最合适的架构是：

```
Linux VM
├─ nginx            只监听 127.0.0.1:8088（不对外开端口）
│   └─ /srv/blackbox/current → releases/<时间戳>/   ← 软链，升级/回滚都是换链
└─ systemd          nginx 开机自启、挂了自动拉起

本地 Windows
└─ ssh -N -L 8088:127.0.0.1:8088 user@vm  →  浏览器 http://127.0.0.1:8088/
```

**为什么这样最合适**：这个项目的价值是"打开就能点"，不是"跑得有规模"。
静态托管让服务器上没有任何会崩的东西；SSH 隧道让服务器**一个端口都不暴露**，
不用配防火墙、不用签证书、不用做鉴权——安全边界直接落在 SSH 上。

资源量级：**nginx 常驻内存约 6–8 MB，磁盘占 1.6 MB**，1 vCPU / 512 MB 的微型 VM 绰绰有余。

---

## 1. 先看清"要部署的是什么"

| 事实 | 影响 |
| --- | --- |
| 8 个变体 + 共享层，全是 `.html/.css/.js` | 只需要一个静态文件服务器，不需要 Node/PM2/反向代理到应用 |
| 站点本体 **1.54 MB / 39 文件**（打包后 tar.gz **403 KB**） | 传输和部署都是秒级，可以频繁发版 |
| `_verify/` **32.5 MB**（截图、参考图） | **不部署**。它是验证证据，不是站点内容 |
| `UI组件库/` **896 MB / 12383 文件** | **不部署**。它是设计参考素材 |
| 数据在浏览器内存里（`domain.js` 种子 + 定时器） | 无数据库、无迁移、无备份策略；刷新 = 回到种子态 |
| 零外链、零 CDN、零字体下载 | 内网/离线可用；CSP 可以收得很紧 |
| 没有内联脚本（已核 9 个页面） | `script-src 'self'` 不会误伤 |

> 这条最关键：**"轻量部署"的第一收益来自"别把不该传的传上去"**。
> 直接把整个工作区 `rsync` 上去会是 **930 MB**，其中 99.8% 与线上无关。

---

## 2. 三种形态，按"给谁看"选

| 形态 | 适合 | 组件 | 常驻内存 | 暴露面 | 复杂度 |
| --- | --- | --- | --- | --- | --- |
| **A（推荐）** | 只有你自己看 | nginx + systemd | ~7 MB | 仅回环 + SSH | ★ |
| **B** | 给同事/客户看 | nginx + systemd + Basic Auth + 防火墙白名单 | ~7 MB | 内网 | ★★ |
| **C** | 要多台复刻 / 进 CI | Docker（nginx:alpine 单镜像） | ~10 MB | 容器端口映射 | ★★ |

三套配置都在本目录：

```
deploy/
├─ pack-site.mjs                 打包（只收站点，产出 dist/site/ + site.tar.gz + manifest.json）
├─ install.sh                    VM 上执行：装 nginx、铺版本目录、写配置、nginx -t、生效、清理旧版
├─ nginx/blackbox.conf           形态 A（只监听 127.0.0.1:8088）
├─ nginx/blackbox-lan.conf       形态 B（监听 0.0.0.0:8088 + Basic Auth）
├─ nginx/blackbox-docker.conf    形态 C 的容器内配置
├─ Caddyfile                     nginx 的替代（配置更短，有域名时自动 HTTPS）
├─ systemd/blackbox.service      备选：不用 nginx，直接用仓库自带 serve.mjs 常驻
├─ Dockerfile / docker-compose.yml
└─ _verify/simulate-nginx.mjs    本机复刻同样响应头，用于验证策略（见 §8）
```

---

## 3. 五分钟部署（形态 A）

```bash
# ① 本地打包（Windows/macOS/Linux 都行，Node 18+）
cd mock-platform
node deploy/pack-site.mjs
#   → deploy/dist/site/           39 文件 1.54 MB
#   → deploy/dist/site.tar.gz     403 KB

# ② 上传（连同 install.sh 与 nginx 配置一起，保持相对路径）
scp -r deploy/dist/site.tar.gz deploy/install.sh deploy/nginx user@<vm>:/tmp/bb/

# ③ VM 上安装（幂等，可重复跑）
ssh user@<vm>
sudo mkdir -p /tmp/bb && cd /tmp/bb
sudo sh install.sh /tmp/bb/site.tar.gz
#   脚本会：装 nginx（缺则装）→ 铺到 /srv/blackbox/releases/<时间戳>
#          → 原子切 current 软链 → 写 /etc/nginx/conf.d/blackbox.conf
#          → nginx -t 自检（不通过就不 reload）→ systemctl enable --now nginx
#          → 保留最近 3 个版本 → 打印访问方式

# ④ 本地开隧道（Windows PowerShell / Git Bash 都行）
ssh -N -L 8088:127.0.0.1:8088 user@<vm>
#   想后台常驻：ssh -f -N -L 8088:127.0.0.1:8088 user@<vm>

# ⑤ 浏览器打开
http://127.0.0.1:8088/
```

升级 = 重新打包上传再跑一次 `install.sh`；回滚 = `sudo sh install.sh --rollback`。

---

## 4. 从本地访问的几种方式（按场景）

| 场景 | 做法 | 命令 / 要点 |
| --- | --- | --- |
| **只有自己看**（推荐） | SSH 本地端口转发，服务只听 127.0.0.1 | `ssh -N -L 8088:127.0.0.1:8088 user@vm` |
| 想把地址固定下来 | Windows 上写个 `%USERPROFILE%\.ssh\config` 主机别名 + 一条快捷方式 | `Host bb` / `HostName` / `User` / `LocalForward 8088 127.0.0.1:8088` |
| **VM 就跑在你本机**（VMware/VirtualBox/Hyper-V） | 桥接网卡，或 NAT 端口转发 8088 | 宿主机直接开 `http://<vm-ip>:8088/` |
| WSL2 | 服务绑 127.0.0.1 即可被 Windows 访问 | `http://localhost:8088/` |
| 给同事看 | 形态 B：监听 0.0.0.0 + 口令 + 只放行你的网段 | `sudo MODE=lan sh install.sh ...` 然后 `ufw allow from 192.168.1.0/24 to any port 8088` |
| 要给外部/移动端 | **不要**直接开端口。用 Tailscale/WireGuard 组网，或 Cloudflare Tunnel | Tailscale：装完直接 `http://<tailscale-ip>:8088/`，零端口暴露 |
| 有域名 + 要 HTTPS | Caddy 两行自动签证书 | Caddyfile 里把 `:8088` 换成 `blackbox.example.com` |

> 注意：**形态 A 下浏览器访问的是你自己机器的 127.0.0.1**，流量经 SSH 加密到 VM。
> 所以 VM 的防火墙一条都不用开，也不会被端口扫描发现。

---

## 5. 为什么不选这些（负向清单）

| 方案 | 为什么不用 |
| --- | --- |
| `python3 -m http.server` | 单线程阻塞、无 gzip、无缓存头；两个人同时开会卡；只适合"30 秒验证一下能不能跑" |
| 让 `serve.mjs` 常驻生产 | 能跑（配置见 `systemd/blackbox.service`），但要维护 Node 版本；`serve.mjs` 的定位是"本地零依赖启动器" |
| `rsync` 整个工作区 | 930 MB，把截图和素材当站点内容传上去；且 `_verify/` 里有参考图，不该对外 |
| nginx 默认站点 | 会暴露 `/usr/share/nginx/html`、无缓存策略、无安全头；且默认站点还占着 :80 |
| 直接开 0.0.0.0:8088 给公网 | 静态站点没有鉴权体系，一旦公网可写日志/被扫描就是噪音源；要公开就套 Tunnel 或加 TLS + 口令 |
| PM2 / Docker Swarm / K8s | 单进程静态文件服务，上编排系统只增加故障面 |

---

## 6. 资源与规格

| 项 | 数值 | 说明 |
| --- | --- | --- |
| 站点体积 | 1.54 MB（tar.gz 403 KB） | 39 文件 |
| 磁盘占用 | ≈ 1.6 MB × 保留版本数 | 默认保留 3 版，约 5 MB |
| nginx 内存 | 默认 1 个 worker，RSS ≈ 6–8 MB | 也可以 `worker_processes 1` 显式钉住 |
| 容器镜像 | ≈ 50 MB（nginx:1.27-alpine + 站点） | 运行时内存 ≈ 10 MB |
| VM 建议 | **1 vCPU / 512 MB / 5 GB 磁盘** | 甚至 256 MB 也能跑 |
| 并发 | 静态文件 + gzip，几百 QPS 无压力 | 这个场景实际是"几个人偶尔打开" |

---

## 7. 运维清单

| 事项 | 做法 |
| --- | --- |
| 升级 | `pack-site.mjs` → scp → `install.sh`（新 release + 换软链，原子生效） |
| 回滚 | `sudo sh install.sh --rollback`（切回上一版） |
| 健康检查 | `curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/` |
| 缓存策略 | HTML `expires -1`（协商缓存，升级立刻生效）；css/js/png `expires 10m`（文件名无 hash，不能长缓存） |
| 日志 | `/var/log/nginx/access.log`、`error.log`；静态资源已 `access_log off` |
| 中文乱码 | 配置里已有 `charset utf-8`；文件本身是 UTF-8 无 BOM |
| 常见故障 | ① 403：检查 `/srv/blackbox` 是否 `o+rx`（nginx worker 要能读）② SELinux 上软链读不到：`chcon -R -t httpd_sys_content_t /srv/blackbox` 或 `setsebool -P httpd_can_network_connect 1` ③ 端口占用：`ss -lntp \| grep 8088` ④ 软链指错：`readlink -f /srv/blackbox/current` |

---

## 8. 已经验证了什么 / 没验证什么

本机是 Windows，且 Docker daemon 与 WSL 都没启动，**没有真实 nginx 可跑**。所以我用
`deploy/_verify/simulate-nginx.mjs` **等价复刻了配置里的响应行为**（目录索引、expires、
gzip、安全头 + CSP、隐藏文件 403、404 回首页），再用真浏览器跑了一遍：

| 验证项 | 结果 |
| --- | --- |
| 9 个页面（首页 + 8 变体）CSP 违规 | **0**（`securitypolicyviolation` 全程为空） |
| 9 个页面运行时错误 | **0**，页面均正常渲染（每变体 6 屏，V8 10 个页签） |
| 响应头 | CSP / nosniff / Referrer-Policy / X-Frame-Options / `Cache-Control: no-cache` / `Content-Encoding: gzip` 全部到位 |
| 目录式 URL | `/v8-blackbox-terminal/` → 该目录 `index.html`，200 |
| 隐藏文件 | `/.git/config` → **403**；`/../etc/passwd` → 404（穿越被拦住） |
| 最容易被 CSP 挡的功能 | 系统设置里的**导出审计 JSON**（blob 下载）在 CSP 下成功下载，0 违规 |
| 部署包 | 39 文件 / 1.54 MB / tar.gz 403 KB，清单含每个文件 sha256 前 16 位 |

**没验证（必须在你的 VM 上做）**：
- `nginx -t` 语法检查（`install.sh` 里内置，不通过不会 reload，不会把线上搞挂）
- systemd 开机自启与 `Restart=on-failure`
- 真实 VM 的 SELinux/AppArmor、防火墙行为
- 容器镜像构建（本机 Docker 未启动）

### 安装脚本的逻辑演练（在 Windows/MSYS 沙箱里真跑了）

`deploy/_verify/test-install.sh` 用 stub 的 `nginx`/`systemctl`/`curl`，把 `ROOT` 与 `CONF_DIR`
指到临时目录，完整跑一遍安装脚本（`bash -n` 语法检查也通过，238 行）：

| 场景 | 断言 | 结果 |
| --- | --- | --- |
| 1 首次安装 | 退出码 0、release 目录、站点落盘 40 文件、version.txt、current 可用、配置监听 `127.0.0.1:8088`、执行了 `nginx -t`、reload/start | 全过 |
| 2 再装一次 | 退出码 0、release 数 2、current 仍可用（幂等） | 全过 |
| 3 回滚 | 退出码 0、输出「已回滚」、回滚后 current 可用 | 全过 |
| 4 只剩 1 版时回滚 | **应被拒绝**（非 0）且提示「没有可回滚的上一版」 | 全过 |
| 5 源不合法 | **应失败**（非 0）且提示「没有 index.html」 | 全过 |

演练顺手抓出并修掉两个**在真机上也会咬人**的问题：

1. **配置目录不可写时，脚本在「切完站点软链之后」才失败** → 会留下"站点已换、nginx 没配上"的半成品。
   改为**先校验配置目录可写**再铺站点（并新增 `CONF_DIR` 可覆盖）。
2. **`mv -f 新软链 → current` 在 `current` 是真实目录时会失败**（`Directory not empty`：
   mv 把新链搬进了目录里）。这在 Linux 上正常是软链不会触发，但只要有一次 `ln -s` 失败、
   或磁盘/文件系统不支持软链就会中招。抽成 `switch_to()`：软链不支持时退化为复制，目标是目录时先删再换，
   正常情况仍是 `mv -f` 原子覆盖（回滚复用同一函数）。

> 另外修了打包脚本：`version.txt` 原先在算完清单后才写，导致清单 39 条、实际 40 个文件；改成先写版本戳再算清单，现在两者一致。


---

## 9. 演进路径：如果目标是"真的能 mock 网元接口"

现在的站点是**控制台**，数据在浏览器里模拟。要让它真的对被测系统提供能力，需要拆成两个进程：

```
                    ┌──────────────────────────────┐
  浏览器 ───────────▶│ nginx  :8088                 │
   (控制台)          │  /        → 静态站点          │
                    │  /api/    → 反代 ──┐          │
                    └────────────────────┼──────────┘
                                         ▼
                    ┌──────────────────────────────┐
   被测系统 ───────▶│ mock 引擎 :8443（真证书）     │
   (NE/网元 API)     │  路由 + 延迟 + 故障注入 + 审计 │
                    └──────────────────────────────┘
```

要点：
1. **控制台与引擎分开**：静态站点不需要重启，引擎可以独立升级/重启。
2. **同源反代**：nginx 把 `/api/` 转给引擎，前端不用处理 CORS，Cookie/鉴权也简单。
3. **端口与证书属于"被测对象"**：:8443 + 自签 CA 是这个产品要模拟的东西，不能被反代顶替。
4. 引擎选型：Node（`node:http` 或 Fastify，和前端同栈、几十行能起）/ Go（单二进制、部署最省心）。
   这个场景我倾向 **Go 单文件**：一个二进制 + systemd，没有 node_modules，容器 10 MB 级。

**建议节奏**：先用形态 A 把静态站点跑起来验证体验（今天就能做完），
等你确认"控制台 → 引擎"的交互契约（哪些动作要真的发请求），再动第二进程。

---

## 10. 需要你确认的三件事

1. **VM 在哪里**：本机虚拟化（VMware/Hyper-V/VirtualBox）、内网服务器、还是云主机？
   —— 决定用"桥接/NAT 端口转发"还是"SSH 隧道"。
2. **能不能 SSH 上去**：有 sudo 权限吗？—— `install.sh` 需要 root 装 nginx。
3. **给谁看**：只有你自己 → 形态 A 收工；要给同事 → 形态 B 加口令与网段白名单；要公网 → 我建议 Tailscale/Cloudflare Tunnel，不开端口。

告诉我这三条，我可以把命令按你的实际网络填好（VM IP、网段、域名），
或者直接把 `install.sh` 改成你机器上能一条命令跑完的版本。
