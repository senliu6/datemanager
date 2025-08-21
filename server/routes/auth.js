const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/userManage');
const { logAction } = require('../models/auditLog');
const { authenticateToken } = require('../middleware/auth');
const config = require('../config/environment');

const router = express.Router();

// 登录接口
router.post('/login', async (req, res) => {
  try {
    const { username, password, remember } = req.body;
    
    // 简化认证：支持内置的管理员用户
    if (config.SIMPLE_AUTH_ENABLED && 
        username === config.UPLOAD_USER && 
        password === config.UPLOAD_PASS) {
      
      const simpleUser = {
        id: 'admin',
        username: 'admin',
        role: 'admin',
        permissions: ['upload', 'data', 'overview', 'users', 'settings', 'admin']
      };
      
      const token = jwt.sign(
        simpleUser,
        config.JWT_SECRET,
        { expiresIn: remember ? '7d' : '1h' }
      );
      
      // 记录登录操作
      try {
        await logAction({
          userId: simpleUser.id,
          username: simpleUser.username,
          action: 'login',
          details: '简化认证用户登录',
          ipAddress: req.ip,
        });
      } catch (logError) {
        console.warn('记录登录日志失败:', logError);
      }
      
      return res.json({ 
        success: true, 
        token, 
        user: simpleUser
      });
    }
    
    // 常规数据库认证
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
      config.JWT_SECRET,
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
    console.log('获取用户信息请求，用户:', req.user);
    
    // 如果是简化认证用户，直接返回token中的信息
    if (req.user && (req.user.id === 'upload' || req.user.username === 'upload')) {
      console.log('返回简化认证用户信息');
      return res.json({ 
        success: true, 
        data: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          permissions: req.user.permissions
        }
      });
    }
    
    // 常规数据库用户
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