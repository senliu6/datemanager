const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const util = require('util');

const fsp = fs.promises;
const gzip = util.promisify(zlib.gzip);
const gunzip = util.promisify(zlib.gunzip);

// 缓存目录
const CACHE_DIR = path.join(__dirname, '../cache');

// 确保缓存目录存在
async function ensureCacheDir() {
  try {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.error('创建缓存目录失败:', err.message);
  }
}

function normalizeFolderPath(folderPath) {
  if (!folderPath) return '';
  return folderPath.replace(/\/+$/, '').replace(/^\/+/, '');
}

// 获取列表缓存文件路径
function getListCacheFilePath(folderPath) {
  folderPath = normalizeFolderPath(folderPath);
  const hash = crypto.createHash('md5').update(folderPath).digest('hex');
  return path.join(CACHE_DIR, `lerobot_list_${hash}.json.gz`);
}

// 获取单个episode缓存文件路径
function getEpisodeCacheFilePath(folderPath, episodeKey, quality = 'medium') {
  folderPath = normalizeFolderPath(folderPath);
  const hash = crypto.createHash('md5').update(`${folderPath}_${episodeKey}_${quality}`).digest('hex');
  return path.join(CACHE_DIR, `lerobot_episode_${quality}_${hash}.json.gz`);
}

// 读取列表缓存（只包含基本信息）
async function getListCache(folderPath) {
  try {
    folderPath = normalizeFolderPath(folderPath);
    const cacheFile = getListCacheFilePath(folderPath);
    if (!fs.existsSync(cacheFile)) return null;
    const compressedData = await fsp.readFile(cacheFile);
    const data = await gunzip(compressedData);
    const episodeList = JSON.parse(data.toString('utf-8'));
    console.log(`✅ 从列表缓存读取 ${episodeList.length} 个 episodes:`, folderPath);
    return episodeList;
  } catch (err) {
    console.warn('❌ 读取列表缓存失败:', err.message);
    return null;
  }
}

// 写入列表缓存（只包含基本信息）
async function setListCache(folderPath, episodes) {
  try {
    folderPath = normalizeFolderPath(folderPath);
    const cacheFile = getListCacheFilePath(folderPath);
    // 只缓存基本信息，不包含点云数据
    const listData = episodes.map(episode => ({
      key: episode.key,
      frame_count: episode.frame_count,
      video_paths: episode.video_paths,
      // 标记是否有点云数据
      has_pointcloud: !!(episode.pointcloud_data?.cam_top?.length || episode.pointcloud_data?.cam_right_wrist?.length)
    }));
    const data = Buffer.from(JSON.stringify(listData));
    const compressedData = await gzip(data);
    await fsp.writeFile(cacheFile, compressedData);
    console.log('✅ 已存储列表缓存:', cacheFile);
  } catch (err) {
    console.warn('❌ 写入列表缓存失败:', err.message);
  }
}

// 读取单个episode的完整缓存
async function getEpisodeCache(folderPath, episodeKey, quality = 'medium') {
  try {
    folderPath = normalizeFolderPath(folderPath);
    const cacheFile = getEpisodeCacheFilePath(folderPath, episodeKey, quality);
    if (!fs.existsSync(cacheFile)) return null;
    const compressedData = await fsp.readFile(cacheFile);
    const data = await gunzip(compressedData);
    const episode = JSON.parse(data.toString('utf-8'));
    console.log(`✅ 从episode缓存读取 (${quality}):`, episodeKey);
    return episode;
  } catch (err) {
    console.warn('❌ 读取episode缓存失败:', err.message);
    return null;
  }
}

// 写入单个episode的完整缓存
async function setEpisodeCache(folderPath, episode, quality = 'medium') {
  try {
    folderPath = normalizeFolderPath(folderPath);
    const cacheFile = getEpisodeCacheFilePath(folderPath, episode.key, quality);
    const data = Buffer.from(JSON.stringify(episode));
    const compressedData = await gzip(data);
    await fsp.writeFile(cacheFile, compressedData);
    console.log(`✅ 已存储episode缓存 (${quality}):`, episode.key);
  } catch (err) {
    console.warn('❌ 写入episode缓存失败:', err.message);
  }
}

// 批量写入episode缓存
async function setEpisodeCacheBatch(folderPath, episodes, quality = 'medium') {
  const promises = episodes.map(episode => setEpisodeCache(folderPath, episode, quality));
  await Promise.all(promises);
}

// 删除所有相关缓存
async function deleteCache(folderPath, quality = null) {
  try {
    folderPath = normalizeFolderPath(folderPath);
    console.log(`🧹 开始清理缓存: folderPath="${folderPath}", quality="${quality || 'all'}"`);
    
    // 删除列表缓存
    const listCacheFile = getListCacheFilePath(folderPath);
    if (fs.existsSync(listCacheFile)) {
      await fsp.unlink(listCacheFile);
      console.log('✅ 已删除列表缓存:', path.basename(listCacheFile));
    }
    
    // 删除episode缓存
    const files = await fsp.readdir(CACHE_DIR);
    console.log(`📁 缓存目录中共有 ${files.length} 个文件`);
    
    // 为当前folderPath生成所有可能的hash值（针对不同的episode和质量级别）
    const folderHash = crypto.createHash('md5').update(folderPath).digest('hex');
    console.log(`🔑 folderPath hash: ${folderHash}`);
    
    let deletedCount = 0;
    
    if (quality) {
      // 删除特定质量级别的缓存
      console.log(`🎯 删除特定质量级别的缓存: ${quality}`);
      for (const file of files) {
        if (file.startsWith(`lerobot_episode_${quality}_`) && file.includes('.json.gz')) {
          // 检查这个文件是否属于当前folderPath
          // 通过尝试匹配hash来确定
          const filePath = path.join(CACHE_DIR, file);
          try {
            await fsp.unlink(filePath);
            deletedCount++;
            console.log(`✅ 已删除${quality}质量缓存:`, file);
          } catch (err) {
            console.warn(`❌ 删除文件失败: ${file}`, err.message);
          }
        }
      }
    } else {
      // 删除所有相关缓存
      console.log(`🎯 删除所有质量级别的缓存`);
      const qualities = ['low', 'medium', 'high', 'full'];
      
      // 我们需要找到属于当前folderPath的所有episode缓存文件
      // 由于缓存文件名包含hash，我们需要通过尝试匹配来找到正确的文件
      
      // 首先，我们需要知道这个folderPath下有哪些episodes
      // 我们可以通过检查实际的缓存文件内容来确定是否属于当前folderPath
      
      for (const file of files) {
        let shouldDelete = false;
        
        // 检查是否是episode缓存文件
        if (file.startsWith('lerobot_episode_') && file.endsWith('.json.gz')) {
          try {
            // 读取缓存文件内容来检查是否属于当前folderPath
            const filePath = path.join(CACHE_DIR, file);
            const compressedData = await fsp.readFile(filePath);
            const data = await gunzip(compressedData);
            const episode = JSON.parse(data.toString('utf-8'));
            
            // 检查episode的folderPath是否匹配
            if (episode.folderPath === folderPath) {
              shouldDelete = true;
              console.log(`🎯 找到匹配的缓存文件: ${file} (episode: ${episode.key})`);
            }
          } catch (err) {
            // 如果读取失败，可能是损坏的缓存文件，也删除它
            console.warn(`⚠️ 无法读取缓存文件 ${file}，将删除: ${err.message}`);
            shouldDelete = true;
          }
        }
        
        if (shouldDelete) {
          try {
            await fsp.unlink(path.join(CACHE_DIR, file));
            deletedCount++;
            console.log('✅ 已删除缓存文件:', file);
          } catch (err) {
            console.warn(`❌ 删除文件失败: ${file}`, err.message);
          }
        }
      }
    }
    
    console.log(`🎉 缓存清理完成，共删除 ${deletedCount} 个文件`);
  } catch (err) {
    console.error('❌ 删除缓存失败:', err.message);
    throw err;
  }
}

// 清理所有旧格式缓存
async function cleanupOldCache() {
  try {
    const files = await fsp.readdir(CACHE_DIR);
    const oldCachePattern = /^lerobot_episode_[a-f0-9]{32}\.json\.gz$/;
    
    for (const file of files) {
      if (oldCachePattern.test(file)) {
        await fsp.unlink(path.join(CACHE_DIR, file));
        console.log('🧹 清理旧格式缓存:', file);
      }
    }
  } catch (err) {
    console.warn('❌ 清理旧缓存失败:', err.message);
  }
}

// 检查episode缓存是否存在
function hasEpisodeCache(folderPath, episodeKey, quality = 'medium') {
  folderPath = normalizeFolderPath(folderPath);
  const cacheFile = getEpisodeCacheFilePath(folderPath, episodeKey, quality);
  return fs.existsSync(cacheFile);
}

// 初始化缓存目录
ensureCacheDir();

// 初始化时清理旧缓存
cleanupOldCache();

module.exports = {
  getListCache,
  setListCache,
  getEpisodeCache,
  setEpisodeCache,
  setEpisodeCacheBatch,
  deleteCache,
  hasEpisodeCache,
  cleanupOldCache
};