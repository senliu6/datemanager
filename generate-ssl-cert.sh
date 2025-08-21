#!/bin/bash

# SSL 证书生成脚本
echo "🔒 生成 SSL 证书用于 HTTPS"
echo "================================"

# 创建 SSL 目录
SSL_DIR="./ssl"
if [ ! -d "$SSL_DIR" ]; then
    mkdir -p "$SSL_DIR"
    echo "📁 创建 SSL 目录: $SSL_DIR"
fi

# 获取本机IP地址
LOCAL_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
fi

echo "📍 检测到本机IP: $LOCAL_IP"

# 创建 OpenSSL 配置文件
cat > "$SSL_DIR/openssl.conf" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=CN
ST=Beijing
L=Beijing
O=DateManager
OU=Development
CN=localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
IP.3 = $LOCAL_IP
EOF

echo "📝 创建 OpenSSL 配置文件"

# 生成私钥
echo "🔑 生成私钥..."
openssl genrsa -out "$SSL_DIR/server.key" 2048

if [ $? -ne 0 ]; then
    echo "❌ 私钥生成失败"
    exit 1
fi

# 生成证书签名请求 (CSR)
echo "📋 生成证书签名请求..."
openssl req -new -key "$SSL_DIR/server.key" -out "$SSL_DIR/server.csr" -config "$SSL_DIR/openssl.conf"

if [ $? -ne 0 ]; then
    echo "❌ CSR 生成失败"
    exit 1
fi

# 生成自签名证书
echo "📜 生成自签名证书..."
openssl x509 -req -in "$SSL_DIR/server.csr" -signkey "$SSL_DIR/server.key" -out "$SSL_DIR/server.crt" -days 365 -extensions v3_req -extfile "$SSL_DIR/openssl.conf"

if [ $? -ne 0 ]; then
    echo "❌ 证书生成失败"
    exit 1
fi

# 设置文件权限
chmod 600 "$SSL_DIR/server.key"
chmod 644 "$SSL_DIR/server.crt"

echo ""
echo "✅ SSL 证书生成完成!"
echo "================================"
echo "📁 证书文件位置:"
echo "   私钥: $SSL_DIR/server.key"
echo "   证书: $SSL_DIR/server.crt"
echo "   配置: $SSL_DIR/openssl.conf"
echo ""
echo "🔍 证书信息:"
openssl x509 -in "$SSL_DIR/server.crt" -text -noout | grep -A 1 "Subject:"
openssl x509 -in "$SSL_DIR/server.crt" -text -noout | grep -A 5 "Subject Alternative Name:"
echo ""
echo "⏰ 证书有效期:"
openssl x509 -in "$SSL_DIR/server.crt" -noout -dates
echo ""
echo "🚀 现在可以启用 HTTPS:"
echo "   1. 设置环境变量: ENABLE_HTTPS=true"
echo "   2. 启动服务器"
echo ""
echo "⚠️  注意: 这是自签名证书，浏览器会显示安全警告"
echo "   生产环境请使用正式的 SSL 证书"