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

    // 查询与 folderPath 关联的所有文件 - 精确匹配避免误删
    const allFiles = await File.findAll();
    const files = allFiles.filter(file => {
      // 精确匹配文件夹路径，避免删除其他相似路径的文件夹
      return file.folderPath === folderPath || 
             file.folderPath.startsWith(folderPath + '/') ||
             file.folderPath.startsWith(folderPath + '\\');
    });

    console.log('Matched files for folderPath:', files);

    if (files.length === 0) {
      console.log('No files found for folderPath:', folderPath);
      return res.status(404).json({
        success: false,
        message: '与该文件夹路径相关联的文件不存在'
      });
    }

    // 安全删除文件系统中的文件 - 检查引用计数
    const { safeDeleteFile } = require('../utils/fileDeduplication');
    
    const checkReferences = async (filePath) => {
      return await File.countByPath(filePath);
    };
    
    for (const file of files) {
      try {
        const deleted = await safeDeleteFile(file.path, checkReferences);
        if (deleted) {
          console.log('安全删除文件成功:', file.path);
        } else {
          console.warn('文件删除跳过或失败:', file.path);
        }
      } catch (error) {
        console.error('删除文件失败:', file.path, error);
      }
    }

    // 删除数据库记录 - 只删除匹配的文件，避免误删
    for (const file of files) {
      await File.delete(file.id);
    }

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