import React, {useEffect, useState} from 'react';
import {Button, Card, Form, Input, message, Modal, Row, Col, Select, Space, Table, Tag, Tooltip} from 'antd';
import {CheckCircleOutlined, SyncOutlined, DownloadOutlined, CloudSyncOutlined} from '@ant-design/icons';
import {useNavigate} from 'react-router-dom';
import axios from '../util/axios';
import LeRobotEpisodeCard from '../components/LeRobotEpisodeCard';
import ErrorBoundary from '../components/ErrorBoundary';
import './DataList.css';
import JSZip from 'jszip';
import {saveAs} from 'file-saver';

const {Search} = Input;

const DataList = () => {
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingFile, setEditingFile] = useState(null);
    const [form] = Form.useForm();
    const [viewMode, setViewMode] = useState('list');
    const navigate = useNavigate();
    const [filteredData, setFilteredData] = useState([]);
    const [episodesMeta, setEpisodesMeta] = useState([]);
    const [selectedEpisode, setSelectedEpisode] = useState(null);

    const [currentFolderPath, setCurrentFolderPath] = useState(null);


    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/files', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            // console.log('API /api/files response:', response.data.data);
            const files = (response.data.data || []).map((file) => ({
                key: file.id,
                fileName: file.fileName || file.originalName,
                originalName: file.originalName,
                tags: file.tags || [],
                size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                duration: file.duration || '未知',
                project: file.project || '未分类',
                uploader: file.uploader,
                uploadTime: new Date(file.uploadTime).toLocaleString(),
                task: file.task,
                annotation: file.annotation,
                path: file.path,
                folderPath: file.folderPath || '未分类',
            }));

            const groupedData = groupFilesByFolder(files);
            setData(groupedData);
            setFilteredData(groupedData);
        } catch (error) {
            message.error('获取数据失败');
            console.error('获取数据失败:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (viewMode === 'single' && data.length > 0 && !currentFolderPath) {
            const firstValidPath = flattenGroup(data)[0]?.key; // 使用 key 作为 fallback
            console.log('📂 Initial firstValidPath =', firstValidPath);
            if (firstValidPath) {
                setCurrentFolderPath(firstValidPath);
                fetchEpisodeData(firstValidPath);
            } else {
                console.warn('No valid folderPath or key found');
                setEpisodesMeta([]);
                message.warning('未找到有效的 folderPath');
            }
        }
    }, [viewMode, data, currentFolderPath]);





    const fetchEpisodeDataWithQuality = async (folderPath, quality) => {
        console.log('fetchEpisodeDataWithQuality called with quality:', quality);
        
        setLoading(true);
        try {
            const response = await axios.post('/api/lerobot/parse', {folderPath, quality}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            
            console.log('API /api/lerobot/parse Response:', response.data.data?.length, 'episodes');
            if (!response.data.data || response.data.data.length === 0) {
                message.warning('未找到有效的 episode 数据');
                setEpisodesMeta([]);
                setSelectedEpisode(null);
            } else {
                const uniqueEpisodes = response.data.data.reduce((acc, ep) => {
                    if (!acc.find(item => item.key === ep.key)) {
                        console.log(`Episode: ${ep.key}, Frame count: ${ep.frame_count}`);
                        acc.push(ep);
                    }
                    return acc;
                }, []);
                
                // 按episode索引排序
                uniqueEpisodes.sort((a, b) => {
                    const aIndex = parseInt(a.key.replace('episode_', ''));
                    const bIndex = parseInt(b.key.replace('episode_', ''));
                    return aIndex - bIndex;
                });
                
                setEpisodesMeta(uniqueEpisodes);
                // 选择第一个episode
                const firstEpisode = uniqueEpisodes[0] || null;
                setSelectedEpisode(firstEpisode);
            }
        } catch (err) {
            console.error('加载 LeRobot 数据失败:', err);
            setEpisodesMeta([]);
            setSelectedEpisode(null);
            message.error('加载数据集失败: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchEpisodeData = (folderPath) => {
        fetchEpisodeDataWithQuality(folderPath, 'medium');
    };


    const groupFilesByFolder = (files) => {
        const tree = {};
        if (!files || files.length === 0) return [];
        files.forEach((file) => {
            const parts = file.folderPath.split('/').filter((p) => p);
            let currentLevel = tree;
            
            // 遍历路径的每一部分，构建文件夹结构
            parts.forEach((part, index) => {
                if (!currentLevel[part]) {
                    currentLevel[part] = {children: {}, files: []};
                }
                
                // 如果是最后一级路径，将文件添加到这个文件夹
                if (index === parts.length - 1) {
                    currentLevel[part].files.push(file);
                } else {
                    // 否则继续向下一级
                    currentLevel = currentLevel[part].children;
                }
            });
        });

        const flattenTree = (node, parentKey = '') => {
            return Object.entries(node).map(([folder, {children, files}]) => {
                const fullKey = parentKey ? `${parentKey}/${folder}` : folder;
                
                // 获取文件夹的上传者和上传时间信息
                // 如果文件夹有文件，使用第一个文件的信息；如果没有文件，从子文件夹中获取
                let folderUploader = '未知用户';
                let folderUploadTime = '未知时间';
                
                if (files.length > 0) {
                    // 使用文件夹中第一个文件的上传者和时间
                    folderUploader = files[0].uploader || '未知用户';
                    folderUploadTime = files[0].uploadTime || '未知时间';
                } else if (Object.keys(children).length > 0) {
                    // 如果没有直接文件，尝试从子文件夹获取信息
                    const childFolders = flattenTree(children, fullKey);
                    if (childFolders.length > 0 && childFolders[0].uploader) {
                        folderUploader = childFolders[0].uploader;
                        folderUploadTime = childFolders[0].uploadTime;
                    }
                }
                
                // 构建子项：包括子文件夹和文件
                const childFolders = Object.keys(children).length > 0 ? flattenTree(children, fullKey) : [];
                const childFiles = files.map((file) => ({
                    ...file,
                    key: `${fullKey}/${file.key}`
                }));
                
                const result = {
                    key: fullKey,
                    folder: folder,
                    uploader: folderUploader,
                    uploadTime: folderUploadTime,
                    children: [...childFolders, ...childFiles],
                };
                return result;
            });
        };

        return flattenTree(tree);
    };

    const handleEdit = (record) => {
        setEditingFile(record);
        form.setFieldsValue({
            originalName: record.fileName,
            project: record.project === '未分类' ? '' : record.project,
        });
        setEditModalVisible(true);
    };

    const handleEditOk = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            const response = await axios.put(`/api/files/${editingFile.key}`, {
                originalName: values.originalName,
                project: values.project || '未分类',
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            if (response.data.success) {
                message.success('文件信息更新成功');
                fetchData();
                setEditModalVisible(false);
                form.resetFields();
                setEditingFile(null);
            } else {
                message.error('文件更新失败');
            }
        } catch (error) {
            message.error('文件更新失败');
            console.error('更新错误:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (id) => {
        Modal.confirm({
            title: '确认删除',
            content: '确定要删除此文件或文件夹相关内容吗？此操作不可恢复！',
            okText: '确定',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    console.log('Deleting with ID:', id);
                    let response;
                    // 判断是否为整数 ID（文件），否则视为文件夹路径
                    if (/^\d+$/.test(id)) {
                        console.log('Deleting with ID:', '删除文件');
                        response = await axios.delete(`/api/files/${encodeURIComponent(id)}`, {
                            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                        });
                    } else {
                        console.log('Deleting with ID:', '删除文件夹');
                        response = await axios.delete(`/api/folders/${encodeURIComponent(id)}`, {
                            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                        });
                    }
                    if (response.data.success) {
                        message.success('删除成功');
                        fetchData();
                    } else {
                        message.error('删除失败: ' + (response.data.message || '未知错误'));
                    }
                } catch (error) {
                    console.error('删除错误:', error.response ? error.response.data : error);
                    message.error('删除失败: ' + (error.response?.data?.message || error.message));
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const handleClearDatabase = () => {
        Modal.confirm({
            title: '确认清除数据库',
            content: '确定要清除所有文件记录和文件吗？此操作不可恢复！',
            okText: '确定',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    const response = await axios.delete('/api/stats/clear-database', {
                        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                    });
                    if (response.data.success) {
                        message.success('数据库和文件已清除');
                        fetchData();
                    } else {
                        message.error('清除失败');
                    }
                } catch (error) {
                    message.error('清除失败');
                    console.error('清除错误:', error);
                } finally {
                    setLoading(false);
                }
            },
        });
    };

// DataList.jsx - 批量下载函数，带进度显示
    const handleDownload = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请先勾选要下载的文件');
            return;
        }

        const allItems = flattenGroup(data);
        const selectedFiles = selectedRowKeys
            .map((key) => allItems.find((item) => item.key === key))
            .filter((item) => item && !item.children);

        if (selectedFiles.length === 0) {
            message.warning('未找到可下载的文件');
            return;
        }

        const baseUrl = ''; // Use relative URL to go through Vite proxy
        
        // 计算总文件大小
        const totalSizeMB = selectedFiles.reduce((sum, file) => {
            const sizeMB = parseFloat(file.size.replace(' MB', ''));
            return sum + (isNaN(sizeMB) ? 0 : sizeMB);
        }, 0);

        // 创建进度提示
        let hideProgress = message.loading(`正在准备批量下载 ${selectedFiles.length} 个文件 (约${totalSizeMB.toFixed(1)}MB)...`, 0);
        
        try {
            setLoading(true);
            
            // 提取文件ID
            const fileIds = selectedFiles.map(file => file.key.split('/').pop());
            
            console.log(`📦 开始批量下载 ${fileIds.length} 个文件`);
            
            // 调用服务端批量下载API
            const response = await fetch(`${baseUrl}/api/download/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ fileIds }),
            });

            if (!response.ok) {
                let errorMessage = `服务器返回状态码: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } catch (e) {
                    // 如果无法解析JSON，使用默认错误消息
                }
                throw new Error(errorMessage);
            }

            
            if (!response.body) {
                throw new Error('响应体为空');
            }

            hideProgress();
            hideProgress = message.loading('正在下载ZIP文件...', 0);

            const reader = response.body.getReader();
            const chunks = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                received += value.length;
            }

            // 创建下载链接
            const blob = new Blob(chunks);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'batch_download.zip';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            hideProgress();
            message.success(`批量下载完成！共 ${fileIds.length} 个文件`);
            console.log(`✅ 批量下载完成`);
            
        } catch (error) {
            hideProgress();
            console.error('🔥 批量下载失败:', {
                message: error.message,
                stack: error.stack,
            });
            
            // 显示详细错误信息
            Modal.error({
                title: '批量下载失败',
                content: (
                    <div>
                        <p><strong>选中文件数:</strong> {selectedFiles.length}</p>
                        <p><strong>预计大小:</strong> {totalSizeMB.toFixed(1)}MB</p>
                        <p><strong>错误信息:</strong> {error.message}</p>
                        <p><strong>建议:</strong></p>
                        <ul>
                            <li>检查网络连接是否稳定</li>
                            <li>文件总大小过大，建议分批下载</li>
                            <li>尝试单个文件下载</li>
                            <li>如果问题持续，请联系管理员</li>
                        </ul>
                    </div>
                ),
                width: 500,
            });
        } finally {
            setLoading(false);
        }
    };

    // 单文件下载函数 - 带进度显示
    const handleSingleDownload = async (record) => {
        const baseUrl = ''; // Use relative URL to go through Vite proxy
        const fileId = record.key.split('/').pop();
        
        // 创建进度提示
        let hideProgress = message.loading(`正在下载 ${record.originalName}...`, 0);
        
        try {
            console.log(`📥 开始单文件下载: ${record.originalName}`);
            
            const response = await fetch(`${baseUrl}/api/download/${fileId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
            });

            if (!response.ok) {
                throw new Error(`服务器返回错误: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error('响应体为空');
            }

            const reader = response.body.getReader();
            const chunks = [];
            let received = 0;
            let lastUpdateTime = Date.now();

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                received += value.length;
                
                // 限制进度更新频率，避免过于频繁的UI更新
                const now = Date.now();
                if (now - lastUpdateTime > 500) { // 每500ms更新一次
                    hideProgress();

                    lastUpdateTime = now;
                }
            }

            // 创建blob并下载
            const blob = new Blob(chunks);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = record.originalName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            hideProgress();
            message.success(`文件 ${record.originalName} 下载完成！`);
            
        } catch (error) {
            hideProgress();
            console.error('单文件下载失败:', error);
            
            // 显示详细错误信息
            Modal.error({
                title: '下载失败',
                content: (
                    <div>
                        <p><strong>文件:</strong> {record.originalName}</p>
                        <p><strong>错误:</strong> {error.message}</p>
                        <p><strong>建议:</strong></p>
                        <ul>
                            <li>检查网络连接</li>
                            <li>文件可能过大，请稍后重试</li>
                            <li>如果问题持续，请联系管理员</li>
                        </ul>
                    </div>
                ),
                width: 500,
            });
        }
    };

    const flattenGroup = (group) => {
        let result = [];
        if (Array.isArray(group)) {
            group.forEach((item) => {
                result = result.concat(flattenGroup(item));
            });
        } else if (group.children && group.children.length > 0) {
            group.children.forEach((child) => {
                result = result.concat(flattenGroup(child));
            });
        } else {
            result.push(group);
        }
        return result;
    };

    const handleEpisodeSelect = async (episode) => {
        console.log('选择episode:', episode.key);
        
        // 查找episode数据
        const currentEpisodeInList = episodesMeta.find(ep => ep.key === episode.key);
        if (currentEpisodeInList) {
            console.log('✅ 找到episode，设置selectedEpisode:', currentEpisodeInList);
            console.log('📊 Episode详细数据:', {
                key: currentEpisodeInList.key,
                frame_count: currentEpisodeInList.frame_count,
                index: currentEpisodeInList.index,
                hasVideoData: !!currentEpisodeInList.video_paths,
                hasMotorData: !!currentEpisodeInList.motor_data,
                hasPointcloudData: !!currentEpisodeInList.pointcloud_data
            });
            setSelectedEpisode(currentEpisodeInList);
            console.log('使用列表中的episode数据:', currentEpisodeInList.key, '帧数:', currentEpisodeInList.frame_count);
        } else {
            // 如果找不到，重新获取数据
            console.log('❌ 未找到对应episode，重新获取数据');
            setSelectedEpisode(episode);
        }
    };

    const rowSelection = {
        selectedRowKeys,
        // onChange: (newSelectedRowKeys) => {
        //   setSelectedRowKeys(newSelectedRowKeys);
        // },
        onSelect: (record, selected) => {
            const treeData = data;
            const node = findNodeByKey(treeData, record.key);
            const keysToUpdate = flattenKeys(node);
            // console.log('✔️ onSelect - 当前 key:', record.key, '是否选中:', selected);
            // console.log('✔️ keysToUpdate:', keysToUpdate);
            const newSet = new Set(selectedRowKeys);
            keysToUpdate.forEach((k) => (selected ? newSet.add(k) : newSet.delete(k)));
            setSelectedRowKeys(Array.from(newSet));
        },
        onSelectAll: (selected, selectedRows, changeRows) => {
            const treeData = data;
            const newSet = new Set(selectedRowKeys);
            changeRows.forEach((row) => {
                const node = findNodeByKey(treeData, row.key);
                const keysToUpdate = flattenKeys(node);
                keysToUpdate.forEach((k) => (selected ? newSet.add(k) : newSet.delete(k)));
            });
            setSelectedRowKeys(Array.from(newSet));
        },
    };

    const findNodeByKey = (tree, key) => {
        for (const node of tree) {
            if (node.key === key) return node;
            if (node.children) {
                const found = findNodeByKey(node.children, key);
                if (found) return found;
            }
        }
        return null;
    };

    const flattenKeys = (node) => {
        if (!node) return [];
        let keys = [node.key];
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                keys = keys.concat(flattenKeys(child));
            }
        }
        return keys;
    };

    const columns = [
        {
            title: '文件夹/文件名',
            dataIndex: 'folder',
            key: 'folder',
            render: (text, record) => {
                if (record.children && record.children.length > 0) {
                    return <span>{text}</span>;
                }
                return (
                    <a onClick={() => navigate(`/data/${record.key.split('/').pop()}`)}>{record.originalName}</a>
                );
            },
        },
        {
            title: '文件大小',
            dataIndex: 'size',
            key: 'size',
            render: (text, record) => (record.children && record.children.length > 0 ? '-' : text),
            sorter: (a, b) =>
                (a.children && a.children.length > 0 ? 0 : parseFloat(a.size)) -
                (b.children && b.children.length > 0 ? 0 : parseFloat(b.size)),
        },
        {
            title: '时长',
            dataIndex: 'duration',
            key: 'duration',
            render: (text, record) => (record.children && record.children.length > 0 ? '-' : text),
        },
        {
            title: '项目',
            dataIndex: 'project',
            key: 'project',
            render: (text, record) => (record.children && record.children.length > 0 ? '-' : text),
            filters: [
                {text: '人类数据', value: '人类数据'},
                {text: '遥操作', value: '遥操作'},
            ],
            onFilter: (value, record) => !record.children || record.project === value,
        },
        {
            title: '上传者',
            dataIndex: 'uploader',
            key: 'uploader',
            render: (text, record) => {
                // 如果是文件夹（有children），显示上传者信息
                if (record.children && record.children.length > 0) {
                    return text || '未知用户';
                }
                // 如果是文件，不显示上传者信息（由父文件夹显示）
                return '-';
            },
        },
        {
            title: '上传时间',
            dataIndex: 'uploadTime',
            key: 'uploadTime',
            render: (text, record) => {
                // 如果是文件夹（有children），显示上传时间
                if (record.children && record.children.length > 0) {
                    return text || '未知时间';
                }
                // 如果是文件，不显示上传时间（由父文件夹显示）
                return '-';
            },
            sorter: (a, b) => {
                // 只对文件夹进行排序
                if (a.children && a.children.length > 0 && b.children && b.children.length > 0) {
                    return new Date(a.uploadTime || 0) - new Date(b.uploadTime || 0);
                }
                return 0;
            },
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => {
                if (record.children && record.children.length > 0 && !record.key.includes('/')) {
                    return (
                        <Space size="middle">
                            <Button
                                type="link"
                                onClick={() => handleSingleView(record.key)}
                            >
                                数据展示
                            </Button>
                            <Button type="link" danger onClick={() => handleDelete(record.key)}>
                                删除
                            </Button>
                        </Space>
                    );
                } else if (record.children && record.children.length > 0) {
                    return (<Space size="middle">

                    </Space>);
                } else {
                    return (
                        <Space size="middle">
                            <a onClick={() => handleSingleDownload(record)}>下载</a>
                            <a onClick={() => handleEdit(record)}>编辑</a>
                            <a onClick={() => handleDelete(record.key.split('/').pop())}>删除</a>
                        </Space>
                    );
                }

            },
        },
    ];

    const handleSingleView = (folderPath) => {
        if (!folderPath) {
            console.warn('Invalid folderPath, using first valid key');
            folderPath = flattenGroup(data)[0]?.key;
        }
        
        console.log('🎬 用户点击数据展示，切换到单一视图模式');
        
        // 立即清空当前选中的episode，触发骨架图显示
        setSelectedEpisode(null);
        
        // 切换视图模式
        setViewMode('single');
        setCurrentFolderPath(folderPath);
        
        // 开始获取episode数据
        fetchEpisodeData(folderPath);
    };

    const renderSingleView = () => {
        console.log('🎨 Rendering single view:', {
            viewMode,
            currentFolderPath,
            selectedEpisode: selectedEpisode?.key || 'null',
            episodesCount: episodesMeta.length
        });
        
        return (
            <div className="single-view-container" style={{ 
                minHeight: '600px', 
                padding: '16px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #d9d9d9',
                borderRadius: '6px'
            }}>
                <Row gutter={16}>
                    <Col span={3} className="episode-list" style={{
                        backgroundColor: '#fff',
                        padding: '16px',
                        borderRadius: '6px',
                        minHeight: '500px'
                    }}>
                        <div style={{ marginBottom: 16 }}>
                            <h3>Episode 列表</h3>
                            <div style={{ fontSize: '12px', color: '#666', marginBottom: 8 }}>
                                Folder: {currentFolderPath}
                            </div>
                        </div>
                        <div className="episode-items">
                            {episodesMeta.map((ep, idx) => {
                                return (
                                    <div
                                        key={`${currentFolderPath}_${ep.key}_${idx}`} // 确保唯一性
                                        className={`episode-item ${selectedEpisode?.key === ep.key ? 'selected' : ''}`}
                                        onClick={() => handleEpisodeSelect(ep)}
                                        style={{
                                            padding: '8px',
                                            margin: '4px 0',
                                            backgroundColor: selectedEpisode?.key === ep.key ? '#e6f7ff' : '#fafafa',
                                            border: '1px solid #d9d9d9',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Episode {idx} (Key: {ep.key})
                                    </div>
                                );
                            })}
                        </div>
                    </Col>
                    <Col span={18} style={{
                        backgroundColor: '#fff',
                        padding: '16px',
                        borderRadius: '6px',
                        minHeight: '500px'
                    }}>
                        <LeRobotEpisodeCard episode={selectedEpisode} onSelectEpisode={handleEpisodeSelect}/>
                    </Col>
                </Row>
            </div>
        );
    };


    const renderListView = () => (
        <Table
            rowKey="key"
            columns={columns}
            dataSource={filteredData}
            loading={loading}
            rowSelection={rowSelection}
            expandable={{childrenColumnName: 'children'}}
            className="custom-table"
        />
    );


    return (
        <div>
            <Card
                title="数据列表"
                extra={
                    <div>
                        {viewMode === 'list' && (
                            <>
                                <Button type="primary" onClick={fetchData}>
                                    刷新
                                </Button>
                                <Button style={{marginLeft: 16}} type="primary" danger icon={<DownloadOutlined/>}
                                        onClick={handleDownload}>
                                    下载
                                </Button>
                                <Button 
                                    style={{marginLeft: 8}}
                                    icon={<CloudSyncOutlined />}
                                    onClick={() => navigate('/remote-sync')}
                                >
                                    远程同步
                                </Button>
                                <Button style={{marginLeft: 16}} danger onClick={handleClearDatabase}>
                                    清除数据库
                                </Button>
                            </>
                        )}
                        {viewMode === 'single' && (
                            <>
                                <Button
                                    type="default"
                                    onClick={async () => {
                                        // 清理当前数据集的所有缓存并重新加载
                                        if (currentFolderPath) {
                                            try {
                                                setLoading(true);
                                                // 清理所有质量级别的缓存
                                                await axios.delete(`/api/lerobot/cache/${encodeURIComponent(currentFolderPath)}`, {
                                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                                });
                                                // 清空当前数据
                                                setEpisodesMeta([]);
                                                setSelectedEpisode(null);
                                                // 重新加载数据
                                                fetchEpisodeData(currentFolderPath);
                                                message.success(`已清理所有缓存并重新加载`);
                                            } catch (error) {
                                                console.error('清理缓存失败:', error);
                                                message.error('清理缓存失败: ' + (error.response?.data?.message || error.message));
                                            } finally {
                                                setLoading(false);
                                            }
                                        }
                                    }}
                                    style={{ marginRight: 8 }}
                                    size="small"
                                    loading={loading}
                                >
                                    清理缓存
                                </Button>
                                <Button
                                    type="primary"
                                    onClick={() => setViewMode('list')}
                                    className="back-to-list-button"
                                >
                                    返回列表
                                </Button>
                            </>
                        )}
                    </div>
                }
            >
                {/*<div style={{marginBottom: 16}}>*/}
                {/*    <Space>*/}
                {/*        <Search*/}
                {/*            placeholder="搜索文件名"*/}
                {/*            allowClear*/}
                {/*            style={{width: 200}}*/}
                {/*            onSearch={(value) => {*/}
                {/*                if (!value) return setFilteredData(data);*/}
                {/*                const filtered = flattenGroup(data).filter((item) =>*/}
                {/*                    item.originalName.toLowerCase().includes(value.toLowerCase())*/}
                {/*                );*/}
                {/*                setFilteredData(groupFilesByFolder(filtered));*/}
                {/*            }}*/}
                {/*        />*/}
                {/*        <Select*/}
                {/*            placeholder="选择项目"*/}
                {/*            style={{width: 120}}*/}
                {/*            allowClear*/}
                {/*            onChange={(value) => {*/}
                {/*                if (!value) return setFilteredData(data);*/}
                {/*                const filtered = flattenGroup(data).filter((item) => item.project === value);*/}
                {/*                setFilteredData(groupFilesByFolder(filtered));*/}
                {/*            }}*/}
                {/*        >*/}
                {/*            <Select.Option value="人类数据">人类数据</Select.Option>*/}
                {/*            <Select.Option value="遥操作">遥操作</Select.Option>*/}
                {/*        </Select>*/}
                {/*    </Space>*/}
                {/*</div>*/}

                {viewMode === 'single' ? renderSingleView() : renderListView()}

                <Modal
                    title="编辑文件信息"
                    open={editModalVisible}
                    onOk={handleEditOk}
                    onCancel={() => {
                        setEditModalVisible(false);
                        form.resetFields();
                        setEditingFile(null);
                    }}
                    okText="保存"
                    cancelText="取消"
                    confirmLoading={loading}
                    className="edit-modal"
                >
                    <Form form={form} layout="vertical">
                        <Form.Item
                            name="originalName"
                            label="文件名"
                            rules={[{required: true, message: '请输入文件名'}]}
                        >
                            <Input placeholder="请输入文件名"/>
                        </Form.Item>
                        <Form.Item
                            name="project"
                            label="项目分类"
                            rules={[{required: true, message: '请选择项目分类'}]}
                        >
                            <Select placeholder="请选择项目分类">
                                <Select.Option value="人类数据">人类数据</Select.Option>
                                <Select.Option value="遥操作">遥操作</Select.Option>
                            </Select>
                        </Form.Item>
                    </Form>
                </Modal>
            </Card>
        </div>
    );
};

export default DataList;