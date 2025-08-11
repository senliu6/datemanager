#!/bin/bash

# ===========================================
# 数据管理平台 - Docker容器部署脚本
# 功能：自动部署和配置Docker容器
# ===========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# 获取宿主机IP
get_host_ip() {
    local ip=""
    
    # 方法1: 获取主要网络接口IP
    ip=$(hostname -I | awk '{print $1}')
    
    # 方法2: 通过路由表获取
    if [[ ! $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        ip=$(ip route get 8.8.8.8 | grep -oP 'src \K\S+')
    fi
    
    # 方法3: 通过ifconfig获取
    if [[ ! $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        ip=$(ifconfig | grep -E 'inet.*broadcast' | awk '{print $2}' | head -1)
    fi
    
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && [[ $ip != "127.0.0.1" ]]; then
        echo "$ip"
    else
        echo "localhost"
    fi
}

# 检查Docker环境
check_docker() {
    log "检查Docker环境..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        echo "安装方法："
        echo "  Ubuntu: curl -fsSL https://get.docker.com | sh"
        echo "  CentOS: curl -fsSL https://get.docker.com | sh"
        echo "  macOS: 下载Docker Desktop"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker服务未运行，请启动Docker服务"
        exit 1
    fi
    
    log_success "Docker环境检查通过"
}

# 停止现有容器
stop_existing_containers() {
    log "停止现有容器..."
    
    if docker ps -q --filter "name=datemanager-app" | grep -q .; then
        docker stop datemanager-app
        log_success "已停止现有容器"
    fi
    
    if docker ps -aq --filter "name=datemanager-app" | grep -q .; then
        docker rm datemanager-app
        log_success "已删除现有容器"
    fi
}

# 构建Docker镜像
build_image() {
    log "构建Docker镜像..."
    
    # 确保docker-entrypoint.sh有执行权限
    chmod +x docker-entrypoint.sh
    
    docker-compose build --no-cache
    
    if [ $? -eq 0 ]; then
        log_success "Docker镜像构建成功"
    else
        log_error "Docker镜像构建失败"
        exit 1
    fi
}

# 启动容器
start_container() {
    local host_ip="$1"
    
    log "启动Docker容器..."
    
    # 设置环境变量
    export DOCKER_HOST_IP="$host_ip"
    
    # 启动容器
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        log_success "Docker容器启动成功"
    else
        log_error "Docker容器启动失败"
        exit 1
    fi
}

# 等待服务启动
wait_for_service() {
    local host_ip="$1"
    local max_attempts=30
    local attempt=1
    
    log "等待服务启动..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://$host_ip:3001/api/health" | grep -q "healthy"; then
            log_success "服务启动成功"
            return 0
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    log_error "服务启动超时"
    return 1
}

# 获取容器信息
get_container_info() {
    local host_ip="$1"
    
    log "获取容器信息..."
    
    # 获取容器ID
    local container_id=$(docker ps -q --filter "name=datemanager-app")
    
    if [ -n "$container_id" ]; then
        # 获取上传用户信息
        local upload_info=$(docker exec $container_id cat /app/upload_user_info.txt 2>/dev/null || echo "信息获取失败")
        
        echo ""
        echo "========================================"
        echo "    数据管理平台 - 部署完成"
        echo "========================================"
        echo "宿主机IP: $host_ip"
        echo "Web访问: http://$host_ip:3001"
        echo "SSH端口: $host_ip:22"
        echo "容器ID: $container_id"
        echo ""
        echo "上传用户信息："
        echo "$upload_info"
        echo "========================================"
        echo ""
        
        # 保存部署信息
        cat > deployment_info.txt << EOF
数据管理平台 - Docker部署信息
======================================
部署时间: $(date)
宿主机IP: $host_ip
Web访问: http://$host_ip:3001
SSH端口: $host_ip:22
容器ID: $container_id

上传用户信息:
$upload_info

使用说明:
1. 访问Web界面: http://$host_ip:3001
2. 使用上传脚本连接到: $host_ip:22
3. 查看容器日志: docker logs datemanager-app
4. 进入容器: docker exec -it datemanager-app bash
======================================
EOF
        
        log_success "部署信息已保存到 deployment_info.txt"
    else
        log_error "无法获取容器信息"
    fi
}

# 创建用户上传脚本
create_user_scripts() {
    local host_ip="$1"
    
    log "创建用户上传脚本..."
    
    # 更新auto_upload.sh中的服务器IP检测逻辑
    if [ -f "auto_upload.sh" ]; then
        # 创建针对当前部署的上传脚本
        sed "s/SERVER_HOST=\".*\"/SERVER_HOST=\"$host_ip\"/" auto_upload.sh > "upload_to_${host_ip//./_}.sh"
        chmod +x "upload_to_${host_ip//./_}.sh"
        
        log_success "创建专用上传脚本: upload_to_${host_ip//./_}.sh"
    fi
    
    # 更新用户包
    if [ -d "user_upload_package" ]; then
        cp "upload_to_${host_ip//./_}.sh" user_upload_package/ 2>/dev/null || true
        
        # 更新README
        cat > user_upload_package/README_DOCKER.txt << EOF
数据管理平台 - Docker部署版上传工具
====================================

🚀 快速开始：
1. 使用 upload_to_${host_ip//./_}.sh 脚本
2. 将脚本复制到要上传的文件夹中
3. 运行脚本: ./upload_to_${host_ip//./_}.sh

🔧 服务器信息：
- 服务器IP: $host_ip
- SSH端口: 22
- Web界面: http://$host_ip:3001

📞 如有问题请联系系统管理员。
EOF
        
        log_success "更新用户上传包"
    fi
}

# 显示使用说明
show_usage_instructions() {
    local host_ip="$1"
    
    echo ""
    echo "🎉 数据管理平台部署完成！"
    echo ""
    echo "📋 使用说明："
    echo "1. Web界面访问: http://$host_ip:3001"
    echo "2. 用户上传脚本: ./upload_to_${host_ip//./_}.sh"
    echo "3. 容器管理命令:"
    echo "   - 查看日志: docker logs datemanager-app"
    echo "   - 进入容器: docker exec -it datemanager-app bash"
    echo "   - 停止容器: docker-compose down"
    echo "   - 重启容器: docker-compose restart"
    echo ""
    echo "📁 重要文件："
    echo "   - deployment_info.txt (部署信息)"
    echo "   - user_upload_package/ (用户上传工具)"
    echo ""
}

# 主函数
main() {
    echo "========================================"
    echo "  数据管理平台 - Docker部署脚本"
    echo "========================================"
    echo ""
    
    # 获取宿主机IP
    local host_ip=$(get_host_ip)
    log "检测到宿主机IP: $host_ip"
    
    # 检查Docker环境
    check_docker
    
    # 停止现有容器
    stop_existing_containers
    
    # 构建镜像
    build_image
    
    # 启动容器
    start_container "$host_ip"
    
    # 等待服务启动
    if wait_for_service "$host_ip"; then
        # 获取容器信息
        get_container_info "$host_ip"
        
        # 创建用户脚本
        create_user_scripts "$host_ip"
        
        # 显示使用说明
        show_usage_instructions "$host_ip"
    else
        log_error "部署失败，请检查容器日志"
        docker logs datemanager-app
        exit 1
    fi
}

# 处理中断信号
trap 'log "部署被中断"; exit 1' INT TERM

# 执行主函数
main "$@"