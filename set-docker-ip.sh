#!/bin/bash

# 设置 Docker 环境的 IP 地址
echo "🐳 设置 Docker 环境 IP 地址"
echo "================================"

# 提示用户输入宿主机IP
echo "请输入宿主机的IP地址（外部可访问的IP）:"
echo "例如: 10.30.10.9 或 192.168.1.100"
read -p "IP地址: " HOST_IP

# 验证IP格式
if [[ ! $HOST_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    echo "❌ IP地址格式不正确，请重新运行脚本"
    exit 1
fi

echo "📍 设置宿主机IP: $HOST_IP"

# 创建正确的 .env.local 文件
cat > .env.local << EOF
# Docker 环境配置
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# 前端API配置 - 使用宿主机IP
VITE_API_BASE_URL=http://$HOST_IP:3001/api

# 本地访问配置
FRONTEND_URL=http://$HOST_IP:3000
API_BASE_URL=http://$HOST_IP:3001/api

# JWT密钥
JWT_SECRET=simple-local-key

# 本地SQLite数据库
DB_PATH=./server/data/datemanager.db

# 本地缓存
CACHE_TYPE=memory

# 文件上传配置
MAX_FILE_SIZE=2GB
UPLOAD_TEMP_DIR=/tmp/uploads

# 简化认证配置
SIMPLE_AUTH_ENABLED=true
UPLOAD_USER=upload
UPLOAD_PASS=upload123
EOF

echo "✅ .env.local 文件已创建"
echo ""
echo "📝 配置内容:"
echo "   宿主机IP: $HOST_IP"
echo "   前端地址: http://$HOST_IP:3000"
echo "   后端API: http://$HOST_IP:3001/api"
echo ""
echo "🚀 现在可以运行启动脚本:"
echo "   ./docker-fix-and-run.sh"
echo ""
echo "🌐 访问地址:"
echo "   前端: http://$HOST_IP:3000"
echo "   后端: http://$HOST_IP:3001"