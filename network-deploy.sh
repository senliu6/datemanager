#!/bin/bash

# 局域网部署脚本 - 支持局域网内所有设备访问
# 使用方法: ./network-deploy.sh [HOST_IP]

set -e

# 获取主机IP地址
if [ -n "$1" ]; then
    HOST_IP="$1"
else
    # 自动检测主机IP（Docker容器的宿主机IP）
    HOST_IP=$(ip route | grep default | awk '{print $3}' | head -1)
    if [ -z "$HOST_IP" ]; then
        # 备用方法：获取第一个非回环网络接口的IP
        HOST_IP=$(ip addr show | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d'/' -f1)
    fi
fi

echo "🌐 Date Manager 局域网部署脚本"
echo "================================"
echo "🖥️  检测到主机IP: $HOST_IP"
echo "🔌 应用将在以下地址可访问:"
echo "   - 本地访问: http://localhost:3001"
echo "   - 局域网访问: http://$HOST_IP:3001"
echo ""

# 设置变量
APP_DIR="/app/datemanager"
BACKUP_DIR="/backup"
LOG_FILE="/tmp/network-deploy.log"

# 创建日志文件
exec 1> >(tee -a $LOG_FILE)
exec 2> >(tee -a $LOG_FILE >&2)

# 检查并安装系统依赖
echo "🔍 检查系统依赖..."
apt-get update

# 安装必要的网络工具
apt-get install -y net-tools iproute2 curl wget

if ! command -v node &> /dev/null; then
    echo "📦 安装Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

if ! command -v python3 &> /dev/null; then
    echo "📦 安装Python3..."
    apt-get install -y python3 python3-pip
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "📦 安装FFmpeg..."
    apt-get install -y ffmpeg sqlite3
fi

# 安装Python依赖
echo "🐍 安装Python依赖..."
pip3 install --no-cache-dir pandas numpy pyarrow joblib

# 停止现有服务
if systemctl is-active --quiet datemanager 2>/dev/null; then
    echo "⏹️  停止现有服务..."
    systemctl stop datemanager
fi

# 备份现有应用
if [ -d "$APP_DIR" ]; then
    echo "💾 备份现有应用..."
    mkdir -p $BACKUP_DIR
    mv $APP_DIR $BACKUP_DIR/datemanager_backup_$(date +%Y%m%d_%H%M%S)
fi

# 创建应用目录
echo "📁 创建应用目录..."
mkdir -p $APP_DIR
cp -r . $APP_DIR/
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

# 创建局域网环境配置
echo "⚙️  创建局域网环境配置..."
cat > $APP_DIR/.env.production << EOF
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# 局域网访问配置
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

# 修改服务器配置以支持局域网访问
echo "🔧 配置服务器支持局域网访问..."

# 更新app.js中的环境变量加载路径
sed -i "s|require('dotenv').config({ path: '../.env.local' });|require('dotenv').config({ path: '$APP_DIR/.env.production' });|g" $APP_DIR/server/app.js

# 更新CORS配置以支持局域网访问
cat > $APP_DIR/server/config/cors.js << 'EOF'
const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // 允许所有来源（开发和局域网访问）
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
Description=Date Manager Application (Network Access)
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

# 配置防火墙（如果存在）
if command -v ufw &> /dev/null; then
    echo "🔥 配置防火墙..."
    ufw allow 3001/tcp
elif command -v iptables &> /dev/null; then
    echo "🔥 配置iptables..."
    iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
    # 保存iptables规则（如果支持）
    if command -v iptables-save &> /dev/null; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
fi

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
echo "🎉 局域网部署完成!"
echo "================================"
echo "📍 应用目录: $APP_DIR"
echo "🌐 访问地址:"
echo "   - 本地访问: http://localhost:3001"
echo "   - 局域网访问: http://$HOST_IP:3001"
echo "   - 容器内访问: http://10.30.30.94:3001"
echo ""
echo "👤 默认管理员: admin / admin123"
echo ""
echo "🔌 网络配置:"
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
echo "  本地健康检查: curl http://localhost:3001/api/health"
echo "  局域网健康检查: curl http://$HOST_IP:3001/api/health"
echo ""
echo "📝 部署日志: $LOG_FILE"
echo "💾 备份位置: $BACKUP_DIR"

# 显示局域网内其他设备的访问说明
echo ""
echo "📱 局域网内其他设备访问说明:"
echo "================================"
echo "1. 确保所有设备在同一局域网内"
echo "2. 在其他设备的浏览器中访问: http://$HOST_IP:3001"
echo "3. 如果无法访问，请检查:"
echo "   - 防火墙设置"
echo "   - Docker端口映射"
echo "   - 网络连通性: ping $HOST_IP"