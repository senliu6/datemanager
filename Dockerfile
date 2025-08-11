# 多阶段构建 - 前端构建阶段
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 复制前端依赖文件
COPY package*.json ./
RUN npm ci --only=production

# 复制前端源代码
COPY src ./src
COPY public ./public
COPY index.html ./
COPY vite.config.js ./

# 构建前端
RUN npm run build

# 后端运行阶段 - 使用Ubuntu支持SSH
FROM ubuntu:22.04 AS backend

# 设置环境变量
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=18

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    openssh-server \
    rsync \
    sqlite3 \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 安装Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs

# 安装Python依赖
RUN pip3 install --no-cache-dir \
    pandas \
    numpy \
    pyarrow \
    joblib

WORKDIR /app

# 复制后端依赖文件
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# 复制后端源代码
COPY server ./server

# 从前端构建阶段复制构建结果
COPY --from=frontend-builder /app/dist ./dist

# 复制启动脚本
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# 创建必要的目录
RUN mkdir -p /app/Uploads \
    && mkdir -p /app/server/data \
    && mkdir -p /app/server/cache \
    && mkdir -p /tmp/uploads

# 设置权限
RUN chown -R node:node /app

# 暴露端口
EXPOSE 3001 22

# 设置工作目录
WORKDIR /app

# 启动命令
CMD ["/app/docker-entrypoint.sh"]