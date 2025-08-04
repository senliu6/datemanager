import axios from 'axios';

// 动态获取API基础URL
const getBaseURL = () => {
    // 如果是开发环境且通过localhost访问，使用代理
    if (import.meta.env.DEV && window.location.hostname === 'localhost') {
        return '';
    }
    
    // 如果是开发环境但通过IP访问，直接指向后端端口
    if (import.meta.env.DEV) {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:3001`;
    }
    
    // 生产环境使用相对路径
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