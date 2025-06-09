const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const File = require('./models/file');

const app = express();
app.use(express.json());

// 连接数据库
connectDB();

// 配置文件存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 100 // 限制文件大小为100MB
  }
});

// 处理文件上传
app.post('/api/upload', upload.array('file'), async (req, res) => {
  try {
    const files = req.files;
    const fileList = [];

    for (const file of files) {
      const fileData = await File.create({
        fileName: file.filename,
        originalName: file.originalname,
        size: file.size,
        path: file.path,
        uploader: 'admin', // 这里应该从认证系统获取当前用户
        tags: []
      });

      fileList.push(fileData);
    }
    
    res.json({
      success: true,
      message: '文件上传成功',
      data: fileList
    });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({
      success: false,
      message: '文件上传失败',
      error: error.message
    });
  }
});

// 获取文件列表
app.get('/api/files', async (req, res) => {
  try {
    const files = await File.findAll();
    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取文件列表失败',
      error: error.message
    });
  }
});

// 获取统计数据
app.get('/api/stats', async (req, res) => {
  try {
    const files = await File.findAll();
    const totalFiles = files.length;
    const recentFiles = files.slice(0, 6);

    // 按月统计上传数量
    const monthlyStats = {};
    files.forEach(file => {
      const date = new Date(file.uploadTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        totalFiles,
        recentFiles,
        monthlyStats: Object.entries(monthlyStats).map(([month, count]) => ({
          month,
          count
        })).sort((a, b) => a.month.localeCompare(b.month))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取统计数据失败',
      error: error.message
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});