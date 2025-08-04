#!/bin/bash

# 检查宿主机IP的脚本

echo "🔍 检查宿主机IP地址..."
echo "================================"

# 方法1: 通过路由表获取
HOST_IP1=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}')

# 方法2: 通过hostname命令获取
HOST_IP2=$(hostname -I 2>/dev/null | awk '{print $1}')

# 方法3: 通过网络接口获取
HOST_IP3=$(ip addr show 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d'/' -f1)

# 方法4: 通过ifconfig获取（如果可用）
if command -v ifconfig &> /dev/null; then
    HOST_IP4=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}')
else
    HOST_IP4="N/A"
fi

echo "📊 检测结果:"
echo "  方法1 (路由表): $HOST_IP1"
echo "  方法2 (hostname): $HOST_IP2"
echo "  方法3 (网络接口): $HOST_IP3"
echo "  方法4 (ifconfig): $HOST_IP4"
echo ""

# 选择最可靠的IP
if [ -n "$HOST_IP1" ]; then
    FINAL_IP="$HOST_IP1"
elif [ -n "$HOST_IP2" ]; then
    FINAL_IP="$HOST_IP2"
elif [ -n "$HOST_IP3" ]; then
    FINAL_IP="$HOST_IP3"
else
    FINAL_IP="未检测到"
fi

echo "🎯 推荐使用的宿主机IP: $FINAL_IP"
echo ""
echo "🌐 局域网访问地址: http://$FINAL_IP:3001"
echo ""

# 验证IP地址格式
if [[ $FINAL_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    echo "✅ IP地址格式正确"
    
    # 测试网络连通性
    echo "🔍 测试网络连通性..."
    if ping -c 1 -W 1 $FINAL_IP > /dev/null 2>&1; then
        echo "✅ 网络连通性正常"
    else
        echo "⚠️  网络连通性测试失败"
    fi
else
    echo "❌ IP地址格式不正确或未检测到"
fi

echo ""
echo "📋 使用说明:"
echo "1. 在局域网内的任何设备上"
echo "2. 打开浏览器"
echo "3. 访问: http://$FINAL_IP:3001"
echo "4. 使用默认账户: admin / admin123"