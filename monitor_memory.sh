#!/bin/bash

echo "📊 实时内存监控 - 按 Ctrl+C 停止"
echo "=================================="

while true; do
    # 获取当前时间
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 获取Node.js进程的内存使用情况
    node_pid=$(pgrep -f "node.*app.js")
    
    if [ -n "$node_pid" ]; then
        # 获取进程内存信息
        node_memory=$(ps -p $node_pid -o pid,ppid,rss,vsz,pmem --no-headers 2>/dev/null)
        
        if [ -n "$node_memory" ]; then
            echo "[$timestamp] Node.js进程 (PID: $node_pid):"
            echo "  RSS内存: $(echo $node_memory | awk '{printf "%.1f MB", $3/1024}')"
            echo "  虚拟内存: $(echo $node_memory | awk '{printf "%.1f MB", $4/1024}')"
            echo "  内存占比: $(echo $node_memory | awk '{print $5"%"}')"
        else
            echo "[$timestamp] 无法获取Node.js进程内存信息"
        fi
    else
        echo "[$timestamp] 未找到Node.js服务器进程"
    fi
    
    # 获取系统内存信息
    echo "  系统内存: $(free -h | grep '^Mem:' | awk '{print "已用 " $3 " / 总计 " $2 " (" int($3/$2*100) "%)"}')"
    
    # 检查内存使用率
    mem_percent=$(free | grep '^Mem:' | awk '{printf "%.0f", $3/$2*100}')
    if [ "$mem_percent" -gt 85 ]; then
        echo "  ⚠️  系统内存使用率过高: ${mem_percent}%"
    fi
    
    echo "  ────────────────────────────────"
    
    # 等待5秒
    sleep 5
done