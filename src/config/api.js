// API配置文件
const getApiBaseUrl = () => {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 开发环境下使用代理
  if (import.meta.env.DEV) {
    return '/api';
  }
  
  // 生产环境下动态获取当前域名和端口
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port || (protocol === 'https:' ? '443' : '80');
  
  // 如果是通过3000端口访问（前端开发服务器），则API在3001端口
  if (port === '3000') {
    return `${protocol}//${hostname}:3001/api`;
  }
  
  // 否则假设前后端在同一端口
  return `${protocol}//${hostname}:${port}/api`;
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