#!/bin/bash

# 针对host网络模式的部署脚本
# 适用于使用 --net=host 的Docker容器

set -e

echo "🌐 Date Manager Host网络模式部署脚本"
echo "================================"
echo "🐳 容器环境: $(hostname)"
echo "🌍 网络模式: Host网络（与宿主机共享）"
echo ""

# 获取宿主机IP地址
HOST_IP=$(ip route get 8.8.8.8 | awk '{print $7; exit}')
if [ -z "$HOST_IP" ]; then
    HOST_IP=$(hostname -I | awk '{print $1}')
fi

echo "🖥️  检测到主机IP: $HOST_IP"
echo "🔌 应用将在以下地址可访问:"
echo "   - 本地访问: http://localhost:3001"
echo "   - 局域网访问: http://$HOST_IP:3001"
echo ""

# 设置变量
APP_DIR="/home/ldz/datemanager"
BACKUP_DIR="/home/ldz/backup"
LOG_FILE="/tmp/host-network-deploy.log"

# 创建日志文件
exec 1> >(tee -a $LOG_FILE)
exec 2> >(tee -a $LOG_FILE >&2)

# 更新系统包
echo "📦 更新系统包..."
apt-get update

# 安装必要的系统依赖
echo "🔧 安装系统依赖..."
apt-get install -y \
    curl \
    wget \
    git \
    python3 \
    python3-pip \
    ffmpeg \
    sqlite3 \
    build-essential \
    net-tools \
    iproute2

# 安装Node.js (如果没有安装)
if ! command -v node &> /dev/null; then
    echo "📦 安装Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    echo "✅ Node.js已安装: $(node -v)"
fi

# 安装Python依赖
echo "🐍 安装Python依赖..."
pip3 install --no-cache-dir \
    pandas \
    numpy \
    pyarrow \
    joblib

# 停止现有服务（如果存在）
if systemctl is-active --quiet datemanager 2>/dev/null; then
    echo "⏹️  停止现有服务..."
    systemctl stop datemanager
fi

# 备份现有应用（如果存在）
if [ -d "$APP_DIR" ]; then
    echo "💾 备份现有应用..."
    mkdir -p $BACKUP_DIR
    mv $APP_DIR $BACKUP_DIR/datemanager_backup_$(date +%Y%m%d_%H%M%S)
fi

# 检查源码是否存在
if [ ! -f "/tmp/datemanager.tar.gz" ]; then
    echo "❌ 源码包不存在: /tmp/datemanager.tar.gz"
    echo "请先将源码包复制到容器中:"
    echo "docker cp datemanager.tar.gz ldz_12_2_ubuntu22:/tmp/"
    exit 1
fi

# 创建应用目录并解压
echo "📁 创建应用目录..."
mkdir -p $APP_DIR
cd /tmp
tar -xzf datemanager.tar.gz -C $APP_DIR --strip-components=0
cd $APP_DIR

# 构建前端
echo "🔨 构建前端应用..."
npm install --production
npm run build

# 安装后端依赖
echo "🔧 安装后端依赖..."
cd server
npm install --production
cd ..

# 创建必要目录
echo "📁 创建数据目录..."
mkdir -p $APP_DIR/Uploads
mkdir -p $APP_DIR/server/data
mkdir -p $APP_DIR/server/cache
mkdir -p /tmp/uploads

# 创建Host网络环境配置
echo "⚙️  创建Host网络环境配置..."
cat > $APP_DIR/.env.production << EOF
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Host网络模式配置（与宿主机共享网络）
FRONTEND_URL=http://$HOST_IP:3001
API_BASE_URL=http://$HOST_IP:3001/api

# 数据库配置
DB_PATH=$APP_DIR/server/data/datemanager.db

# 缓存配置
CACHE_TYPE=memory

# 文件上传配置
MAX_FILE_SIZE=100MB
UPLOAD_TEMP_DIR=/tmp/uploads

# 安全配置
JWT_SECRET=$(openssl rand -base64 32)
BCRYPT_ROUNDS=10

# 网络配置
CORS_ORIGIN=*
TRUST_PROXY=true
EOF

# 修改服务器配置以使用生产环境变量
echo "🔧 配置服务器..."
sed -i "s|require('dotenv').config({ path: '../.env.local' });|require('dotenv').config({ path: '$APP_DIR/.env.production' });|g" $APP_DIR/server/app.js

# 更新CORS配置以支持Host网络模式
cat > $APP_DIR/server/config/cors.js << 'EOF'
const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // Host网络模式下允许所有来源
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);
EOF

# 创建systemd服务
echo "📋 创建系统服务..."
cat > /etc/systemd/system/datemanager.service << EOF
[Unit]
Description=Date Manager Application (Host Network Mode)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3001
EnvironmentFile=$APP_DIR/.env.production
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd并启用服务
systemctl daemon-reload
systemctl enable datemanager

# 设置权限
echo "🔐 设置权限..."
chown -R root:root $APP_DIR
chmod -R 755 $APP_DIR

# 启动服务
echo "🚀 启动服务..."
systemctl start datemanager

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
if systemctl is-active --quiet datemanager; then
    echo "✅ 服务启动成功!"
    
    # 测试本地访问
    for i in {1..10}; do
        if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
            echo "✅ 本地访问测试通过!"
            break
        else
            echo "⏳ 等待应用启动... ($i/10)"
            sleep 2
        fi
        
        if [ $i -eq 10 ]; then
            echo "⚠️  应用可能启动异常，请检查日志"
        fi
    done
    
    # 测试局域网访问
    echo "🌐 测试局域网访问..."
    if curl -f http://$HOST_IP:3001/api/health > /dev/null 2>&1; then
        echo "✅ 局域网访问测试通过!"
    else
        echo "⚠️  局域网访问可能需要额外配置"
    fi
else
    echo "❌ 服务启动失败!"
    systemctl status datemanager
    exit 1
fi

# 显示网络信息
echo ""
echo "🎉 Host网络模式部署完成!"
echo "================================"
echo "📍 应用目录: $APP_DIR"
echo "🌐 访问地址:"
echo "   - 容器内访问: http://localhost:3001"
echo "   - 宿主机访问: http://localhost:3001"
echo "   - 局域网访问: http://$HOST_IP:3001"
echo ""
echo "👤 默认管理员: admin / admin123"
echo ""
echo "🔌 网络配置:"
echo "   - 网络模式: Host网络（与宿主机共享）"
echo "   - 监听地址: 0.0.0.0:3001"
echo "   - 主机IP: $HOST_IP"
echo "   - CORS: 允许所有来源"
echo ""
echo "📊 常用命令:"
echo "  查看状态: systemctl status datemanager"
echo "  查看日志: journalctl -u datemanager -f"
echo "  重启服务: systemctl restart datemanager"
echo "  停止服务: systemctl stop datemanager"
echo ""
echo "🔍 网络测试:"
echo "  容器内健康检查: curl http://localhost:3001/api/health"
echo "  局域网健康检查: curl http://$HOST_IP:3001/api/health"
echo ""
echo "📝 部署日志: $LOG_FILE"
echo "💾 备份位置: $BACKUP_DIR"

# 显示Host网络模式的优势
echo ""
echo "🌟 Host网络模式优势:"
echo "================================"
echo "✅ 无需端口映射，直接使用宿主机网络"
echo "✅ 网络性能最佳，无额外网络开销"
echo "✅ 局域网设备可直接访问宿主机IP:3001"
echo "✅ 支持所有网络功能，无限制"
echo ""
echo "📱 局域网设备访问说明:"
echo "1. 确保设备在同一局域网内"
echo "2. 浏览器访问: http://$HOST_IP:3001"
echo "3. 移动设备也可直接访问该地址"