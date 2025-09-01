import React, { useState, useEffect } from 'react';
import { Card, message, Button, Space } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import ReactPlayer from 'react-player';
import axios from '../util/axios';
import { useParams, useNavigate } from 'react-router-dom';

const FileDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [jsonContent, setJsonContent] = useState(null);

    useEffect(() => {
        if (!id) return;
        
        const fetchFileDetail = async () => {
            try {
                setLoading(true);
                
                // 先检查服务器状态
                const serverOk = await checkServerStatus();
                if (!serverOk) {
                    setError('服务器连接失败，请检查后端服务是否正常运行');
                    return;
                }
                
                const response = await axios.get(`/api/files/${id}`);
                console.log('API Response:', response.data);
                
                if (response.data.success) {
                    const fileData = response.data.data;
                    setFile(fileData);
                    
                    // 如果是JSON文件，尝试获取内容
                    if (fileData.originalName?.toLowerCase().endsWith('.json')) {
                        await fetchJsonContent(fileData);
                    }
                } else {
                    setError(response.data.message || '获取文件信息失败');
                }
            } catch (err) {
                console.error("请求出错:", err);
                console.error("请求配置:", err.config);
                console.error("响应状态:", err.response?.status);
                console.error("响应数据:", err.response?.data);
                
                if (err.response?.status === 401) {
                    message.error('未授权访问，请重新登录');
                    // 清除无效的token
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    navigate('/login');
                } else if (err.code === 'NETWORK_ERROR' || !err.response) {
                    // 再次检查服务器状态
                    const serverOk = await checkServerStatus();
                    if (!serverOk) {
                        setError('服务器连接失败，请确认：\n1. 后端服务器是否在运行\n2. 后端端口是否可访问\n3. 代理配置是否正确');
                    } else {
                        setError('网络连接失败，请稍后重试');
                    }
                    message.error('网络连接失败，请检查服务器状态');
                } else {
                    setError(err.response?.data?.message || "无法加载文件，请稍后重试");
                    message.error('获取文件详情失败: ' + (err.response?.data?.message || err.message));
                }
            } finally {
                setLoading(false);
            }
        };

        fetchFileDetail();
    }, [id, navigate]);

    const fetchJsonContent = async (fileData) => {
        try {
            // 通过下载接口获取JSON文件内容
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/download/${id}?token=${token}`);
            
            if (response.ok) {
                const text = await response.text();
                try {
                    const json = JSON.parse(text);
                    setJsonContent(json);
                } catch (parseError) {
                    console.warn('JSON解析失败，显示原始文本:', parseError);
                    setJsonContent({ _rawText: text });
                }
            } else {
                console.warn('获取JSON内容失败:', response.status);
            }
        } catch (error) {
            console.warn('获取JSON内容出错:', error);
        }
    };

    // 检查服务器状态
    const checkServerStatus = async () => {
        try {
            const response = await axios.get('/api/health');
            console.log('服务器状态检查成功:', response.data);
            return true;
        } catch (error) {
            console.error('服务器状态检查失败:', error);
            return false;
        }
    };

    const handleDownload = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/download/${id}?token=${token}`);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.originalName;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                message.success('文件下载成功');
            } else {
                message.error('文件下载失败');
            }
        } catch (error) {
            console.error('下载错误:', error);
            message.error('文件下载失败');
        }
    };

    const renderFileContent = () => {
        if (!file) return null;

        const fileName = file.originalName?.toLowerCase() || '';
        
        // JSON文件显示
        if (fileName.endsWith('.json')) {
            return (
                <div>
                    <h3>JSON文件内容:</h3>
                    {jsonContent ? (
                        <pre style={{
                            background: '#f5f5f5',
                            padding: '16px',
                            borderRadius: '4px',
                            overflow: 'auto',
                            maxHeight: '600px',
                            fontSize: '12px',
                            lineHeight: '1.4'
                        }}>
                            {jsonContent._rawText ? 
                                jsonContent._rawText : 
                                JSON.stringify(jsonContent, null, 2)
                            }
                        </pre>
                    ) : (
                        <div>正在加载JSON内容...</div>
                    )}
                </div>
            );
        }
        
        // 视频文件显示
        if (fileName.endsWith('.mp4') || fileName.endsWith('.avi') || fileName.endsWith('.mov') || fileName.endsWith('.mkv')) {
            return (
                <ReactPlayer
                    url={`/Uploads/${file.path.split('/').pop()}`}
                    controls
                    width="100%"
                    height="auto"
                    onError={(e) => {
                        console.error('ReactPlayer Error:', e);
                        console.error('Failed URL:', `/Uploads/${file.path.split('/').pop()}`);
                        setError('视频加载失败，请检查文件路径');
                    }}
                />
            );
        }
        
        // 图片文件显示
        if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') || fileName.endsWith('.gif') || fileName.endsWith('.bmp')) {
            return (
                <img 
                    src={`/Uploads/${file.path.split('/').pop()}`}
                    alt={file.originalName}
                    style={{ maxWidth: '100%', height: 'auto' }}
                    onError={(e) => {
                        console.error('Image load error:', e);
                        setError('图片加载失败，请检查文件路径');
                    }}
                />
            );
        }
        
        // 文本文件显示
        if (fileName.endsWith('.txt') || fileName.endsWith('.log') || fileName.endsWith('.md')) {
            return (
                <div>
                    <p>文本文件预览功能开发中，请下载查看完整内容。</p>
                </div>
            );
        }
        
        // 其他文件类型
        return (
            <div>
                <p>此文件类型不支持在线预览，请下载查看。</p>
                <p><strong>文件类型:</strong> {fileName.split('.').pop()?.toUpperCase() || '未知'}</p>
                <p><strong>文件大小:</strong> {file.size}</p>
            </div>
        );
    };

    if (loading) return <div>加载中...</div>;
    if (error) return <div style={{ padding: '20px', color: 'red' }}>{error}</div>;
    if (!file) return <div>文件不存在</div>;

    return (
        <Card 
            title={
                <Space>
                    <Button 
                        icon={<ArrowLeftOutlined />} 
                        onClick={() => navigate('/data')}
                    >
                        返回
                    </Button>
                    <span>{file.originalName}</span>
                </Space>
            }
            extra={
                <Button 
                    type="primary" 
                    icon={<DownloadOutlined />}
                    onClick={handleDownload}
                >
                    下载文件
                </Button>
            }
        >
            <div style={{ marginBottom: '16px' }}>
                <p><strong>文件大小:</strong> {file.size}</p>
                <p><strong>上传时间:</strong> {new Date(file.uploadTime).toLocaleString()}</p>
                <p><strong>上传者:</strong> {file.uploader}</p>
                {file.duration && <p><strong>时长:</strong> {file.duration}</p>}
                {file.project && <p><strong>项目:</strong> {file.project}</p>}
            </div>
            
            {renderFileContent()}
        </Card>
    );
};

export default FileDetail;