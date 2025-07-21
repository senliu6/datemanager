const express = require('express');
const User = require('../models/userManage');
const { authenticateToken, checkPermission } = require('../middleware/auth');

const router = express.Router();

// 获取用户列表
router.get('/', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const users = await User.findAll();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ success: false, message: '获取用户列表失败', error: error.message });
  }
});

// 创建用户
router.post('/', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({ success: false, message: '创建用户失败', error: error.message });
  }
});

// 更新用户
router.put('/:id', authenticateToken, checkPermission('users'), async (req, res) => {
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

// 删除用户
router.delete('/:id', authenticateToken, checkPermission('users'), async (req, res) => {
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

module.exports = router;