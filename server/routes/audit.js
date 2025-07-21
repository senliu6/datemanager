const express = require('express');
const { findAllAuditLogs, deleteAllAuditLogs } = require('../models/auditLog');
const { authenticateToken, checkPermission } = require('../middleware/auth');

const router = express.Router();

// 获取操作记录
router.get('/logs', authenticateToken, checkPermission('settings'), async (req, res) => {
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

// 删除所有操作记录
router.delete('/logs', authenticateToken, checkPermission('settings'), async (req, res) => {
  try {
    if (req.user.role !== '管理员') {
      return res.status(403).json({ success: false, message: '仅管理员可删除操作记录' });
    }
    await deleteAllAuditLogs();
    res.json({
      success: true,
      message: '操作记录已清空',
    });
  } catch (error) {
    console.error('删除操作记录失败:', error);
    res.status(500).json({
      success: false,
      message: '删除操作记录失败',
      error: error.message,
    });
  }
});

module.exports = router;