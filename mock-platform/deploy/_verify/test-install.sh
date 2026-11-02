#!/usr/bin/env bash
# 在 Windows/MSYS 沙箱里演练 install.sh 的流程（stub 掉 nginx/systemctl/curl，不需要 root）
#   bash deploy/_verify/test-install.sh
set -u
cd "$(dirname "$0")/../.." || exit 1        # → mock-platform/
MP=$(pwd)
TMP=$(mktemp -d)
ROOT="$TMP/srv"
BIN="$TMP/bin"
mkdir -p "$BIN" "$ROOT"

# --- 桩：nginx / systemctl / curl（记录被调用，返回成功）---
cat > "$BIN/nginx" <<'EOF'
#!/bin/sh
echo "stub-nginx $*" >> "$STUB_LOG"
case "$*" in *-t*) exit 0;; esac
exit 0
EOF
cat > "$BIN/systemctl" <<'EOF'
#!/bin/sh
echo "stub-systemctl $*" >> "$STUB_LOG"
exit 0
EOF
cat > "$BIN/curl" <<'EOF'
#!/bin/sh
echo -n 200
EOF
cat > "$BIN/readlink" <<'EOF'
#!/usr/bin/env bash
exec /usr/bin/readlink "$@" 2>/dev/null || echo ""
EOF
chmod +x "$BIN"/* 2>/dev/null
export STUB_LOG="$TMP/calls.log"
: > "$STUB_LOG"
export PATH="$BIN:$PATH"

# --- 测试副本：把 root 检查换成可跳过（真实脚本在 VM 上才需要 root）---
sed 's/^\[ "\$(id -u)" = "0" \].*/: # root check skipped in sandbox/' \
  deploy/install.sh > "$TMP/install-test.sh"

fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1"; else echo "  ✗ $1（期望 $3，实际 $2）"; fail=$((fail+1)); fi; }
ok()  { if [ "$2" = "yes" ]; then echo "  ✓ $1"; else echo "  ✗ $1"; fail=$((fail+1)); fi; }

echo "=== 场景 1：从目录安装 ==="
ROOT="$ROOT" CONF_DIR="$TMP/conf" sh "$TMP/install-test.sh" deploy/dist/site > "$TMP/run1.log" 2>&1
chk "退出码" "$?" "0"

REL1=$(ls -1d "$ROOT"/releases/*/ 2>/dev/null | head -1)
[ -n "$REL1" ] && ok "创建 release 目录" yes || ok "创建 release 目录" no
[ -f "$REL1/index.html" ] && ok "站点铺开（index.html）" yes || ok "站点铺开（index.html）" no
chk "文件数" "$(find "$REL1" -type f | wc -l | tr -d ' ')" "40"
[ -f "$REL1/version.txt" ] && ok "version.txt" yes || ok "version.txt" no
[ -f "$ROOT/current/index.html" ] && ok "current 可用（软链或副本）" yes || ok "current 可用（软链或副本）" no
CONF=$(find /etc/nginx "$TMP" -name 'blackbox.conf' 2>/dev/null | head -1)
if grep -q 'listen      127.0.0.1:8088' "$CONF" 2>/dev/null; then ok "写出的配置监听回环:8088" yes
elif grep -q 'listen      127.0.0.1:8088' /tmp/bb-conf 2>/dev/null; then ok "写出的配置监听回环:8088" yes
else echo "  ! 配置写到 /etc/nginx（沙箱无权限），改为检查模板"; grep -q 'listen      127.0.0.1:8088' deploy/nginx/blackbox.conf && ok "模板配置监听回环:8088" yes || ok "模板配置监听回环:8088" no; fi
grep -q 'stub-nginx -t' "$STUB_LOG" && ok "install.sh 执行了 nginx -t 自检" yes || ok "install.sh 执行了 nginx -t 自检" no
grep -q 'stub-systemctl reload nginx\|stub-systemctl start nginx' "$STUB_LOG" && ok "reload/start nginx" yes || ok "reload/start nginx" no

echo ""
echo "=== 场景 2：再装一次（幂等 + 新 release）==="
sleep 1
ROOT="$ROOT" CONF_DIR="$TMP/conf" sh "$TMP/install-test.sh" deploy/dist/site > "$TMP/run2.log" 2>&1; RC2=$?; chk "第二次安装退出码" "$RC2" "0"
NREL=$(ls -1d "$ROOT"/releases/*/ 2>/dev/null | wc -l | tr -d ' ')
chk "release 数量（应为 2）" "$NREL" "2"
[ -f "$ROOT/current/index.html" ] && ok "current 仍可用" yes || ok "current 仍可用" no

echo ""
echo "=== 场景 3：回滚（此时有 2 个版本）==="
CUR_BEFORE=$(basename "$(readlink -f "$ROOT/current" 2>/dev/null || echo "$ROOT/current")")
ROOT="$ROOT" CONF_DIR="$TMP/conf" sh "$TMP/install-test.sh" --rollback > "$TMP/run3.log" 2>&1
RC3=$?
chk "回滚退出码" "$RC3" "0"
grep -q '已回滚' "$TMP/run3.log" && ok "回滚输出提示" yes || ok "回滚输出提示" no
[ -f "$ROOT/current/index.html" ] && ok "回滚后 current 可用" yes || ok "回滚后 current 可用" no

echo ""
echo "=== 场景 4：只剩 1 个版本时回滚应被拒绝 ==="
ROOT="$ROOT" CONF_DIR="$TMP/conf" KEEP=1 sh "$TMP/install-test.sh" deploy/dist/site > "$TMP/run4.log" 2>&1
chk "KEEP=1 后 release 数" "$(ls -1d "$ROOT"/releases/*/ 2>/dev/null | wc -l | tr -d ' ')" "1"
ROOT="$ROOT" CONF_DIR="$TMP/conf" sh "$TMP/install-test.sh" --rollback > "$TMP/run4b.log" 2>&1
RC4=$?
chk "无可回滚时退出码应非 0" "$([ "$RC4" != "0" ] && echo fail || echo pass)" "fail"
grep -q '没有可回滚' "$TMP/run4b.log" && ok "给出明确提示" yes || ok "给出明确提示" no

echo ""
echo "=== 场景 5：源不合法时拒绝安装（不能静默成功）==="
mkdir -p "$TMP/empty"
ROOT="$ROOT" CONF_DIR="$TMP/conf" sh "$TMP/install-test.sh" "$TMP/empty" > "$TMP/run5.log" 2>&1
RC5=$?
chk "缺 index.html 应失败（非 0）" "$([ "$RC5" != "0" ] && echo fail || echo pass)" "fail"
grep -q '没有 index.html' "$TMP/run5.log" && ok "给出明确报错" yes || ok "给出明确报错" no

echo ""
echo "--- 调用记录 ---"
sed 's/^/  /' "$STUB_LOG" | head -12
echo "--- 安装输出（首次）---"
sed 's/^/  /' "$TMP/run1.log" | head -22

rm -rf "$TMP"
echo ""
if [ "$fail" = "0" ]; then echo "全部通过"; else echo "失败 $fail 项"; fi
exit "$fail"
