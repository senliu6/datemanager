import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Upload, Card, message, Progress, Button, Space, InputNumber, Alert, Statistic, Row, Col, notification } from 'antd';
import { InboxOutlined, PauseOutlined, PlayCircleOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from '../util/axios';

const { Dragger } = Upload;

const UploadPage = () => {
    // 核心状态
    const [uploadStats, setUploadStats] = useState({
        total: 0,
        completed: 0,
        failed: 0,
        uploading: 0,
        queued: 0
    });
    const [overallProgress, setOverallProgress] = useState(0);
    const [batchSize, setBatchSize] = useState(8); // 提高默认并发数
    const [isPaused, setIsPaused] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // 使用 Ref 管理大量数据，避免频繁重渲染
    const uploadQueueRef = useRef([]);
    const activeUploadsRef = useRef(new Set());
    const abortControllersRef = useRef(new Map());
    const completedFilesRef = useRef([]);
    const failedFilesRef = useRef([]);
    const uploadProgressRef = useRef({});

    // 计算整体进度 - 移除对uploadStats的依赖
    const calculateProgress = useCallback((stats) => {
        if (stats.total === 0) return 0;
        
        const completedProgress = stats.completed * 100;
        const currentProgress = Object.values(uploadProgressRef.current).reduce((sum, progress) => sum + progress, 0);
        return Math.round((completedProgress + currentProgress) / stats.total);
    }, []);

    // 更新统计信息 - 修复循环依赖
    const updateStats = useCallback(() => {
        const stats = {
            total: uploadQueueRef.current.length + activeUploadsRef.current.size + completedFilesRef.current.length + failedFilesRef.current.length,
            completed: completedFilesRef.current.length,
            failed: failedFilesRef.current.length,
            uploading: activeUploadsRef.current.size,
            queued: uploadQueueRef.current.length
        };
        
        setUploadStats(stats);
        setOverallProgress(calculateProgress(stats));
        
        return stats;
    }, [calculateProgress]);

    // 智能并发数计算
    const calculateOptimalConcurrency = useCallback((fileCount, avgSizeMB) => {
        let concurrency = 8; // 默认值
        
        // 根据文件数量调整
        if (fileCount > 50000) {
            concurrency = 3;
        } else if (fileCount > 20000) {
            concurrency = 4;
        } else if (fileCount > 10000) {
            concurrency = 5;
        } else if (fileCount > 5000) {
            concurrency = 6;
        } else if (fileCount > 1000) {
            concurrency = 8;
        } else {
            concurrency = 12;
        }
        
        // 根据平均文件大小调整
        if (avgSizeMB > 100) {
            concurrency = Math.max(1, Math.floor(concurrency / 4));
        } else if (avgSizeMB > 50) {
            concurrency = Math.max(2, Math.floor(concurrency / 2));
        } else if (avgSizeMB > 10) {
            concurrency = Math.max(3, Math.floor(concurrency * 0.8));
        } else if (avgSizeMB < 1) {
            concurrency = Math.min(20, concurrency + 4);
        }
        
        console.log(`智能并发数: 文件数=${fileCount}, 平均大小=${avgSizeMB.toFixed(2)}MB, 推荐并发=${concurrency}`);
        return concurrency;
    }, []);

    // 单个文件上传
    const uploadSingleFile = useCallback(async (fileItem) => {
        const abortController = new AbortController();
        abortControllersRef.current.set(fileItem.uid, abortController);

        try {
            const folderPath = fileItem.originFileObj.webkitRelativePath
                ? fileItem.originFileObj.webkitRelativePath.split('/').slice(0, -1).join('/') || '未分类'
                : '未分类';
            
            const formData = new FormData();
            formData.append('file', fileItem.originFileObj);
            formData.append('folderPath', folderPath);

            const response = await axios.post('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: abortController.signal,
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    uploadProgressRef.current[fileItem.uid] = percentCompleted;
                    
                    // 减少状态更新频率
                    if (percentCompleted % 25 === 0 || percentCompleted === 100) {
                        // 计算当前统计信息
                        const currentStats = {
                            total: uploadQueueRef.current.length + activeUploadsRef.current.size + completedFilesRef.current.length + failedFilesRef.current.length,
                            completed: completedFilesRef.current.length,
                            failed: failedFilesRef.current.length,
                            uploading: activeUploadsRef.current.size,
                            queued: uploadQueueRef.current.length
                        };
                        setOverallProgress(calculateProgress(currentStats));
                    }
                },
            });

            if (response.data.success) {
                completedFilesRef.current.push(fileItem);
                delete uploadProgressRef.current[fileItem.uid];
            } else {
                throw new Error(response.data.message || '上传失败');
            }

        } catch (error) {
            if (error.name === 'CanceledError') {
                return;
            }
            failedFilesRef.current.push({ ...fileItem, error: error.message });
            delete uploadProgressRef.current[fileItem.uid];
        } finally {
            activeUploadsRef.current.delete(fileItem.uid);
            abortControllersRef.current.delete(fileItem.uid);
            updateStats();
            
            // 继续处理队列
            setTimeout(() => processUploadQueue(), 5);
        }
    }, [calculateProgress, updateStats]);

    // 队列处理器
    const processUploadQueue = useCallback(() => {
        if (isPaused || isProcessing) return;
        
        setIsProcessing(true);
        
        while (uploadQueueRef.current.length > 0 && activeUploadsRef.current.size < batchSize && !isPaused) {
            const fileItem = uploadQueueRef.current.shift();
            if (!fileItem) continue;
            
            activeUploadsRef.current.add(fileItem.uid);
            uploadSingleFile(fileItem);
        }
        
        setIsProcessing(false);
    }, [isPaused, isProcessing, batchSize, uploadSingleFile]);

    // 确保并发数变化时重新启动队列处理
    useEffect(() => {
        if (!isPaused && uploadQueueRef.current.length > 0) {
            processUploadQueue();
        }
    }, [batchSize, processUploadQueue]);

    // 压缩images文件夹的函数
    const compressImagesFolder = useCallback(async (imagesEntry) => {
        return new Promise(async (resolve) => {
            try {
                // 动态导入JSZip
                const JSZip = (await import('jszip')).default;
                const zip = new JSZip();
                
                message.info('正在压缩images文件夹...');
                
                // 递归添加文件到压缩包
                const addToZip = async (entry, zipFolder, basePath = '') => {
                    if (entry.isFile) {
                        return new Promise((fileResolve) => {
                            entry.file((file) => {
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                    const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
                                    zipFolder.file(relativePath, e.target.result);
                                    fileResolve();
                                };
                                reader.readAsArrayBuffer(file);
                            });
                        });
                    } else if (entry.isDirectory) {
                        const dirReader = entry.createReader();
                        const newZipFolder = zipFolder.folder(entry.name);
                        const newBasePath = basePath ? `${basePath}/${entry.name}` : entry.name;
                        
                        return new Promise((dirResolve) => {
                            const readEntries = () => {
                                dirReader.readEntries(async (entries) => {
                                    if (entries.length === 0) {
                                        dirResolve();
                                        return;
                                    }
                                    
                                    for (const childEntry of entries) {
                                        await addToZip(childEntry, newZipFolder, '');
                                    }
                                    
                                    readEntries(); // 继续读取更多条目
                                });
                            };
                            readEntries();
                        });
                    }
                };
                
                // 添加images文件夹内容到压缩包
                const imagesFolder = zip.folder('images');
                const dirReader = imagesEntry.createReader();
                
                const processImagesEntries = () => {
                    dirReader.readEntries(async (entries) => {
                        if (entries.length === 0) {
                            // 生成压缩包
                            const zipBlob = await zip.generateAsync({ type: 'blob' });
                            
                            // 创建压缩包文件对象
                            const zipFile = new File([zipBlob], 'images.zip', { type: 'application/zip' });
                            Object.defineProperty(zipFile, 'webkitRelativePath', {
                                value: 'images.zip',
                                writable: false
                            });
                            
                            message.success(`images文件夹已压缩，大小: ${(zipBlob.size / 1024 / 1024).toFixed(2)}MB`);
                            resolve(zipFile);
                            return;
                        }
                        
                        for (const entry of entries) {
                            await addToZip(entry, imagesFolder);
                        }
                        
                        processImagesEntries(); // 继续读取更多条目
                    });
                };
                
                processImagesEntries();
                
            } catch (error) {
                console.error('压缩images文件夹失败:', error);
                message.error('压缩images文件夹失败');
                resolve(null);
            }
        });
    }, []);

    // LeRobot数据处理 - 压缩images文件夹，正常处理data、meta、videos
    const processLeRobotData = useCallback(async (items) => {
        message.info('开始处理LeRobot数据，将压缩images文件夹...');
        
        let totalProcessed = 0;
        let totalSize = 0;
        let imagesEntry = null;
        const allowedFolders = ['data', 'meta', 'videos']; // 正常处理这三个文件夹
        
        // 显示进度通知
        let progressNotification = null;
        const showProgress = (processed, compressed, avgSize) => {
            if (progressNotification) {
                notification.destroy(progressNotification.key);
            }
            
            progressNotification = notification.info({
                key: 'file-progress',
                message: 'LeRobot数据处理进度',
                description: `已处理 ${processed} 个文件${compressed ? '，images文件夹已压缩' : ''}，平均大小: ${avgSize.toFixed(2)}MB`,
                duration: 0,
                btn: (
                    <Button size="small" onClick={() => {
                        notification.destroy('file-progress');
                    }}>
                        隐藏
                    </Button>
                ),
            });
        };

        // 检查路径是否在images文件夹内
        const isInImagesFolder = (fullPath) => {
            const pathParts = fullPath.split('/');
            return pathParts[0] === 'images';
        };

        // 递归处理目录条目 - 添加详细调试信息
        const processDirectoryRecursive = async (entry, basePath = '') => {
            return new Promise((resolve) => {
                if (entry.isFile) {
                    const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
                    
                    // 详细调试信息
                    console.log(`🔍 处理文件: ${fullPath}`);
                    
                    // 如果文件在images文件夹内，跳过处理
                    if (isInImagesFolder(fullPath)) {
                        console.log(`❌ 跳过images文件: ${fullPath}`);
                        resolve();
                        return;
                    }
                    
                    console.log(`✅ 添加文件到队列: ${fullPath}`);
                    
                    entry.file((file) => {
                        Object.defineProperty(file, 'webkitRelativePath', {
                            value: fullPath,
                            writable: false
                        });
                        
                        const fileItem = {
                            uid: `lerobot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            originFileObj: file,
                            status: 'queued'
                        };

                        uploadQueueRef.current.push(fileItem);
                        totalProcessed++;
                        totalSize += file.size || 0;
                        
                        resolve();
                    });
                } else if (entry.isDirectory) {
                    const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
                    
                    console.log(`📁 处理目录: ${fullPath} (basePath: "${basePath}", entry.name: "${entry.name}")`);
                    
                    // 如果是顶级images文件夹，保存引用稍后压缩，不处理其内容
                    if (entry.name === 'images' && !basePath) {
                        console.log('🎯 发现顶级images文件夹，将进行压缩处理，跳过其内容');
                        imagesEntry = entry;
                        resolve();
                        return;
                    }
                    
                    // 如果是images文件夹内的子文件夹，也跳过
                    if (isInImagesFolder(fullPath)) {
                        console.log(`❌ 跳过images子目录: ${fullPath}`);
                        resolve();
                        return;
                    }
                    
                    console.log(`✅ 处理目录内容: ${fullPath}`);
                    
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
                                    
                                    console.log(`📂 读取到 ${entries.length} 个条目在目录: ${fullPath}`);
                                    allEntries.push(...entries);
                                    await readBatch(); // 继续读取更多条目
                                    batchResolve();
                                });
                            });
                        };
                        
                        await readBatch();
                        
                        console.log(`📊 目录 ${fullPath} 总共有 ${allEntries.length} 个条目`);
                        
                        // 递归处理所有子条目
                        for (const childEntry of allEntries) {
                            await processDirectoryRecursive(childEntry, fullPath);
                            
                            // 每处理一些文件就更新进度和启动上传
                            if (totalProcessed % 50 === 0) {
                                console.log(`📈 已处理 ${totalProcessed} 个文件`);
                                updateStats();
                                processUploadQueue();
                                
                                const avgSizeMB = totalSize > 0 ? (totalSize / totalProcessed) / (1024 * 1024) : 0;
                                
                                // 动态调整并发数
                                if (totalProcessed % 500 === 0) {
                                    const optimalConcurrency = calculateOptimalConcurrency(totalProcessed, avgSizeMB);
                                    setBatchSize(optimalConcurrency);
                                }
                                
                                // 显示进度
                                if (totalProcessed % 200 === 0) {
                                    showProgress(totalProcessed, false, avgSizeMB);
                                }
                                
                                // 让出主线程
                                await new Promise(resolve => setTimeout(resolve, 10));
                            }
                        }
                        
                        resolve();
                    };
                    
                    readAllEntries();
                } else {
                    resolve();
                }
            });
        };

        try {
            // 第一步：处理所有拖拽项目，收集images文件夹
            for (const item of items) {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    await processDirectoryRecursive(entry);
                    // 每个顶级项目后让出主线程
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
            }
            
            // 第二步：如果找到images文件夹，进行压缩
            if (imagesEntry) {
                const compressedFile = await compressImagesFolder(imagesEntry);
                if (compressedFile) {
                    const zipFileItem = {
                        uid: `images-zip-${Date.now()}`,
                        name: 'images.zip',
                        size: compressedFile.size,
                        type: 'application/zip',
                        originFileObj: compressedFile,
                        status: 'queued'
                    };
                    
                    uploadQueueRef.current.push(zipFileItem);
                    totalProcessed++;
                    totalSize += compressedFile.size;
                    
                    showProgress(totalProcessed, true, totalSize > 0 ? (totalSize / totalProcessed) / (1024 * 1024) : 0);
                }
            }
            
            // 清除进度通知
            if (progressNotification) {
                notification.destroy('file-progress');
            }
            
            // 最终统计
            updateStats();
            processUploadQueue();
            
            const avgSizeMB = totalSize > 0 ? (totalSize / totalProcessed) / (1024 * 1024) : 0;
            const finalConcurrency = calculateOptimalConcurrency(totalProcessed, avgSizeMB);
            setBatchSize(finalConcurrency);
            
            message.success(`LeRobot数据处理完成！共处理 ${totalProcessed} 个文件${imagesEntry ? '（包含压缩的images.zip）' : ''}，智能并发数: ${finalConcurrency}`);
            
            // 显示处理结果
            notification.success({
                message: 'LeRobot数据处理完成',
                description: (
                    <div>
                        <div>✅ 已处理文件夹: data, meta, videos</div>
                        <div>{imagesEntry ? '📦 images文件夹已压缩为 images.zip' : '❌ 未发现images文件夹'}</div>
                        <div>📊 总计处理: {totalProcessed} 个文件</div>
                    </div>
                ),
                duration: 8,
            });
            
        } catch (error) {
            if (progressNotification) {
                notification.destroy('file-progress');
            }
            console.error('LeRobot数据处理失败:', error);
            message.error('LeRobot数据处理失败，请重试');
        }
    }, [updateStats, processUploadQueue, calculateOptimalConcurrency, compressImagesFolder]);

    // 处理拖拽
    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        
        const items = Array.from(e.dataTransfer.items);
        if (items.length === 0) return;

        // 使用LeRobot数据处理，自动忽略images文件夹
        return processLeRobotData(items);
    }, [processLeRobotData]);

    // 控制操作
    const togglePause = useCallback(() => {
        setIsPaused(!isPaused);
        if (isPaused) {
            processUploadQueue();
            message.info('已恢复上传');
        } else {
            abortControllersRef.current.forEach(controller => controller.abort());
            message.info('已暂停上传');
        }
    }, [isPaused, processUploadQueue]);

    const clearAll = useCallback(() => {
        abortControllersRef.current.forEach(controller => controller.abort());
        
        uploadQueueRef.current = [];
        activeUploadsRef.current.clear();
        abortControllersRef.current.clear();
        completedFilesRef.current = [];
        failedFilesRef.current = [];
        uploadProgressRef.current = {};
        
        setUploadStats({ total: 0, completed: 0, failed: 0, uploading: 0, queued: 0 });
        setOverallProgress(0);
        setIsPaused(false);
        
        message.success('已清除所有文件');
    }, []);

    const retryFailed = useCallback(() => {
        const failedFiles = [...failedFilesRef.current];
        if (failedFiles.length === 0) {
            message.info('没有失败的文件需要重试');
            return;
        }

        failedFilesRef.current = [];
        uploadQueueRef.current.push(...failedFiles.map(f => ({ ...f, status: 'queued' })));
        updateStats();
        processUploadQueue();
        
        message.info(`开始重试 ${failedFiles.length} 个失败的文件`);
    }, [updateStats, processUploadQueue]);

    const uploadProps = {
        name: 'file',
        multiple: true,
        directory: true,
        showUploadList: false,
        customRequest: ({ file, onSuccess }) => {
            const fileItem = {
                uid: `single-${Date.now()}`,
                name: file.name,
                size: file.size,
                type: file.type,
                originFileObj: file,
                status: 'queued'
            };

            uploadQueueRef.current.push(fileItem);
            updateStats();
            processUploadQueue();
            onSuccess({ success: true });
        },
        onDrop: handleDrop,
    };

    // 性能优化的统计显示
    const statsDisplay = useMemo(() => (
        <Row gutter={16}>
            <Col span={6}>
                <Statistic title="总计" value={uploadStats.total} />
            </Col>
            <Col span={6}>
                <Statistic title="队列中" value={uploadStats.queued} valueStyle={{ color: '#faad14' }} />
            </Col>
            <Col span={6}>
                <Statistic title="上传中" value={uploadStats.uploading} valueStyle={{ color: '#1890ff' }} />
            </Col>
            <Col span={6}>
                <Statistic title="已完成" value={uploadStats.completed} valueStyle={{ color: '#52c41a' }} />
            </Col>
        </Row>
    ), [uploadStats]);

    return (
        <div style={{ padding: '24px' }}>
            <Card title="LeRobot数据智能上传">
                <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">点击或拖拽LeRobot数据文件夹到此区域上传</p>
                    <p className="ant-upload-hint">
                        自动处理data、meta、videos文件夹，images文件夹将被压缩为zip文件上传
                    </p>
                </Dragger>

                {uploadStats.total > 0 && (
                    <>
                        <Alert
                            message="智能上传控制"
                            description={
                                <Space>
                                    <span>并发数:</span>
                                    <InputNumber
                                        min={1}
                                        max={30}
                                        value={batchSize}
                                        onChange={(value) => {
                                            setBatchSize(value);
                                            console.log(`手动调整并发数为: ${value}`);
                                        }}
                                        size="small"
                                        style={{ width: 80 }}
                                    />
                                    <span style={{ fontSize: '12px', color: '#666' }}>
                                        (系统会根据文件特征自动调整)
                                    </span>
                                    <Button
                                        type={isPaused ? "primary" : "default"}
                                        icon={isPaused ? <PlayCircleOutlined /> : <PauseOutlined />}
                                        onClick={togglePause}
                                        size="small"
                                    >
                                        {isPaused ? '恢复' : '暂停'}
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

                        {statsDisplay}

                        <Progress
                            percent={overallProgress}
                            status={uploadStats.uploading > 0 ? 'active' : uploadStats.failed > 0 ? 'exception' : 'success'}
                            format={(percent) => `${uploadStats.completed}/${uploadStats.total} (${percent}%)`}
                            style={{ marginTop: 16 }}
                        />

                        {uploadStats.failed > 0 && (
                            <Alert
                                message={`${uploadStats.failed} 个文件上传失败`}
                                type="error"
                                showIcon
                                style={{ marginTop: 16 }}
                            />
                        )}
                    </>
                )}
            </Card>
        </div>
    );
};

export default UploadPage;