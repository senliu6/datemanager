const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const File = require('../models/file');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { logAction } = require('../models/auditLog');
const { getVideoDuration } = require('../utils/videoUtils');


const router = express.Router();

// 处理普通文件上传
router.post('/upload', authenticateToken, checkPermission('upload'), upload.array('file'), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }
    const fileList = [];

    for (const file of files) {
      const folderPath = req.body.folderPath || (file.webkitRelativePath ? path.dirname(file.webkitRelativePath) : '未分类');
      
      console.log(`开始上传文件: ${file.originalname}, 大小: ${file.size} bytes`);
      
      // 保存文件到本地
      const uploadsDir = process.env.NODE_ENV === 'production' 
        ? '/app/Uploads' 
        : path.join(__dirname, '../../Uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000000000)}${path.extname(file.originalname)}`;
      const filePath = path.join(uploadsDir, fileName);
      fs.writeFileSync(filePath, file.buffer);

      console.log(`文件保存成功: ${filePath}`);

      // 获取视频时长（异步处理，不阻塞响应）
      let duration = '未知';
      try {
        duration = await getVideoDuration(filePath);
      } catch (durationError) {
        console.warn('获取视频时长失败:', durationError);
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
        folderPath: folderPath
      });
      fileList.push(fileData);
      
      // 记录上传操作
      await logAction({
        userId: req.user.id,
        username: req.user.username,
        action: 'upload_file',
        details: `上传文件: ${file.originalname}`,
        ipAddress: req.ip,
      });
    }

    res.json({
      success: true,
      message: '文件上传成功',
      data: fileList
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

// 处理分块上传
router.post('/upload/chunk', authenticateToken, checkPermission('upload'), upload.single('chunk'), async (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks, fileName, fileSize } = req.body;
    const chunkPath = req.file.path;

    const tempDir = path.join(__dirname, '../../Uploads/temp', fileId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const chunkDest = path.join(tempDir, `chunk-${chunkIndex}`);
    fs.renameSync(chunkPath, chunkDest);

    const uploadedChunks = fs.readdirSync(tempDir).length;
    if (uploadedChunks === parseInt(totalChunks)) {
      const finalPath = path.join(__dirname, '../../Uploads', `${fileId}${path.extname(fileName)}`);
      const writeStream = fs.createWriteStream(finalPath);

      for (let i = 0; i < totalChunks; i++) {
        const chunkFile = path.join(tempDir, `chunk-${i}`);
        if (!fs.existsSync(chunkFile)) {
          throw new Error(`分块文件 ${chunkFile} 不存在`);
        }
        const chunkData = fs.readFileSync(chunkFile);
        writeStream.write(chunkData);
        fs.unlinkSync(chunkFile);
      }

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });

      if (!fs.existsSync(finalPath)) {
        throw new Error(`合并后的文件 ${finalPath} 不存在`);
      }

      const fileContent = fs.readFileSync(finalPath);
      const md5 = crypto.createHash('md5').update(fileContent).digest('hex');

      const fileData = await File.create({
        fileName: `${fileId}${path.extname(fileName)}`,
        originalName: fileName,
        size: parseInt(fileSize),
        path: finalPath,
        uploader: 'admin',
        tags: [],
        chunked: true,
        md5
      });

      fs.rmSync(tempDir, { recursive: true, force: true });

      res.json({
        success: true,
        message: '文件分块上传完成并合并',
        data: fileData
      });
    } else {
      res.json({
        success: true,
        message: `分块 ${chunkIndex} 上传成功`,
        chunkIndex
      });
    }
  } catch (error) {
    console.error('分块上传错误:', error);
    res.status(500).json({
      success: false,
      message: '分块上传失败',
      error: error.message
    });
  }
});

// 检查已上传的分块
router.get('/upload/check', authenticateToken, checkPermission('upload'), async (req, res) => {
  try {
    const { fileId } = req.query;
    const tempDir = path.join(__dirname, '../../Uploads/temp', fileId);
    if (!fs.existsSync(tempDir)) {
      return res.json({
        success: true,
        uploadedChunks: []
      });
    }

    const uploadedChunks = fs.readdirSync(tempDir)
      .filter(file => file.startsWith('chunk-'))
      .map(file => parseInt(file.replace('chunk-', '')))
      .sort((a, b) => a - b);

    res.json({
      success: true,
      uploadedChunks
    });
  } catch (error) {
    console.error('检查分块错误:', error);
    res.status(500).json({
      success: false,
      message: '检查分块失败',
      error: error.message
    });
  }
});

// 获取文件列表
router.get('/', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const files = await File.findAll();
    // 记录访问数据操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'access_data',
      details: '访问文件列表',
      ipAddress: req.ip,
    });
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

// 获取文件详情
router.get('/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    res.json({
      success: true,
      data: file
    });
  } catch (error) {
    console.error('获取文件详情错误:', error);
    res.status(500).json({
      success: false,
      message: '获取文件详情失败',
      error: error.message
    });
  }
});

// 获取文件内容
router.get('/content/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const result = await File.getFileContent(req.params.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    res.json({
      success: true,
      data: { content: result.content, path: result.path, extension: result.extension }
    });
  } catch (error) {
    console.error('获取文件内容错误:', error);
    res.status(500).json({
      success: false,
      message: '获取文件内容失败',
      error: error.message
    });
  }
});

// 更新文件信息
router.put('/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const updates = req.body;
    const file = await File.update(req.params.id, updates);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在或更新失败'
      });
    }
    res.json({
      success: true,
      message: '文件信息更新成功',
      data: file
    });
  } catch (error) {
    console.error('更新文件错误:', error);
    res.status(500).json({
      success: false,
      message: '更新文件失败',
      error: error.message
    });
  }
});

// 批量注册文件到数据库
router.post('/register-batch', async (req, res) => {
  try {
    const { uploadPath } = req.body;
    
    if (!uploadPath) {
      return res.status(400).json({
        success: false,
        message: '请提供上传路径'
      });
    }

    console.log(`开始注册文件: ${uploadPath}`);
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(uploadPath)) {
      return res.status(404).json({
        success: false,
        message: '上传路径不存在'
      });
    }

    let registeredFiles = 0;
    let skippedFiles = 0;
    let errorFiles = 0;

    // 递归扫描目录
    async function scanDirectory(dirPath, relativePath = '') {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          const newRelativePath = relativePath ? path.join(relativePath, item) : item;
          await scanDirectory(fullPath, newRelativePath);
        } else if (stats.isFile()) {
          try {
            // 检查文件是否已经在数据库中（基于完整路径）
            const allFiles = await File.findAll();
            console.log(`检查文件: ${item}, 路径: ${fullPath}`);
            console.log(`数据库中总文件数: ${allFiles.length}`);
            
            const existingFile = allFiles.find(f => f.path === fullPath);
            console.log(`查找结果: ${existingFile ? 'FOUND' : 'NOT FOUND'}`);
            
            if (existingFile) {
              console.log(`跳过已存在的文件: ${item} (ID: ${existingFile.id})`);
              skippedFiles++;
              continue;
            }
            
            console.log(`准备注册新文件: ${item}`);
            
            // 生成唯一的文件名
            const timestamp = Date.now();
            const randomNum = Math.floor(Math.random() * 1000000000);
            const ext = path.extname(item);
            const fileName = `${timestamp}-${randomNum}${ext}`;
            
            // 确定文件夹路径
            let folderPath = relativePath || '未分类';
            
            // 创建文件记录
            await File.create({
              fileName: fileName,
              originalName: item,
              size: stats.size,
              duration: '未知',
              path: fullPath,
              uploader: 'upload_user',
              tags: [],
              chunked: false,
              folderPath: folderPath
            });
            
            registeredFiles++;
            
          } catch (error) {
            console.error(`注册文件失败: ${item}`, error);
            errorFiles++;
          }
        }
      }
    }
    
    await scanDirectory(uploadPath);
    
    res.json({
      success: true,
      message: `文件注册完成`,
      data: {
        registered: registeredFiles,
        skipped: skippedFiles,
        errors: errorFiles
      }
    });
    
  } catch (error) {
    console.error('批量注册文件失败:', error);
    res.status(500).json({
      success: false,
      message: '批量注册文件失败',
      error: error.message
    });
  }
});

// 删除文件
router.delete('/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    console.log(`准备删除文件: ${file.originalName}, 路径: ${file.path}`);

    // 安全删除本地文件 - 检查是否有其他引用
    try {
      const { safeDeleteFile } = require('../utils/fileDeduplication');
      const File = require('../models/file');
      
      const checkReferences = async (filePath) => {
        return await File.countByPath(filePath);
      };
      
      const deleted = await safeDeleteFile(file.path, checkReferences);
      if (deleted) {
        console.log(`本地文件安全删除成功: ${file.path}`);
      } else {
        console.warn(`本地文件删除跳过或失败: ${file.path}`);
      }
    } catch (error) {
      console.warn(`删除本地文件失败: ${error.message}`);
      // 即使本地文件删除失败，也继续删除数据库记录
    }

    // 从数据库删除记录
    const deleted = await File.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: '删除文件失败'
      });
    }

    // 记录删除操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_file',
      details: `删除文件: ${file.originalName}`,
      ipAddress: req.ip,
    });

    console.log(`文件删除成功: ${file.originalName}`);
    res.json({
      success: true,
      message: '文件删除成功'
    });
  } catch (error) {
    console.error('删除文件错误:', error);
    res.status(500).json({
      success: false,
      message: '删除文件失败',
      error: error.message
    });
  }
});

// 下载文件
router.get('/download/:id', authenticateToken, checkPermission('data'), async (req, res) => {
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

    const safeName = path.basename(file.originalName);
    const fileStats = fs.statSync(file.path);
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeName)}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    console.log(`📤 发送文件:`, {
      filename: safeName,
      contentLength: fileStats.size,
      filePath: file.path,
    });

    // 发送文件数据
    const fileStream = fs.createReadStream(file.path);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      console.log(`✅ 文件 ${safeName} 下载完成, 总计传输: ${fileStats.size} bytes`);
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

module.exports = router;