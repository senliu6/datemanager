#!/bin/bash

# 检查是否启用HTTPS
ENABLE_HTTPS_MODE=false
if [ "$1" = "https" ]; then
    ENABLE_HTTPS_MODE=true
    echo "🚀 启动 Date Manager (HTTPS模式)"
else
    echo "🚀 启动 Date Manager (HTTP模式)"
fi
echo "================================"

# 获取本机IP
get_local_ip() {
    local ip=""
    if command -v ip >/dev/null 2>&1; then
        ip=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K\S+')
    fi
    if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$ip" ]; then
        ip="127.0.0.1"
    fi
    echo "$ip"
}

LOCAL_IP=$(get_local_ip)
echo "📍 本机IP: $LOCAL_IP"

# 强制清理所有相关进程
echo "🛑 清理所有进程..."
pkill -f "node.*app\|vite\|node.*server" 2>/dev/null || true
sleep 3

# 清理端口
for port in 3000 3001 3002; do
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    fi
done

sleep 2

# 清理日志
rm -f *.log 2>/dev/null || true

if [ "$ENABLE_HTTPS_MODE" = "true" ]; then
    echo "🚀 启动后端服务 (HTTPS 模式)..."
    HTTPS_FLAG=true
    PROTOCOL="https"
    PORT_SUFFIX="s"
else
    echo "🚀 启动后端服务 (HTTP 模式)..."
    HTTPS_FLAG=false
    PROTOCOL="http"
    PORT_SUFFIX=""
fi

NODE_ENV=development \
ENABLE_HTTPS=$HTTPS_FLAG \
PORT=3001 \
HOST=0.0.0.0 \
JWT_SECRET=simple-jwt-secret-$(date +%s) \
SIMPLE_AUTH_ENABLED=true \
UPLOAD_USER=admin \
UPLOAD_PASS=admin123 \
nohup node server/app.js > backend.log 2>&1 &

BACKEND_PID=$!
echo "后端PID: $BACKEND_PID"

# 等待后端启动
echo "⏳ 等待后端启动..."
for i in {1..10}; do
    if [ "$ENABLE_HTTPS_MODE" = "true" ]; then
        if curl -k -s https://localhost:3443/api/health >/dev/null 2>&1; then
            echo "✅ 后端启动成功"
            break
        fi
    else
        if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
            echo "✅ 后端启动成功"
            break
        fi
    fi
    sleep 1
done

echo "🚀 启动前端服务..."
ENABLE_HTTPS=$HTTPS_FLAG \
nohup npx vite --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "前端PID: $FRONTEND_PID"

# 等待前端启动
echo "⏳ 等待前端启动..."
for i in {1..15}; do
    if [ "$ENABLE_HTTPS_MODE" = "true" ]; then
        if curl -k -s https://localhost:3000 >/dev/null 2>&1; then
            echo "✅ 前端启动成功"
            break
        fi
    else
        if curl -s http://localhost:3000 >/dev/null 2>&1; then
            echo "✅ 前端启动成功"
            break
        fi
    fi
    sleep 1
done

echo ""
echo "🎉 启动完成!"
echo "============="
echo "🌐 访问地址:"
if [ "$ENABLE_HTTPS_MODE" = "true" ]; then
    echo "   前端: $PROTOCOL://$LOCAL_IP:3000"
    echo "   后端: $PROTOCOL://$LOCAL_IP:3443"
    echo "   API:  $PROTOCOL://$LOCAL_IP:3443/api"
else
    echo "   前端: $PROTOCOL://$LOCAL_IP:3000"
    echo "   后端: $PROTOCOL://$LOCAL_IP:3001"
    echo "   API:  $PROTOCOL://$LOCAL_IP:3001/api"
fi
echo ""
echo "👤 登录信息:"
echo "   用户名: admin"
echo "   密码: admin123"
echo ""
echo "📊 进程信息:"
echo "   后端PID: $BACKEND_PID"
echo "   前端PID: $FRONTEND_PID"
echo ""
echo "🔧 测试命令:"
if [ "$ENABLE_HTTPS_MODE" = "true" ]; then
    echo "   测试后端: curl -k https://localhost:3443/api/health"
    echo "   测试前端: curl -k https://localhost:3000"
else
    echo "   测试后端: curl http://localhost:3001/api/health"
    echo "   测试前端: curl http://localhost:3000"
fi
echo "   查看日志: tail -f backend.log frontend.log"
echo ""
echo "🛑 停止服务: pkill -f 'node.*app\\|vite'"

# 定义清理函数
cleanup() {
    echo ""
    echo "🛑 停止服务..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    pkill -f "node.*app\|vite" 2>/dev/null || true
    echo "✅ 服务已停止"
    exit 0
}

# 如果用户按 Ctrl+C，清理并退出
trap cleanup INT TERM

echo ""
echo "📝 实时日志 (按 Ctrl+C 停止):"
tail -f backend.log frontend.log &

# 保持脚本运行
wait