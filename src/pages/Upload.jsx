import React, {useState} from 'react';
import {Upload, Card, message, Progress} from 'antd';
import {InboxOutlined} from '@ant-design/icons';
import axios from '../util/axios';

const {Dragger} = Upload;

const UploadPage = () => {
    const [uploadProgress, setUploadProgress] = useState({});

    const customRequest = async ({file, onSuccess, onError, onProgress}) => {
        try {
            const folderPath = file.webkitRelativePath
                ? file.webkitRelativePath.split('/').slice(0, -1).join('/') || '未分类'
                : '未分类';
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folderPath', folderPath);

            const response = await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress((prev) => ({
                        ...prev,
                        [file.uid]: percentCompleted
                    }));
                    onProgress({percent: percentCompleted});
                },
            });

            if (response.data.success) {
                onSuccess(response.data);
                // message.success(`${file.name} 上传成功`);
            } else {
                throw new Error(response.data.message || '上传失败');
            }

            setUploadProgress((prev) => {
                const newProgress = {...prev};
                delete newProgress[file.uid];
                return newProgress;
            });
        } catch (error) {
            console.error('Upload error:', error);
            onError(error);
            message.error(`${file.name} 上传失败: ${error.message}`);
            setUploadProgress((prev) => {
                const newProgress = {...prev};
                delete newProgress[file.uid];
                return newProgress;
            });
        }
    };

    const uploadProps = {
        name: 'file',
        multiple: true,
        directory: true,
        customRequest,
        onChange(info) {
            const {status, name} = info.file;
            if (status === 'done') {
                // message.success(`${name} 上传成功`);
            } else if (status === 'error') {
                message.error(`${name} 上传失败`);
            }
        },
        onDrop(e) {
            console.log('Dropped files', e.dataTransfer.files);
        },
        showUploadList: {
            showRemoveIcon: true,
            showPreviewIcon: false,
            renderItem: (originNode, file) => (
                <div>
                    {originNode}
                    {uploadProgress[file.uid] && (
                        <Progress percent={uploadProgress[file.uid]} size="small"/>
                    )}
                </div>
            ),
        },
    };

    return (
        <div style={{padding: '24px'}}>
            <Card title="文件上传">
                <div style={{marginBottom: 16}}>
                    <Dragger {...uploadProps} className="upload-dragger">
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined/>
                        </p>
                        <p className="ant-upload-text">点击或拖拽文件/文件夹到此区域上传</p>
                        <p className="ant-upload-hint">
                            支持单个或批量文件上传，支持文件夹结构
                        </p>
                    </Dragger>
                </div>
            </Card>
        </div>
    );
};

export default UploadPage;