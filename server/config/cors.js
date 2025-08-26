const cors = require('cors');

// 动态获取允许的源
const getAllowedOrigins = () => {
  const origins = [
    // HTTP 地址
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    // HTTPS 地址
    'https://localhost:3000',
    'https://localhost:3443',
    'https://127.0.0.1:3000',
    'https://127.0.0.1:3443',
  ];
  
  // 添加当前机器的IP地址
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // HTTP 地址
        origins.push(`http://${iface.address}:3000`);
        origins.push(`http://${iface.address}:3001`);
        // HTTPS 地址
        origins.push(`https://${iface.address}:3000`);
        origins.push(`https://${iface.address}:3443`);
      }
    }
  }
  
  return origins;
};

module.exports = cors({
  origin: function (origin, callback) {
    // 允许没有 origin 的请求（比如移动应用）
    if (!origin) return callback(null, true);
    
    const allowedOrigins = getAllowedOrigins();
    
    // 检查是否在允许列表中
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // 允许本地开发环境的任何端口（HTTP 和 HTTPS）
    if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):\d+$/)) {
      return callback(null, true);
    }
    
    console.warn(`CORS: 阻止来自 ${origin} 的请求`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400 // 24小时
});
