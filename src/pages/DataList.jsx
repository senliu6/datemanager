import React, {useEffect, useState} from 'react';
import {Button, Card, Form, Input, message, Modal, Row, Col, Select, Space, Table, Tag, Tooltip} from 'antd';
import {CheckCircleOutlined, SyncOutlined, DownloadOutlined} from '@ant-design/icons';
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
            const response = await axios.get('/api/files');
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

    const fetchEpisodeData = (folderPath) => {
        console.log('Fetching with folderPath:', folderPath);
        axios
            .post('/api/lerobot/parse', {folderPath})
            .then((res) => {
                // console.log('API /api/lerobot/parse Response:', JSON.stringify(res.data.data, null, 2));
                if (!res.data.data || res.data.data.length === 0) {
                    message.warning('未找到有效的 episode 数据');
                    setEpisodesMeta([]);
                } else {
                    const uniqueEpisodes = res.data.data.reduce((acc, ep) => {
                        if (!acc.find(item => item.key === ep.key)) {
                            console.log('Episode:', ep.key, 'Pointcloud data:', ep.pointcloud_data);
                            acc.push(ep);
                        }
                        return acc;
                    }, []);
                    setEpisodesMeta(uniqueEpisodes);
                    setSelectedEpisode(uniqueEpisodes[0] || null);
                }
            })
            .catch((err) => {
                console.error('加载 LeRobot 数据失败:', err);
                setEpisodesMeta([]);
                message.error('加载数据集失败: ' + err.message);
            });
    };


    const groupFilesByFolder = (files) => {
        const tree = {};
        if (!files || files.length === 0) return [];
        files.forEach((file) => {
            const parts = file.folderPath.split('/').filter((p) => p);
            let currentLevel = tree;
            parts.forEach((part, index) => {
                if (!currentLevel[part]) {
                    currentLevel[part] = {children: {}, files: []};
                }
                if (index === parts.length - 1) {
                    currentLevel[part].files.push(file);
                }
                currentLevel = currentLevel[part].children;
            });
        });

        const flattenTree = (node, parentKey = '') => {
            return Object.entries(node).map(([folder, {children, files}]) => {
                const fullKey = parentKey ? `${parentKey}/${folder}` : folder;
                const result = {
                    key: fullKey,
                    folder: folder,
                    children: files.length === 0 ? flattenTree(children, fullKey) : files.map((file) => ({
                        ...file,
                        key: `${fullKey}/${file.key}`
                    })),
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
                        response = await axios.delete(`/api/files/${encodeURIComponent(id)}`);
                    } else {
                        console.log('Deleting with ID:', '删除文件夹');
                        response = await axios.delete(`/api/folders/${encodeURIComponent(id)}`);
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
                    const response = await axios.delete('/api/clear-database');
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

// DataList.jsx
    const handleDownload = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请先勾选要下载的文件');
            return;
        }

        const zip = new JSZip();
        const allItems = flattenGroup(data);
        const selectedFiles = selectedRowKeys
            .map((key) => allItems.find((item) => item.key === key))
            .filter((item) => item && !item.children);

        if (selectedFiles.length === 0) {
            message.warning('未找到可下载的文件');
            return;
        }

        const maxRetries = 3;
        const retryDelay = 1000;
        const baseUrl = 'http://localhost:3001';

        const downloadFileWithRetry = async (file, retries = maxRetries) => {
            const fileId = file.key.split('/').pop();
            const requestUrl = `${baseUrl}/api/download/${fileId}`;
            console.log(`📥 Attempting to download fileId: ${fileId}, folderPath: ${file.folderPath}, originalName: ${file.originalName}`);

            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    const response = await fetch(requestUrl, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/octet-stream',
                        },
                    });

                    console.log(`📡 Response for ${file.originalName}:`, {
                        status: response.status,
                        headers: Object.fromEntries(response.headers.entries()),
                    });

                    if (!response.ok) {
                        throw new Error(`服务器返回状态码: ${response.status}`);
                    }

                    const contentLength = response.headers.get('Content-Length');
                    const reader = response.body.getReader();
                    const total = contentLength ? parseInt(contentLength) : null;

                    const chunks = [];
                    let received = 0;

                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        chunks.push(value);
                        received += value.length;
                        console.log(`📥 进度 (${file.originalName}, 尝试 ${attempt}): ${received}/${total || '未知'} bytes`);
                    }

                    const blob = new Blob(chunks, {type: 'application/octet-stream'});

                    if (blob.size === 0) {
                        console.warn(`⚠️ 空响应: ${file.originalName}`);
                        message.error(`文件 ${file.originalName} 数据为空`);
                        return false;
                    }

                    const folderPath = file.folderPath || 'Uncategorized';
                    const folder = zip.folder(folderPath);
                    folder.file(file.originalName, blob, {binary: true});

                    console.log(`✅ 添加成功: ${file.originalName} (size: ${blob.size} bytes)`);
                    return true;
                } catch (err) {
                    console.error(`❌ 下载失败: ${file.originalName} (尝试 ${attempt}/${retries})`, {
                        errorMessage: err.message,
                        requestUrl,
                        stack: err.stack,
                    });

                    if (attempt < retries) {
                        console.log(`🔄 等待 ${retryDelay}ms 后重试...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }

                    message.error(`🔥 最终下载失败: ${file.originalName} - ${err.message}`);
                    return false;
                }
            }

            return false;
        };


        try {
            setLoading(true);

            const downloadPromises = selectedFiles.map(file => downloadFileWithRetry(file));
            const results = await Promise.all(downloadPromises);

            if (!results.some(success => success)) {
                throw new Error('没有任何文件成功下载');
            }

            const zipBlob = await zip.generateAsync({type: 'blob'});
            saveAs(zipBlob, 'downloaded_files.zip');
            message.success('下载已开始');
            console.log('🎉 ZIP 文件生成并下载');
        } catch (error) {
            console.error('🔥 下载流程异常:', {
                message: error.message,
                code: error.code || 'Unknown',
                stack: error.stack,
            });
            message.error('下载失败: ' + (error.message || '未知错误'));
        } finally {
            setLoading(false);
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

    const handleEpisodeSelect = (episode) => {
        setSelectedEpisode(episode);
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
            render: (text, record) => (record.children && record.children.length > 0 ? '-' : text),
        },
        {
            title: '上传时间',
            dataIndex: 'uploadTime',
            key: 'uploadTime',
            render: (text, record) => (record.children && record.children.length > 0 ? '-' : text),
            sorter: (a, b) =>
                (a.children && a.children.length > 0 ? 0 : new Date(a.uploadTime)) -
                (b.children && b.children.length > 0 ? 0 : new Date(b.uploadTime)),
        },
        {
            title: '任务',
            dataIndex: 'task',
            key: 'task',
            render: (text, record) =>
                record.children && record.children.length > 0 ? '-' : (
                    <Tag color={text === '已完成' ? 'green' : 'processing'}>
                        {text === '已完成' ? <CheckCircleOutlined/> : <SyncOutlined spin/>}
                        {text}
                    </Tag>
                ),
        },
        {
            title: '标注',
            dataIndex: 'annotation',
            key: 'annotation',
            render: (count, record) =>
                record.children && record.children.length > 0 ? '-' : (
                    <Tooltip title={`${count} 条标注`}>
                        <Tag color="blue">{count}</Tag>
                    </Tooltip>
                ),
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
        setViewMode('single');
        setCurrentFolderPath(folderPath);
        fetchEpisodeData(folderPath);
    };

    const renderSingleView = () => (
        <div className="single-view-container">
            <Row gutter={16}>
                <Col span={3} className="episode-list">
                    <h3>Episode 列表 (Folder: {currentFolderPath})</h3>
                    <div className="episode-items">
                        {episodesMeta.map((ep, idx) => {
                            console.log(`Episode ${idx} - Folder: ${ep.folderPath}, Key: ${ep.key}`); // 调试
                            return (
                                <div
                                    key={`${currentFolderPath}_${ep.key}_${idx}`} // 确保唯一性
                                    className={`episode-item ${selectedEpisode?.key === ep.key ? 'selected' : ''}`}
                                    onClick={() => handleEpisodeSelect(ep)}
                                >
                                    Episode {idx} (Key: {ep.key})
                                </div>
                            );
                        })}
                    </div>
                </Col>
                <Col span={18}>
                    {selectedEpisode ? (
                        <LeRobotEpisodeCard episode={selectedEpisode} onSelectEpisode={handleEpisodeSelect}/>
                    ) : (
                        <div className="no-data">请选择一个 Episode</div>
                    )}
                </Col>
            </Row>
        </div>
    );


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
                        <Button type="primary" onClick={fetchData}>
                            刷新
                        </Button>
                        <Button style={{marginLeft: 16}} type="primary" danger icon={<DownloadOutlined/>}
                                onClick={handleDownload}>
                            下载
                        </Button>
                        <Button style={{marginLeft: 16}} danger onClick={handleClearDatabase}>
                            清除数据库
                        </Button>
                        <Button
                            style={{marginLeft: 16}}
                            onClick={() => setViewMode(viewMode === 'single' ? 'list' : 'single')}
                            className="single-view-button"
                        >
                            {viewMode === 'single' ? '返回列表' : '单条数据展示'}
                        </Button>
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