import axios from 'axios';

// 简化的API基础URL配置
const getBaseURL = () => {
    // 始终使用相对路径，让 Vite 代理处理
    return '';
};

const instance = axios.create({
    baseURL: getBaseURL(),
    timeout: 600000,
});

instance.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    error => Promise.reject(error)
);

export default instance;