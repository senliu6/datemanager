const express = require('express');
const path = require('path');
const connectDB = require('./config/db');
const corsMiddleware = require('./config/cors');
const { createAuditLogTable } = require('./models/auditLog');

// 路由模块
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const folderRoutes = require('./routes/folders');
const userRoutes = require('./routes/users');
const lerobotRoutes = require('./routes/lerobot');
const statsRoutes = require('./routes/stats');
const auditRoutes = require('./routes/audit');

const app = express();

// 中间件配置
app.use(corsMiddleware);
app.use(express.json());

// 静态文件服务
app.use('/Uploads', express.static('/home/sen/gitee/datemanager/Uploads'));
app.use('/datasets', express.static(path.join(__dirname, '../datasets')));

// 数据库连接和初始化
connectDB();
createAuditLogTable();

// 初始化字典表
const initializeDictionary = async () => {
  try {
    const Dictionary = require('./models/dictionary');
    console.log('Dictionary class loaded:', typeof Dictionary);
    console.log('Dictionary methods:', Object.getOwnPropertyNames(Dictionary));
    
    if (typeof Dictionary.createTable === 'function') {
      await Dictionary.createTable();
      console.log('字典表初始化成功');
    } else {
      console.error('Dictionary.createTable 不是一个函数');
    }
  } catch (error) {
    console.error('初始化字典表失败:', error);
  }
};

// 延迟初始化字典表，确保数据库连接已建立
setTimeout(initializeDictionary, 2000);

// 路由配置
app.use('/api', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lerobot', lerobotRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dictionary', require('./routes/dictionary'));

// 添加直接的上传路由，方便前端调用
const upload = require('./middleware/upload');
const File = require('./models/file');
const { authenticateToken, checkPermission } = require('./middleware/auth');
const { logAction } = require('./models/auditLog');

app.post('/api/upload', authenticateToken, checkPermission('upload'), upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: '没有上传文件'
      });
    }

    const folderPath = req.body.folderPath || '未分类';
    
    const fileData = await File.create({
      fileName: path.basename(file.path),
      originalName: file.originalname,
      size: file.size,
      path: file.path,
      uploader: req.user.username || 'admin',
      tags: [],
      chunked: false,
      folderPath: folderPath
    });

    // 记录上传操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'upload_file',
      details: `上传文件: ${file.originalname}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: '文件上传成功',
      data: fileData
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: '文件上传失败',
      error: error.message
    });
  }
});

// 添加清除数据库的直接路由
app.delete('/api/clear-database', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const files = await File.findAll();
    
    // 删除物理文件
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
    
    // 清空数据库
    await File.deleteAll();
    
    // 记录清除操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'clear_database',
      details: '清除所有数据库记录和文件',
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: '数据库和文件已清除'
    });
  } catch (error) {
    console.error('清除数据库错误:', error);
    res.status(500).json({
      success: false,
      message: '清除数据库失败',
      error: error.message
    });
  }
});

// 向后兼容的下载路由
const fs = require('fs');

app.get('/api/download/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    console.log(`📩 收到下载请求:`, {
      id: req.params.id,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent'],
      requestTime: new Date().toISOString(),
    });

    const file = await File.findById(req.params.id);
    if (!file) {
      console.error(`文件未找到: id=${req.params.id}`);
      return res.status(404).json({ success: false, message: '文件不存在' });
    }

    const filePath = file.path;

    if (!fs.existsSync(filePath)) {
      console.error(`文件路径不存在: ${filePath}`);
      return res.status(404).json({ success: false, message: '文件在服务器上不存在' });
    }

    const stats = fs.statSync(filePath);
    console.log(`📊 文件系统状态:`, {
      size: stats.size,
      isFile: stats.isFile(),
      permissions: stats.mode.toString(8),
      lastModified: stats.mtime.toISOString(),
    });

    if (stats.size === 0) {
      console.error(`文件为空: ${filePath}`);
      return res.status(400).json({ success: false, message: '文件为空' });
    }

    if (stats.size !== file.size) {
      console.warn(`⚠️ 文件大小不匹配: 数据库=${file.size}, 实际=${stats.size}`);
    }

    const safeName = path.basename(file.originalName);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeName)}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    console.log(`📤 发送文件:`, {
      filename: safeName,
      contentLength: stats.size,
      headers: res.getHeaders(),
    });

    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    let totalBytesSent = 0;

    stream.on('data', (chunk) => {
      totalBytesSent += chunk.length;
    });

    stream.on('error', (err) => {
      console.error(`文件流错误 (${safeName}):`, {
        error: err.message,
        code: err.code,
        stack: err.stack,
        bytesSent: totalBytesSent,
      });
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: '文件传输失败', error: err.message });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);

    stream.on('end', () => {
      console.log(`✅ 文件 ${safeName} 下载完成, 总计传输: ${totalBytesSent} bytes`);
    });
  } catch (error) {
    console.error('下载文件错误:', {
      id: req.params.id,
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '下载失败', error: error.message });
    } else {
      res.destroy();
    }
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : '服务器错误'
  });
});

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

module.exports = app;