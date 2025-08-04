#!/bin/bash

# 获取本机局域网IP地址的函数
get_local_ip() {
    # 方法1: 使用hostname -I (推荐)
    local ip=$(hostname -I | awk '{print $1}')
    
    # 如果方法1失败，尝试方法2: 使用ip route
    if [ -z "$ip" ] || [ "$ip" = "127.0.0.1" ]; then
        ip=$(ip route get 8.8.8.8 | awk '{print $7; exit}' 2>/dev/null)
    fi
    
    # 如果方法2失败，尝试方法3: 使用ifconfig
    if [ -z "$ip" ] || [ "$ip" = "127.0.0.1" ]; then
        ip=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
    fi
    
    # 如果方法3失败，尝试方法4: 使用网络连接测试
    if [ -z "$ip" ] || [ "$ip" = "127.0.0.1" ]; then
        ip=$(ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d'/' -f1 | head -1)
    fi
    
    echo "$ip"
}

# 验证IP地址格式
validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    else
        return 1
    fi
}

# 主函数
main() {
    local ip=$(get_local_ip)
    
    if validate_ip "$ip"; then
        echo "$ip"
        return 0
    else
        echo "127.0.0.1"  # 回退到localhost
        return 1
    fi
}

# 如果直接运行脚本，输出IP
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main
fi