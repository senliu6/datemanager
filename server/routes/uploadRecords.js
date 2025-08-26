const express = require('express');
const UploadRecord = require('../models/uploadRecord');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const { logAction } = require('../models/auditLog');

const router = express.Router();

// 创建上传记录
router.post('/', authenticateToken, async (req, res) => {
  try {
    const recordData = {
      session_id: req.body.session_id,
      user_id: req.user.id,
      username: req.user.username,
      total_files: req.body.total_files || 0,
      completed_files: req.body.completed_files || 0,
      failed_files: req.body.failed_files || 0,
      total_size: req.body.total_size || 0,
      completed_size: req.body.completed_size || 0,
      start_time: req.body.start_time || new Date().toISOString(),
      status: req.body.status || 'in_progress',
      folder_path: req.body.folder_path || null,
      notes: req.body.notes || null,
      ip_address: req.ip
    };

    const record = await UploadRecord.create(recordData);
    
    res.json({
      success: true,
      message: '上传记录创建成功',
      data: record
    });
  } catch (error) {
    console.error('创建上传记录失败:', error);
    res.status(500).json({
      success: false,
      message: '创建上传记录失败',
      error: error.message
    });
  }
});

// 获取当前用户的上传记录列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const records = await UploadRecord.findByUserId(req.user.id, limit);
    
    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('获取上传记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取上传记录失败',
      error: error.message
    });
  }
});

// 清空用户的所有上传记录 - 移动到其他路由之前
router.delete('/all', authenticateToken, async (req, res) => {
  try {
    const deletedCount = await UploadRecord.deleteAllByUserId(req.user.id);
    
    // 记录删除操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'clear_all_upload_records',
      details: `清空所有上传记录，共删除 ${deletedCount} 条记录`,
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: `成功清空 ${deletedCount} 条上传记录`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('清空上传记录失败:', error);
    res.status(500).json({
      success: false,
      message: '清空上传记录失败',
      error: error.message
    });
  }
});

// 获取所有上传记录（管理员权限）
router.get('/all', authenticateToken, checkPermission('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const records = await UploadRecord.findAll({ limit });
    
    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('获取所有上传记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取上传记录失败',
      error: error.message
    });
  }
});

// 获取单个上传记录详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const record = await UploadRecord.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: '上传记录不存在'
      });
    }

    // 检查权限：只有记录所有者或管理员可以查看
    if (record.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '无权限查看此记录'
      });
    }
    
    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('获取上传记录详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取上传记录详情失败',
      error: error.message
    });
  }
});

// 更新上传记录
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const record = await UploadRecord.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: '上传记录不存在'
      });
    }

    // 检查权限：只有记录所有者可以更新
    if (record.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '无权限修改此记录'
      });
    }

    const updates = req.body;
    const updatedRecord = await UploadRecord.update(req.params.id, updates);
    
    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: '更新上传记录失败'
      });
    }
    
    res.json({
      success: true,
      message: '上传记录更新成功',
      data: updatedRecord
    });
  } catch (error) {
    console.error('更新上传记录失败:', error);
    res.status(500).json({
      success: false,
      message: '更新上传记录失败',
      error: error.message
    });
  }
});

// 通过session_id更新上传记录
router.put('/session/:sessionId', authenticateToken, async (req, res) => {
  try {
    const record = await UploadRecord.findBySessionId(req.params.sessionId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: '上传记录不存在'
      });
    }

    // 检查权限：只有记录所有者可以更新
    if (record.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '无权限修改此记录'
      });
    }

    const updates = req.body;
    const updatedRecord = await UploadRecord.updateBySessionId(req.params.sessionId, updates);
    
    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: '更新上传记录失败'
      });
    }
    
    res.json({
      success: true,
      message: '上传记录更新成功',
      data: updatedRecord
    });
  } catch (error) {
    console.error('更新上传记录失败:', error);
    res.status(500).json({
      success: false,
      message: '更新上传记录失败',
      error: error.message
    });
  }
});

// 删除上传记录
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const record = await UploadRecord.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: '上传记录不存在'
      });
    }

    // 检查权限：只有记录所有者或管理员可以删除
    if (record.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '无权限删除此记录'
      });
    }

    const deleted = await UploadRecord.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: '删除上传记录失败'
      });
    }

    // 记录删除操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_upload_record',
      details: `删除上传记录: ${record.session_id}`,
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: '上传记录删除成功'
    });
  } catch (error) {
    console.error('删除上传记录失败:', error);
    res.status(500).json({
      success: false,
      message: '删除上传记录失败',
      error: error.message
    });
  }
});

// 获取用户上传统计
router.get('/stats/user', authenticateToken, async (req, res) => {
  try {
    const stats = await UploadRecord.getUserStats(req.user.id);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取用户上传统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取上传统计失败',
      error: error.message
    });
  }
});

module.exports = router;