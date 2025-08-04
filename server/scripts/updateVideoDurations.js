const File = require('../models/file');
const { getVideoDuration } = require('../utils/videoUtils');


/**
 * 更新所有现有视频文件的时长信息
 */
async function updateVideoDurations() {
  try {
    console.log('开始更新视频文件时长...');
    
    // 获取所有文件
    const files = await File.findAll();
    console.log(`找到 ${files.length} 个文件`);
    
    // 筛选出需要更新时长的视频文件
    const videoFiles = files.filter(file => {
      const ext = file.originalName.split('.').pop().toLowerCase();
      const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
      return videoExtensions.includes(ext) && (file.duration === '未知' || !file.duration);
    });
    
    console.log(`找到 ${videoFiles.length} 个需要更新时长的视频文件`);
    
    if (videoFiles.length === 0) {
      console.log('没有需要更新的视频文件');
      return;
    }
    
    let updatedCount = 0;
    let errorCount = 0;
    
    // 逐个更新视频文件时长
    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      console.log(`正在处理 (${i + 1}/${videoFiles.length}): ${file.originalName}`);
      
      try {
        // 获取视频时长
        const duration = await getVideoDuration(file.path);
        
        if (duration !== '未知') {
          // 更新数据库中的时长信息
          await File.update(file.id, { duration });
          console.log(`✅ 更新成功: ${file.originalName} -> ${duration}`);
          updatedCount++;
        } else {
          console.log(`⚠️ 无法获取时长: ${file.originalName}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`❌ 处理失败: ${file.originalName}`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n更新完成！');
    console.log(`成功更新: ${updatedCount} 个文件`);
    console.log(`处理失败: ${errorCount} 个文件`);
    
  } catch (error) {
    console.error('更新视频时长失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  // 初始化数据库连接
  const connectDB = require('../config/db');
  connectDB();
  
  // 等待数据库连接建立后执行更新
  setTimeout(() => {
    updateVideoDurations().then(() => {
      console.log('脚本执行完成');
      process.exit(0);
    }).catch((error) => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
  }, 1000);
}

module.exports = { updateVideoDurations };