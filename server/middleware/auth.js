const jwt = require('jsonwebtoken');

// 简化的认证中间件 - 支持多种认证方式
const authenticateToken = (req, res, next) => {
  // 方式1: JWT Token认证
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  // 方式2: URL参数中的token
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  // 方式3: 简单的用户名密码认证（用于上传脚本）
  const simpleAuth = req.headers['x-simple-auth'];
  if (!token && simpleAuth) {
    const [username, password] = Buffer.from(simpleAuth, 'base64').toString().split(':');
    if (username === 'upload' && password === 'upload123') {
      req.user = {
        id: 'upload',
        username: 'upload',
        role: 'uploader',
        permissions: ['upload', 'data']
      };
      return next();
    }
  }
  
  // 方式4: 开发模式下的免认证（仅限本地）- 暂时禁用
  // if (process.env.NODE_ENV === 'development' && req.ip === '127.0.0.1') {
  //   req.user = {
  //     id: 'dev',
  //     username: 'dev',
  //     role: 'admin',
  //     permissions: ['upload', 'data', 'admin']
  //   };
  //   return next();
  // }
  
  if (!token) {
    return res.status(401).json({ success: false, message: '未提供认证信息' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      console.log('JWT验证失败:', err.message);
      return res.status(403).json({ success: false, message: '无效的认证令牌' });
    }
    console.log('JWT验证成功，用户:', user);
    req.user = user;
    next();
  });
};

// 简化的权限检查
const checkPermission = (permission) => {
  return (req, res, next) => {
    // 如果没有用户信息，直接拒绝
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未认证' });
    }
    
    // 管理员拥有所有权限
    if (req.user.role === 'admin') {
      return next();
    }
    
    // 检查具体权限
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  checkPermission
};