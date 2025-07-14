import React, { useState, useEffect } from 'react';
import { Card } from 'antd';
import ReactPlayer from 'react-player';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const FileDetail = () => {
    const { id } = useParams();
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) return;
        axios.get(`/api/files/${id}`)
            .then(res => {
                console.log('API Response:', res.data);
                setFile(res.data.data);
            })
            .catch(err => {
                console.error("请求出错:", err);
                setError("无法加载文件，请稍后重试");
            });
    }, [id]);

    if (error) return <div>{error}</div>;
    if (!file) return <div>加载中...</div>;

    return file && file.path ? (
        <Card title={file.originalName}>
            <ReactPlayer
                url={`/Uploads/${file.path.split('/').pop()}`} // 提取文件名
                controls
                width="100%"
                height="auto"
                onError={(e) => {
                    console.error('ReactPlayer Error:', e);
                    console.error('Failed URL:', `/Uploads/${file.path.split('/').pop()}`); // 打印失败的 URL
                    setError('视频加载失败，请检查文件路径');
                }}
            />
        </Card>
    ) : <div>文件不存在</div>;
};

export default FileDetail;