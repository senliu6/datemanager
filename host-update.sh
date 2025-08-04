#!/bin/bash

# Host网络模式应用更新脚本
# 适用于使用 --net=host 的Docker容器
# 使用方法: ./host-update.sh [version_tag]

set -e

VERSION_TAG=${1:-"latest"}
APP_DIR="/home/ldz/datemanager"
BACKUP_DIR="/home/ldz/backup"
UPDATE_LOG="/tmp/host-update-$(date +%Y%m%d_%H%M%S).log"

echo "🔄 Date Manager Host网络模式更新脚本"
echo "================================"
echo "📦 更新版本: $VERSION_TAG"
echo "📍 应用目录: $APP_DIR"
echo "📝 更新日志: $UPDATE_LOG"
echo ""

# 创建日志文件
exec 1> >(tee -a $UPDATE_LOG)
exec 2> >(tee -a $UPDATE_LOG >&2)

# 检查应用是否存在
if [ ! -d "$APP_DIR" ]; then
    echo "❌ 应用目录不存在: $APP_DIR"
    echo "请先运行初始部署脚本: ./host-network-deploy.sh"
    exit 1
fi

# 检查服务状态
echo "🔍 检查当前服务状态..."
if systemctl is-active --quiet datemanager; then
    SERVICE_WAS_RUNNING=true
    echo "✅ 服务正在运行"
else
    SERVICE_WAS_RUNNING=false
    echo "⚠️  服务未运行"
fi

# 创建备份
echo "💾 创建当前版本备份..."
BACKUP_NAME="datemanager_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR
cp -r $APP_DIR $BACKUP_DIR/$BACKUP_NAME
echo "✅ 备份完成: $BACKUP_DIR/$BACKUP_NAME"

# 保存当前配置
echo "💾 保存当前配置..."
cp $APP_DIR/.env.production /tmp/env.backup
cp /etc/systemd/system/datemanager.service /tmp/service.backup

# 停止服务
if [ "$SERVICE_WAS_RUNNING" = true ]; then
    echo "⏹️  停止服务..."
    systemctl stop datemanager
fi

# 检查更新源码是否存在
if [ ! -f "/tmp/datemanager-update.tar.gz" ]; then
    echo "❌ 更新包不存在: /tmp/datemanager-update.tar.gz"
    echo "请先将更新包复制到容器中:"
    echo "docker cp datemanager-update.tar.gz ldz_12_2_ubuntu22:/tmp/"
    exit 1
fi

# 解压更新包到临时目录
echo "📦 解压更新包..."
TEMP_DIR="/tmp/datemanager-update-$(date +%Y%m%d_%H%M%S)"
mkdir -p $TEMP_DIR
tar -xzf /tmp/datemanager-update.tar.gz -C $TEMP_DIR

# 检查更新包结构
if [ ! -f "$TEMP_DIR/package.json" ] || [ ! -d "$TEMP_DIR/server" ]; then
    echo "❌ 更新包结构不正确"
    echo "请确保更新包包含 package.json 和 server 目录"
    exit 1
fi

# 备份用户数据
echo "💾 备份用户数据..."
cp -r $APP_DIR/server/data /tmp/data.backup
cp -r $APP_DIR/Uploads /tmp/uploads.backup

# 更新应用代码
echo "🔄 更新应用代码..."
rm -rf $APP_DIR/src $APP_DIR/server $APP_DIR/package.json $APP_DIR/vite.config.js $APP_DIR/index.html
cp -r $TEMP_DIR/* $APP_DIR/

# 恢复用户数据
echo "🔄 恢复用户数据..."
rm -rf $APP_DIR/server/data $APP_DIR/Uploads
cp -r /tmp/data.backup $APP_DIR/server/data
cp -r /tmp/uploads.backup $APP_DIR/Uploads

# 恢复配置文件
echo "🔄 恢复配置文件..."
cp /tmp/env.backup $APP_DIR/.env.production
cp /tmp/service.backup /etc/systemd/system/datemanager.service

# 安装依赖
echo "📦 安装前端依赖..."
cd $APP_DIR
npm install --production

echo "🔨 构建前端..."
npm run build

echo "📦 安装后端依赖..."
cd $APP_DIR/server
npm install --production

# 设置权限
echo "🔐 设置权限..."
chown -R root:root $APP_DIR
chmod -R 755 $APP_DIR

# 重新加载systemd
systemctl daemon-reload

# 启动服务
if [ "$SERVICE_WAS_RUNNING" = true ]; then
    echo "🚀 启动服务..."
    systemctl start datemanager
    
    # 等待服务启动
    echo "⏳ 等待服务启动..."
    sleep 5
    
    # 获取主机IP
    HOST_IP=$(ip route get 8.8.8.8 | awk '{print $7; exit}')
    if [ -z "$HOST_IP" ]; then
        HOST_IP=$(hostname -I | awk '{print $1}')
    fi
    
    # 检查服务状态
    if systemctl is-active --quiet datemanager; then
        echo "✅ 服务启动成功!"
        
        # 测试健康检查
        for i in {1..10}; do
            if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
                echo "✅ 应用健康检查通过!"
                break
            else
                echo "⏳ 等待应用启动... ($i/10)"
                sleep 2
            fi
            
            if [ $i -eq 10 ]; then
                echo "❌ 应用启动异常，开始回滚..."
                systemctl stop datemanager
                rm -rf $APP_DIR
                cp -r $BACKUP_DIR/$BACKUP_NAME $APP_DIR
                systemctl start datemanager
                echo "✅ 回滚完成"
                exit 1
            fi
        done
        
        # 测试局域网访问
        echo "🌐 测试局域网访问..."
        if curl -f http://$HOST_IP:3001/api/health > /dev/null 2>&1; then
            echo "✅ 局域网访问测试通过!"
        else
            echo "⚠️  局域网访问可能需要检查"
        fi
    else
        echo "❌ 服务启动失败，开始回滚..."
        rm -rf $APP_DIR
        cp -r $BACKUP_DIR/$BACKUP_NAME $APP_DIR
        systemctl start datemanager
        echo "✅ 回滚完成"
        exit 1
    fi
fi

# 清理临时文件
echo "🧹 清理临时文件..."
rm -rf $TEMP_DIR
rm -f /tmp/env.backup /tmp/service.backup
rm -rf /tmp/data.backup /tmp/uploads.backup

# 获取主机IP用于显示
HOST_IP=$(ip route get 8.8.8.8 | awk '{print $7; exit}')
if [ -z "$HOST_IP" ]; then
    HOST_IP=$(hostname -I | awk '{print $1}')
fi

echo ""
echo "🎉 Host网络模式更新完成!"
echo "================================"
echo "📦 更新版本: $VERSION_TAG"
echo "📍 应用目录: $APP_DIR"
echo "💾 备份位置: $BACKUP_DIR/$BACKUP_NAME"
echo "📝 更新日志: $UPDATE_LOG"
echo ""
echo "🌐 访问地址:"
echo "   - 容器内访问: http://localhost:3001"
echo "   - 宿主机访问: http://localhost:3001"
echo "   - 局域网访问: http://$HOST_IP:3001"
echo ""
echo "📊 常用命令:"
echo "  查看状态: systemctl status datemanager"
echo "  查看日志: journalctl -u datemanager -f"
echo "  回滚版本: systemctl stop datemanager && rm -rf $APP_DIR && cp -r $BACKUP_DIR/$BACKUP_NAME $APP_DIR && systemctl start datemanager"
echo ""
echo "🔍 验证命令:"
echo "  本地健康检查: curl http://localhost:3001/api/health"
echo "  局域网健康检查: curl http://$HOST_IP:3001/api/health"