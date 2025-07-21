const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/userManage');
const { logAction } = require('../models/auditLog');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 登录接口
router.post('/login', async (req, res) => {
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
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        permissions: user.permissions 
      } 
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '登录失败', error: error.message });
  }
});

// 获取当前用户信息
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByUsername(req.user.username);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    res.json({ 
      success: true, 
      data: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        permissions: user.permissions 
      } 
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ success: false, message: '获取用户信息失败', error: error.message });
  }
});

module.exports = router;