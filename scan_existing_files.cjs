const fs = require('fs');
const path = require('path');
const File = require('./server/models/file');

async function scanAndImportFiles() {
  try {
    console.log('开始扫描文件...');

    const uploadsDir = path.join(__dirname, 'Uploads');
    
    if (!fs.existsSync(uploadsDir)) {
      console.error('Uploads 目录不存在');
      return;
    }

    const files = fs.readdirSync(uploadsDir);
    console.log(`发现 ${files.length} 个文件`);

    let importedCount = 0;
    let skippedCount = 0;

    for (const fileName of files) {
      const filePath = path.join(uploadsDir, fileName);
      const stats = fs.statSync(filePath);
      
      // 跳过目录
      if (stats.isDirectory()) {
        console.log(`跳过目录: ${fileName}`);
        skippedCount++;
        continue;
      }

      // 检查文件是否已存在于数据库中
      const existingFile = await File.findByFileName(fileName);
      if (existingFile) {
        console.log(`文件已存在于数据库: ${fileName}`);
        skippedCount++;
        continue;
      }

      try {
        // 创建文件记录
        const fileData = await File.create({
          fileName: fileName,
          originalName: fileName, // 对于现有文件，原始名称就是文件名
          size: stats.size,
          duration: '未知',
          path: filePath,
          uploader: 'system',
          tags: [],
          chunked: false,
          folderPath: '未分类'
        });

        console.log(`✅ 导入文件: ${fileName} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
        importedCount++;
      } catch (error) {
        console.error(`❌ 导入文件失败: ${fileName}`, error.message);
        skippedCount++;
      }
    }

    console.log('\n导入完成:');
    console.log(`- 成功导入: ${importedCount} 个文件`);
    console.log(`- 跳过: ${skippedCount} 个文件`);
    
  } catch (error) {
    console.error('扫描导入失败:', error);
  }
}

// 运行扫描
scanAndImportFiles();