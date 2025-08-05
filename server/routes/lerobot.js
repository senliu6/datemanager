const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const File = require('../models/file');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const {
  getEpisodeCache,
  setEpisodeCache,
  hasEpisodeCache
} = require('../services/cacheService');

const router = express.Router();

// 解析单个episode的Python脚本
async function parseEpisodeWithPython(filePath, originalName, folderPath) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../parse_lerobot.py');
    const args = ['--files', `${filePath}:${originalName}`, '--folderPath', folderPath];

    const pythonProcess = spawn('python3', [pythonScript, ...args]);
    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python脚本执行失败: ${stderrData}`));
        return;
      }

      try {
        const episodes = JSON.parse(stdoutData || '[]');
        resolve(episodes[0] || null);
      } catch (parseError) {
        reject(new Error(`JSON解析失败: ${parseError.message}`));
      }
    });
  });
}

// 获取视频路径映射
function getVideoPathsForEpisode(episodeIdx, baseFolder, videoFiles) {
  const videoMap = {};
  const matchingVideos = videoFiles.filter(file =>
    file.originalName === `episode_${episodeIdx}.mp4` &&
    file.folderPath.startsWith(baseFolder)
  );

  if (matchingVideos.length > 0) {
    matchingVideos.forEach(file => {
      const cameraPath = file.folderPath.split('/').pop();
      const cameraName = cameraPath.replace('observation.images.', 'cam_');
      videoMap[cameraName] = `/Uploads/${file.fileName}`;
    });
  }
  return videoMap;
}

// LeRobot 解析路由 - 兼容原有API，返回完整数据
router.post('/parse', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    let { folderPath, quality = 'medium' } = req.body;
    console.log('收到 /api/lerobot/parse 请求:', { folderPath, quality });

    if (!folderPath) {
      return res.status(400).json({ success: false, message: 'folderPath 是必需的' });
    }

    // 检查是否所有episodes都已缓存
    const files = await File.findAll();
    const filteredFiles = files.filter(file => file.folderPath.startsWith(folderPath));
    const parquetFiles = filteredFiles.filter(file =>
      /^episode_\d{6}\.parquet$/.test(file.originalName) &&
      fs.existsSync(file.path)
    );

    if (parquetFiles.length === 0) {
      console.log('未找到 Parquet 文件:', folderPath);
      return res.status(404).json({ success: false, message: `未找到 ${folderPath} 的有效 Parquet 文件` });
    }

    // 检查缓存状态（基于质量级别）
    const allCached = parquetFiles.every(parquet => {
      const episodeIdx = parquet.originalName.split('_')[1].split('.')[0];
      const episodeKey = `episode_${episodeIdx}`;
      return hasEpisodeCache(folderPath, episodeKey, quality);
    });

    if (allCached) {
      console.log(`所有episodes已缓存 (${quality})，从缓存读取`);
      const episodes = [];
      for (const parquet of parquetFiles) {
        const episodeIdx = parquet.originalName.split('_')[1].split('.')[0];
        const episodeKey = `episode_${episodeIdx}`;
        const cachedEpisode = await getEpisodeCache(folderPath, episodeKey, quality);
        if (cachedEpisode) {
          console.log(`从缓存读取episode: ${episodeKey}, 点云数据:`, {
            cam_top_length: cachedEpisode.pointcloud_data?.cam_top?.length || 0,
            cam_right_wrist_length: cachedEpisode.pointcloud_data?.cam_right_wrist?.length || 0
          });
          episodes.push(cachedEpisode);
        }
      }

      if (episodes.length > 0) {
        console.log(`从缓存返回 ${episodes.length} 个episodes`);
        return res.json({ success: true, data: episodes });
      } else {
        console.log('缓存中没有找到有效的episode数据，重新解析');
      }
    }

    // 如果没有完全缓存，则解析所有数据
    console.log('开始解析所有episodes...');
    const videoFiles = files.filter(file => file.path.endsWith('.mp4'));
    const episodes = [];

    // 使用原来的批量解析方式以保证数据完整性
    const filePaths = parquetFiles.map(file => `${file.path}:${file.originalName}`);
    console.log('找到的 Parquet 文件:', filePaths);

    const pythonScript = path.join(__dirname, '../parse_lerobot.py');
    const args = ['--files', ...filePaths, '--folderPath', folderPath, '--quality', quality];
    console.log('执行命令: python3', [pythonScript, ...args].join(' '));

    const pythonProcess = spawn('python3', [pythonScript, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 1024 // 1GB buffer
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let totalSize = 0;

    pythonProcess.stdout.on('data', (data) => {
      stdoutChunks.push(data);
      totalSize += data.length;
      console.log(`接收数据块: ${data.length} bytes, 总计: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrChunks.push(data);
      console.log('Python 脚本 stderr:', data.toString());
    });

    pythonProcess.on('close', async (code) => {
      if (code !== 0) {
        const stderrData = Buffer.concat(stderrChunks).toString();
        console.error('Python 脚本退出，代码:', code, 'stderr:', stderrData);
        return res.status(500).json({ success: false, message: '解析数据集失败', error: stderrData });
      }

      let parsedEpisodes = [];
      try {
        const stdoutData = Buffer.concat(stdoutChunks).toString();
        console.log(`合并数据完成，总大小: ${(stdoutData.length / 1024 / 1024).toFixed(2)} MB`);
        const jsonData = JSON.parse(stdoutData || '[]');

        // 检查是否是错误响应
        if (jsonData.error) {
          console.error('Python脚本返回错误:', jsonData.error);
          return res.status(500).json({
            success: false,
            message: '数据处理失败',
            error: jsonData.error
          });
        }

        // 直接解析数据，不处理分块
        parsedEpisodes = Array.isArray(jsonData) ? jsonData : jsonData.episodes || [];

        console.log('解析后的 episodes 数据:');
        parsedEpisodes.forEach((episode, idx) => {
          console.log(`Episode ${idx} - Key: ${episode.key}, Frame count: ${episode.frame_count}, Pointcloud data:`, {
            cam_top_length: episode.pointcloud_data?.cam_top?.length || 0,
            cam_right_wrist_length: episode.pointcloud_data?.cam_right_wrist?.length || 0,
            cam_top_sample: episode.pointcloud_data?.cam_top?.[0]?.slice(0, 3) || [],
            cam_right_wrist_sample: episode.pointcloud_data?.cam_right_wrist?.[0]?.slice(0, 3) || []
          });
        });
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        return res.status(500).json({ success: false, message: 'JSON 解析失败', error: parseError.message });
      }

      // 添加视频路径映射
      const videoMap = {};
      parquetFiles.forEach(parquet => {
        const episodeIdx = parquet.originalName.split('_')[1].split('.')[0];
        const baseFolder = parquet.folderPath.split('/')[0];

        const matchingVideos = videoFiles.filter(file =>
          file.originalName === `episode_${episodeIdx}.mp4` &&
          file.folderPath.startsWith(baseFolder)
        );

        if (matchingVideos.length > 0) {
          videoMap[episodeIdx] = {};
          matchingVideos.forEach(file => {
            const cameraPath = file.folderPath.split('/').pop();
            const cameraName = cameraPath.replace('observation.images.', 'cam_');
            videoMap[episodeIdx][cameraName] = `/Uploads/${file.fileName}`;
          });
        }
      });

      const finalEpisodes = parsedEpisodes.map(episode => {
        const episodeIdx = episode.key.replace('episode_', '');
        return {
          ...episode,
          video_paths: videoMap[episodeIdx] || {}
        };
      });

      // 缓存所有episodes（按质量级别）
      console.log(`开始缓存所有episodes (${quality})...`);
      for (const episode of finalEpisodes) {
        try {
          await setEpisodeCache(folderPath, episode, quality);
          console.log(`缓存完成 (${quality}):`, episode.key);
        } catch (error) {
          console.warn('缓存失败:', episode.key, error.message);
        }
      }

      console.log('最终返回的 episodes 数据:', {
        episodeCount: finalEpisodes.length,
        sample: finalEpisodes[0] ? {
          key: finalEpisodes[0].key,
          frame_count: finalEpisodes[0].frame_count,
          pointcloud_data: {
            cam_top_length: finalEpisodes[0].pointcloud_data?.cam_top?.length || 0,
            cam_right_wrist_length: finalEpisodes[0].pointcloud_data?.cam_right_wrist?.length || 0
          }
        } : {}
      });

      // 直接返回数据
      res.json({ success: true, data: finalEpisodes });
    });
  } catch (error) {
    console.error('LeRobot 解析错误:', error);
    res.status(500).json({ success: false, message: '解析数据集失败', error: error.message });
  }
});

// 清理特定数据集的缓存
router.delete('/cache/:folderPath', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { folderPath } = req.params;
    const { quality } = req.query; // 可选：只清理特定质量的缓存

    console.log(`🧹 清理缓存请求: folderPath=${folderPath}, quality=${quality || 'all'}`);

    const { deleteCache } = require('../services/cacheService');
    await deleteCache(decodeURIComponent(folderPath), quality || null);

    console.log(`✅ 缓存清理完成: ${folderPath}`);

    res.json({
      success: true,
      message: `已清理 ${folderPath} 的${quality ? quality + '质量' : '所有'}缓存`
    });
  } catch (error) {
    console.error('❌ 清理缓存错误:', error);
    res.status(500).json({
      success: false,
      message: '清理缓存失败',
      error: error.message
    });
  }
});



// 获取单个episode的完整数据
router.get('/episode/:folderPath/:episodeKey', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { folderPath, episodeKey } = req.params;
    const { quality = 'medium' } = req.query;
    console.log('收到获取episode请求:', { folderPath, episodeKey, quality });

    // 先尝试从缓存获取（使用正确的质量参数）
    const cachedEpisode = await getEpisodeCache(folderPath, episodeKey, quality);
    if (cachedEpisode) {
      console.log(`从episode缓存读取 (${quality}):`, episodeKey, {
        cam_top_length: cachedEpisode.pointcloud_data?.cam_top?.length || 0,
        cam_right_wrist_length: cachedEpisode.pointcloud_data?.cam_right_wrist?.length || 0
      });
      return res.json({ success: true, data: cachedEpisode });
    }

    // 缓存中没有，需要解析
    const files = await File.findAll();
    const filteredFiles = files.filter(file => file.folderPath.startsWith(folderPath));
    const episodeIdx = episodeKey.replace('episode_', '');
    const parquetFile = filteredFiles.find(file =>
      file.originalName === `episode_${episodeIdx}.parquet` &&
      fs.existsSync(file.path)
    );

    if (!parquetFile) {
      return res.status(404).json({ success: false, message: `未找到episode文件: ${episodeKey}` });
    }

    console.log('开始解析episode:', episodeKey);

    try {
      const episode = await parseEpisodeWithPython(parquetFile.path, parquetFile.originalName, folderPath);
      if (!episode) {
        return res.status(500).json({ success: false, message: '解析episode失败' });
      }

      // 添加视频路径
      const videoFiles = files.filter(file => file.path.endsWith('.mp4'));
      const baseFolder = parquetFile.folderPath.split('/')[0];
      episode.video_paths = getVideoPathsForEpisode(episodeIdx, baseFolder, videoFiles);

      // 缓存解析结果（使用正确的质量参数）
      await setEpisodeCache(folderPath, episode, quality);

      console.log('episode解析完成:', {
        key: episode.key,
        frame_count: episode.frame_count,
        pointcloud_data: {
          cam_top_length: episode.pointcloud_data?.cam_top?.length || 0,
          cam_right_wrist_length: episode.pointcloud_data?.cam_right_wrist?.length || 0
        }
      });

      res.json({ success: true, data: episode });
    } catch (error) {
      console.error('解析episode失败:', error);
      res.status(500).json({ success: false, message: '解析episode失败', error: error.message });
    }
  } catch (error) {
    console.error('获取episode错误:', error);
    res.status(500).json({ success: false, message: '获取episode失败', error: error.message });
  }
});

// 单独获取点云数据的API接口
router.get('/pointcloud/:folderPath/:episodeKey', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { folderPath, episodeKey } = req.params;
    const { quality = 'medium' } = req.query;
    console.log('收到获取点云数据请求:', { folderPath, episodeKey, quality });

    // 先尝试从缓存获取完整episode数据
    const cachedEpisode = await getEpisodeCache(folderPath, episodeKey, quality);
    if (cachedEpisode && cachedEpisode.pointcloud_data) {
      console.log(`从缓存读取点云数据 (${quality}):`, episodeKey, {
        cam_top_length: cachedEpisode.pointcloud_data?.cam_top?.length || 0,
        cam_right_wrist_length: cachedEpisode.pointcloud_data?.cam_right_wrist?.length || 0
      });
      return res.json({
        success: true,
        data: {
          episodeKey,
          quality,
          pointcloud_data: cachedEpisode.pointcloud_data,
          source: 'cache'
        }
      });
    }

    // 缓存中没有，需要解析
    const files = await File.findAll();
    const filteredFiles = files.filter(file => file.folderPath.startsWith(folderPath));
    const episodeIdx = episodeKey.replace('episode_', '');
    const parquetFile = filteredFiles.find(file =>
      file.originalName === `episode_${episodeIdx}.parquet` &&
      fs.existsSync(file.path)
    );

    if (!parquetFile) {
      return res.status(404).json({ success: false, message: `未找到episode文件: ${episodeKey}` });
    }

    console.log('开始解析点云数据:', episodeKey, 'quality:', quality);

    // 使用Python脚本解析点云数据
    const pythonScript = path.join(__dirname, '../parse_lerobot.py');
    const args = [
      '--files', `${parquetFile.path}:${parquetFile.originalName}`,
      '--folderPath', folderPath,
      '--quality', quality
    ];

    const pythonProcess = spawn('python3', [pythonScript, ...args]);
    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error('Python脚本执行失败:', stderrData);
        return res.status(500).json({ success: false, message: '解析点云数据失败', error: stderrData });
      }

      try {
        const episodes = JSON.parse(stdoutData || '[]');
        const episode = episodes[0];

        if (!episode || !episode.pointcloud_data) {
          return res.status(500).json({ success: false, message: '未找到点云数据' });
        }

        // 添加视频路径等基础信息
        const videoFiles = files.filter(file => file.path.endsWith('.mp4'));
        const baseFolder = parquetFile.folderPath.split('/')[0];
        episode.video_paths = getVideoPathsForEpisode(episodeIdx, baseFolder, videoFiles);

        // 缓存完整的episode数据
        await setEpisodeCache(folderPath, episode, quality);

        console.log('点云数据解析完成:', {
          key: episode.key,
          quality,
          pointcloud_data: {
            cam_top_length: episode.pointcloud_data?.cam_top?.length || 0,
            cam_right_wrist_length: episode.pointcloud_data?.cam_right_wrist?.length || 0
          }
        });

        res.json({
          success: true,
          data: {
            episodeKey,
            quality,
            pointcloud_data: episode.pointcloud_data,
            source: 'parsed'
          }
        });
      } catch (parseError) {
        console.error('JSON解析错误:', parseError);
        res.status(500).json({ success: false, message: 'JSON解析失败', error: parseError.message });
      }
    });
  } catch (error) {
    console.error('获取点云数据错误:', error);
    res.status(500).json({ success: false, message: '获取点云数据失败', error: error.message });
  }
});

module.exports = router;