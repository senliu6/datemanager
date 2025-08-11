#!/bin/bash

# ===========================================
# 数据管理平台 - 网络环境部署脚本
# 功能：支持不同网络环境的自动部署
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

# 检测网络环境
detect_network_environment() {
    log "检测网络环境..."
    
    local current_ip=$(hostname -I | awk '{print $1}')
    local network_type=""
    
    if [[ $current_ip =~ ^192\.168\. ]]; then
        network_type="home"
        log "检测到家庭网络环境: $current_ip"
    elif [[ $current_ip =~ ^10\. ]]; then
        network_type="corporate"
        log "检测到企业网络环境: $current_ip"
    elif [[ $current_ip =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]]; then
        network_type="docker"
        log "检测到Docker网络环境: $current_ip"
    else
        network_type="public"
        log "检测到公网环境: $current_ip"
    fi
    
    echo "$network_type:$current_ip"
}

# 扫描网络中的潜在服务器
scan_network_servers() {
    local current_ip="$1"
    local network_prefix=$(echo $current_ip | cut -d'.' -f1-3)
    
    log "扫描网络中的数据管理平台服务器..."
    
    local found_servers=()
    local scan_ips=(
        "$current_ip"                    # 本机
        "${network_prefix}.1"            # 网关
        "${network_prefix}.10"           # 常见服务器IP
        "${network_prefix}.94"           # 你当前的服务器IP
        "${network_prefix}.100"          # 常见服务器IP
        "${network_prefix}.200"          # 常见服务器IP
    )
    
    echo "🔍 扫描IP范围: ${network_prefix}.x"
    
    for ip in "${scan_ips[@]}"; do
        # 检查Web服务
        if timeout 2 curl -s "http://$ip:3001/api/health" | grep -q "healthy" 2>/dev/null; then
            found_servers+=("$ip:web")
            log_success "发现Web服务: $ip:3001"
        fi
        
        # 检查SSH服务
        if timeout 2 nc -z "$ip" 22 2>/dev/null; then
            found_servers+=("$ip:ssh")
            log_success "发现SSH服务: $ip:22"
        fi
    done
    
    if [ ${#found_servers[@]} -gt 0 ]; then
        echo "找到的服务器:"
        printf '%s\n' "${found_servers[@]}"
    else
        log_warning "未找到现有的数据管理平台服务器"
    fi
    
    echo "${found_servers[@]}"
}

# 选择部署模式
choose_deployment_mode() {
    local found_servers="$1"
    
    echo ""
    echo "请选择部署模式："
    echo "1. 本地部署 (直接在当前机器运行)"
    echo "2. Docker部署 (推荐，容器化部署)"
    echo "3. 连接现有服务器 (如果网络中已有服务器)"
    echo ""
    
    if [ -n "$found_servers" ]; then
        echo "检测到现有服务器："
        echo "$found_servers"
        echo ""
    fi
    
    while true; do
        read -p "请选择部署模式 (1-3): " choice
        case $choice in
            1)
                echo "local"
                return 0
                ;;
            2)
                echo "docker"
                return 0
                ;;
            3)
                if [ -n "$found_servers" ]; then
                    echo "existing"
                    return 0
                else
                    log_error "未检测到现有服务器"
                fi
                ;;
            *)
                log_error "无效选择，请输入1-3"
                ;;
        esac
    done
}

# 本地部署
deploy_local() {
    local current_ip="$1"
    
    log "开始本地部署..."
    
    # 检查Node.js环境
    if ! command -v node &> /dev/null; then
        log_error "Node.js未安装，请先安装Node.js"
        echo "安装方法："
        echo "  Ubuntu: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
        echo "  macOS: brew install node"
        return 1
    fi
    
    # 安装依赖
    log "安装依赖..."
    npm install
    cd server && npm install && cd ..
    
    # 构建前端
    log "构建前端..."
    npm run build
    
    # 设置上传用户
    if [ ! -f "setup_upload_user.sh" ]; then
        log_error "setup_upload_user.sh 脚本不存在"
        return 1
    fi
    
    log "设置上传用户..."
    sudo ./setup_upload_user.sh
    
    # 启动服务
    log "启动服务..."
    cd server
    nohup npm run dev > ../server.log 2>&1 &
    SERVER_PID=$!
    cd ..
    
    # 等待服务启动
    sleep 5
    
    if curl -s "http://$current_ip:3001/api/health" | grep -q "healthy"; then
        log_success "本地部署成功"
        echo "Web访问: http://$current_ip:3001"
        echo "服务PID: $SERVER_PID"
        
        # 保存PID
        echo "$SERVER_PID" > server.pid
        
        return 0
    else
        log_error "本地部署失败"
        return 1
    fi
}

# Docker部署
deploy_docker() {
    log "开始Docker部署..."
    
    if [ ! -f "container-deploy.sh" ]; then
        log_error "container-deploy.sh 脚本不存在"
        return 1
    fi
    
    chmod +x container-deploy.sh
    ./container-deploy.sh
    
    return $?
}

# 连接现有服务器
connect_existing() {
    local found_servers="$1"
    
    log "连接现有服务器..."
    
    # 解析服务器列表
    local servers=($(echo "$found_servers" | tr ' ' '\n' | grep ":web" | cut -d':' -f1))
    
    if [ ${#servers[@]} -eq 0 ]; then
        log_error "未找到可用的Web服务器"
        return 1
    fi
    
    local server_ip="${servers[0]}"
    log "连接到服务器: $server_ip"
    
    # 测试连接
    if curl -s "http://$server_ip:3001/api/health" | grep -q "healthy"; then
        log_success "连接成功"
        echo "Web访问: http://$server_ip:3001"
        
        # 创建用户上传脚本
        create_user_upload_script "$server_ip"
        
        return 0
    else
        log_error "连接失败"
        return 1
    fi
}

# 创建用户上传脚本
create_user_upload_script() {
    local server_ip="$1"
    
    log "创建用户上传脚本..."
    
    # 创建针对特定服务器的上传脚本
    if [ -f "auto_upload.sh" ]; then
        local script_name="upload_to_${server_ip//./_}.sh"
        
        # 复制并修改脚本
        cp auto_upload.sh "$script_name"
        
        # 在脚本中硬编码服务器IP
        sed -i "s/detect_server_ip()/echo \"$server_ip\"/" "$script_name"
        
        chmod +x "$script_name"
        
        log_success "创建上传脚本: $script_name"
        
        # 创建使用说明
        cat > "upload_instructions_${server_ip//./_}.txt" << EOF
数据管理平台 - 上传工具使用说明
================================

服务器信息:
- IP地址: $server_ip
- Web界面: http://$server_ip:3001
- SSH端口: 22

使用方法:
1. 将 $script_name 复制到要上传的文件夹中
2. 运行脚本: ./$script_name
3. 按提示完成上传

首次使用需要配置SSH密钥，请联系管理员。

创建时间: $(date)
EOF
        
        log_success "创建使用说明: upload_instructions_${server_ip//./_}.txt"
    fi
}

# 显示部署结果
show_deployment_result() {
    local mode="$1"
    local server_ip="$2"
    local status="$3"
    
    echo ""
    echo "========================================"
    echo "    数据管理平台 - 部署结果"
    echo "========================================"
    
    if [ "$status" = "success" ]; then
        echo "✅ 部署成功！"
        echo ""
        echo "部署模式: $mode"
        echo "服务器IP: $server_ip"
        echo "Web访问: http://$server_ip:3001"
        echo ""
        
        case $mode in
            "local")
                echo "管理命令:"
                echo "  - 停止服务: kill \$(cat server.pid)"
                echo "  - 查看日志: tail -f server.log"
                ;;
            "docker")
                echo "管理命令:"
                echo "  - 查看日志: docker logs datemanager-app"
                echo "  - 停止容器: docker-compose down"
                ;;
            "existing")
                echo "连接信息:"
                echo "  - 使用现有服务器"
                echo "  - 上传脚本已创建"
                ;;
        esac
        
        echo ""
        echo "用户上传工具:"
        ls -la upload_to_*.sh 2>/dev/null || echo "  - 请使用 auto_upload.sh"
        
    else
        echo "❌ 部署失败！"
        echo ""
        echo "请检查错误信息并重试"
    fi
    
    echo "========================================"
}

# 主函数
main() {
    echo "========================================"
    echo "  数据管理平台 - 智能部署脚本"
    echo "========================================"
    echo ""
    
    # 检测网络环境
    local network_info=$(detect_network_environment)
    local network_type=$(echo "$network_info" | cut -d':' -f1)
    local current_ip=$(echo "$network_info" | cut -d':' -f2)
    
    # 扫描网络服务器
    local found_servers=$(scan_network_servers "$current_ip")
    
    # 选择部署模式
    local deployment_mode=$(choose_deployment_mode "$found_servers")
    
    echo ""
    log "选择的部署模式: $deployment_mode"
    
    # 执行部署
    local deployment_status="failed"
    
    case $deployment_mode in
        "local")
            if deploy_local "$current_ip"; then
                deployment_status="success"
            fi
            ;;
        "docker")
            if deploy_docker; then
                deployment_status="success"
            fi
            ;;
        "existing")
            if connect_existing "$found_servers"; then
                deployment_status="success"
            fi
            ;;
    esac
    
    # 显示结果
    show_deployment_result "$deployment_mode" "$current_ip" "$deployment_status"
    
    if [ "$deployment_status" = "success" ]; then
        exit 0
    else
        exit 1
    fi
}

# 处理中断信号
trap 'log "部署被中断"; exit 1' INT TERM

# 执行主函数
main "$@"