# ============================================================================
# 形态 C：单容器（约 50 MB 镜像，无状态，可复制到多台/CI）
#   docker build -f deploy/Dockerfile -t blackbox:8.0 .
#   docker run -d --name blackbox -p 127.0.0.1:8088:8088 \
#     --read-only --tmpfs /var/cache/nginx --tmpfs /var/run \
#     --memory 96m blackbox:8.0
# 前置：先在 mock-platform/ 下跑 node deploy/pack-site.mjs 生成 deploy/dist/site/
# ============================================================================
FROM nginx:1.27-alpine

# 默认站点配置会抢占 :80，删掉；换成只服务静态文件的 :8088
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/blackbox-docker.conf /etc/nginx/conf.d/blackbox.conf

# 只复制站点本体（1.5 MB / 39 文件），不带截图与素材
COPY deploy/dist/site/ /usr/share/nginx/html/

EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8088/version.txt >/dev/null 2>&1 || exit 1

# nginx 官方镜像以 root 启动再降权 worker；如需完全非 root 用 nginxinc/nginx-unprivileged
STOPSIGNAL SIGQUIT
