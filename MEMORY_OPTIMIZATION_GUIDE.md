# 高质量数据处理指南

## 目标
**保持数据完整性和高质量**，通过优化内存管理和流式处理来处理尽可能多的数据，而不是压缩或减少数据量。

## 核心理念
- ✅ 保持原始数据的完整性
- ✅ 通过流式处理管理内存
- ✅ 智能内存分配和清理
- ❌ 不压缩或减少数据量

## 解决方案概览

### 1. 流式数据处理 (推荐用于大数据集)
**适用场景**: 需要处理完整的大数据集，保持高质量数据

```javascript
// 前端使用StreamDataProcessor组件
import StreamDataProcessor from './components/StreamDataProcessor';

<StreamDataProcessor
  folderPath={selectedFolder}
  onDataReceived={(episodes, batchIndex, isLast) => {
    // 处理接收到的数据批次
    setEpisodes(prev => [...prev, ...episodes]);
  }}
  onComplete={(allEpisodes) => {
    console.log('所有数据处理完成:', allEpisodes.length);
  }}
/>
```

**API调用**:
```bash
# 获取数据集概览
GET /api/lerobot-stream/overview/:folderPath

# 流式解析数据
POST /api/lerobot-stream/parse-stream
{
  "folderPath": "your-dataset-path",
  "quality": "low|medium|high",
  "batchSize": 3
}
```

### 2. 高质量数据级别选择
**新的质量级别设计 - 保持更多数据**：

| 质量级别 | 帧数限制 | 点云密度 | 预估内存 | 适用场景 |
|---------|---------|---------|---------|---------|
| low     | 2000帧  | 1500点/帧 | ~150MB  | 高质量预览，保持丰富数据 |
| medium  | 3000帧  | 2000点/帧 | ~300MB  | 高质量分析，平衡性能 |
| high    | 4000帧  | 2500点/帧 | ~500MB  | 详细分析，保持高精度 |
| full    | 无限制   | 无限制   | >800MB  | 完整原始数据 |

### 3. 高质量单个Episode处理
**新增API**: 专门用于处理单个episode的高质量数据

```bash
# 高质量单episode解析
POST /api/lerobot-stream/parse-single-hq
{
  "filePath": "/path/to/episode_000000.parquet",
  "originalName": "episode_000000.parquet", 
  "folderPath": "your-dataset-path",
  "quality": "high"
}
```

**特点**:
- 保持原始数据完整性
- 智能内存管理
- 支持高达2GB的单episode处理
- 自动内存清理和优化

### 3. 服务器内存配置

#### 启动参数优化
```bash
# 标准配置 (4GB内存)
npm run start

# 大内存配置 (8GB内存)
npm run start-large

# 手动配置
node --max-old-space-size=8192 --expose-gc app.js
```

#### Docker配置
```yaml
environment:
  - NODE_OPTIONS=--max-old-space-size=4096 --expose-gc
  - MAX_FILE_SIZE=2GB
```

### 4. 文件上传优化

#### 改进措施
- ✅ 使用磁盘存储替代内存存储
- ✅ 降低文件大小限制到2GB
- ✅ 添加内存监控中间件

#### 上传大文件建议
1. 将文件分割为小于2GB的块
2. 使用流式上传
3. 监控内存使用情况

### 5. Python脚本优化

#### 内存管理策略
- 智能数据压缩
- 分批处理episodes
- 自动垃圾回收
- 动态质量调整

#### 使用示例
```bash
# 低质量快速处理
python3 parse_lerobot.py --files file1.parquet --folderPath dataset --quality low

# 高质量处理
python3 parse_lerobot.py --files file1.parquet --folderPath dataset --quality high --max-frames 2000
```

## 最佳实践

### 1. 测试内存优化效果
使用内置测试脚本验证不同质量设置的效果：

```bash
cd server
node test_memory_optimization.js /path/to/your/episode_000000.parquet your-dataset-name
```

这将测试所有质量级别并给出推荐设置。

### 2. 内存监控
系统会自动监控内存使用情况：
- 堆内存使用率 > 80% 时发出警告
- 系统内存使用率 > 90% 时发出警告
- 每个请求都会记录内存使用情况

### 3. 分批处理策略
```javascript
// 推荐的批次大小计算
const recommendedBatchSize = Math.min(3, Math.max(1, Math.floor(15 / totalEpisodes)));
```

### 4. 启用垃圾回收
确保服务器启动时启用垃圾回收：
```bash
npm run start  # 已包含 --expose-gc 参数
```

### 5. 渐进式数据加载
```javascript
// 先获取概览
const overview = await fetch('/api/lerobot-stream/overview/dataset-path');

// 根据概览选择合适的质量和批次大小
const quality = overview.data.episodeStructure.estimated_size_mb > 100 ? 'low' : 'medium';
const batchSize = overview.data.recommendedBatchSize;

// 使用流式处理
const response = await fetch('/api/lerobot-stream/parse-stream', {
  method: 'POST',
  body: JSON.stringify({ folderPath, quality, batchSize })
});
```

### 6. 错误处理和降级策略
```javascript
// 捕获内存相关错误并自动降级
try {
  // 尝试高质量处理
  const result = await processData({ quality: 'high' });
} catch (error) {
  if (error.message.includes('memory') || error.message.includes('too large')) {
    console.warn('内存不足，降级到低质量处理');
    const result = await processData({ quality: 'low' });
  }
}
```

## 故障排除

### 常见错误及解决方案

#### 1. "JavaScript heap out of memory"
**解决方案**:
- 增加Node.js内存限制: `--max-old-space-size=8192`
- 使用更低的质量设置
- 使用流式处理API

#### 2. "Data too large"
**解决方案**:
- 使用 `quality: 'low'` 设置
- 减小批次大小
- 分多次处理数据

#### 3. "Request timeout"
**解决方案**:
- 使用流式API替代批量API
- 增加请求超时时间
- 减小数据处理量

#### 4. 上传失败
**解决方案**:
- 检查文件大小是否超过2GB
- 确保磁盘空间充足
- 使用文件分割工具

## 性能优化建议

### 1. 硬件要求
- **最小配置**: 4GB RAM, 2GB可用磁盘空间
- **推荐配置**: 8GB RAM, 10GB可用磁盘空间
- **高性能配置**: 16GB RAM, 50GB可用磁盘空间

### 2. 系统调优
```bash
# 增加系统文件描述符限制
ulimit -n 65536

# 增加虚拟内存
sudo sysctl vm.max_map_count=262144
```

### 3. 监控命令
```bash
# 监控内存使用
free -h
htop

# 监控磁盘空间
df -h

# 监控Node.js进程
ps aux | grep node
```

## 获取最大数据量的推荐策略

### 策略1: 高质量单Episode处理 (推荐)
**适用场景**: 需要完整的高质量数据，逐个处理episodes

```javascript
// 前端实现示例
async function processHighQualityData(episodes) {
  const results = [];
  
  for (const episode of episodes) {
    try {
      const response = await fetch('/api/lerobot-stream/parse-single-hq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: episode.path,
          originalName: episode.originalName,
          folderPath: episode.folderPath,
          quality: 'high'  // 使用高质量设置
        })
      });
      
      const result = await response.json();
      if (result.success) {
        results.push(result.data);
        console.log(`处理完成: ${result.data.key}, 数据大小: ${result.metadata.data_size_mb}MB`);
      }
    } catch (error) {
      console.error(`处理失败: ${episode.originalName}`, error);
    }
  }
  
  return results;
}
```

### 策略2: 流式处理 + 高质量设置
**适用场景**: 需要处理多个episodes，保持高数据量

```javascript
// 使用高质量流式处理
const streamResponse = await fetch('/api/lerobot-stream/parse-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    folderPath: 'your-dataset-path',
    quality: 'high',      // 使用高质量
    batchSize: 1          // 小批次以确保内存安全
  })
});
```

### 策略3: 分阶段数据获取
**适用场景**: 超大数据集，需要分阶段获取完整数据

```javascript
// 分阶段处理策略
async function processLargeDataset(folderPath) {
  // 第1阶段：获取概览
  const overview = await fetch(`/api/lerobot-stream/overview/${encodeURIComponent(folderPath)}`);
  const overviewData = await overview.json();
  
  console.log(`数据集包含 ${overviewData.data.totalEpisodes} 个episodes`);
  
  // 第2阶段：根据内存情况选择策略
  const availableMemoryGB = 8; // 假设8GB可用内存
  let processingStrategy;
  
  if (overviewData.data.totalEpisodes <= 5 && availableMemoryGB >= 8) {
    processingStrategy = 'single-hq'; // 高质量单个处理
  } else if (overviewData.data.totalEpisodes <= 20 && availableMemoryGB >= 4) {
    processingStrategy = 'stream-medium'; // 中等质量流式处理
  } else {
    processingStrategy = 'stream-low'; // 低质量流式处理
  }
  
  console.log(`选择处理策略: ${processingStrategy}`);
  
  // 第3阶段：执行处理
  switch (processingStrategy) {
    case 'single-hq':
      return await processHighQualityData(episodes);
    case 'stream-medium':
      return await processStreamData(folderPath, 'medium', 2);
    case 'stream-low':
      return await processStreamData(folderPath, 'low', 3);
  }
}
```

## 内存使用优化技巧

### 1. 动态内存管理
```bash
# 根据数据集大小动态调整内存限制
# 小数据集 (< 5 episodes)
NODE_OPTIONS="--max-old-space-size=4096" npm start

# 中等数据集 (5-20 episodes)  
NODE_OPTIONS="--max-old-space-size=6144" npm start

# 大数据集 (> 20 episodes)
NODE_OPTIONS="--max-old-space-size=8192" npm start
```

### 2. 批次大小优化
```javascript
// 智能批次大小计算
function calculateOptimalBatchSize(totalEpisodes, availableMemoryGB) {
  if (availableMemoryGB >= 8) {
    return Math.min(3, Math.max(1, Math.floor(totalEpisodes / 5)));
  } else if (availableMemoryGB >= 4) {
    return Math.min(2, Math.max(1, Math.floor(totalEpisodes / 8)));
  } else {
    return 1; // 内存受限时单个处理
  }
}
```

### 3. 数据质量自适应选择
```javascript
// 根据系统资源自动选择质量级别
function selectOptimalQuality(episodeCount, systemMemoryGB, targetDataSize) {
  const memoryPerEpisode = systemMemoryGB / episodeCount;
  
  if (memoryPerEpisode >= 2 && targetDataSize === 'maximum') {
    return 'full';    // 完整数据
  } else if (memoryPerEpisode >= 1) {
    return 'high';    // 高质量
  } else if (memoryPerEpisode >= 0.5) {
    return 'medium';  // 中等质量
  } else {
    return 'low';     // 低质量但仍保持丰富数据
  }
}
```

## 实际使用示例

### 示例1: 处理完整的机器人数据集
```javascript
// 获取最大数据量的完整示例
async function processRobotDataset() {
  const folderPath = 'robot-manipulation-dataset';
  
  try {
    // 1. 获取数据集信息
    const overview = await fetch(`/api/lerobot-stream/overview/${encodeURIComponent(folderPath)}`);
    const info = await overview.json();
    
    console.log(`数据集信息:`, {
      episodes: info.data.totalEpisodes,
      estimatedSize: info.data.episodeStructure?.pointcloud_info?.estimated_size_mb,
      recommendedBatch: info.data.recommendedBatchSize
    });
    
    // 2. 选择最优策略
    const quality = info.data.totalEpisodes <= 10 ? 'high' : 'medium';
    const batchSize = Math.min(2, info.data.recommendedBatchSize);
    
    console.log(`使用设置: quality=${quality}, batchSize=${batchSize}`);
    
    // 3. 流式处理获取完整数据
    const response = await fetch('/api/lerobot-stream/parse-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderPath,
        quality,
        batchSize
      })
    });
    
    // 4. 处理流式数据
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const allEpisodes = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.trim()) {
          const data = JSON.parse(line);
          if (data.episodes) {
            allEpisodes.push(...data.episodes);
            console.log(`收到批次: ${data.episodes.length} episodes, 总计: ${allEpisodes.length}`);
          }
        }
      }
    }
    
    console.log(`处理完成! 总共获得 ${allEpisodes.length} 个高质量episodes`);
    return allEpisodes;
    
  } catch (error) {
    console.error('处理失败:', error);
    throw error;
  }
}
```

## 总结

**新的优化策略重点**：

1. **保持数据完整性**: 不压缩数据，通过更好的内存管理处理更多数据
2. **智能处理策略**: 根据数据集大小和系统资源自动选择最优处理方式
3. **流式处理**: 避免内存峰值，支持处理大数据集
4. **高质量单Episode API**: 专门处理单个episode的完整数据
5. **自适应质量选择**: 根据系统资源动态调整质量级别

**推荐使用顺序**：
1. 首先尝试高质量单Episode处理 (`/api/lerobot-stream/parse-single-hq`)
2. 如果数据集较大，使用高质量流式处理 (`quality: 'high'`)
3. 如果内存仍然不足，使用中等质量流式处理 (`quality: 'medium'`)
4. 最后才考虑低质量设置，但仍保持丰富的数据量

这样可以确保在内存限制下获得尽可能多和高质量的数据。