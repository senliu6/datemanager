const app = require('./app');

const config = require('./config/environment');

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`服务器运行在 ${config.HOST}:${config.PORT}`);
  console.log(`本地访问: http://localhost:${config.PORT}`);
  console.log(`网络访问: http://${config.localIP}:${config.PORT}`);
});

// 设置服务器超时时间为15分钟（大文件上传需要更长时间）
server.timeout = 15 * 60 * 1000; // 15分钟
server.keepAliveTimeout = 15 * 60 * 1000; // 15分钟
server.headersTimeout = 15 * 60 * 1000; // 15分钟