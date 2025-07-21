const jwt = require('jsonwebtoken');

// 中间件：验证 JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: '未提供认证令牌' });
  }
  jwt.verify(token, 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: '无效的认证令牌' });
    }
    req.user = user;
    next();
  });
};

// 检查权限
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ success: false, message: '无权限访问此页面' });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  checkPermission
};