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

// 清除数据库
router.delete('/clear-database', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    console.log('开始清除数据库...');
    const files = await File.findAll();
    
    // 清除数据库记录
    await File.deleteAll();
    
    console.log(`清除完成 - 删除了 ${files.length} 条记录`);
    
    res.json({
      success: true,
      message: `数据库已清除，删除了 ${files.length} 条记录`,
      data: {
        deletedCount: files.length,
        totalFiles: files.length
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