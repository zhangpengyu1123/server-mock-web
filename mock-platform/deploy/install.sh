#!/bin/sh
# =============================================================================
# BLACKBOX TERMINAL · Linux 一键安装（幂等，可重复执行）
#
#   用法（在 VM 上，需 root）：
#     sudo sh install.sh /tmp/site.tar.gz          # 从打包上传的 tar.gz 安装
#     sudo sh install.sh                           # 用脚本同级的 dist/site/
#     sudo MODE=lan sh install.sh /tmp/site.tar.gz # 监听内网 + Basic Auth
#     sudo PORT=9000 sh install.sh ...             # 换端口
#     sudo sh install.sh --rollback                # 回滚到上一个 release
#
#   设计要点：
#     · 版本化目录 /srv/blackbox/releases/<时间戳> + current 软链 → 升级/回滚都是换链
#     · 写配置前先备份，nginx -t 不通过就不 reload（不会把线上搞挂）
#     · 只保留最近 KEEP 个 release（默认 3）
# =============================================================================
set -eu

PORT="${PORT:-8088}"
MODE="${MODE:-loopback}"        # loopback（只听 127.0.0.1）| lan（听 0.0.0.0 + 口令）
ROOT="${ROOT:-/srv/blackbox}"
KEEP="${KEEP:-3}"
BASIC_USER="${BASIC_USER:-viewer}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MODE_ARG="${1:-}"

say()  { printf '%s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "需要 root：sudo sh install.sh ..."
command -v nginx >/dev/null 2>&1 || INSTALL_NGINX=1

# 切换 current 指向某个 release。
#   目标是软链/文件时 mv -f 是原子覆盖；
#   目标若是"真实目录"（历史遗留、或文件系统不支持软链），必须先删再换 ——
#   否则 mv 会把新链搬进目录里（真实踩过：Directory not empty）。
switch_to() {
  _target=$1
  rm -rf "$ROOT/current.tmp"
  if ln -s "$_target" "$ROOT/current.tmp" 2>/dev/null; then
    :
  else
    warn "该文件系统不支持软链，退化为整目录复制"
    cp -a "$_target" "$ROOT/current.tmp"
  fi
  if [ -d "$ROOT/current" ] && [ ! -L "$ROOT/current" ]; then
    rm -rf "$ROOT/current"
    mv "$ROOT/current.tmp" "$ROOT/current"
  else
    mv -f "$ROOT/current.tmp" "$ROOT/current"
  fi
}

# ----------------------------------------------------------------- 0. 回滚
if [ "$MODE_ARG" = "--rollback" ]; then
  CUR=$(readlink -f "$ROOT/current" 2>/dev/null || true)
  PREV=$(ls -1dt "$ROOT"/releases/*/ 2>/dev/null | sed -n '2p' | sed 's:/*$::')
  [ -n "${PREV:-}" ] || die "没有可回滚的上一版"
  [ "$PREV" != "$CUR" ] || PREV=$(ls -1dt "$ROOT"/releases/*/ | sed -n '2p' | sed 's:/*$::')
  switch_to "$PREV"
  nginx -t >/dev/null 2>&1 && { systemctl reload nginx 2>/dev/null || nginx -s reload; } || true
  say "已回滚：current → $PREV"
  exit 0
fi

# ------------------------------------------------------------ 1. 装 nginx
if [ "${INSTALL_NGINX:-0}" = "1" ]; then
  say "=== 安装 nginx ==="
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q nginx
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache nginx
  else
    die "认不出包管理器，请先手动安装 nginx"
  fi
fi
command -v nginx >/dev/null 2>&1 || die "nginx 仍不可用"

# ------------------------------------------------- 2a. 先确认配置目录可写
# 放在铺站点之前：否则会出现"站点已切换、nginx 没配上"的半成品状态
if [ -n "${CONF_DIR:-}" ]; then
  mkdir -p "$CONF_DIR" || die "无法创建 CONF_DIR：$CONF_DIR"
  CONF="$CONF_DIR/blackbox.conf"
else
  CONF=""
  for d in /etc/nginx/conf.d /etc/nginx/sites-enabled /etc/nginx/http.d; do
    if [ -d "$d" ]; then CONF="$d/blackbox.conf"; break; fi
  done
  [ -n "$CONF" ] || die "找不到 nginx 配置目录（试过 conf.d / sites-enabled / http.d）；可用 CONF_DIR 指定"
  [ -w "$(dirname "$CONF")" ] || die "配置目录不可写：$(dirname "$CONF")（需要 root）"
fi
[ -f "$CONF" ] && cp -a "$CONF" "$CONF.bak.$(date +%s)" && say "=== 已备份旧配置 ==="

# ---------------------------------------------------- 2b. 取源并铺成 release
TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

if [ -n "$MODE_ARG" ] && [ "$MODE_ARG" != "--rollback" ]; then
  SRC="$MODE_ARG"
else
  SRC=""
fi

if [ -n "$SRC" ]; then
  [ -e "$SRC" ] || die "源不存在：$SRC"
  TMP=$(mktemp -d)
  case "$SRC" in
    *.tar.gz|*.tgz)
      tar -xzf "$SRC" -C "$TMP"
      if [ -d "$TMP/site" ]; then SRCROOT="$TMP/site"; else SRCROOT="$TMP"; fi
      ;;
    *)
      cp -a "$SRC/." "$TMP/"
      SRCROOT="$TMP"
      ;;
  esac
else
  SRCROOT="$SCRIPT_DIR/dist/site"
fi
[ -f "$SRCROOT/index.html" ] || die "源里没有 index.html：$SRCROOT（先在本地跑 node deploy/pack-site.mjs）"

mkdir -p "$ROOT/releases"
REL="$ROOT/releases/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$REL"
cp -a "$SRCROOT/." "$REL/"

# current 软链：先建临时名再 mv，替换是原子的（nginx 不会看到半新半旧）
switch_to "$REL"
say "=== 已铺开 $(du -sh "$REL" | cut -f1) 到 $REL ==="

# --------------------------------------------------------------- 3. 写配置

if [ "$MODE" = "lan" ]; then
  LISTEN="    listen      $PORT;"
  AUTH=""
else
  LISTEN="    listen      127.0.0.1:$PORT;"
  AUTH=""
fi

# 优先用脚本旁的真实配置（避免两处漂移）；没有就内联生成
if [ -f "$SCRIPT_DIR/nginx/blackbox.conf" ] && [ "$MODE" != "lan" ]; then
  sed "s|127.0.0.1:8088|127.0.0.1:$PORT|; s|/srv/blackbox/current|$ROOT/current|g" \
    "$SCRIPT_DIR/nginx/blackbox.conf" > "$CONF"
elif [ -f "$SCRIPT_DIR/nginx/blackbox-lan.conf" ] && [ "$MODE" = "lan" ]; then
  sed "s|listen      8088;|listen      $PORT;|; s|/srv/blackbox/current|$ROOT/current|g" \
    "$SCRIPT_DIR/nginx/blackbox-lan.conf" > "$CONF"
else
  cat > "$CONF" <<NGINX
server {
    server_name _;
$LISTEN
    root  $ROOT/current;
    index index.html;
    charset utf-8;
    server_tokens off;
    client_max_body_size 1m;

    location / {
        try_files \$uri \$uri/ =404;
        expires -1;
    }
    location ~* \.(?:css|js|mjs|svg|png|jpe?g|webp|ico|woff2?|txt)\$ {
        expires 10m;
        access_log off;
        try_files \$uri =404;
    }
    location ~ /\.(?!well-known) { deny all; }

    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript text/javascript application/json image/svg+xml;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" always;

    error_page 404 /index.html;
}
NGINX
fi

# ----------------------------------------------------------------- 4. 口令
if [ "$MODE" = "lan" ]; then
  if [ ! -f /etc/nginx/.htpasswd ]; then
    PASS=$(head -c 12 /dev/urandom | base64 | tr -d '/+=' | cut -c1-12)
    if command -v htpasswd >/dev/null 2>&1; then
      htpasswd -bc /etc/nginx/.htpasswd "$BASIC_USER" "$PASS" 2>/dev/null
    else
      HASH=$(openssl passwd -apr1 "$PASS" 2>/dev/null || die "需要 htpasswd 或 openssl 来生成口令")
      printf '%s:%s\n' "$BASIC_USER" "$HASH" > /etc/nginx/.htpasswd
    fi
    chmod 640 /etc/nginx/.htpasswd
    say ""
    say "  ⚠ 已生成访问口令（只显示这一次）："
    say "     用户名 $BASIC_USER   密码 $PASS"
  else
    say "  已有 /etc/nginx/.htpasswd，沿用（改口令：htpasswd -B /etc/nginx/.htpasswd $BASIC_USER）"
  fi
fi

# --------------------------------------------------------- 5. 自检 + 生效
if nginx -t 2>/dev/null; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl is-active --quiet nginx && systemctl reload nginx || systemctl start nginx
  elif command -v rc-service >/dev/null 2>&1; then
    rc-update add nginx default >/dev/null 2>&1 || true
    rc-service nginx restart
  else
    nginx -s reload 2>/dev/null || nginx
  fi
else
  warn "nginx -t 未通过，配置没生效（旧配置仍在跑）。输出："
  nginx -t || true
  die "请修正 $CONF 后重试"
fi

# ------------------------------------------------------------- 6. 清理旧版
COUNT=$(ls -1d "$ROOT"/releases/*/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1dt "$ROOT"/releases/*/ | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -rf "$old"
  done
fi

# ------------------------------------------------------------- 7. 打印结论
HEALTH=$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || echo "000")
say ""
say "======================================================"
say " 已安装  $ROOT/current  →  $REL"
say " 监听    $([ "$MODE" = lan ] && echo "0.0.0.0:$PORT（内网 + 口令）" || echo "127.0.0.1:$PORT（仅回环）")"
say " 自检    http://127.0.0.1:$PORT/  →  HTTP $HEALTH"
say " 版本    $(cat "$ROOT/current/version.txt" 2>/dev/null | head -1)"
say "======================================================"
if [ "$MODE" != "lan" ]; then
  say ""
  say " 在你自己的电脑上开隧道，然后访问 http://127.0.0.1:$PORT/"
  say "   ssh -N -L $PORT:127.0.0.1:$PORT $(id -un)@<这台机器的IP>"
else
  say ""
  say " 同事访问  http://<这台机器的IP>:$PORT/"
  say " 记得开防火墙且只放行你的网段："
  say "   ufw allow from 192.168.1.0/24 to any port $PORT proto tcp"
fi
say ""
say " 升级   重新上传 tar.gz 再跑一遍本脚本"
say " 回滚   sudo sh $0 --rollback"
