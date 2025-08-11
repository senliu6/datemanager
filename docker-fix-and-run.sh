#!/bin/bash

# Docker 环境修复并启动 Date Manager
echo "🐳 Docker 环境修复并启动 Date Manager"
echo "================================"

# 检查是否在 Docker 容器中
if [ -f /.dockerenv ]; then
    echo "✅ 检测到 Docker 环境"
    IN_DOCKER=true
else
    echo "⚠️  未检测到 Docker 环境，但继续执行"
    IN_DOCKER=false
fi

# 获取IP地址
get_docker_host_ip() {
    local detected_ip=""
    
    # 方法1: 从环境变量获取
    if [ -n "$DOCKER_HOST_IP" ]; then
        detected_ip="$DOCKER_HOST_IP"
        echo "使用环境变量 DOCKER_HOST_IP: $detected_ip"
        return 0
    fi
    
    # 方法2: 从现有的 .env.local 文件获取（如果存在且有效）
    if [ -f ".env.local" ]; then
        local existing_ip=$(grep "VITE_API_BASE_URL" .env.local | sed 's/.*http:\/\/\([^:]*\):.*/\1/')
        if [[ $existing_ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && [ "$existing_ip" != "0.0.0.0" ]; then
            detected_ip="$existing_ip"
            echo "使用现有配置文件中的IP: $detected_ip"
            return 0
        fi
    fi
    
    # 方法3: 通过网关获取宿主机IP
    detected_ip=$(ip route | grep default | awk '{print $3}' | head -1)
    if [[ $detected_ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && [ "$detected_ip" != "0.0.0.0" ]; then
        echo "通过默认网关检测到宿主机IP: $detected_ip"
        return 0
    fi
    
    # 方法4: 尝试从网络接口获取
    detected_ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
    if [[ $detected_ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && [ "$detected_ip" != "0.0.0.0" ]; then
        echo "通过路由检测到IP: $detected_ip"
        return 0
    fi
    
    # 方法5: 使用容器内的网络接口（排除回环地址）
    detected_ip=$(hostname -I | awk '{print $1}' | grep -v '^127\.' | head -1)
    if [[ $detected_ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && [ "$detected_ip" != "0.0.0.0" ]; then
        echo "使用容器网络接口IP: $detected_ip"
        return 0
    fi
    
    # 如果都失败了，提示用户手动设置
    echo "❌ 无法自动检测到有效的IP地址"
    echo "请使用以下方式之一："
    echo "1. 设置环境变量: DOCKER_HOST_IP=你的宿主机IP ./docker-fix-and-run.sh"
    echo "2. 手动运行: ./set-docker-ip.sh"
    echo "3. 直接编辑 .env.local 文件"
    exit 1
}

if [ "$IN_DOCKER" = true ]; then
    get_docker_host_ip
    LOCAL_IP="$detected_ip"
else
    LOCAL_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}')
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(hostname -I | awk '{print $1}')
    fi
fi
echo "📍 本机IP: $LOCAL_IP"

# 停止现有进程
echo "🛑 停止现有进程..."
pkill -f "node\|npm\|vite" 2>/dev/null || true
if command -v lsof >/dev/null 2>&1; then
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
fi
sleep 2

# 清理缓存和临时文件
echo "🧹 清理缓存..."
rm -rf node_modules/.vite-temp
rm -rf node_modules/.vite
rm -rf dist
rm -rf .vite

# 检查环境
echo "🔍 检查环境..."
echo "Node.js 版本: $(node --version)"
echo "npm 版本: $(npm --version)"
echo "当前目录: $(pwd)"
echo "用户: $(whoami)"

# 设置 npm 配置（Docker 环境优化）
echo "⚙️  配置 npm..."
npm config set fund false
npm config set audit false
npm config set progress false

# 检查前端依赖
echo "🔍 检查前端依赖..."
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📦 首次安装前端依赖..."
    npm install
elif [ "package.json" -nt "node_modules" ]; then
    echo "📦 package.json 已更新，重新安装依赖..."
    npm install
else
    echo "✅ 前端依赖已存在，跳过安装"
fi

# 验证 vite 安装
echo "🔍 验证 vite 安装..."
if [ -f "node_modules/.bin/vite" ]; then
    echo "✅ vite 可执行文件存在"
    ls -la node_modules/.bin/vite
else
    echo "❌ vite 可执行文件不存在"
    echo "尝试全局安装 vite..."
    npm install -g vite
fi

# 检查 vite 版本
if npx vite --version >/dev/null 2>&1; then
    echo "✅ vite 版本: $(npx vite --version)"
else
    echo "❌ vite 无法运行，尝试修复..."
    npm install vite@latest --save-dev
fi

# 修复后端配置
echo "🔧 修复后端配置..."
cd server
if [ -f "app.js" ]; then
    # 备份原文件
    cp app.js app.js.backup
    # 移除重复的 path 声明
    sed -i '/^const path = require/d' app.js
    # 在 express 声明后添加 path
    sed -i "/const express = require('express');/a\\const path = require('path');" app.js
fi

# 检查后端依赖
echo "🔍 检查后端依赖..."
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📦 首次安装后端依赖..."
    npm install
elif [ "package.json" -nt "node_modules" ]; then
    echo "📦 package.json 已更新，重新安装后端依赖..."
    npm install
else
    echo "✅ 后端依赖已存在，跳过安装"
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

# 启动前端 - 使用多种方式尝试
echo "🚀 启动前端..."

# 方式1: 直接使用 vite
if [ -f "node_modules/.bin/vite" ]; then
    echo "使用本地 vite..."
    nohup ./node_modules/.bin/vite --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
    FRONTEND_PID=$!
elif command -v vite >/dev/null 2>&1; then
    echo "使用全局 vite..."
    nohup vite --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
    FRONTEND_PID=$!
else
    echo "使用 npx vite..."
    nohup npx vite --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
    FRONTEND_PID=$!
fi

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 15

# 检查服务状态
echo ""
echo "🔍 检查服务状态..."

# 检查后端
if curl -f http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "✅ 后端服务正常"
elif curl -f http://localhost:3001 >/dev/null 2>&1; then
    echo "✅ 后端服务正常（无健康检查端点）"
else
    echo "❌ 后端服务异常"
    echo "后端日志:"
    tail -20 backend.log
fi

# 检查前端
if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ 前端服务正常"
else
    echo "⏳ 前端可能还在启动中..."
    echo "前端日志:"
    tail -20 frontend.log
    
    # 如果前端启动失败，尝试构建静态文件
    echo "🔄 尝试构建静态文件..."
    npm run build
    if [ $? -eq 0 ]; then
        echo "✅ 构建成功，可以使用静态文件服务"
        echo "静态文件位置: $(pwd)/dist"
    fi
fi

# 定义中止函数
stop_services() {
    echo "🛑 停止所有服务..."
    pkill -f "node\|npm\|vite" 2>/dev/null || true
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
        lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    fi
    sleep 2
    echo "✅ 服务已停止"
    exit 0
}

# 捕获终止信号
trap 'stop_services' INT TERM

# 显示最终信息
echo ""
echo "🎉 部署完成! 按 Ctrl+C 终止服务"
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
echo "🔧 故障排除:"
echo "   查看前端日志: tail -f frontend.log"
echo "   查看后端日志: tail -f backend.log"
echo "   检查进程: ps aux | grep -E 'node|vite'"
echo ""

# 实时查看日志
echo "📝 日志查看 (实时):"
tail -f backend.log frontend.log &

# 保持脚本运行
wait