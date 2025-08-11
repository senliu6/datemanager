#!/bin/bash

# Docker 快速部署脚本
echo "🐳 Docker 快速部署 Date Manager"
echo "================================"

# 获取宿主机IP
HOST_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}')
if [ -z "$HOST_IP" ]; then
    HOST_IP=$(hostname -I | awk '{print $1}')
fi
echo "📍 宿主机IP: $HOST_IP"

# 停止并删除现有容器
echo "🛑 停止现有容器..."
docker stop datemanager 2>/dev/null || true
docker rm datemanager 2>/dev/null || true

# 构建镜像
echo "🔨 构建Docker镜像..."
docker build -t datemanager:latest .

if [ $? -ne 0 ]; then
    echo "❌ Docker镜像构建失败"
    exit 1
fi

# 创建数据目录
echo "📁 创建数据目录..."
mkdir -p ./docker-data/uploads
mkdir -p ./docker-data/database
mkdir -p ./docker-data/logs

# 启动容器
echo "🚀 启动Docker容器..."
docker run -d \
    --name datemanager \
    --restart unless-stopped \
    -p 3001:3001 \
    -p 2222:22 \
    -v "$(pwd)/docker-data/uploads:/app/Uploads" \
    -v "$(pwd)/docker-data/database:/app/server/data" \
    -v "$(pwd)/docker-data/logs:/app/logs" \
    -e DOCKER_HOST_IP="$HOST_IP" \
    -e NODE_ENV=production \
    datemanager:latest

if [ $? -eq 0 ]; then
    echo "✅ 容器启动成功"
    
    # 等待服务启动
    echo "⏳ 等待服务启动..."
    sleep 10
    
    # 检查服务状态
    if curl -f http://localhost:3001/api/health >/dev/null 2>&1; then
        echo "✅ 服务运行正常"
    else
        echo "⏳ 服务可能还在启动中..."
    fi
    
    echo ""
    echo "🎉 部署完成!"
    echo "================================"
    echo "🌐 Web访问: http://$HOST_IP:3001"
    echo "🔐 SSH访问: ssh upload@$HOST_IP -p 2222"
    echo "👤 登录: admin / admin123"
    echo "📁 上传目录: ./docker-data/uploads"
    echo ""
    echo "📊 容器管理:"
    echo "   查看日志: docker logs -f datemanager"
    echo "   停止容器: docker stop datemanager"
    echo "   重启容器: docker restart datemanager"
    echo "   进入容器: docker exec -it datemanager bash"
    
else
    echo "❌ 容器启动失败"
    echo "查看错误日志:"
    docker logs datemanager
    exit 1
fi