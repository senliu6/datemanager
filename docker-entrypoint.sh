#!/bin/sh

# Docker容器启动脚本

echo "🚀 Starting Date Manager Application..."

# 确保必要的目录存在
mkdir -p /app/server/data
mkdir -p /app/Uploads
mkdir -p /app/server/cache
mkdir -p /tmp/uploads

# 设置权限
chown -R node:node /app/server/data
chown -R node:node /app/Uploads
chown -R node:node /app/server/cache

echo "📁 Directories created and permissions set"

# 检查Python依赖
echo "🐍 Checking Python dependencies..."
python3 -c "import pandas, numpy, pyarrow, joblib; print('Python dependencies OK')" || {
    echo "❌ Python dependencies missing, installing..."
    pip3 install pandas numpy pyarrow joblib
}

# 检查ffmpeg
echo "🎬 Checking ffmpeg..."
ffmpeg -version > /dev/null 2>&1 || {
    echo "❌ ffmpeg not found"
    exit 1
}

echo "✅ All dependencies checked"

# 启动应用
echo "🎯 Starting Node.js application..."
cd /app/server
exec node app.js