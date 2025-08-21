// API配置文件 - 简化版本
const getApiBaseUrl = () => {
  // 开发环境始终使用代理
  if (import.meta.env.DEV) {
    return '/api';
  }
  
  // 生产环境使用相对路径
  return '/api';
};

export const API_BASE_URL = getApiBaseUrl();

// 导出常用的API端点
export const API_ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/login`,
  LOGOUT: `${API_BASE_URL}/logout`,
  HEALTH: `${API_BASE_URL}/health`,
  USERS: `${API_BASE_URL}/users`,
  // 可以在这里添加更多API端点
};

export default {
  API_BASE_URL,
  API_ENDPOINTS
};