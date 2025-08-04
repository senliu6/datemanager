// OBS服务已移除
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 获取视频文件的时长（本地文件）
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<string>} - 返回格式化的时长 (HH:MM:SS)
 */
const getVideoDuration = async (filePath) => {
  return new Promise((resolve, reject) => {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        console.warn(`文件不存在: ${filePath}`);
        resolve('未知');
        return;
      }

      // 检查文件扩展名
      const ext = path.extname(filePath).toLowerCase();
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v'];
      
      if (!videoExtensions.includes(ext)) {
        resolve('未知');
        return;
      }

      console.log(`正在获取视频时长: ${filePath}`);

      // 使用ffprobe获取视频时长
      const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.warn(`获取视频时长失败 (${filePath}):`, error.message);
          resolve('未知');
          return;
        }

        const durationInSeconds = parseFloat(stdout.trim());
        
        if (isNaN(durationInSeconds)) {
          console.warn(`无法解析视频时长 (${filePath}):`, stdout);
          resolve('未知');
          return;
        }

        // 格式化时长为 HH:MM:SS
        const hours = Math.floor(durationInSeconds / 3600);
        const minutes = Math.floor((durationInSeconds % 3600) / 60);
        const seconds = Math.floor(durationInSeconds % 60);
        
        const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        console.log(`视频时长获取成功 (${filePath}): ${formattedDuration}`);
        resolve(formattedDuration);
      });

    } catch (error) {
      console.error(`处理视频文件失败 (${filePath}):`, error);
      resolve('未知');
    }
  });
};

/**
 * 批量获取多个文件的视频时长
 * @param {Array} filePaths - 文件路径数组
 * @returns {Promise<Array>} - 返回时长数组
 */
const getBatchVideoDurations = async (filePaths) => {
  const durations = [];
  
  for (const filePath of filePaths) {
    try {
      const duration = await getVideoDuration(filePath);
      durations.push(duration);
    } catch (error) {
      console.error(`获取视频时长失败 (${filePath}):`, error);
      durations.push('未知');
    }
  }
  
  return durations;
};

module.exports = {
  getVideoDuration,
  getBatchVideoDurations
};