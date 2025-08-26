/**
 * 环境配置管理
 * 移除对 .env 文件的依赖，使用默认值和环境变量
 */

// 检测运行环境
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const isDocker = process.env.DOCKER_ENV === 'true' || process.env.IS_DOCKER === 'true';

// 获取本机IP地址
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // 跳过内部地址和非IPv4地址
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

const localIP = getLocalIP();

// 配置对象
const config = {
    // 基础配置
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 3001,
    HTTPS_PORT: parseInt(process.env.HTTPS_PORT) || 3443,
    HOST: process.env.HOST || '0.0.0.0',

    // HTTPS 配置
    ENABLE_HTTPS: process.env.ENABLE_HTTPS === 'true',
    HTTP_REDIRECT: process.env.HTTP_REDIRECT === 'true',
    SSL_KEY_PATH: process.env.SSL_KEY_PATH || './ssl/server.key',
    SSL_CERT_PATH: process.env.SSL_CERT_PATH || './ssl/server.crt',

    // URL 配置 - 根据环境自动生成
    get FRONTEND_URL() {
        const protocol = this.ENABLE_HTTPS ? 'https' : 'http';
        const port = this.ENABLE_HTTPS ? this.HTTPS_PORT : this.PORT;
        return process.env.FRONTEND_URL || `${protocol}://${localIP}:${port}`;
    },

    get API_BASE_URL() {
        const protocol = this.ENABLE_HTTPS ? 'https' : 'http';
        const port = this.ENABLE_HTTPS ? this.HTTPS_PORT : this.PORT;
        return process.env.API_BASE_URL || `${protocol}://${localIP}:${port}/api`;
    },

    get VITE_API_BASE_URL() {
        return process.env.VITE_API_BASE_URL || this.API_BASE_URL;
    },

    // 安全配置
    JWT_SECRET: process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 10,

    // 数据库配置
    get DB_PATH() {
        if (process.env.DB_PATH) return process.env.DB_PATH;
        if (isDocker) return '/app/server/data/datemanager.db';
        return './server/data/datemanager.db';
    },

    // 缓存配置
    CACHE_TYPE: process.env.CACHE_TYPE || 'memory',
    get CACHE_DIR() {
        if (process.env.CACHE_DIR) return process.env.CACHE_DIR;
        if (isDocker) return '/app/cache';
        return './cache';
    },

    // 文件上传配置
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || (isProduction ? '100MB' : '2GB'),
    UPLOAD_TEMP_DIR: process.env.UPLOAD_TEMP_DIR || '/tmp/uploads',

    get UPLOADS_PATH() {
        if (process.env.UPLOADS_PATH) return process.env.UPLOADS_PATH;
        if (isDocker) return '/app/Uploads';
        return './Uploads';
    },

    // 认证配置
    SIMPLE_AUTH_ENABLED: process.env.SIMPLE_AUTH_ENABLED !== 'false', // 默认启用
    UPLOAD_USER: process.env.UPLOAD_USER || 'upload',
    UPLOAD_PASS: process.env.UPLOAD_PASS || 'upload123',

    // 运行时信息
    isProduction,
    isDevelopment,
    isDocker,
    localIP
};

// 导出配置
module.exports = config;

// 打印配置信息（仅在开发模式）
if (isDevelopment) {
    console.log('🔧 环境配置加载完成:');
    console.log(`   环境: ${config.NODE_ENV}`);
    console.log(`   端口: ${config.PORT}`);
    console.log(`   主机: ${config.HOST}`);
    console.log(`   HTTPS: ${config.ENABLE_HTTPS}`);
    console.log(`   本机IP: ${config.localIP}`);
    console.log(`   前端URL: ${config.FRONTEND_URL}`);
    console.log(`   API URL: ${config.API_BASE_URL}`);
    console.log(`   数据库: ${config.DB_PATH}`);
    console.log(`   上传目录: ${config.UPLOADS_PATH}`);
}