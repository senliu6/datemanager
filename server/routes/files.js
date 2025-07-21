const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const File = require('../models/file');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { logAction } = require('../models/auditLog');

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
      const fileData = await File.create({
        fileName: path.basename(file.path),
        originalName: file.originalname,
        size: file.size,
        path: file.path,
        uploader: 'admin',
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
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
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

module.exports = router;