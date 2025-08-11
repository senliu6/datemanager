const multer = require('multer');

// 改为内存存储，不保存到本地磁盘
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1000 * 1024 * 1024, // 增加到1000MB限制
    fieldSize: 50 * 1024 * 1024,  // 字段大小限制50MB
    fields: 10,                   // 最多10个字段
    files: 50                     // 最多50个文件
  },
  fileFilter: (req, file, cb) => {
    // 移除文件类型限制，允许所有文件类型
    console.log(`上传文件: ${file.originalname}, MIME类型: ${file.mimetype}`);
    cb(null, true);
  }
});

module.exports = upload;