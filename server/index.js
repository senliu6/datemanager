const express = require('express');
const cors = require('cors'); // 引入 cors
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const connectDB = require('./config/db');
const File = require('./models/file');
const { spawn } = require('child_process');
const User = require('./models/userManage');
const jwt = require('jsonwebtoken');
const { createAuditLogTable, logAction, findAllAuditLogs } = require('./models/auditLog');


const execPromise = util.promisify(exec);

const app = express();

// 配置 CORS
const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://10.30.30.94:3000'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的跨域请求: ' + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use('/Uploads', express.static('/home/sen/gitee/datemanager/Uploads'));
app.use('/datasets', express.static(path.join(__dirname, '../datasets')));



// 连接数据库
connectDB();
createAuditLogTable();

// 配置文件存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../Uploads');
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

const upload = multer({ storage });


// 中间件：验证 JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: '未提供认证令牌' });
  }
  jwt.verify(token, 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: '无效的认证令牌' });
    }
    req.user = user;
    next();
  });
};

// 检查权限
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ success: false, message: '无权限访问此页面' });
    }
    next();
  };
};


// 处理普通文件上传
app.post('/api/upload', authenticateToken, checkPermission('upload'),upload.array('file'), async (req, res) => {
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
app.post('/api/upload/chunk',authenticateToken, checkPermission('upload'), upload.single('chunk'), async (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks, fileName, fileSize } = req.body;
    const chunkPath = req.file.path;

    const tempDir = path.join(__dirname, '../Uploads/temp', fileId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const chunkDest = path.join(tempDir, `chunk-${chunkIndex}`);
    fs.renameSync(chunkPath, chunkDest);

    const uploadedChunks = fs.readdirSync(tempDir).length;
    if (uploadedChunks === parseInt(totalChunks)) {
      const finalPath = path.join(__dirname, '../Uploads', `${fileId}${path.extname(fileName)}`);
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
app.get('/api/upload/check',authenticateToken, checkPermission('upload'), async (req, res) => {
  try {
    const { fileId } = req.query;
    const tempDir = path.join(__dirname, '../Uploads/temp', fileId);
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
app.get('/api/files',authenticateToken, checkPermission('data'), async (req, res) => {
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
app.get('/api/files/:id',authenticateToken, checkPermission('data'), async (req, res) => {
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
app.get('/api/files/content/:id', authenticateToken, checkPermission('data'),async (req, res) => {
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
app.put('/api/files/:id', authenticateToken, checkPermission('data'),async (req, res) => {
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
app.delete('/api/files/:id',authenticateToken, checkPermission('data'), async (req, res) => {
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

app.delete('/api/folders/:id',authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const folderPath = req.params.id; // 例如 'koch_test31'
    const uploadDir = path.join(__dirname, '..', 'Uploads'); // 实际 uploads 路径

    // console.log('Attempting to delete files for folderPath:', folderPath);

    // 查询与 folderPath 关联的所有文件
    const allFiles = await File.findAll();
    // console.log('All files in database:', allFiles); // 调试所有记录
    const files = allFiles.filter(file => file.folderPath.startsWith(folderPath));

    console.log('Matched files for folderPath:', files); // 调试匹配结果

    if (files.length === 0) {
      console.log('No files found for folderPath:', folderPath);
      return res.status(404).json({
        success: false,
        message: '与该文件夹路径相关联的文件不存在'
      });
    }

    // 删除文件系统中的文件
    files.forEach(file => {
      const filePath = path.join(uploadDir, path.basename(file.path));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Deleted file:', filePath);
      }
    });

    // 删除数据库记录
    await File.deleteMany({ folderPath: { $like: `${folderPath}%` } }); // SQLite LIKE 语法

    res.json({
      success: true,
      message: '文件夹路径相关文件删除成功'
    });
  } catch (error) {
    console.error('删除文件夹错误:', error);
    res.status(500).json({
      success: false,
      message: '删除文件夹相关文件失败',
      error: error.message
    });
  }
});

// 获取统计数据
app.get('/api/stats',authenticateToken, checkPermission('overview'), async (req, res) => {
  try {
    const files = await File.findAll();
    const totalFiles = files.length;
    const recentFiles = files.slice(0, 6);

    const monthlyStats = {};
    files.forEach(file => {
      const date = new Date(file.uploadTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + 1;
    });

    const totalDuration = files.reduce((sum, file) => {
      if (file.duration && file.duration !== '未知') {
        const [hours, minutes, seconds] = file.duration.split(':').map(Number);
        return sum + (hours * 3600 + minutes * 60 + seconds);
      }
      return sum;
    }, 0);
    const totalAnnotations = files.reduce((sum, file) => sum + (file.annotation || 0), 0);

    const formatDuration = (seconds) => {
      const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
      const s = Math.floor(seconds % 60).toString().padStart(2, '0');
      return `${h}:${m}:${s}`;
    };

    res.json({
      success: true,
      data: {
        totalFiles,
        totalDuration: formatDuration(totalDuration),
        totalAnnotations,
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

// 清除数据库
app.delete('/api/clear-database', authenticateToken, checkPermission('data'),async (req, res) => {
  try {
    const files = await File.findAll();
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
    await File.deleteAll();
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

// 下载文件
app.get('/api/download/:id', authenticateToken, checkPermission('data'),async (req, res) => {
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
    // console.log(`📄 文件元数据:`, {
    //   id: req.params.id,
    //   originalName: file.originalName,
    //   folderPath: file.folderPath,
    //   filePath,
    //   sizeInDB: file.size,
    // });

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
      // console.log(`📦 传输数据块 (${safeName}): ${chunk.length} bytes, 累计: ${totalBytesSent}/${stats.size}`);
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

// 新增 LeRobot 解析路由
app.post('/api/lerobot/parse',authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    let { folderPath } = req.body;
    console.log('收到 /api/lerobot/parse 请求:', { folderPath });

    if (!folderPath) {
      return res.status(400).json({ success: false, message: 'folderPath 是必需的' });
    }

    const files = await File.findAll({ where: { folderPath } });
    console.log('找到的文件:', files.map(f => ({ originalName: f.originalName, path: f.path })));

    const parquetFiles = files.filter(file =>
        /^episode_\d{6}\.parquet$/.test(file.originalName) &&
        fs.existsSync(file.path)
    );

    if (parquetFiles.length === 0) {
      console.log('未找到 Parquet 文件:', folderPath);
      return res.status(404).json({ success: false, message: `未找到 ${folderPath} 的有效 Parquet 文件` });
    }

    const filePaths = parquetFiles.map(file => `${file.path}:${file.originalName}`);
    console.log('找到的 Parquet 文件:', filePaths);

    const pythonScript = path.join(__dirname, 'parse_lerobot.py');
    const args = ['--files', ...filePaths, '--folderPath', folderPath];
    console.log('执行命令: python3', [pythonScript, ...args].join(' '));

    const pythonProcess = spawn('python3', [pythonScript, ...args]);
    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.log('Python 脚本 stderr:', data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python 脚本退出，代码:', code, 'stderr:', stderrData);
        return res.status(500).json({ success: false, message: '解析数据集失败', error: stderrData });
      }

      let episodes = [];
      try {
        episodes = JSON.parse(stdoutData || '[]');
        console.log('解析后的 episodes 数据:');
        episodes.forEach((episode, idx) => {
          console.log(`Episode ${idx} - Key: ${episode.key}, Frame count: ${episode.frame_count}, Pointcloud data:`, {
            cam_top_length: episode.pointcloud_data?.cam_top?.length || 0,
            cam_right_wrist_length: episode.pointcloud_data?.cam_right_wrist?.length || 0,
            cam_top_sample: episode.pointcloud_data?.cam_top?.[0]?.slice(0, 3) || [],
            cam_right_wrist_sample: episode.pointcloud_data?.cam_right_wrist?.[0]?.slice(0, 3) || []
          });
        });
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        return res.status(500).json({ success: false, message: 'JSON 解析失败', error: parseError.message });
      }

      const videoFiles = files.filter(file => file.path.endsWith('.mp4'));
      const videoMap = {};

      parquetFiles.forEach(parquet => {
        const episodeIdx = parquet.originalName.split('_')[1].split('.')[0];
        const baseFolder = parquet.folderPath.split('/')[0];

        const matchingVideos = videoFiles.filter(file =>
            file.originalName === `episode_${episodeIdx}.mp4` &&
            file.folderPath.startsWith(baseFolder)
        );

        if (matchingVideos.length > 0) {
          videoMap[episodeIdx] = {};
          matchingVideos.forEach(file => {
            const cameraPath = file.folderPath.split('/').pop();
            const cameraName = cameraPath.replace('observation.images.', 'cam_');
            videoMap[episodeIdx][cameraName] = `/Uploads/${file.fileName}`;
          });
        }
      });

      episodes = episodes.map(episode => {
        const episodeIdx = episode.key.replace('episode_', '');
        return {
          ...episode,
          video_paths: videoMap[episodeIdx] || {}
        };
      });

      console.log('最终返回的 episodes 数据:', {
        episodeCount: episodes.length,
        sample: episodes[0] ? {
          key: episodes[0].key,
          frame_count: episodes[0].frame_count,
          pointcloud_data: {
            cam_top_length: episodes[0].pointcloud_data?.cam_top?.length || 0,
            cam_right_wrist_length: episodes[0].pointcloud_data?.cam_right_wrist?.length || 0
          }
        } : {}
      });
      res.json({ success: true, data: episodes });
    });
  } catch (error) {
    console.error('LeRobot 解析错误:', error);
    res.status(500).json({ success: false, message: '解析数据集失败', error: error.message });
  }
});



// 登录接口
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, remember } = req.body;
    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    const isValid = await User.validatePassword(username, password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, permissions: user.permissions },
        'your-secret-key',
        { expiresIn: remember ? '7d' : '1h' }
    );
    // 记录登录操作
    await logAction({
      userId: user.id,
      username: user.username,
      action: 'login',
      details: '用户登录',
      ipAddress: req.ip,
    });
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '登录失败', error: error.message });
  }
});

// 获取当前用户信息
app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByUsername(req.user.username);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    res.json({ success: true, data: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ success: false, message: '获取用户信息失败', error: error.message });
  }
});

// 用户管理接口
app.get('/api/users', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const users = await User.findAll();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).mea({ success: false, message: '获取用户列表失败', error: error.message });
  }
});

app.post('/api/users', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({ success: false, message: '创建用户失败', error: error.message });
  }
});

app.put('/api/users/:id', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const user = await User.update(req.params.id, req.body);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在或更新失败' });
    }
    res.json({ success: true, message: '用户信息更新成功', data: user });
  } catch (error) {
    console.error('更新用户错误:', error);
    res.status(500).json({ success: false, message: '更新用户失败', error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const deleted = await User.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: '用户不存在或无法删除' });
    }
    res.json({ success: true, message: '用户删除成功' });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({ success: false, message: '删除用户失败', error: error.message });
  }
});

// 获取操作记录
app.get('/api/audit-logs', authenticateToken, checkPermission('settings'), async (req, res) => {
  try {
    if (req.user.role !== '管理员') {
      return res.status(403).json({ success: false, message: '仅管理员可查看操作记录' });
    }
    const logs = await findAllAuditLogs();
    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('获取操作记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取操作记录失败',
      error: error.message,
    });
  }
});
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});