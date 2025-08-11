#!/bin/bash

# ===========================================
# 数据管理平台 - 文件注册脚本
# 功能：将上传的文件注册到数据库中
# 运行：在服务器上由upload_user调用
# ===========================================

# 配置参数
UPLOAD_DIR="$1"
NODE_APP_DIR="/home/sen/gitee/datemanager"
REGISTER_API_URL="http://localhost:3001/api/files/register-batch"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志函数
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# 检查参数
if [ -z "$UPLOAD_DIR" ]; then
    echo "使用方法: $0 <上传目录路径>"
    exit 1
fi

if [ ! -d "$UPLOAD_DIR" ]; then
    echo "错误: 目录不存在 $UPLOAD_DIR"
    exit 1
fi

log "开始注册文件: $UPLOAD_DIR"

# 扫描上传目录中的所有文件
FILES_JSON="["
FIRST_FILE=true

while IFS= read -r -d '' file; do
    if [ -f "$file" ]; then
        # 获取文件信息
        FILENAME=$(basename "$file")
        FILESIZE=$(stat -c%s "$file" 2>/dev/null || echo 0)
        FILEPATH="$file"
        
        # 从路径中提取文件夹信息
        RELATIVE_PATH="${file#$UPLOAD_DIR/}"
        FOLDER_PATH=$(dirname "$RELATIVE_PATH")
        if [ "$FOLDER_PATH" = "." ]; then
            FOLDER_PATH="未分类"
        fi
        
        # 构建JSON
        if [ "$FIRST_FILE" = false ]; then
            FILES_JSON="$FILES_JSON,"
        fi
        
        FILES_JSON="$FILES_JSON{
            \"originalName\": \"$FILENAME\",
            \"size\": $FILESIZE,
            \"path\": \"$FILEPATH\",
            \"folderPath\": \"$FOLDER_PATH\",
            \"uploader\": \"upload_user\"
        }"
        
        FIRST_FILE=false
        log "发现文件: $FILENAME ($FILESIZE bytes)"
    fi
done < <(find "$UPLOAD_DIR" -type f -print0 2>/dev/null)

FILES_JSON="$FILES_JSON]"

# 如果没有文件，退出
if [ "$FIRST_FILE" = true ]; then
    log "没有找到文件"
    exit 0
fi

log "准备注册文件到数据库..."

# 调用Node.js脚本注册文件
node << EOF
const fs = require('fs');
const path = require('path');

// 切换到应用目录
process.chdir('$NODE_APP_DIR');

// 加载文件模型
const File = require('./server/models/file');

// 解析文件列表
const files = $FILES_JSON;

async function registerFiles() {
    console.log('开始注册 ' + files.length + ' 个文件...');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const fileInfo of files) {
        try {
            // 生成唯一的文件名
            const timestamp = Date.now();
            const randomNum = Math.floor(Math.random() * 1000000000);
            const ext = path.extname(fileInfo.originalName);
            const fileName = timestamp + '-' + randomNum + ext;
            
            // 创建文件记录
            const fileData = await File.create({
                fileName: fileName,
                originalName: fileInfo.originalName,
                size: fileInfo.size,
                duration: '未知',
                path: fileInfo.path,
                uploader: fileInfo.uploader,
                tags: [],
                chunked: false,
                folderPath: fileInfo.folderPath
            });
            
            console.log('✅ 注册成功: ' + fileInfo.originalName + ' (ID: ' + fileData.id + ')');
            successCount++;
            
        } catch (error) {
            console.error('❌ 注册失败: ' + fileInfo.originalName + ' - ' + error.message);
            errorCount++;
        }
    }
    
    console.log('注册完成: 成功 ' + successCount + ' 个, 失败 ' + errorCount + ' 个');
    
    if (errorCount > 0) {
        process.exit(1);
    }
}

registerFiles().catch(error => {
    console.error('注册过程出错:', error);
    process.exit(1);
});
EOF

REGISTER_STATUS=$?

if [ $REGISTER_STATUS -eq 0 ]; then
    log "文件注册完成"
    exit 0
else
    log "文件注册失败"
    exit 1
fi