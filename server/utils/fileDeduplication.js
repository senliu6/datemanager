const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 计算文件的MD5哈希值
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} MD5哈希值
 */
const calculateFileHash = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

/**
 * 生成唯一的文件名，避免冲突
 * @param {string} originalName - 原始文件名
 * @param {string} folderPath - 文件夹路径
 * @returns {string} 唯一文件名
 */
const generateUniqueFileName = (originalName, folderPath) => {
  const timestamp = Date.now();
  const randomId = Math.floor(Math.random() * 1000000000);
  const folderPrefix = folderPath.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20); // 限制长度
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext).substring(0, 50); // 限制长度
  
  return `${folderPrefix}_${baseName}_${timestamp}_${randomId}${ext}`;
};

/**
 * 检查文件是否已存在（基于内容哈希）
 * @param {string} filePath - 文件路径
 * @param {Function} findByHashCallback - 查找文件的回调函数
 * @returns {Promise<Object|null>} 存在的文件信息或null
 */
const checkFileExists = async (filePath, findByHashCallback) => {
  try {
    const fileHash = await calculateFileHash(filePath);
    const existingFile = await findByHashCallback(fileHash);
    return existingFile;
  } catch (error) {
    console.warn('计算文件哈希失败:', error);
    return null;
  }
};

/**
 * 创建文件的硬链接或软链接（如果支持）
 * @param {string} sourcePath - 源文件路径
 * @param {string} targetPath - 目标文件路径
 * @returns {Promise<boolean>} 是否成功创建链接
 */
const createFileLink = async (sourcePath, targetPath) => {
  try {
    // 尝试创建硬链接
    fs.linkSync(sourcePath, targetPath);
    return true;
  } catch (error) {
    try {
      // 如果硬链接失败，尝试复制文件
      fs.copyFileSync(sourcePath, targetPath);
      return true;
    } catch (copyError) {
      console.error('创建文件链接失败:', copyError);
      return false;
    }
  }
};

/**
 * 安全删除文件，检查是否有其他引用
 * @param {string} filePath - 文件路径
 * @param {Function} checkReferencesCallback - 检查引用的回调函数
 * @returns {Promise<boolean>} 是否成功删除
 */
const safeDeleteFile = async (filePath, checkReferencesCallback) => {
  try {
    // 检查是否还有其他文件引用这个物理文件
    const references = await checkReferencesCallback(filePath);
    
    if (references <= 1) {
      // 只有一个引用，可以安全删除
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('文件已删除:', filePath);
        return true;
      }
    } else {
      console.log(`文件有 ${references} 个引用，跳过删除:`, filePath);
      return true; // 虽然没删除物理文件，但操作成功
    }
  } catch (error) {
    console.error('删除文件失败:', error);
    return false;
  }
  
  return false;
};

module.exports = {
  calculateFileHash,
  generateUniqueFileName,
  checkFileExists,
  createFileLink,
  safeDeleteFile
};