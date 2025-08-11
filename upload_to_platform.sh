#!/bin/bash

# 数据管理平台 - 本地文件夹上传脚本
# 使用rsync将本地大文件夹同步到服务器

# ===========================================
# 配置参数 - 请根据实际情况修改
# ===========================================

# 服务器配置
SERVER_HOST="10.30.10.9"          # 服务器IP地址
SERVER_PORT="22"                   # SSH端口
SERVER_USER="your_username"        # 服务器用户名
REMOTE_PATH="/app/Uploads"         # 服务器目标路径

# 本地配置
LOCAL_PATH="/path/to/your/folder"  # 本地文件夹路径（请修改为实际路径）

# 同步选项
RSYNC_OPTIONS="-avz --progress --stats"  # rsync参数
EXCLUDE_PATTERNS=(                 # 排除的文件模式
    "*.tmp"
    "*.log" 
    ".DS_Store"
    "Thumbs.db"
    "*.swp"
    "*.bak"
)

# ===========================================
# 脚本开始
# ===========================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查参数
check_config() {
    log_info "检查配置参数..."
    
    if [ "$SERVER_HOST" = "10.30.10.9" ] || [ "$SERVER_USER" = "your_username" ] || [ "$LOCAL_PATH" = "/path/to/your/folder" ]; then
        log_error "请先修改脚本中的配置参数！"
        log_info "需要修改的参数："
        echo "  - SERVER_HOST: 服务器IP地址"
        echo "  - SERVER_USER: 服务器用户名"
        echo "  - LOCAL_PATH: 本地文件夹路径"
        exit 1
    fi
    
    if [ ! -d "$LOCAL_PATH" ]; then
        log_error "本地路径不存在: $LOCAL_PATH"
        exit 1
    fi
    
    log_success "配置检查通过"
}

# 测试连接
test_connection() {
    log_info "测试服务器连接..."
    
    if ssh -p "$SERVER_PORT" -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_USER@$SERVER_HOST" exit 2>/dev/null; then
        log_success "服务器连接正常"
    else
        log_error "无法连接到服务器 $SERVER_USER@$SERVER_HOST:$SERVER_PORT"
        log_info "请检查："
        echo "  1. 服务器地址和端口是否正确"
        echo "  2. SSH密钥是否已配置"
        echo "  3. 网络连接是否正常"
        exit 1
    fi
}

# 检查远程目录
check_remote_path() {
    log_info "检查远程目录..."
    
    if ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_HOST" "[ -d '$REMOTE_PATH' ]" 2>/dev/null; then
        log_success "远程目录存在: $REMOTE_PATH"
    else
        log_warning "远程目录不存在，尝试创建: $REMOTE_PATH"
        if ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_PATH'" 2>/dev/null; then
            log_success "远程目录创建成功"
        else
            log_error "无法创建远程目录，请检查权限"
            exit 1
        fi
    fi
}

# 计算本地文件夹大小
calculate_size() {
    log_info "计算本地文件夹大小..."
    
    local size=$(du -sh "$LOCAL_PATH" 2>/dev/null | cut -f1)
    local count=$(find "$LOCAL_PATH" -type f 2>/dev/null | wc -l)
    
    log_info "本地文件夹信息："
    echo "  路径: $LOCAL_PATH"
    echo "  大小: $size"
    echo "  文件数: $count"
}

# 构建rsync命令
build_rsync_command() {
    local cmd="rsync $RSYNC_OPTIONS"
    
    # 添加SSH选项
    cmd="$cmd -e 'ssh -p $SERVER_PORT'"
    
    # 添加排除模式
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        cmd="$cmd --exclude='$pattern'"
    done
    
    # 添加源和目标
    cmd="$cmd '$LOCAL_PATH/' '$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/'"
    
    echo "$cmd"
}

# 执行同步
perform_sync() {
    log_info "开始同步文件..."
    log_info "源路径: $LOCAL_PATH"
    log_info "目标路径: $SERVER_USER@$SERVER_HOST:$REMOTE_PATH"
    
    # 构建rsync命令
    local rsync_cmd
    rsync_cmd=$(build_rsync_command)
    
    log_info "执行命令: $rsync_cmd"
    echo ""
    
    # 记录开始时间
    local start_time=$(date +%s)
    
    # 执行rsync
    eval "$rsync_cmd"
    local exit_code=$?
    
    # 记录结束时间
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    if [ $exit_code -eq 0 ]; then
        log_success "同步完成！"
        log_info "耗时: ${duration}秒"
    else
        log_error "同步失败，退出码: $exit_code"
        exit $exit_code
    fi
}

# 显示帮助信息
show_help() {
    echo "数据管理平台 - 文件夹上传脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  -n, --dry-run  预览模式，不实际传输文件"
    echo "  -v, --verbose  详细输出模式"
    echo ""
    echo "配置文件中需要修改的参数:"
    echo "  SERVER_HOST    服务器IP地址"
    echo "  SERVER_USER    服务器用户名"
    echo "  LOCAL_PATH     本地文件夹路径"
    echo "  REMOTE_PATH    服务器目标路径"
    echo ""
}

# 主函数
main() {
    echo "========================================"
    echo "  数据管理平台 - 文件夹上传工具"
    echo "========================================"
    echo ""
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -n|--dry-run)
                RSYNC_OPTIONS="$RSYNC_OPTIONS --dry-run"
                log_info "启用预览模式"
                shift
                ;;
            -v|--verbose)
                RSYNC_OPTIONS="$RSYNC_OPTIONS --verbose"
                shift
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 执行检查和同步
    check_config
    test_connection
    check_remote_path
    calculate_size
    
    # 确认执行
    echo ""
    read -p "确认开始同步？(y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        perform_sync
        log_success "所有操作完成！"
    else
        log_info "操作已取消"
        exit 0
    fi
}

# 执行主函数
main "$@"