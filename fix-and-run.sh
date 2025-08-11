#!/bin/bash

# 修复并启动 Date Manager 开发环境
echo "🔧 修复并启动 Date Manager 开发环境"
echo "================================"

# 获取IP地址
LOCAL_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi
echo "📍 本机IP: $LOCAL_IP"

# 停止现有进程
echo "🛑 停止现有进程..."
pkill -f "node\|npm\|vite" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
sleep 2

# 清理缓存和临时文件
echo "🧹 清理缓存..."
rm -rf node_modules/.vite-temp
rm -rf node_modules/.vite
rm -rf dist
rm -rf .vite

# 检查 Node.js 和 npm 版本
echo "🔍 检查环境..."
echo "Node.js 版本: $(node --version)"
echo "npm 版本: $(npm --version)"

# 重新安装前端依赖（包括开发依赖）
echo "📦 重新安装前端依赖..."
npm cache clean --force
rm -rf node_modules
npm install --include=dev

# 修复后端app.js重复声明问题
echo "🔧 修复后端配置..."
cd server
if [ -f "app.js" ]; then
    sed -i '/^const path = require/d' app.js
    sed -i "/const express = require('express');/a\\const path = require('path');" app.js
fi

# 安装后端依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装后端依赖..."
    npm install
fi

# 启动后端
echo "🚀 启动后端..."
nohup node app.js > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# 创建环境配置
cat > .env.local << EOF
VITE_API_BASE_URL=http://$LOCAL_IP:3001/api
NODE_ENV=development
EOF

# 等待后端启动
echo "⏳ 等待后端启动..."
sleep 5

# 使用 npx 直接启动 vite
echo "🚀 启动前端..."
nohup npx vite --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
FRONTEND_PID=$!

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo ""
echo "🔍 检查服务状态..."
if curl -f http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "✅ 后端服务正常"
else
    echo "❌ 后端服务异常"
    echo "后端日志:"
    tail -10 backend.log
fi

if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ 前端服务正常"
else
    echo "⏳ 前端可能还在启动中..."
    echo "前端日志:"
    tail -10 frontend.log
fi

# 定义中止函数
stop_services() {
    echo "🛑 停止所有服务..."
    pkill -f "node\|npm\|vite" 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    sleep 2
    echo "✅ 服务已停止"
    exit 0
}

# 捕获终止信号
trap 'stop_services' INT TERM

# 实时查看日志
echo ""
echo "🎉 部署完成! 按 Ctrl+C 终止服务并停止所有进程"
echo "================================"
echo "🌐 访问地址:"
echo "   前端: http://$LOCAL_IP:3000"
echo "   后端: http://$LOCAL_IP:3001"
echo "👤 登录: admin / admin123"
echo ""
echo "📊 进程管理:"
echo "   前端PID: $FRONTEND_PID"
echo "   后端PID: $BACKEND_PID"
echo ""
echo "📝 日志查看 (实时):"
tail -f backend.log frontend.log &

# 保持脚本运行
wait