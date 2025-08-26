import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Card, message, Progress, Button, InputNumber, Alert, Statistic, Row, Col, Dropdown, Space, Modal } from 'antd';
import { InboxOutlined, PauseOutlined, PlayCircleOutlined, DeleteOutlined, ReloadOutlined, HistoryOutlined, DownOutlined } from '@ant-design/icons';
import axios from '../util/axios';
import uploadManager from '../utils/uploadManager';
import UploadRecordsModal from '../components/UploadRecordsModal';
import FailedFilesCollapse from '../components/FailedFilesCollapse';

const { Dragger } = Upload;

const UploadPage = () => {
    // 基础状态 - 从全局管理器获取
    const [uploadStats, setUploadStats] = useState(uploadManager.getStats());
    const [showRecordsModal, setShowRecordsModal] = useState(false);
    const [recordsRefreshTrigger, setRecordsRefreshTrigger] = useState(0);

    // 生成会话ID
    const generateSessionId = () => `upload_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // 创建上传记录
    const createUploadRecord = useCallback(async (sessionId, totalFiles, totalSize, folderPath) => {
        try {
            await axios.post('/api/upload-records', {
                session_id: sessionId,
                total_files: totalFiles,
                total_size: totalSize,
                start_time: new Date().toISOString(),
                status: 'in_progress',
                folder_path: folderPath,
                notes: `上传 ${totalFiles} 个文件`
            });
        } catch (error) {
            console.error('创建上传记录失败:', error);
            message.error('创建上传记录失败');
        }
    }, []);

    // 监听上传管理器状态变化
    useEffect(() => {
        const handleStatsUpdate = (stats) => {
            setUploadStats(stats);

            // 如果上传完成，触发记录刷新
            if (stats.uploading === 0 && stats.queued === 0 && stats.total > 0) {
                setRecordsRefreshTrigger(prev => prev + 1);
            }
        };

        uploadManager.addListener(handleStatsUpdate);

        return () => {
            uploadManager.removeListener(handleStatsUpdate);
        };
    }, []);

    // 处理文件拖拽
    const handleDrop = useCallback(async (e) => {
        e.preventDefault();

        const items = Array.from(e.dataTransfer.items);
        if (items.length === 0) return;

        // 生成新的会话ID
        const sessionId = generateSessionId();

        let totalFiles = 0;
        let totalSize = 0;
        const files = [];

        // 递归处理文件夹
        const processEntry = async (entry, basePath = '') => {
            return new Promise((resolve) => {
                if (entry.isFile) {
                    entry.file((file) => {
                        const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
                        Object.defineProperty(file, 'webkitRelativePath', {
                            value: fullPath,
                            writable: false
                        });

                        files.push(file);
                        totalFiles++;
                        totalSize += file.size || 0;
                        resolve();
                    });
                } else if (entry.isDirectory) {
                    const dirReader = entry.createReader();
                    const readAllEntries = async () => {
                        const allEntries = [];

                        const readBatch = () => {
                            return new Promise((batchResolve) => {
                                dirReader.readEntries(async (entries) => {
                                    if (entries.length === 0) {
                                        batchResolve();
                                        return;
                                    }
                                    allEntries.push(...entries);
                                    await readBatch();
                                    batchResolve();
                                });
                            });
                        };

                        await readBatch();

                        // 使用Promise.all来并行处理所有子条目
                        await Promise.all(allEntries.map(childEntry => {
                            const newPath = basePath ? `${basePath}/${entry.name}` : entry.name;
                            return processEntry(childEntry, newPath);
                        }));

                        resolve();
                    };

                    readAllEntries();
                } else {
                    resolve();
                }
            });
        };

        // 处理所有拖拽项目
        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                await processEntry(entry);
            }
        }

        // 添加文件到全局管理器
        const folderPath = items[0]?.webkitGetAsEntry()?.name || '未分类';

        if (totalFiles > 0) {
            await createUploadRecord(sessionId, totalFiles, totalSize, folderPath);
            uploadManager.addFiles(files, sessionId, folderPath);
            message.success(`已添加 ${totalFiles} 个文件到上传队列`);
        }
    }, [createUploadRecord]);

    // 暂停/恢复上传
    const togglePause = useCallback(() => {
        if (uploadStats.isPaused) {
            uploadManager.resume();
            message.info('已恢复上传');
        } else {
            uploadManager.pause();
            message.info('已暂停上传');
        }
    }, [uploadStats.isPaused]);



    // 清除所有文件
    const clearAll = useCallback(() => {
        uploadManager.clearAll();
        message.success('已清除所有文件');
    }, []);

    // 重试失败的文件
    const retryFailed = useCallback(() => {
        const result = uploadManager.retryFailed();
        if (result.success) {
            if (result.skippedCount > 0) {
                message.warning(`${result.skippedCount} 个文件无法重试，已从列表中移除。`);
            }
            message.info(result.message);
        } else {
            message.warning(result.message + '。请重新选择文件上传。');
        }
    }, []);

    // 处理文件选择（点击选择）
    const handleFileSelect = useCallback(async (fileList) => {
        if (!fileList || fileList.length === 0) return;

        // 生成新的会话ID
        const sessionId = generateSessionId();
        let totalSize = 0;

        // 计算总大小并确定文件夹名称
        let folderName = '文件选择上传';

        for (const file of fileList) {
            totalSize += file.size || 0;

            // 如果文件有webkitRelativePath，说明是文件夹上传
            if (file.webkitRelativePath) {
                const pathParts = file.webkitRelativePath.split('/');
                if (pathParts.length > 1) {
                    folderName = pathParts[0]; // 使用第一级文件夹名称
                }
            }
        }

        // 如果所有文件都没有webkitRelativePath，检查是否有共同的文件夹结构
        if (folderName === '文件选择上传' && fileList.length > 1) {
            // 检查文件名是否有共同前缀或者是否来自同一个文件夹
            const firstFile = fileList[0];
            if (firstFile.webkitRelativePath) {
                const pathParts = firstFile.webkitRelativePath.split('/');
                if (pathParts.length > 1) {
                    folderName = pathParts[0];
                }
            } else {
                // 如果是多个单独文件，使用"混合文件"作为文件夹名
                folderName = fileList.length > 5 ? `批量文件上传(${fileList.length}个)` : '混合文件上传';
            }
        }

        // 创建上传记录
        await createUploadRecord(sessionId, fileList.length, totalSize, folderName);

        // 添加到全局管理器
        uploadManager.addFiles(fileList, sessionId, folderName);
        message.success(`已添加 ${fileList.length} 个文件到上传队列`);
    }, [createUploadRecord]);

    // 上传配置
    const uploadProps = {
        name: 'file',
        multiple: true,
        directory: true,
        showUploadList: false,
        beforeUpload: (file, fileList) => {
            // 拦截默认上传，使用我们的处理逻辑
            if (fileList.indexOf(file) === 0) {
                // 只在第一个文件时处理整个文件列表
                handleFileSelect(fileList);
            }
            return false; // 阻止默认上传
        },
        onDrop: handleDrop,
    };

    // 清空所有上传记录
    const clearAllRecords = useCallback(async () => {
        try {
            const response = await axios.delete('/api/upload-records/all');
            if (response.data.success) {
                setRecordsRefreshTrigger(prev => prev + 1);
                message.success('已清空所有上传记录');
            }
        } catch (error) {
            console.error('清空上传记录失败:', error);
            message.error('清空上传记录失败');
        }
    }, []);

    // 上传记录下拉菜单
    const recordsMenuItems = [
        {
            key: 'view',
            icon: <HistoryOutlined />,
            label: '查看上传记录',
            onClick: () => {
                setShowRecordsModal(true);
            }
        },
        {
            key: 'refresh',
            icon: <ReloadOutlined />,
            label: '刷新记录',
            onClick: () => {
                setRecordsRefreshTrigger(prev => prev + 1);
                message.success('已刷新上传记录');
            }
        },
        {
            type: 'divider'
        },
        {
            key: 'clear',
            icon: <DeleteOutlined />,
            label: '清空所有记录',
            danger: true,
            onClick: () => {
                Modal.confirm({
                    title: '确认清空',
                    content: '确定要清空所有上传记录吗？此操作不可恢复。',
                    okText: '确定',
                    cancelText: '取消',
                    okType: 'danger',
                    onOk: clearAllRecords
                });
            }
        }
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card
                title="文件上传"
                extra={
                    <Dropdown menu={{ items: recordsMenuItems }} trigger={['click']}>
                        <Button type="link">
                            上传记录 <DownOutlined />
                        </Button>
                    </Dropdown>
                }
            >
                <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">点击或拖拽文件/文件夹到此区域上传</p>
                    <p className="ant-upload-hint">
                        支持单个文件或整个文件夹上传，支持大文件上传
                    </p>
                </Dragger>

                {uploadStats.total > 0 && (
                    <>
                        <Alert
                            message="上传控制"
                            description={
                                <Space>
                                    <span>并发数:</span>
                                    <InputNumber
                                        min={1}
                                        max={20}
                                        value={uploadStats.batchSize}
                                        onChange={(value) => {
                                            uploadManager.setBatchSize(value);
                                        }}
                                        size="small"
                                        style={{ width: 80 }}
                                    />
                                    <Button
                                        type={uploadStats.isPaused ? "primary" : "default"}
                                        icon={uploadStats.isPaused ? <PlayCircleOutlined /> : <PauseOutlined />}
                                        onClick={togglePause}
                                        size="small"
                                    >
                                        {uploadStats.isPaused ? '恢复' : '暂停'}
                                    </Button>
                                    {uploadStats.failed > 0 && (
                                        <Button
                                            type="primary"
                                            icon={<ReloadOutlined />}
                                            onClick={retryFailed}
                                            size="small"
                                        >
                                            重试失败 ({uploadStats.failed})
                                        </Button>
                                    )}

                                    <Button
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={clearAll}
                                        size="small"
                                    >
                                        清除全部
                                    </Button>
                                </Space>
                            }
                            type="info"
                            style={{ marginBottom: 16 }}
                        />

                        <Row gutter={16} style={{ marginBottom: 16 }}>
                            <Col span={6}>
                                <Statistic title="总计" value={uploadStats.total} />
                            </Col>
                            <Col span={6}>
                                <Statistic
                                    title="队列中"
                                    value={uploadStats.queued}
                                    valueStyle={{ color: '#faad14' }}
                                />
                            </Col>
                            <Col span={6}>
                                <Statistic title="上传中" value={uploadStats.uploading} valueStyle={{ color: '#1890ff' }} />
                            </Col>
                            <Col span={6}>
                                <Statistic title="已完成" value={uploadStats.completed} valueStyle={{ color: '#52c41a' }} />
                            </Col>
                        </Row>

                        <Progress
                            percent={uploadStats.progress}
                            status={uploadStats.uploading > 0 ? 'active' : uploadStats.failed > 0 ? 'exception' : 'success'}
                            format={(percent) => `${uploadStats.completed}/${uploadStats.total} (${percent}%)`}
                        />

                        {uploadStats.failed > 0 && (
                            <FailedFilesCollapse
                                failedFiles={uploadManager.failedFiles}
                                failedCount={uploadStats.failed}
                            />
                        )}
                    </>
                )}
            </Card>

            <UploadRecordsModal
                visible={showRecordsModal}
                onClose={() => setShowRecordsModal(false)}
                refreshTrigger={recordsRefreshTrigger}
            />
        </div>
    );
};

export default UploadPage;