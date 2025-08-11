#!/bin/bash

# 快速修复 .env.local 中的 IP 地址
echo "🔧 快速修复 .env.local IP 地址"
echo "================================"

if [ ! -f ".env.local" ]; then
    echo "❌ .env.local 文件不存在"
    echo "请先运行 ./set-docker-ip.sh 创建配置文件"
    exit 1
fi

echo "当前 .env.local 内容:"
cat .env.local
echo ""

# 检查是否包含 0.0.0.0
if grep -q "0.0.0.0" .env.local; then
    echo "⚠️  检测到无效的 0.0.0.0 地址"
    
    # 提示用户输入正确的IP
    echo "请输入正确的宿主机IP地址:"
    read -p "IP地址: " CORRECT_IP
    
    # 验证IP格式
    if [[ ! $CORRECT_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo "❌ IP地址格式不正确"
        exit 1
    fi
    
    # 备份原文件
    cp .env.local .env.local.backup.$(date +%Y%m%d_%H%M%S)
    
    # 替换所有的 0.0.0.0 为正确的IP
    sed -i "s/0\.0\.0\.0/$CORRECT_IP/g" .env.local
    
    echo "✅ IP地址已修复"
    echo ""
    echo "修复后的内容:"
    cat .env.local
    
else
    echo "✅ .env.local 文件中没有发现 0.0.0.0 地址"
fi

echo ""
echo "🚀 现在可以重新启动服务"