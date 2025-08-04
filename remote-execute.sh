#!/bin/bash

# 在Docker主机上执行的脚本

set -e

CONTAINER_NAME="ldz_12_2_ubuntu22"
PACKAGE_FILE="datemanager-20250728_163316.tar.gz"

echo "🚀 Docker主机上的远程执行脚本"
echo "================================"
echo "🐳 目标容器: $CONTAINER_NAME"
echo "📦 部署包: $PACKAGE_FILE"
echo ""

# 检查Docker是否可用
echo "🔍 检查Docker环境..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker命令不可用"
    echo "请确保在Docker主机上运行此脚本"
    exit 1
fi

# 检查容器是否运行
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ 容器 $CONTAINER_NAME 未运行"
    echo "当前运行的容器:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    exit 1
fi
echo "✅ 容器 $CONTAINER_NAME 正在运行"

# 检查部署包是否存在
if [ ! -f "$PACKAGE_FILE" ]; then
    echo "❌ 部署包不存在: $PACKAGE_FILE"
    echo "请确保已将部署包上传到当前目录"
    exit 1
fi
echo "✅ 部署包存在: $PACKAGE_FILE"

# 传输文件到容器
echo ""
echo "📤 传输文件到容器..."
if docker cp "$PACKAGE_FILE" "$CONTAINER_NAME:/tmp/"; then
    echo "✅ 部署包传输成功"
else
    echo "❌ 部署包传输失败"
    exit 1
fi

# 在容器内创建并执行部署脚本
echo ""
echo "🚀 在容器内执行部署..."

docker exec "$CONTAINER_NAME" bash -c "
set -e

PACKAGE_FILE='/tmp/$PACKAGE_FILE'
APP_DIR='/home/ldz/datemanager'
BACKUP_DIR='/home/ldz/backup'

echo '🚀 容器内部署开始...'
echo '================================'

# 获取宿主机IP
HOST_IP=\$(ip route get 8.8.8.8 2>/dev/null | awk '{print \$7; exit}')
if [ -z \"\$HOST_IP\" ]; then
    HOST_IP=\$(hostname -I 2>/dev/null | awk '{print \$1}')
fi
if [ -z \"\$HOST_IP\" ]; then
    HOST_IP='localhost'
fi

echo \"🖥️  检测到宿主机IP: \$HOST_IP\"

# 更新系统包
echo '📦 更新系统包...'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# 安装必要依赖
echo '🔧 安装系统依赖...'
apt-get install -y -qq curl wget git python3 python3-pip ffmpeg sqlite3 build-essential net-tools iproute2 ca-certificates gnupg lsb-release

# 安装Node.js
if ! command -v node &> /dev/null; then
    echo '📦 安装Node.js...'
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs
fi

echo \"✅ Node.js版本: \$(node -v)\"

# 安装Python依赖
echo '🐍 安装Python依赖...'
pip3 install --no-cache-dir -q pandas numpy pyarrow joblib

# 停止现有服务
if systemctl is-active --quiet datemanager 2>/dev/null; then
    echo '⏹️  停止现有服务...'
    systemctl stop datemanager
fi

# 备份现有应用
if [ -d \"\$APP_DIR\" ]; then
    echo '💾 备份现有应用...'
    mkdir -p \"\$BACKUP_DIR\"
    mv \"\$APP_DIR\" \"\$BACKUP_DIR/datemanager_backup_\$(date +%Y%m%d_%H%M%S)\"
fi

# 创建应用目录并解压
echo '📦 解压部署包...'
mkdir -p \"\$APP_DIR\"
tar -xzf \"\$PACKAGE_FILE\" -C \"\$APP_DIR\"
cd \"\$APP_DIR\"

# 构建前端
echo '🔨 构建前端...'
npm install --production --silent
npm run build --silent

# 安装后端依赖
echo '🔧 安装后端依赖...'
cd server
npm install --production --silent
cd ..

# 创建必要目录
mkdir -p \"\$APP_DIR/Uploads\"
mkdir -p \"\$APP_DIR/server/data\"
mkdir -p \"\$APP_DIR/server/cache\"
mkdir -p \"/tmp/uploads\"

# 创建环境配置
echo '⚙️  创建环境配置...'
cat > \"\$APP_DIR/.env.production\" << EOL
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
FRONTEND_URL=http://\$HOST_IP:3001
API_BASE_URL=http://\$HOST_IP:3001/api
DB_PATH=\$APP_DIR/server/data/datemanager.db
CACHE_TYPE=memory
MAX_FILE_SIZE=100MB
UPLOAD_TEMP_DIR=/tmp/uploads
JWT_SECRET=\$(openssl rand -base64 32)
BCRYPT_ROUNDS=10
CORS_ORIGIN=*
TRUST_PROXY=true
EOL

# 修改服务器配置
sed -i \"s|require('dotenv').config({ path: '../.env.local' });|require('dotenv').config({ path: '\$APP_DIR/.env.production' });|g\" \"\$APP_DIR/server/app.js\"

# 创建CORS配置
mkdir -p \"\$APP_DIR/server/config\"
cat > \"\$APP_DIR/server/config/cors.js\" << 'EOL'
const cors = require('cors');
const corsOptions = {
  origin: function (origin, callback) { callback(null, true); },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};
module.exports = cors(corsOptions);
EOL

# 创建systemd服务
echo '📋 创建系统服务...'
cat > /etc/systemd/system/datemanager.service << EOL
[Unit]
Description=Date Manager Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=\$APP_DIR/server
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3001
EnvironmentFile=\$APP_DIR/.env.production
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOL

# 设置权限
chown -R root:root \"\$APP_DIR\"
chmod -R 755 \"\$APP_DIR\"

# 启用并启动服务
systemctl daemon-reload
systemctl enable datemanager
systemctl start datemanager

# 等待服务启动
echo '⏳ 等待服务启动...'
sleep 5

# 检查服务状态
if systemctl is-active --quiet datemanager; then
    echo '✅ 服务启动成功!'
    
    # 健康检查
    for i in {1..10}; do
        if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
            echo '✅ 应用健康检查通过!'
            break
        else
            echo \"⏳ 等待应用启动... (\$i/10)\"
            sleep 2
        fi
    done
else
    echo '❌ 服务启动失败!'
    systemctl status datemanager
    exit 1
fi

echo ''
echo '🎉 部署完成!'
echo '================================'
echo \"🌐 访问地址:\"
echo \"   - 容器内访问: http://localhost:3001\"
echo \"   - 局域网访问: http://\$HOST_IP:3001\"
echo \"👤 默认管理员: admin / admin123\"
echo ''
echo '📊 管理命令:'
echo '  查看状态: systemctl status datemanager'
echo '  查看日志: journalctl -u datemanager -f'
echo '  重启服务: systemctl restart datemanager'

# 清理部署包
rm -f \"\$PACKAGE_FILE\"
"

echo ""
echo "🎉 远程执行完成!"
