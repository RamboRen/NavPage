#!/usr/bin/env bash
# ------------------------------------------------------------------
# NavPage Docker 运行脚本（Linux / macOS / WSL / Git Bash）
#   ./docker-run.sh            构建并后台启动，默认端口 8787
#   PORT=8080 ./docker-run.sh  换宿主机端口
#   ./docker-run.sh stop       停止并移除容器（数据卷保留）
#   ./docker-run.sh logs       跟踪日志
# 数据卷：navpage-data → 容器内 /app/data
# ------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

IMAGE="navpage:latest"
NAME="navpage"
VOLUME="navpage-data"
PORT="${PORT:-8787}"
ACTION="${1:-start}"

case "$ACTION" in
  start | up)
    echo "==> 构建镜像 ${IMAGE}（首次约需 1-3 分钟）"
    docker build -t "$IMAGE" .

    echo "==> 移除同名旧容器"
    docker rm -f "$NAME" >/dev/null 2>&1 || true

    echo "==> 启动容器，端口 ${PORT} -> 8787"
    docker run -d \
      --name "$NAME" \
      --restart unless-stopped \
      -p "${PORT}:8787" \
      -e PORT=8787 \
      -e NAVPAGE_DATA_DIR=/app/data \
      -e TZ=Asia/Shanghai \
      -v "${VOLUME}:/app/data" \
      --health-cmd "node -e \"fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" \
      --health-interval 30s \
      --health-timeout 5s \
      --health-start-period 10s \
      --health-retries 3 \
      "$IMAGE" >/dev/null

    echo "==> 等待健康检查"
    for _ in $(seq 1 30); do
      status="$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo starting)"
      [ "$status" = "healthy" ] && break
      sleep 1
    done

    echo
    echo "NavPage 已启动：http://localhost:${PORT}"
    echo "查看日志：./docker-run.sh logs"
    echo "停止服务：./docker-run.sh stop"
    ;;

  stop | down)
    echo "==> 停止并移除容器 ${NAME}（数据卷 ${VOLUME} 保留）"
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    echo "已停止。如需连数据一起删除：docker volume rm ${VOLUME}"
    ;;

  logs)
    docker logs -f "$NAME"
    ;;

  restart)
    docker restart "$NAME"
    ;;

  *)
    echo "用法：$0 [start|stop|logs|restart]" >&2
    exit 1
    ;;
esac
