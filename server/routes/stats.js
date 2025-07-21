const express = require('express');
const fs = require('fs');
const File = require('../models/file');
const { authenticateToken, checkPermission } = require('../middleware/auth');

const router = express.Router();

// 获取统计数据
router.get('/', authenticateToken, checkPermission('overview'), async (req, res) => {
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
router.delete('/clear-database', authenticateToken, checkPermission('data'), async (req, res) => {
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

module.exports = router;