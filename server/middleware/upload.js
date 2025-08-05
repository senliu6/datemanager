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
    // 允许的文件类型
    const allowedTypes = [
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
      'video/x-ms-wmv', 'video/x-flv', 'video/webm', 'video/x-m4v',
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'text/plain', 'application/json',
      'application/zip', 'application/x-zip-compressed', // 添加zip文件支持
      'application/octet-stream','application/x-hdf',
      'application/x-hdf5',

    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.endsWith('.parquet') || 
        file.originalname.endsWith('.jsonl') ||
        file.originalname.endsWith('.zip')) { // 添加zip文件扩展名支持
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
    }
  }
});

module.exports = upload;