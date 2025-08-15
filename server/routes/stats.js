const express = require('express');
const fs = require('fs');
const File = require('../models/file');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const { updateVideoDurations } = require('../scripts/updateVideoDurations');
const { exec } = require('child_process');


const router = express.Router();

// 获取统计数据
router.get('/', authenticateToken, checkPermission('overview'), async (req, res) => {
  try {
    const files = await File.findAll();
    const totalFiles = files.length;
    const recentFiles = files.slice(0, 6);

    // 按月份统计数据量
    const monthlyStats = {};
    // 按月份统计数据时长
    const monthlyDurationStats = {};
    
    files.forEach(file => {
      const date = new Date(file.uploadTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // 统计数量
      monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + 1;
      
      // 统计时长
      if (file.duration && file.duration !== '未知') {
        const [hours, minutes, seconds] = file.duration.split(':').map(Number);
        const durationInSeconds = hours * 3600 + minutes * 60 + seconds;
        monthlyDurationStats[monthKey] = (monthlyDurationStats[monthKey] || 0) + durationInSeconds;
      }
    });

    // 计算总时长
    const totalDuration = files.reduce((sum, file) => {
      if (file.duration && file.duration !== '未知') {
        const [hours, minutes, seconds] = file.duration.split(':').map(Number);
        return sum + (hours * 3600 + minutes * 60 + seconds);
      }
      return sum;
    }, 0);

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
        recentFiles,
        monthlyStats: Object.entries(monthlyStats).map(([month, count]) => ({
          month,
          count
        })).sort((a, b) => a.month.localeCompare(b.month)),
        durationStats: Object.entries(monthlyDurationStats).map(([month, duration]) => ({
          month,
          duration
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

// 检查FFmpeg是否安装
router.get('/check-ffmpeg', authenticateToken, checkPermission('overview'), (req, res) => {
  exec('ffprobe -version', (error, stdout, stderr) => {
    if (error) {
      res.json({
        success: true,
        data: {
          installed: false,
          message: 'FFmpeg未安装，无法获取视频时长'
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          installed: true,
          version: stdout.split('\n')[0],
          message: 'FFmpeg已安装'
        }
      });
    }
  });
});

// 更新视频时长
router.post('/update-durations', authenticateToken, checkPermission('overview'), async (req, res) => {
  try {
    console.log('开始手动更新视频时长...');
    
    // 获取所有文件
    const files = await File.findAll();
    
    // 筛选出需要更新时长的视频文件
    const videoFiles = files.filter(file => {
      const ext = file.originalName.split('.').pop().toLowerCase();
      const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
      return videoExtensions.includes(ext) && (file.duration === '未知' || !file.duration);
    });
    
    if (videoFiles.length === 0) {
      return res.json({
        success: true,
        message: '没有需要更新的视频文件',
        data: {
          totalFiles: files.length,
          videoFiles: 0,
          updatedCount: 0
        }
      });
    }

    // 异步更新视频时长
    updateVideoDurations().catch(error => {
      console.error('后台更新视频时长失败:', error);
    });

    res.json({
      success: true,
      message: `正在后台更新 ${videoFiles.length} 个视频文件的时长，请稍后刷新页面查看结果`,
      data: {
        totalFiles: files.length,
        videoFiles: videoFiles.length,
        status: 'processing'
      }
    });
  } catch (error) {
    console.error('更新视频时长失败:', error);
    res.status(500).json({
      success: false,
      message: '更新视频时长失败',
      error: error.message
    });
  }
});

// 清除数据库和缓存
router.delete('/clear-database', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    console.log('开始清除数据库和缓存...');
    const files = await File.findAll();
    const path = require('path');
    const fs = require('fs');

    // 删除本地文件
    for (const file of files) {
      try {
        console.log(`正在删除本地文件: ${file.path}`);
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (error) {
        console.error(`删除本地文件异常: ${file.path}`, error);
      }
    }

    // 清除临时文件和缓存目录
    const cleanupDirectories = [
      path.join(__dirname, '../../Uploads/temp'),  // 分块上传临时目录
      path.join(__dirname, '../../temp'),          // 合并文件临时目录
      path.join(__dirname, '../cache'),            // 服务器缓存目录
      path.join(__dirname, '../../dist'),          // 构建缓存目录
      path.join(__dirname, '../../.vite'),         // Vite 缓存目录
      path.join(__dirname, '../../node_modules/.vite'), // Vite 模块缓存
      path.join(__dirname, '../../node_modules/.vite-temp'), // Vite 临时缓存
    ];

    let cleanedDirs = 0;
    let cleanedFiles = 0;

    for (const dir of cleanupDirectories) {
      try {
        if (fs.existsSync(dir)) {
          const stats = fs.statSync(dir);
          if (stats.isDirectory()) {
            // 计算目录中的文件数量
            const countFiles = (dirPath) => {
              let count = 0;
              try {
                const items = fs.readdirSync(dirPath);
                for (const item of items) {
                  const itemPath = path.join(dirPath, item);
                  const itemStats = fs.statSync(itemPath);
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
            fs.rmSync(dir, { recursive: true, force: true });
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
      const dictionaryRouter = require('./dictionary');
      if (dictionaryRouter && typeof dictionaryRouter.clearCache === 'function') {
        dictionaryRouter.clearCache();
        console.log('✅ 字典缓存已清除');
      }
    } catch (error) {
      console.warn('清除字典缓存失败:', error);
    }

    // 清除数据库记录
    await File.deleteAll();

    // 记录清除操作
    const { logAction } = require('../models/auditLog');
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

module.exports = router;