// 前端使用示例 - LeRobot 数据加载优化

class LeRobotDataManager {
  constructor(apiBaseUrl = '/api') {
    this.apiBaseUrl = apiBaseUrl;
    this.episodeCache = new Map(); // 前端额外缓存
  }

  // 获取数据集列表
  async getDatasetList(folderPath) {
    try {
      console.log('🔄 加载数据集列表:', folderPath);
      
      const response = await fetch(`${this.apiBaseUrl}/lerobot/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ folderPath })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message);
      }

      console.log('✅ 数据集列表加载完成:', result.data.length, '个episodes');
      return result.data;
    } catch (error) {
      console.error('❌ 加载数据集列表失败:', error);
      throw error;
    }
  }

  // 获取单个episode详细数据
  async getEpisodeDetail(folderPath, episodeKey) {
    const cacheKey = `${folderPath}/${episodeKey}`;
    
    // 检查前端缓存
    if (this.episodeCache.has(cacheKey)) {
      console.log('📦 从前端缓存获取:', episodeKey);
      return this.episodeCache.get(cacheKey);
    }

    try {
      console.log('🔄 加载episode详细数据:', episodeKey);
      
      const response = await fetch(`${this.apiBaseUrl}/lerobot/episode/${encodeURIComponent(folderPath)}/${episodeKey}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message);
      }

      // 缓存到前端
      this.episodeCache.set(cacheKey, result.data);
      console.log('✅ Episode详细数据加载完成:', episodeKey);
      
      return result.data;
    } catch (error) {
      console.error('❌ 加载episode详细数据失败:', error);
      throw error;
    }
  }

  // 预加载下一个episode（优化用户体验）
  async preloadNextEpisode(folderPath, episodes, currentIndex) {
    if (currentIndex + 1 < episodes.length) {
      const nextEpisode = episodes[currentIndex + 1];
      const cacheKey = `${folderPath}/${nextEpisode.key}`;
      
      // 如果还没有缓存，则预加载
      if (!this.episodeCache.has(cacheKey)) {
        console.log('🔮 预加载下一个episode:', nextEpisode.key);
        this.getEpisodeDetail(folderPath, nextEpisode.key).catch(err => {
          console.warn('预加载失败:', err.message);
        });
      }
    }
  }

  // 清除前端缓存
  clearCache() {
    this.episodeCache.clear();
    console.log('🧹 前端缓存已清除');
  }
}

// React Hook 示例
function useLeRobotData(folderPath) {
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const dataManager = useMemo(() => new LeRobotDataManager(), []);

  // 加载episode列表
  const loadEpisodeList = useCallback(async () => {
    if (!folderPath) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const episodeList = await dataManager.getDatasetList(folderPath);
      setEpisodes(episodeList);
      
      // 如果第一个episode有完整数据，直接设置为当前episode
      if (episodeList.length > 0 && episodeList[0].has_pointcloud) {
        const firstEpisodeDetail = await dataManager.getEpisodeDetail(folderPath, episodeList[0].key);
        setCurrentEpisode(firstEpisodeDetail);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folderPath, dataManager]);

  // 选择episode
  const selectEpisode = useCallback(async (episodeKey, index) => {
    setLoading(true);
    setError(null);
    
    try {
      const episodeDetail = await dataManager.getEpisodeDetail(folderPath, episodeKey);
      setCurrentEpisode(episodeDetail);
      
      // 预加载下一个episode
      dataManager.preloadNextEpisode(folderPath, episodes, index);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folderPath, episodes, dataManager]);

  useEffect(() => {
    loadEpisodeList();
  }, [loadEpisodeList]);

  return {
    episodes,
    currentEpisode,
    loading,
    error,
    selectEpisode,
    refreshList: loadEpisodeList
  };
}

// Vue Composition API 示例
function useLeRobotDataVue(folderPath) {
  const episodes = ref([]);
  const currentEpisode = ref(null);
  const loading = ref(false);
  const error = ref(null);
  
  const dataManager = new LeRobotDataManager();

  const loadEpisodeList = async () => {
    if (!folderPath.value) return;
    
    loading.value = true;
    error.value = null;
    
    try {
      const episodeList = await dataManager.getDatasetList(folderPath.value);
      episodes.value = episodeList;
      
      if (episodeList.length > 0 && episodeList[0].has_pointcloud) {
        const firstEpisodeDetail = await dataManager.getEpisodeDetail(folderPath.value, episodeList[0].key);
        currentEpisode.value = firstEpisodeDetail;
      }
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  };

  const selectEpisode = async (episodeKey, index) => {
    loading.value = true;
    error.value = null;
    
    try {
      const episodeDetail = await dataManager.getEpisodeDetail(folderPath.value, episodeKey);
      currentEpisode.value = episodeDetail;
      
      dataManager.preloadNextEpisode(folderPath.value, episodes.value, index);
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  };

  watch(folderPath, loadEpisodeList, { immediate: true });

  return {
    episodes,
    currentEpisode,
    loading,
    error,
    selectEpisode,
    refreshList: loadEpisodeList
  };
}

// 导出供使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LeRobotDataManager,
    useLeRobotData,
    useLeRobotDataVue
  };
}