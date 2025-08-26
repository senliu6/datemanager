const express = require('express');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const os = require('os');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 记录服务器启动时间
const serverStartTime = Date.now();

// 获取系统信息
router.get('/info', authenticateToken, checkPermission('settings'), async (req, res) => {
  try {
    // 计算服务器运行时间
    const uptime = Date.now() - serverStartTime;
    const uptimeSeconds = Math.floor(uptime / 1000);
    const uptimeDays = Math.floor(uptimeSeconds / (24 * 3600));
    const uptimeHours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeSecondsRemainder = uptimeSeconds % 60;

    let uptimeString = '';
    if (uptimeDays > 0) {
      uptimeString += `${uptimeDays}天`;
    }
    if (uptimeHours > 0) {
      uptimeString += `${uptimeHours}小时`;
    }
    if (uptimeMinutes > 0) {
      uptimeString += `${uptimeMinutes}分钟`;
    }
    if (uptimeSecondsRemainder > 0 || uptimeString === '') {
      uptimeString += `${uptimeSecondsRemainder}秒`;
    }

    // 读取package.json获取版本信息
    let packageInfo = {};
    try {
      const packagePath = path.join(__dirname, '../package.json');
      const packageContent = fs.readFileSync(packagePath, 'utf8');
      packageInfo = JSON.parse(packageContent);
    } catch (error) {
      console.warn('无法读取package.json:', error.message);
    }

    // 系统信息
    const systemInfo = {
      // 服务器信息
      server: {
        startTime: new Date(serverStartTime).toLocaleString('zh-CN'),
        uptime: uptimeString,
        uptimeMs: uptime,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      },
      
      // 系统资源信息
      system: {
        hostname: os.hostname(),
        type: os.type(),
        release: os.release(),
        totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100, // GB
        freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100, // GB
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg(),
        networkInterfaces: Object.keys(os.networkInterfaces())
      },

      // 应用信息
      application: {
        name: packageInfo.name || 'LeRobot数据管理系统',
        version: packageInfo.version || '1.0.0',
        description: packageInfo.description || '机器人数据集管理和可视化平台',
        author: packageInfo.author || '开发团队',
        dependencies: packageInfo.dependencies || {}
      },

      // 进程信息
      process: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        cwd: process.cwd(),
        execPath: process.execPath,
        argv: process.argv
      }
    };

    res.json({
      success: true,
      data: systemInfo
    });

  } catch (error) {
    console.error('获取系统信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统信息失败',
      error: error.message
    });
  }
});

// 获取服务器状态
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const uptime = Date.now() - serverStartTime;
    const memUsage = process.memoryUsage();
    
    res.json({
      success: true,
      data: {
        status: 'running',
        uptime: uptime,
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100, // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
          external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100 // MB
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取服务器状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取服务器状态失败',
      error: error.message
    });
  }
});

module.exports = router;