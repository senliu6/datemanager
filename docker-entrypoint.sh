#!/bin/bash

# ===========================================
# Docker容器启动脚本
# 功能：自动配置SSH服务和上传用户
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

# 获取容器IP地址
get_container_ip() {
    local ip=$(hostname -I | awk '{print $1}')
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo "$ip"
    else
        echo "172.17.0.2"  # Docker默认IP
    fi
}

# 获取宿主机IP地址
get_host_ip() {
    local host_ip=""
    
    # 方法1: 从环境变量获取
    if [ -n "$DOCKER_HOST_IP" ]; then
        host_ip="$DOCKER_HOST_IP"
    else
        # 方法2: 通过网关获取
        host_ip=$(ip route | grep default | awk '{print $3}' | head -1)
    fi
    
    if [[ $host_ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo "$host_ip"
    else
        echo "host.docker.internal"
    fi
}

# 初始化SSH服务
init_ssh_service() {
    log "初始化SSH服务..."
    
    # 安装SSH服务（如果未安装）
    if ! command -v sshd &> /dev/null; then
        log "安装SSH服务..."
        apt-get update -qq
        apt-get install -y -qq openssh-server
    fi
    
    # 创建SSH目录
    mkdir -p /var/run/sshd
    mkdir -p /etc/ssh
    
    # 生成SSH主机密钥（如果不存在）
    if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
        log "生成SSH主机密钥..."
        ssh-keygen -t rsa -b 4096 -f /etc/ssh/ssh_host_rsa_key -N ""
        ssh-keygen -t ecdsa -b 256 -f /etc/ssh/ssh_host_ecdsa_key -N ""
        ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""
    fi
    
    # 配置SSH服务（简化配置，只使用密码认证）
    cat > /etc/ssh/sshd_config << 'EOF'
Port 22
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key

# 认证配置（只使用密码认证）
PasswordAuthentication yes
PermitEmptyPasswords no
PubkeyAuthentication no
ChallengeResponseAuthentication no

# 安全配置
PermitRootLogin no
X11Forwarding no
PrintMotd no
UsePAM yes
StrictModes no

# 性能配置
ClientAliveInterval 60
ClientAliveCountMax 3
MaxAuthTries 6
MaxSessions 10

# 日志配置
SyslogFacility AUTH
LogLevel INFO
EOF
    
    log_success "SSH服务配置完成"
}

# 创建上传用户
create_upload_user() {
    log "创建上传用户..."
    
    local upload_user="upload"
    local upload_password="upload123"
    
    # 删除已存在的用户
    if id "$upload_user" &>/dev/null; then
        userdel -r "$upload_user" 2>/dev/null || true
    fi
    
    # 创建新用户
    useradd -m -s /bin/bash "$upload_user"
    echo "$upload_user:$upload_password" | chpasswd
    
    # 设置上传目录权限
    mkdir -p /app/Uploads
    chown -R "$upload_user:$upload_user" /app/Uploads
    chmod 755 /app/Uploads
    
    # 保存用户信息
    cat > /app/upload_user_info.txt << EOF
用户: $upload_user
密码: $upload_password
创建时间: $(date)
上传目录: /app/Uploads
EOF
    
    log_success "上传用户创建完成"
    log_success "用户名: $upload_user"
    log_success "密码: $upload_password"
}

# 创建管理脚本
create_management_scripts() {
    log "创建管理脚本..."
    
    # 添加公钥脚本
    cat > /usr/local/bin/add_upload_key.sh << 'EOF'
#!/bin/bash
UPLOAD_USER="upload_user"
AUTHORIZED_KEYS="/home/$UPLOAD_USER/.ssh/authorized_keys"

if [ $# -ne 1 ]; then
    echo "使用方法: $0 <公钥文件或公钥内容>"
    exit 1
fi

if [ -f "$1" ]; then
    cat "$1" >> "$AUTHORIZED_KEYS"
    echo "已添加公钥文件: $1"
else
    echo "$1" >> "$AUTHORIZED_KEYS"
    echo "已添加公钥内容"
fi

chown "$UPLOAD_USER:$UPLOAD_USER" "$AUTHORIZED_KEYS"
chmod 600 "$AUTHORIZED_KEYS"
echo "公钥添加完成"
EOF
    
    chmod +x /usr/local/bin/add_upload_key.sh
    
    # 上传统计脚本
    cat > /usr/local/bin/upload_stats.sh << 'EOF'
#!/bin/bash
UPLOAD_DIR="/app/Uploads"

echo "========================================"
echo "        上传统计信息"
echo "========================================"
echo ""

if [ -d "$UPLOAD_DIR" ]; then
    echo "📁 上传目录: $UPLOAD_DIR"
    echo "📊 总大小: $(du -sh "$UPLOAD_DIR" | cut -f1)"
    echo "📄 文件数量: $(find "$UPLOAD_DIR" -type f | wc -l)"
    echo "📂 目录数量: $(find "$UPLOAD_DIR" -type d | wc -l)"
    echo ""
    
    echo "最近上传的文件："
    find "$UPLOAD_DIR" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -10 | while read timestamp file; do
        date_str=$(date -d "@$timestamp" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r "$timestamp" '+%Y-%m-%d %H:%M:%S')
        size=$(du -h "$file" | cut -f1)
        echo "  $date_str - $size - $(basename "$file")"
    done
else
    echo "上传目录不存在: $UPLOAD_DIR"
fi
EOF
    
    chmod +x /usr/local/bin/upload_stats.sh
    
    log_success "管理脚本创建完成"
}

# 启动SSH服务
start_ssh_service() {
    log "启动SSH服务..."
    
    # 启动SSH守护进程
    /usr/sbin/sshd -D &
    SSH_PID=$!
    
    # 等待SSH服务启动
    sleep 2
    
    if kill -0 $SSH_PID 2>/dev/null; then
        log_success "SSH服务启动成功 (PID: $SSH_PID)"
    else
        log_error "SSH服务启动失败"
        exit 1
    fi
}

# 显示容器信息
show_container_info() {
    local container_ip=$(get_container_ip)
    local host_ip=$(get_host_ip)
    
    echo ""
    echo "========================================"
    echo "    数据管理平台 - Docker容器信息"
    echo "========================================"
    echo "容器IP: $container_ip"
    echo "宿主机IP: $host_ip"
    echo "Web访问: http://$host_ip:3001"
    echo "SSH端口: $host_ip:22"
    echo "上传用户: upload_user"
    echo "配置文件: /app/upload_user_info.txt"
    echo "========================================"
    echo ""
    
    # 保存IP信息到文件
    cat > /app/container_info.txt << EOF
容器IP: $container_ip
宿主机IP: $host_ip
Web访问: http://$host_ip:3001
SSH端口: $host_ip:22
启动时间: $(date)
EOF
}

# 主函数
main() {
    log "开始初始化Docker容器..."
    
    # 初始化SSH服务
    init_ssh_service
    
    # 创建上传用户
    create_upload_user
    
    # 创建管理脚本
    create_management_scripts
    
    # 启动SSH服务
    start_ssh_service
    
    # 显示容器信息
    show_container_info
    
    log_success "Docker容器初始化完成"
    
    # 启动主应用
    log "启动数据管理平台..."
    cd /app
    exec node server/app.js
}

# 处理信号
trap 'log "收到终止信号，正在关闭..."; kill $SSH_PID 2>/dev/null; exit 0' TERM INT

# 执行主函数
main "$@"