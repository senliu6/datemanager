#!/bin/bash

# 导入IP获取函数
source ./get-local-ip.sh

echo "🔧 动态更新IP配置..."

# 获取当前本机IP
LOCAL_IP=$(get_local_ip)
echo "📍 检测到本机IP: $LOCAL_IP"

# 备份原始文件
backup_file() {
    local file=$1
    if [ -f "$file" ]; then
        cp "$file" "$file.backup.$(date +%Y%m%d_%H%M%S)"
        echo "   📋 备份文件: $file"
    fi
}

# 更新前端Login.jsx中的API地址
echo "🔄 更新前端API配置..."
if [ -f "src/pages/Login.jsx" ]; then
    backup_file "src/pages/Login.jsx"
    sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:3001|http://$LOCAL_IP:3001|g" src/pages/Login.jsx
    echo "   ✅ 更新 src/pages/Login.jsx"
fi

# 更新环境变量文件
echo "🔄 更新环境变量配置..."
if [ -f ".env.local" ]; then
    backup_file ".env.local"
    sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:3001|http://$LOCAL_IP:3001|g" .env.local
    echo "   ✅ 更新 .env.local"
fi

# 更新服务器配置
echo "🔄 更新服务器配置..."
if [ -f "server/app.js" ]; then
    backup_file "server/app.js"
    sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:|http://$LOCAL_IP:|g" server/app.js
    echo "   ✅ 更新 server/app.js"
fi

if [ -f "server/index.js" ]; then
    backup_file "server/index.js"
    sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:|http://$LOCAL_IP:|g" server/index.js
    echo "   ✅ 更新 server/index.js"
fi

# 更新CORS配置
if [ -f "server/config/cors.js" ]; then
    backup_file "server/config/cors.js"
    sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:3000|http://$LOCAL_IP:3000|g" server/config/cors.js
    echo "   ✅ 更新 server/config/cors.js"
fi

# 更新脚本文件
echo "🔄 更新脚本配置..."
if [ -f "restart-app.sh" ]; then
    backup_file "restart-app.sh"
    sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:3001|http://$LOCAL_IP:3001|g" restart-app.sh
    echo "   ✅ 更新 restart-app.sh"
fi

if [ -f "deployment-summary.sh" ]; then
    backup_file "deployment-summary.sh"
    sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:3001|http://$LOCAL_IP:3001|g" deployment-summary.sh
    echo "   ✅ 更新 deployment-summary.sh"
fi

# 检查其他可能的配置文件
for file in *.sh; do
    if [ -f "$file" ] && [ "$file" != "update-ip-config.sh" ] && [ "$file" != "get-local-ip.sh" ]; then
        if grep -q "[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:3001" "$file" 2>/dev/null; then
            backup_file "$file"
            sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:3001|http://$LOCAL_IP:3001|g" "$file"
            echo "   ✅ 更新 $file"
        fi
    fi
done

echo ""
echo "✅ IP配置更新完成！"
echo "📍 新的访问地址: http://$LOCAL_IP:3001"
echo ""
echo "⚠️  注意: 需要重新构建前端以应用更改"
echo "💡 运行以下命令完成更新:"
echo "   1. ./build-optimized.sh  # 重新构建前端"
echo "   2. ./restart-app.sh      # 重启服务"