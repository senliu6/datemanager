#!/bin/bash

echo "🚨 重启服务器并应用内存优化..."

# 停止当前服务器进程
echo "🛑 停止当前服务器进程..."
pkill -f "node.*app.js" || echo "没有找到运行中的服务器进程"

# 等待进程完全停止
sleep 2

# 清理系统缓存（如果有权限）
echo "🧹 清理系统缓存..."
sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || echo "无法清理系统缓存（需要sudo权限）"

# 显示当前内存状态
echo "📊 当前系统内存状态:"
free -h

# 进入服务器目录
cd server

# 使用更大的内存限制启动服务器
echo "🚀 使用优化的内存设置启动服务器..."
echo "   内存限制: 6GB"
echo "   启用垃圾回收: --expose-gc"
echo "   HTTP头大小: 1MB"

# 启动服务器
npm run start &

# 等待服务器启动
echo "⏳ 等待服务器启动..."
sleep 5

# 检查服务器是否启动成功
if pgrep -f "node.*app.js" > /dev/null; then
    echo "✅ 服务器启动成功！"
    echo "📝 内存优化建议:"
    echo "   1. 使用 quality='low' 或 'medium' 设置"
    echo "   2. 使用小批次大小 (batchSize=1-2)"
    echo "   3. 使用流式API: /api/lerobot-stream/parse-stream"
    echo "   4. 监控内存使用情况"
    echo ""
    echo "🔧 如果仍有内存问题，运行:"
    echo "   node --expose-gc emergency_memory_fix.js"
else
    echo "❌ 服务器启动失败，请检查日志"
    exit 1
fi