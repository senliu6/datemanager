#!/bin/bash

# ===========================================
# 获取本机IP地址脚本
# 用于Docker和本地部署的IP自动检测
# ===========================================

# 获取主要网络接口的IP地址
get_primary_ip() {
    # 方法1: 使用hostname命令
    local ip1=$(hostname -I 2>/dev/null | awk '{print $1}')
    
    # 方法2: 使用ip命令
    local ip2=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K\S+')
    
    # 方法3: 使用ifconfig命令
    local ip3=$(ifconfig 2>/dev/null | grep -E 'inet.*broadcast' | awk '{print $2}' | head -1)
    
    # 方法4: 连接外部服务获取IP
    local ip4=$(curl -s --connect-timeout 3 ifconfig.me 2>/dev/null)
    
    # 选择最合适的IP
    for ip in "$ip1" "$ip2" "$ip3"; do
        if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && [[ $ip != "127.0.0.1" ]]; then
            echo "$ip"
            return 0
        fi
    done
    
    # 如果本地IP都不可用，返回外网IP
    if [[ $ip4 =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo "$ip4"
        return 0
    fi
    
    return 1
}

# 检测Docker环境
is_docker_environment() {
    if [ -f /.dockerenv ]; then
        return 0
    fi
    
    if grep -q docker /proc/1/cgroup 2>/dev/null; then
        return 0
    fi
    
    return 1
}

# 获取Docker宿主机IP
get_docker_host_ip() {
    # 方法1: 通过默认网关
    local gateway_ip=$(ip route | grep default | awk '{print $3}' | head -1)
    
    # 方法2: 通过环境变量
    if [ -n "$DOCKER_HOST_IP" ]; then
        echo "$DOCKER_HOST_IP"
        return 0
    fi
    
    # 方法3: 通过网络接口
    local docker_ip=$(ip route | grep docker0 | awk '{print $9}' | head -1)
    
    # 返回最合适的IP
    for ip in "$gateway_ip" "$docker_ip"; do
        if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "$ip"
            return 0
        fi
    done
    
    return 1
}

# 主函数
main() {
    local ip=""
    
    if is_docker_environment; then
        echo "检测到Docker环境"
        ip=$(get_docker_host_ip)
        if [ $? -eq 0 ] && [ -n "$ip" ]; then
            echo "Docker宿主机IP: $ip"
        else
            echo "无法获取Docker宿主机IP，尝试获取容器IP"
            ip=$(get_primary_ip)
        fi
    else
        echo "本地环境"
        ip=$(get_primary_ip)
    fi
    
    if [ -n "$ip" ]; then
        echo "检测到的IP地址: $ip"
        echo "$ip"
    else
        echo "无法检测到有效的IP地址"
        exit 1
    fi
}

# 如果直接运行脚本
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi