// 加载环境变量
const envPath = process.env.NODE_ENV === 'production' ? '../.env.docker' : '../.env.local';
require('dotenv').config({ path: envPath });

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
app.use(express.json({ limit: '12gb' })); // 增加到12GB支持超大文件
app.use(express.urlencoded({ limit: '12gb', extended: true }));

// 静态文件服务
const uploadsPath = process.env.NODE_ENV === 'production'
  ? '/app/Uploads'
  : '/home/sen/gitee/datemanager/Uploads';
app.use('/Uploads', express.static(uploadsPath));
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
app.use('/api/remote-sync', require('./routes/remoteSync'));

// 添加直接的上传路由，方便前端调用
const upload = require('./middleware/upload');
const File = require('./models/file');
const { authenticateToken, checkPermission } = require('./middleware/auth');
const { logAction } = require('./models/auditLog');
const { getVideoDuration } = require('./utils/videoUtils');
const { calculateFileHash, generateUniqueFileName } = require('./utils/fileDeduplication');


app.post('/api/upload', authenticateToken, checkPermission('upload'), (req, res, next) => {
  // 设置更长的超时时间用于大文件上传
  req.setTimeout(30 * 60 * 1000); // 30分钟超时
  res.setTimeout(30 * 60 * 1000); // 30分钟超时

  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Multer upload error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          message: '文件太大，最大支持2GB'
        });
      }
      return res.status(400).json({
        success: false,
        message: `上传失败: ${err.message}`
      });
    }

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          message: '没有上传文件'
        });
      }

      const folderPath = req.body.folderPath || '未分类';

      console.log(`开始上传文件: ${file.originalname}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

      // 保存文件到本地
      const uploadsDir = process.env.NODE_ENV === 'production'
        ? '/app/Uploads'
        : path.join(__dirname, '../Uploads');
      if (!require('fs').existsSync(uploadsDir)) {
        require('fs').mkdirSync(uploadsDir, { recursive: true });
      }

      // 生成唯一的文件名，使用新的去重工具
      const fileName = generateUniqueFileName(file.originalname, folderPath);
      const filePath = path.join(uploadsDir, fileName);

      // 使用流式写入处理大文件
      const fs = require('fs');
      await new Promise((resolve, reject) => {
        fs.writeFile(filePath, file.buffer, (writeErr) => {
          if (writeErr) {
            console.error('文件写入失败:', writeErr);
            reject(writeErr);
          } else {
            console.log(`文件保存成功: ${filePath}`);
            resolve();
          }
        });
      });

      // 计算文件哈希值用于去重
      let fileHash = null;
      try {
        fileHash = await calculateFileHash(filePath);
        console.log(`文件哈希计算完成: ${fileHash}`);
      } catch (hashError) {
        console.warn('计算文件哈希失败:', hashError);
      }

      // 获取视频时长（仅对视频文件，跳过zip文件）
      let duration = '未知';
      if (!file.originalname.endsWith('.zip')) {
        try {
          duration = await getVideoDuration(filePath);
        } catch (durationError) {
          console.warn('获取视频时长失败:', durationError);
        }
      }

      const fileData = await File.create({
        fileName: fileName,
        originalName: file.originalname,
        size: file.size,
        duration: duration,
        path: filePath,
        uploader: req.user.username || 'admin',
        tags: [],
        chunked: false,
        folderPath: folderPath,
        md5: fileHash
      });

      // 记录上传操作
      await logAction({
        userId: req.user.id,
        username: req.user.username,
        action: 'upload_file',
        details: `上传文件: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        message: '文件上传成功',
        data: fileData
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      res.status(500).json({
        success: false,
        message: '文件上传失败',
        error: error.message
      });
    }
  });
});

// 批量下载路由 - 服务端打包
app.post('/api/download/batch', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { fileIds } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ success: false, message: '请提供文件ID列表' });
    }

    console.log(`📦 开始批量下载，文件数量: ${fileIds.length}`);

    // 获取所有文件信息
    const files = [];
    for (const id of fileIds) {
      const file = await File.findById(id);
      if (file && fs.existsSync(file.path)) {
        files.push(file);
      } else {
        console.warn(`文件不存在或已删除: ID=${id}`);
      }
    }

    if (files.length === 0) {
      return res.status(404).json({ success: false, message: '没有找到可下载的文件' });
    }

    console.log(`📁 找到 ${files.length} 个有效文件`);

    // 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="batch_download.zip"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 使用archiver创建ZIP流
    const archiver = require('archiver');
    const archive = archiver('zip', {
      zlib: { level: 1 } // 使用最快的压缩级别
    });

    // 处理错误
    archive.on('error', (err) => {
      console.error('ZIP创建错误:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'ZIP创建失败' });
      }
    });

    // 将archive流连接到响应
    archive.pipe(res);

    // 添加文件到ZIP
    for (const file of files) {
      const folderPath = file.folderPath || 'Uncategorized';
      const zipPath = `${folderPath}/${file.originalName}`;

      console.log(`📄 添加文件到ZIP: ${zipPath}`);
      archive.file(file.path, { name: zipPath });
    }

    // 完成ZIP创建
    await archive.finalize();
    console.log(`✅ 批量下载完成，总文件数: ${files.length}`);

  } catch (error) {
    console.error('批量下载错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '批量下载失败', error: error.message });
    }
  }
});

// 添加清除数据库的直接路由
app.delete('/api/clear-database', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    console.log('开始清除数据库和缓存...');
    const files = await File.findAll();

    // 删除本地文件
    for (const file of files) {
      try {
        console.log(`正在删除本地文件: ${file.path}`);
        if (require('fs').existsSync(file.path)) {
          require('fs').unlinkSync(file.path);
        }
      } catch (error) {
        console.error(`删除本地文件异常: ${file.path}`, error);
      }
    }

    // 清除临时文件和缓存目录
    const cleanupDirectories = [
      path.join(__dirname, '../Uploads/temp'),  // 分块上传临时目录
      path.join(__dirname, '../temp'),          // 合并文件临时目录
      path.join(__dirname, '../server/cache'),  // 服务器缓存目录
      path.join(__dirname, '../dist'),          // 构建缓存目录
      path.join(__dirname, '../.vite'),         // Vite 缓存目录
      path.join(__dirname, '../node_modules/.vite'), // Vite 模块缓存
    ];

    let cleanedDirs = 0;
    let cleanedFiles = 0;

    for (const dir of cleanupDirectories) {
      try {
        if (require('fs').existsSync(dir)) {
          const stats = require('fs').statSync(dir);
          if (stats.isDirectory()) {
            // 计算目录中的文件数量
            const countFiles = (dirPath) => {
              let count = 0;
              try {
                const items = require('fs').readdirSync(dirPath);
                for (const item of items) {
                  const itemPath = path.join(dirPath, item);
                  const itemStats = require('fs').statSync(itemPath);
                  if (itemStats.isDirectory()) {
                    count += countFiles(itemPath);
                  } else {
                    count++;
                  }
                }
              } catch (error) {
                console.warn(`计算文件数量失败: ${dirPath}`, error);
              }
              return count;
            };

            const fileCount = countFiles(dir);
            require('fs').rmSync(dir, { recursive: true, force: true });
            console.log(`✅ 清除缓存目录: ${dir} (${fileCount} 个文件)`);
            cleanedDirs++;
            cleanedFiles += fileCount;
          }
        }
      } catch (error) {
        console.warn(`清除缓存目录失败: ${dir}`, error);
      }
    }

    // 清除字典缓存
    try {
      const dictionaryRouter = require('./routes/dictionary');
      if (dictionaryRouter && typeof dictionaryRouter.clearCache === 'function') {
        dictionaryRouter.clearCache();
        console.log('✅ 字典缓存已清除');
      }
    } catch (error) {
      console.warn('清除字典缓存失败:', error);
    }

    // 清空数据库
    await File.deleteAll();

    // 记录清除操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'clear_database',
      details: `清除所有数据库记录、本地文件和缓存，共 ${files.length} 个数据库文件，${cleanedFiles} 个缓存文件，${cleanedDirs} 个缓存目录`,
      ipAddress: req.ip,
    });

    console.log(`清除完成 - 删除了 ${files.length} 个数据库文件，${cleanedFiles} 个缓存文件，${cleanedDirs} 个缓存目录`);

    res.json({
      success: true,
      message: `数据库、本地文件和缓存已清除，共删除 ${files.length} 个数据库文件，${cleanedFiles} 个缓存文件`,
      data: {
        deletedCount: files.length,
        totalFiles: files.length,
        cleanedCacheFiles: cleanedFiles,
        cleanedCacheDirs: cleanedDirs
      }
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

// 检查是否为分割文件的第一部分
const isFirstPartOfSplit = (filename) => {
  return filename.includes('_part_aa') || filename.includes('.7z.001') || filename.includes('.zip.001');
};

// 查找所有相关的分割文件
const findSplitParts = async (baseFile) => {
  const parts = [];
  const baseName = baseFile.originalName;

  // 不同的分割文件命名模式
  const patterns = [
    // split命令模式: images_part_aa, images_part_ab, ...
    { prefix: baseName.replace('_part_aa', '_part_'), suffixes: ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah', 'ai', 'aj', 'ak', 'al', 'am', 'an', 'ao', 'ap'] },
    // 7z分卷模式: images.7z.001, images.7z.002, ...
    { prefix: baseName.replace('.001', '.'), suffixes: ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016'] },
    // zip分卷模式: images.zip.001, images.zip.002, ...
    { prefix: baseName.replace('.zip.001', '.zip.'), suffixes: ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016'] }
  ];

  for (const pattern of patterns) {
    for (const suffix of pattern.suffixes) {
      const expectedName = pattern.prefix + suffix;
      try {
        const files = await File.findByOriginalName(expectedName);
        if (files && files.length > 0) {
          const file = files[0];
          if (fs.existsSync(file.path)) {
            parts.push(file);
          }
        } else {
          break; // 如果找不到下一个部分，停止查找
        }
      } catch (error) {
        break;
      }
    }
    if (parts.length > 0) break; // 如果找到了分割文件，停止尝试其他模式
  }

  return parts;
};

// 合并分割文件
const mergeSplitFiles = async (parts, outputPath) => {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputPath);
    let currentIndex = 0;

    const mergeNext = () => {
      if (currentIndex >= parts.length) {
        writeStream.end();
        resolve();
        return;
      }

      const part = parts[currentIndex];
      console.log(`📦 合并分割文件 ${currentIndex + 1}/${parts.length}: ${part.originalName}`);

      const readStream = fs.createReadStream(part.path);
      readStream.pipe(writeStream, { end: false });

      readStream.on('end', () => {
        currentIndex++;
        mergeNext();
      });

      readStream.on('error', (error) => {
        writeStream.destroy();
        reject(error);
      });
    };

    writeStream.on('error', reject);
    mergeNext();
  });
};

// 修改认证中间件以支持URL参数中的token
const authenticateTokenFlexible = (req, res, next) => {
  // 首先尝试从Authorization header获取token
  let token = req.headers.authorization?.replace('Bearer ', '');

  // 如果header中没有token，尝试从URL参数获取
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: '未提供访问令牌' });
  }

  // 验证token的逻辑（复制自原authenticateToken中间件）
  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: '无效的访问令牌' });
  }
};

app.get('/api/download/:id', authenticateTokenFlexible, checkPermission('data'), async (req, res) => {
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

    console.log(`📁 准备下载本地文件: ${file.path}`);

    // 检查本地文件是否存在
    if (!fs.existsSync(file.path)) {
      console.error(`本地文件不存在: ${file.path}`);
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    let finalFilePath = file.path;
    let finalFileName = file.originalName;
    let shouldCleanup = false;

    // 检查是否为分割文件的第一部分
    if (isFirstPartOfSplit(file.originalName)) {
      console.log(`🔍 检测到分割文件，开始查找所有分割部分...`);

      const parts = await findSplitParts(file);
      if (parts.length > 1) {
        console.log(`📦 找到 ${parts.length} 个分割文件，开始合并...`);

        // 创建临时合并文件
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // 生成合并后的文件名
        finalFileName = file.originalName.replace(/_part_aa|\.001/, '');
        if (!finalFileName.includes('.')) {
          finalFileName += '.zip'; // 默认添加.zip扩展名
        }

        finalFilePath = path.join(tempDir, `merged_${Date.now()}_${finalFileName}`);

        try {
          await mergeSplitFiles(parts, finalFilePath);
          shouldCleanup = true;
          console.log(`✅ 分割文件合并完成: ${finalFilePath}`);
        } catch (mergeError) {
          console.error('合并分割文件失败:', mergeError);
          return res.status(500).json({
            success: false,
            message: '合并分割文件失败',
            error: mergeError.message
          });
        }
      }
    }

    const fileStats = fs.statSync(finalFilePath);

    // 设置响应头
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(finalFileName)}"; filename*=UTF-8''${encodeURIComponent(finalFileName)}`
    );
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    console.log(`📤 发送文件:`, {
      filename: finalFileName,
      contentLength: fileStats.size,
      filePath: finalFilePath,
      isMerged: shouldCleanup
    });

    // 发送文件数据
    const fileStream = fs.createReadStream(finalFilePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      console.log(`✅ 文件 ${finalFileName} 下载完成, 总计传输: ${fileStats.size} bytes`);

      // 清理临时合并文件
      if (shouldCleanup) {
        setTimeout(() => {
          try {
            fs.unlinkSync(finalFilePath);
            console.log(`🗑️ 临时合并文件已清理: ${finalFilePath}`);
          } catch (cleanupError) {
            console.warn('清理临时文件失败:', cleanupError);
          }
        }, 5000); // 5秒后清理
      }
    });

    fileStream.on('error', (streamError) => {
      console.error('文件流错误:', streamError);
      if (shouldCleanup) {
        try {
          fs.unlinkSync(finalFilePath);
        } catch (cleanupError) {
          console.warn('清理临时文件失败:', cleanupError);
        }
      }
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

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 检查文件是否已存在的端点
app.post('/api/check-file', authenticateToken, checkPermission('upload'), async (req, res) => {
  try {
    const { fileName, fileSize, folderPath } = req.body;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: '缺少文件名参数'
      });
    }

    // 查找相同文件名、大小和文件夹路径的文件 - 精确匹配避免跨文件夹冲突
    const existingFiles = await File.findByOriginalName(fileName);
    
    for (const file of existingFiles) {
      // 检查文件名、大小和文件夹路径是否完全匹配（必须在同一文件夹）
      if (file.originalName === fileName && 
          file.size === fileSize && 
          file.folderPath === (folderPath || '未分类')) {
        
        // 检查物理文件是否还存在
        const fs = require('fs');
        if (fs.existsSync(file.path)) {
          return res.json({
            success: true,
            exists: true,
            message: '文件已存在',
            fileId: file.id
          });
        }
      }
    }

    res.json({
      success: true,
      exists: false,
      message: '文件不存在，可以上传'
    });

  } catch (error) {
    console.error('检查文件存在性错误:', error);
    res.status(500).json({
      success: false,
      message: '检查文件失败',
      error: error.message
    });
  }
});

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`服务器运行在 ${HOST}:${PORT}`);
    console.log(`本地访问: http://localhost:${PORT}`);
    console.log(`网络访问: http://10.30.30.94:${PORT}`);
  });
}

module.exports = app;