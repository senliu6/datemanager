import React, { useState } from 'react';
import { Upload, Card, message, Progress, Collapse, List, Badge, notification } from 'antd';
import { InboxOutlined, CheckCircleOutlined, LoadingOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import axios from '../util/axios';

const { Dragger } = Upload;
const { Panel } = Collapse;

const UploadPage = () => {
    const [uploadProgress, setUploadProgress] = useState({});
    const [fileList, setFileList] = useState([]);
    const [overallProgress, setOverallProgress] = useState(0);
    const [uploadStats, setUploadStats] = useState({
        total: 0,
        completed: 0,
        failed: 0,
        uploading: 0
    });

    // 计算整体进度
    const calculateOverallProgress = (progressMap, stats) => {
        if (stats.total === 0) return 0;
        const completedProgress = stats.completed * 100;
        const currentProgress = Object.values(progressMap).reduce((sum, progress) => sum + progress, 0);
        return Math.round((completedProgress + currentProgress) / stats.total);
    };

    // 更新统计信息
    const updateStats = (fileList) => {
        const stats = {
            total: fileList.length,
            completed: fileList.filter(f => f.status === 'done').length,
            failed: fileList.filter(f => f.status === 'error').length,
            uploading: fileList.filter(f => f.status === 'uploading').length
        };
        setUploadStats(stats);
        setOverallProgress(calculateOverallProgress(uploadProgress, stats));
        return stats;
    };

    const customRequest = async ({ file, onSuccess, onError, onProgress }) => {
        // 更新文件状态为上传中
        setFileList(prev => {
            const newList = prev.map(f => f.uid === file.uid ? { ...f, status: 'uploading' } : f);
            updateStats(newList);
            return newList;
        });

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
                    setUploadProgress((prev) => {
                        const newProgress = {
                            ...prev,
                            [file.uid]: percentCompleted
                        };
                        // 实时更新整体进度
                        setOverallProgress(calculateOverallProgress(newProgress, uploadStats));
                        return newProgress;
                    });
                    onProgress({ percent: percentCompleted });
                },
            });

            if (response.data.success) {
                onSuccess(response.data);

                // 更新文件状态为完成
                setFileList(prev => {
                    const newList = prev.map(f => f.uid === file.uid ? { ...f, status: 'done' } : f);
                    const stats = updateStats(newList);

                    // 检查是否所有文件都上传完成
                    if (stats.uploading === 0 && stats.total > 0) {
                        notification.success({
                            message: '上传完成',
                            description: `成功上传 ${stats.completed} 个文件${stats.failed > 0 ? `，失败 ${stats.failed} 个` : ''}`,
                            duration: 4.5,
                        });
                    }

                    return newList;
                });
            } else {
                throw new Error(response.data.message || '上传失败');
            }

            // 清除该文件的进度记录
            setUploadProgress((prev) => {
                const newProgress = { ...prev };
                delete newProgress[file.uid];
                return newProgress;
            });
        } catch (error) {
            console.error('Upload error:', error);
            onError(error);

            // 更新文件状态为失败
            setFileList(prev => {
                const newList = prev.map(f => f.uid === file.uid ? { ...f, status: 'error', error: error.message } : f);
                updateStats(newList);
                return newList;
            });

            message.error(`${file.name} 上传失败: ${error.message}`);

            // 清除该文件的进度记录
            setUploadProgress((prev) => {
                const newProgress = { ...prev };
                delete newProgress[file.uid];
                return newProgress;
            });
        }
    };

    // 处理拖拽文件夹的函数
    const handleDrop = async (e) => {
        e.preventDefault();
        console.log('拖拽事件:', e.dataTransfer);

        const items = Array.from(e.dataTransfer.items);
        const files = [];

        // 递归处理文件夹
        const processEntry = async (entry, path = '') => {
            if (entry.isFile) {
                return new Promise((resolve) => {
                    entry.file((file) => {
                        // 为文件添加相对路径信息
                        const relativePath = path ? `${path}/${file.name}` : file.name;
                        Object.defineProperty(file, 'webkitRelativePath', {
                            value: relativePath,
                            writable: false
                        });
                        files.push(file);
                        resolve();
                    });
                });
            } else if (entry.isDirectory) {
                const dirReader = entry.createReader();
                return new Promise((resolve) => {
                    const readEntries = async () => {
                        dirReader.readEntries(async (entries) => {
                            if (entries.length === 0) {
                                resolve();
                                return;
                            }

                            const promises = entries.map(childEntry => {
                                const childPath = path ? `${path}/${entry.name}` : entry.name;
                                return processEntry(childEntry, childPath);
                            });

                            await Promise.all(promises);
                            await readEntries(); // 继续读取更多条目
                        });
                    };
                    readEntries();
                });
            }
        };

        // 处理所有拖拽的项目
        const promises = items.map(item => {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                return processEntry(entry);
            }
        });

        await Promise.all(promises);

        if (files.length > 0) {
            console.log(`拖拽获取到 ${files.length} 个文件:`, files.map(f => f.webkitRelativePath || f.name));

            // 创建文件列表对象
            const newFileList = files.map((file, index) => ({
                uid: `drag-${Date.now()}-${index}`,
                name: file.name,
                size: file.size,
                type: file.type,
                originFileObj: file,
                status: 'ready'
            }));

            // 更新文件列表
            setFileList(prev => [...prev, ...newFileList]);
            updateStats([...fileList, ...newFileList]);

            // 开始上传
            newFileList.forEach(fileItem => {
                // 为拖拽的文件添加uid，以便customRequest能正确处理
                fileItem.originFileObj.uid = fileItem.uid;

                customRequest({
                    file: fileItem.originFileObj,
                    onSuccess: (response) => {
                        console.log('上传成功:', fileItem.name);
                    },
                    onError: (error) => {
                        console.error('上传失败:', fileItem.name, error);
                    },
                    onProgress: (progress) => {
                        console.log('上传进度:', fileItem.name, progress.percent);
                    }
                });
            });

            message.success(`准备上传 ${files.length} 个文件`);
        }
    };

    const uploadProps = {
        name: 'file',
        multiple: true,
        directory: true,
        customRequest,
        fileList: fileList,
        onChange(info) {
            const { fileList: newFileList } = info;
            setFileList(newFileList);
            updateStats(newFileList);
        },
        onDrop: handleDrop,
        showUploadList: false, // 隐藏默认的文件列表，使用自定义的
    };

    // 获取文件状态图标
    const getFileStatusIcon = (status) => {
        switch (status) {
            case 'done':
                return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
            case 'error':
                return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
            case 'uploading':
                return <LoadingOutlined style={{ color: '#1890ff' }} />;
            default:
                return null;
        }
    };

    return (
        <div style={{ padding: '24px' }}>
            <Card title="文件上传">
                <div style={{ marginBottom: 16 }}>
                    <Dragger {...uploadProps} className="upload-dragger">
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">点击或拖拽文件/文件夹到此区域上传</p>
                        <p className="ant-upload-hint">
                            支持单个或批量文件上传，支持文件夹结构
                        </p>
                    </Dragger>
                </div>

                {/* 整体进度显示 */}
                {uploadStats.total > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span>整体进度</span>
                            <span>
                                <Badge count={uploadStats.completed} style={{ backgroundColor: '#52c41a', marginRight: 8 }} />
                                <Badge count={uploadStats.uploading} style={{ backgroundColor: '#1890ff', marginRight: 8 }} />
                                <Badge count={uploadStats.failed} style={{ backgroundColor: '#ff4d4f' }} />
                            </span>
                        </div>
                        <Progress
                            percent={overallProgress}
                            status={uploadStats.uploading > 0 ? 'active' : uploadStats.failed > 0 ? 'exception' : 'success'}
                            format={(percent) => `${uploadStats.completed}/${uploadStats.total} (${percent}%)`}
                        />
                    </div>
                )}

                {/* 详细文件列表 */}
                {fileList.length > 0 && (
                    <Collapse ghost>
                        <Panel header={`查看详情 (${fileList.length} 个文件)`} key="1">
                            <List
                                size="small"
                                dataSource={fileList}
                                renderItem={(file) => (
                                    <List.Item
                                        key={file.uid}
                                        style={{
                                            padding: '8px 0',
                                            borderBottom: '1px solid #f0f0f0'
                                        }}
                                    >
                                        <div style={{ width: '100%' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                                    {getFileStatusIcon(file.status)}
                                                    <span style={{ marginLeft: 8, flex: 1 }}>{file.name}</span>
                                                    <span style={{ color: '#666', fontSize: '12px' }}>
                                                        {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            {file.status === 'uploading' && uploadProgress[file.uid] && (
                                                <Progress
                                                    percent={uploadProgress[file.uid]}
                                                    size="small"
                                                    style={{ marginTop: 4 }}
                                                />
                                            )}
                                            {file.status === 'error' && file.error && (
                                                <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: 4 }}>
                                                    错误: {file.error}
                                                </div>
                                            )}
                                        </div>
                                    </List.Item>
                                )}
                            />
                        </Panel>
                    </Collapse>
                )}
            </Card>
        </div>
    );
};

export default UploadPage;