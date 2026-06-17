#!/usr/bin/env bash
# Install / update the C3Pool Mining Manager on Ubuntu (20.04 / 22.04 / 24.04).
# Run this from the project root (where package.json lives):
#   sudo bash deploy/install-ubuntu.sh
set -e

APP_DIR="${APP_DIR:-/opt/c3pool-manager}"
SERVICE_USER="${SERVICE_USER:-c3pool}"
SERVICE_NAME="c3pool-manager"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "请以 root 运行: sudo bash deploy/install-ubuntu.sh" >&2
  exit 1
fi

echo "==> [1/6] 安装系统依赖 (curl, git, ca-certificates)"
apt-get update -y
apt-get install -y curl git ca-certificates
echo "==> [2/6] 安装 Node.js 22 (NodeSource) — node:sqlite 需要 >= 22.5"
if ! command -v node >/dev/null 2>&1 || ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "    node: $(node -v)   npm: $(npm -v)"

echo "==> [3/6] 创建服务用户与目录: $APP_DIR"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$APP_DIR/data"

echo "==> [4/6] 同步项目文件到 $APP_DIR"
# Use cp (always available); rsync would need an extra dep.
mkdir -p "$APP_DIR"
cp -a "$SRC_DIR"/. "$APP_DIR"/
rm -rf "$APP_DIR/node_modules"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"

echo "==> [5/6] 安装 npm 依赖"
# Service user is nologin; run via an explicit bash -c.
sudo -u "$SERVICE_USER" -H bash -c "cd '$APP_DIR' && npm install --omit=dev --no-audit --no-fund"

echo "==> [6/6] 注册并启动 systemd 服务"
install -m 644 "$APP_DIR/deploy/c3pool-manager.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl restart "${SERVICE_NAME}.service"

sleep 2
echo
echo "==> 完成！"
echo "    状态:   systemctl status ${SERVICE_NAME}"
echo "    日志:   journalctl -u ${SERVICE_NAME} -f"
PORT=$(systemctl show "${SERVICE_NAME}" -p Environment | grep -oE 'server.port=[0-9]+' | cut -d= -f2)
[ -z "$PORT" ] && PORT=7788
echo "    访问:   http://<本机IP>:${PORT}"
echo "    默认登录: admin / adminadmin  (登录后请到「设置」修改密码并生成 API Key)"
