#!/bin/bash

# ===========================================
# 数据管理平台 - 超简单一键上传脚本
# 功能：自动检测服务器，一键上传当前目录文件
# 使用：将此脚本放在要上传的文件夹中，运行即可
# ===========================================

# 固定配置
UPLOAD_USER="upload"
UPLOAD_PASS="upload123"
WEB_PORT="3001"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 清屏并显示标题
clear
echo -e "${BLUE}"
echo "================================================"
echo "        数据管理平台 - 一键上传工具"
echo "================================================"
echo -e "${NC}"
echo ""

# 显示当前信息
echo "📁 当前目录: $SCRIPT_DIR"
echo "👤 当前用户: $(whoami)"
echo "💻 主机名: $(hostname)"
echo ""

# 服务器IP配置选项
echo "🔧 服务器配置选项："
echo "  1. 自动检测服务器IP（推荐）"
echo "  2. 手动输入服务器IP"
echo ""
read -p "请选择配置方式 (1/2，默认1): " CONFIG_CHOICE

if [ "$CONFIG_CHOICE" = "2" ]; then
    echo ""
    echo "📝 手动配置服务器IP"
    
    # 循环输入直到连接成功或用户选择退出
    while true; do
        read -p "请输入服务器IP地址 (输入 'q' 退出): " MANUAL_SERVER_IP
        
        if [ "$MANUAL_SERVER_IP" = "q" ] || [ "$MANUAL_SERVER_IP" = "Q" ]; then
            echo "用户取消操作，退出"
            exit 0
        fi
        
        if [ -z "$MANUAL_SERVER_IP" ]; then
            echo -e "${YELLOW}⚠️  IP地址不能为空，请重新输入${NC}"
            continue
        fi
        
        # 简单的IP格式验证
        if ! echo "$MANUAL_SERVER_IP" | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$|^localhost$' > /dev/null; then
            echo -e "${YELLOW}⚠️  IP地址格式不正确，请输入正确的IP地址（如：192.168.1.100）${NC}"
            continue
        fi
        
        echo -n "测试 $MANUAL_SERVER_IP:$WEB_PORT ... "
        
        # 测试连接并显示详细错误信息
        HEALTH_RESPONSE=$(timeout 10 curl -s "http://$MANUAL_SERVER_IP:$WEB_PORT/api/health" 2>&1)
        CURL_EXIT_CODE=$?
        
        if [ $CURL_EXIT_CODE -eq 0 ] && echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
            echo -e "${GREEN}✅ 服务器连接成功${NC}"
            SERVER_IP="$MANUAL_SERVER_IP"
            break
        else
            echo -e "${RED}❌ 连接失败${NC}"
            echo ""
            echo "错误详情："
            
            case $CURL_EXIT_CODE in
                7)
                    echo "  - 无法连接到服务器，请检查："
                    echo "    1. IP地址是否正确"
                    echo "    2. 服务器是否已启动"
                    echo "    3. 网络连接是否正常"
                    ;;
                28)
                    echo "  - 连接超时，可能原因："
                    echo "    1. 服务器响应缓慢"
                    echo "    2. 网络延迟过高"
                    echo "    3. 防火墙阻止连接"
                    ;;
                *)
                    echo "  - 连接错误 (代码: $CURL_EXIT_CODE)"
                    if [ -n "$HEALTH_RESPONSE" ]; then
                        echo "  - 响应内容: $HEALTH_RESPONSE"
                    fi
                    ;;
            esac
            
            echo ""
            echo "建议："
            echo "  1. 确认服务器IP地址正确"
            echo "  2. 确认数据管理平台服务已启动"
            echo "  3. 尝试在浏览器中访问 http://$MANUAL_SERVER_IP:$WEB_PORT"
            echo "  4. 检查防火墙设置"
            echo ""
        fi
    done
else
    echo ""
    echo "🔍 正在自动检测数据管理平台服务器..."
    
    # 获取本机IP网段
    if command -v hostname &> /dev/null; then
        LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi

    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
    fi

    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP="192.168.1.100"  # 默认值
    fi

    NETWORK_PREFIX=$(echo $LOCAL_IP | cut -d'.' -f1-3)

    echo "本机IP: $LOCAL_IP"
    echo "扫描网段: ${NETWORK_PREFIX}.x"

    # 扫描常见的服务器IP
    SCAN_IPS=(
        "$LOCAL_IP"                    # 本机
        "${NETWORK_PREFIX}.1"          # 网关
        "${NETWORK_PREFIX}.94"         # 你的服务器IP
        "${NETWORK_PREFIX}.10"         # 常见服务器IP
        "${NETWORK_PREFIX}.100"        # 常见服务器IP
        "${NETWORK_PREFIX}.200"        # 常见服务器IP
        "127.0.0.1"                    # 本地回环
        "localhost"                    # 本地主机
    )

    SERVER_IP=""
    for ip in "${SCAN_IPS[@]}"; do
        echo -n "测试 $ip:$WEB_PORT ... "
        
        # 测试Web服务健康检查
        if timeout 3 curl -s "http://$ip:$WEB_PORT/api/health" 2>/dev/null | grep -q "healthy"; then
            echo -e "${GREEN}✅ 发现数据管理平台${NC}"
            SERVER_IP="$ip"
            break
        else
            echo "❌"
        fi
    done

    # 如果没有自动检测到，手动输入
    if [ -z "$SERVER_IP" ]; then
        echo ""
        echo -e "${YELLOW}⚠️  自动检测失败，请手动输入服务器IP地址${NC}"
        echo ""
        read -p "请输入服务器IP: " SERVER_IP
        
        if [ -z "$SERVER_IP" ]; then
            echo -e "${RED}❌ 未输入服务器IP，退出${NC}"
            read -p "按回车键退出..."
            exit 1
        fi
    fi
fi

echo ""
echo "🌐 目标服务器: http://$SERVER_IP:$WEB_PORT"
echo ""

# 扫描本地文件（递归扫描所有文件夹）
echo "📂 扫描本地文件..."

FILE_LIST=()
TOTAL_SIZE=0

while IFS= read -r -d '' file; do
    filename=$(basename "$file")
    # 排除脚本自身和临时文件
    if [[ "$filename" != "$SCRIPT_NAME" ]] && [[ "$filename" != "upload.log" ]] && [[ "$filename" != .* ]]; then
        FILE_LIST+=("$file")
        if command -v stat &> /dev/null; then
            SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
            ((TOTAL_SIZE+=SIZE))
        fi
    fi
done < <(find "$SCRIPT_DIR" -type f -print0 2>/dev/null)

FILE_COUNT=${#FILE_LIST[@]}

# 格式化大小显示
if [ $TOTAL_SIZE -lt 1024 ]; then
    SIZE_STR="${TOTAL_SIZE}B"
elif [ $TOTAL_SIZE -lt 1048576 ]; then
    SIZE_STR="$((TOTAL_SIZE / 1024))KB"
elif [ $TOTAL_SIZE -lt 1073741824 ]; then
    SIZE_STR="$((TOTAL_SIZE / 1048576))MB"
else
    SIZE_STR="$((TOTAL_SIZE / 1073741824))GB"
fi

echo "📄 找到文件: $FILE_COUNT 个"
echo "📊 总大小: $SIZE_STR"

if [ $FILE_COUNT -eq 0 ]; then
    echo -e "${YELLOW}⚠️  当前目录没有可上传的文件${NC}"
    read -p "按回车键退出..."
    exit 1
fi

echo ""

# 显示文件列表
echo "文件列表："
for i in "${!FILE_LIST[@]}"; do
    if [ $i -lt 5 ]; then
        filename=$(basename "${FILE_LIST[$i]}")
        echo "  📄 $filename"
    fi
done

if [ $FILE_COUNT -gt 5 ]; then
    echo "  ... 还有 $((FILE_COUNT - 5)) 个文件"
fi

echo ""

# 确认上传
echo -e "${YELLOW}⚠️  准备上传当前目录的所有文件到数据管理平台${NC}"
echo ""
echo "确认信息："
echo "  📁 本地目录: $SCRIPT_DIR"
echo "  🌐 服务器: http://$SERVER_IP:$WEB_PORT"
echo "  📄 文件数量: $FILE_COUNT"
echo "  📊 总大小: $SIZE_STR"
echo ""

while true; do
    read -p "确认开始上传？(y/n): " yn
    case $yn in
        [Yy]* ) break;;
        [Nn]* ) echo "上传已取消"; exit 0;;
        * ) echo "请输入 y 或 n";;
    esac
done

echo ""

# 测试服务器连接
echo "🔗 测试服务器连接..."

if timeout 5 curl -s "http://$SERVER_IP:$WEB_PORT/api/health" | grep -q "healthy"; then
    echo -e "${GREEN}✅ 服务器连接正常${NC}"
else
    echo -e "${RED}❌ 无法连接到服务器${NC}"
    echo ""
    echo "可能的原因："
    echo "1. 服务器IP地址错误"
    echo "2. 网络连接问题"
    echo "3. 服务器未启动"
    echo ""
    read -p "按回车键退出..."
    exit 1
fi

echo ""

# 开始上传文件
echo "🚀 开始上传文件..."
echo ""

# 记录开始时间
START_TIME=$(date +%s)

# 生成认证头
AUTH_HEADER=$(echo -n "$UPLOAD_USER:$UPLOAD_PASS" | base64)

SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_FILES=()

# 逐个上传文件
for file in "${FILE_LIST[@]}"; do
    filename=$(basename "$file")
    # 计算相对路径作为文件夹路径
    relative_path=$(dirname "${file#$SCRIPT_DIR/}")
    if [ "$relative_path" = "." ]; then
        folder_path="根目录"
    else
        folder_path="$relative_path"
    fi
    
    # 获取文件大小
    if command -v stat &> /dev/null; then
        file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    else
        file_size=0
    fi
    
    echo -n "📤 检查 $filename (${folder_path}) ... "
    
    # 先检查文件是否已存在
    CHECK_RESPONSE=$(curl -s -X POST \
        -H "X-Simple-Auth: $AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "{\"fileName\":\"$filename\",\"fileSize\":$file_size,\"folderPath\":\"$folder_path\"}" \
        "http://$SERVER_IP:$WEB_PORT/api/check-file" 2>/dev/null)
    
    # 检查文件是否已存在
    if echo "$CHECK_RESPONSE" | grep -q '"exists":true'; then
        echo -e "${YELLOW}⏭️ 已存在，跳过${NC}"
        ((SUCCESS_COUNT++))
        continue
    fi
    
    echo -n "上传中 ... "
    
    # 使用curl上传文件，保持文件夹结构
    RESPONSE=$(curl -s -X POST \
        -H "X-Simple-Auth: $AUTH_HEADER" \
        -F "file=@$file" \
        -F "folderPath=$folder_path" \
        "http://$SERVER_IP:$WEB_PORT/api/upload" 2>/dev/null)
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✅${NC}"
        ((SUCCESS_COUNT++))
    else
        echo -e "${RED}❌${NC}"
        ((FAILED_COUNT++))
        FAILED_FILES+=("$filename")
        
        # 显示错误信息
        ERROR_MSG=$(echo "$RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$ERROR_MSG" ]; then
            echo "     错误: $ERROR_MSG"
        fi
    fi
done

# 记录结束时间
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "================================================"

if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 所有文件上传成功！${NC}"
else
    echo -e "${YELLOW}⚠️  部分文件上传失败${NC}"
fi

echo ""
echo "📊 上传统计："
echo "  ✅ 成功: $SUCCESS_COUNT 个文件"
echo "  ❌ 失败: $FAILED_COUNT 个文件"
echo "  ⏱️  耗时: ${DURATION}秒"
echo "  📁 本地目录: $SCRIPT_DIR"
echo "  🌐 服务器: http://$SERVER_IP:$WEB_PORT"

if [ $FAILED_COUNT -gt 0 ]; then
    echo ""
    echo "失败的文件："
    for failed_file in "${FAILED_FILES[@]}"; do
        echo "  ❌ $failed_file"
    done
fi

echo ""
echo "💡 提示："
echo "  - 可以在浏览器中访问 http://$SERVER_IP:$WEB_PORT 查看上传的文件"
echo "  - 如需重新上传失败的文件，请再次运行此脚本"

# 记录上传信息到日志文件
{
    echo "========================================"
    echo "上传记录 - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================"
    echo "本地目录: $SCRIPT_DIR"
    echo "服务器: http://$SERVER_IP:$WEB_PORT"
    echo "成功文件: $SUCCESS_COUNT"
    echo "失败文件: $FAILED_COUNT"
    echo "总耗时: ${DURATION}秒"
    if [ $FAILED_COUNT -gt 0 ]; then
        echo "失败列表: ${FAILED_FILES[*]}"
    fi
    echo ""
} >> "$SCRIPT_DIR/upload.log"

echo "================================================"
echo ""
read -p "按回车键退出..."

if [ $FAILED_COUNT -eq 0 ]; then
    exit 0
else
    exit 1
fi