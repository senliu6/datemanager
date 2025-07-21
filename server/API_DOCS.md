# LeRobot API 优化文档

## 概述

LeRobot API 已经优化为分层缓存和按需加载机制，提供更好的性能和用户体验。

## 新的工作流程

### 1. 获取Episode列表
**接口**: `POST /api/lerobot/parse`

**请求体**:
```json
{
  "folderPath": "dataset_folder_name"
}
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "key": "episode_000001",
      "frame_count": 100,
      "video_paths": {
        "cam_top": "/Uploads/video1.mp4",
        "cam_right_wrist": "/Uploads/video2.mp4"
      },
      "has_pointcloud": true
    },
    {
      "key": "episode_000002",
      "frame_count": 150,
      "video_paths": {
        "cam_top": "/Uploads/video3.mp4"
      },
      "has_pointcloud": true
    }
  ]
}
```

**特点**:
- 首次调用会解析第一个episode的完整数据并缓存
- 返回所有episode的基本信息列表
- 后台异步解析其他episodes并缓存
- 后续调用直接从缓存返回

### 2. 获取单个Episode详细数据
**接口**: `GET /api/lerobot/episode/:folderPath/:episodeKey`

**参数**:
- `folderPath`: 数据集文件夹路径
- `episodeKey`: episode键名，如 "episode_000001"

**响应**:
```json
{
  "success": true,
  "data": {
    "key": "episode_000001",
    "frame_count": 100,
    "video_paths": {
      "cam_top": "/Uploads/video1.mp4",
      "cam_right_wrist": "/Uploads/video2.mp4"
    },
    "pointcloud_data": {
      "cam_top": [[x1, y1, z1], [x2, y2, z2], ...],
      "cam_right_wrist": [[x1, y1, z1], [x2, y2, z2], ...]
    }
  }
}
```

**特点**:
- 优先从缓存获取数据
- 如果缓存不存在，实时解析并缓存
- 包含完整的点云数据

## 缓存策略

### 两级缓存结构

1. **列表缓存** (`lerobot_list_*.json.gz`)
   - 存储所有episode的基本信息
   - 不包含点云数据，体积小，加载快
   - 用于快速显示episode列表

2. **Episode缓存** (`lerobot_episode_*.json.gz`)
   - 存储单个episode的完整数据
   - 包含完整点云数据
   - 按需加载和缓存

### 缓存生命周期

1. **首次访问**:
   ```
   用户请求 → 检查列表缓存 → 不存在 → 解析第一个episode → 
   返回列表 → 后台解析其他episodes → 缓存所有数据
   ```

2. **后续访问列表**:
   ```
   用户请求 → 检查列表缓存 → 存在 → 直接返回
   ```

3. **访问特定episode**:
   ```
   用户请求 → 检查episode缓存 → 存在 → 直接返回
                                → 不存在 → 实时解析 → 缓存 → 返回
   ```

## 前端使用建议

### 1. 数据列表页面
```javascript
// 获取episode列表
const response = await axios.post('/api/lerobot/parse', {
  folderPath: 'your_dataset_folder'
});

const episodes = response.data.data;
// 显示episode列表，第一个episode可能已有完整数据
```

### 2. 数据详情页面
```javascript
// 点击列表项时获取完整数据
const getEpisodeDetail = async (folderPath, episodeKey) => {
  const response = await axios.get(`/api/lerobot/episode/${folderPath}/${episodeKey}`);
  return response.data.data;
};

// 使用示例
const episodeData = await getEpisodeDetail('dataset_folder', 'episode_000001');
// 渲染点云数据和其他详细信息
```

### 3. 优化用户体验
```javascript
// 预加载策略：在用户浏览列表时预加载下一个episode
const preloadNextEpisode = async (folderPath, currentIndex, episodes) => {
  if (currentIndex + 1 < episodes.length) {
    const nextEpisode = episodes[currentIndex + 1];
    // 后台预加载，不阻塞UI
    getEpisodeDetail(folderPath, nextEpisode.key).catch(console.warn);
  }
};
```

## 性能优势

1. **首次加载速度提升**: 只解析第一个episode，立即返回列表
2. **内存使用优化**: 按需加载点云数据，避免一次性加载所有数据
3. **缓存命中率高**: 分层缓存策略，减少重复解析
4. **后台处理**: 异步解析不阻塞用户操作
5. **网络传输优化**: 压缩存储，减少数据传输量

## 错误处理

- 如果Python脚本执行失败，会返回详细错误信息
- 缓存读写失败不会影响正常功能，会降级到实时解析
- 文件不存在或损坏时会返回404错误

## 监控和调试

- 所有缓存操作都有详细日志输出
- 可以通过日志监控缓存命中率和解析性能
- 支持手动清除缓存进行调试