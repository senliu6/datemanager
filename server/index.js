const app = require('./app');

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 ${HOST}:${PORT}`);
  console.log(`本地访问: http://localhost:${PORT}`);
  console.log(`网络访问: http://10.30.30.94:${PORT}`);
});

// 设置服务器超时时间为15分钟（大文件上传需要更长时间）
server.timeout = 15 * 60 * 1000; // 15分钟
server.keepAliveTimeout = 15 * 60 * 1000; // 15分钟
server.headersTimeout = 15 * 60 * 1000; // 15分钟