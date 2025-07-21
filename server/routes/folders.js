const express = require('express');
const fs = require('fs');
const path = require('path');
const File = require('../models/file');
const { authenticateToken, checkPermission } = require('../middleware/auth');

const router = express.Router();

// 删除文件夹
router.delete('/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const folderPath = req.params.id;
    const uploadDir = path.join(__dirname, '../../Uploads');

    // 查询与 folderPath 关联的所有文件
    const allFiles = await File.findAll();
    const files = allFiles.filter(file => file.folderPath.startsWith(folderPath));

    console.log('Matched files for folderPath:', files);

    if (files.length === 0) {
      console.log('No files found for folderPath:', folderPath);
      return res.status(404).json({
        success: false,
        message: '与该文件夹路径相关联的文件不存在'
      });
    }

    // 删除文件系统中的文件
    files.forEach(file => {
      const filePath = path.join(uploadDir, path.basename(file.path));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Deleted file:', filePath);
      }
    });

    // 删除数据库记录
    await File.deleteMany({ folderPath: { $like: `${folderPath}%` } });

    res.json({
      success: true,
      message: '文件夹路径相关文件删除成功'
    });
  } catch (error) {
    console.error('删除文件夹错误:', error);
    res.status(500).json({
      success: false,
      message: '删除文件夹相关文件失败',
      error: error.message
    });
  }
});

module.exports = router;