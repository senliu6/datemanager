#!/bin/bash

echo "🔄 重启应用..."

# 查找并停止现有的Node.js进程
echo "🛑 停止现有进程..."
pkill -f "node.*server" || true
sleep 2

# 启动服务器
echo "🚀 启动服务器..."
cd server && npm start &
SERVER_PID=$!

# 等待服务器启动
sleep 3

# 测试服务器是否正常运行
echo "🔍 测试服务器状态..."
if curl -s http://localhost:3001/api/health > /dev/null; then
    echo "✅ 服务器启动成功，PID: $SERVER_PID"
    echo "🌐 访问地址: http://10.30.30.94:3001"
    echo "👤 登录信息: admin / admin123"
else
    echo "❌ 服务器启动失败"
    exit 1
fi