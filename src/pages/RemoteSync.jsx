import React, { useState, useEffect } from 'react';
import {
    Card,
    Form,
    Input,
    Select,
    Button,
    Table,
    Modal,
    message,
    Progress,
    Tabs,
    Space,
    Divider,
    Alert,
    Tag,
    Tooltip,
    Upload
} from 'antd';
import {
    CloudSyncOutlined,
    SettingOutlined,
    DownloadOutlined,
    PlayCircleOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    FileTextOutlined,
    UploadOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const RemoteSync = () => {
    const [form] = Form.useForm();
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [syncConfig, setSyncConfig] = useState({});
    const [syncMethod, setSyncMethod] = useState('sftp');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState(null);
    const [syncResults, setSyncResults] = useState([]);
    const [configTemplates, setConfigTemplates] = useState({});
    const [files, setFiles] = useState([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    // 获取配置模板
    useEffect(() => {
        fetchConfigTemplates();
        fetchFiles();
    }, []);

    const fetchConfigTemplates = async () => {
        try {
            const response = await fetch('/api/remote-sync/config-template', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setConfigTemplates(data.data);
            }
        } catch (error) {
            console.error('获取配置模板失败:', error);
        }
    };

    const fetchFiles = async () => {
        try {
            const response = await fetch('/api/files', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setFiles(data.data);
            }
        } catch (error) {
            console.error('获取文件列表失败:', error);
        }
    };

    // 测试连接
    const testConnection = async () => {
        try {
            setIsConnecting(true);
            const values = form.getFieldsValue();
            
            const response = await fetch('/api/remote-sync/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(values)
            });

            const data = await response.json();
            
            if (data.success) {
                setConnectionStatus('success');
                message.success('连接测试成功！');
                setSyncConfig(values);
            } else {
                setConnectionStatus('error');
                message.error(`连接测试失败: ${data.message}`);
            }
        } catch (error) {
            setConnectionStatus('error');
            message.error(`连接测试失败: ${error.message}`);
        } finally {
            setIsConnecting(false);
        }
    };

    // 开始同步
    const startSync = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请选择要同步的文件');
            return;
        }

        if (!syncConfig.host) {
            message.warning('请先测试连接');
            return;
        }

        try {
            setIsSyncing(true);
            setSyncResults([]);

            const response = await fetch('/api/remote-sync/sync-files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    fileIds: selectedRowKeys,
                    config: syncConfig,
                    method: syncMethod,
                    options: {
                        stopOnError: false
                    }
                })
            });

            const data = await response.json();
            
            if (data.success) {
                setSyncResults(data.data.results);
                message.success(`同步完成！成功: ${data.data.successCount}, 失败: ${data.data.failureCount}`);
            } else {
                message.error(`同步失败: ${data.message}`);
            }
        } catch (error) {
            message.error(`同步失败: ${error.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    // 生成同步脚本
    const generateScript = async (direction = 'download') => {
        if (selectedRowKeys.length === 0) {
            message.warning('请选择要同步的文件');
            return;
        }

        try {
            const response = await fetch('/api/remote-sync/generate-script', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    fileIds: selectedRowKeys,
                    config: syncConfig,
                    method: syncMethod,
                    options: {
                        direction: direction
                    }
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${direction}_script_${syncMethod}.sh`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                message.success(`${direction === 'upload' ? '上传' : '下载'}脚本已下载`);
            } else {
                const data = await response.json();
                message.error(`生成脚本失败: ${data.message}`);
            }
        } catch (error) {
            message.error(`生成脚本失败: ${error.message}`);
        }
    };

    // 加载配置模板
    const loadTemplate = (templateKey) => {
        const template = configTemplates[templateKey];
        if (template) {
            form.setFieldsValue(template.config);
            setSyncMethod(templateKey);
        }
    };

    // 文件表格列定义
    const columns = [
        {
            title: '文件名',
            dataIndex: 'originalName',
            key: 'originalName',
            ellipsis: true,
        },
        {
            title: '大小',
            dataIndex: 'size',
            key: 'size',
            width: 100,
            render: (size) => `${(size / 1024 / 1024).toFixed(2)} MB`
        },
        {
            title: '文件夹',
            dataIndex: 'folderPath',
            key: 'folderPath',
            width: 150,
            ellipsis: true,
        },
        {
            title: '上传时间',
            dataIndex: 'uploadTime',
            key: 'uploadTime',
            width: 150,
            render: (time) => new Date(time).toLocaleString()
        }
    ];

    // 同步结果表格列定义
    const resultColumns = [
        {
            title: '文件名',
            dataIndex: 'file',
            key: 'file',
        },
        {
            title: '状态',
            dataIndex: 'success',
            key: 'success',
            width: 100,
            render: (success) => (
                <Tag color={success ? 'green' : 'red'}>
                    {success ? '成功' : '失败'}
                </Tag>
            )
        },
        {
            title: '详情',
            dataIndex: 'error',
            key: 'error',
            ellipsis: true,
            render: (error, record) => error || (record.success ? '同步成功' : '未知错误')
        }
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (newSelectedRowKeys) => {
            setSelectedRowKeys(newSelectedRowKeys);
        },
        getCheckboxProps: (record) => ({
            name: record.originalName,
        }),
    };

    return (
        <div style={{ padding: '24px' }}>
            <Card title={
                <Space>
                    <CloudSyncOutlined />
                    远程同步
                </Space>
            }>
                <Tabs defaultActiveKey="config">
                    <TabPane tab="连接配置" key="config">
                        <Card size="small" title="快速配置模板" style={{ marginBottom: 16 }}>
                            <Space wrap>
                                {Object.entries(configTemplates).map(([key, template]) => (
                                    <Button
                                        key={key}
                                        onClick={() => loadTemplate(key)}
                                        icon={<SettingOutlined />}
                                    >
                                        {template.name}
                                    </Button>
                                ))}
                            </Space>
                        </Card>

                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={testConnection}
                        >
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                <Form.Item
                                    label="同步方法"
                                    style={{ minWidth: '150px' }}
                                >
                                    <Select
                                        value={syncMethod}
                                        onChange={setSyncMethod}
                                        style={{ width: '100%' }}
                                    >
                                        <Option value="sftp">SFTP</Option>
                                        <Option value="rsync">Rsync</Option>
                                        <Option value="rclone">Rclone</Option>
                                    </Select>
                                </Form.Item>
                            </div>

                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                <Form.Item
                                    name="host"
                                    label="主机地址"
                                    rules={[{ required: true, message: '请输入主机地址' }]}
                                    style={{ flex: 1, minWidth: '200px' }}
                                >
                                    <Input placeholder="192.168.1.100" />
                                </Form.Item>

                                <Form.Item
                                    name="port"
                                    label="端口"
                                    style={{ width: '100px' }}
                                >
                                    <Input placeholder="22" />
                                </Form.Item>

                                <Form.Item
                                    name="username"
                                    label="用户名"
                                    rules={[{ required: true, message: '请输入用户名' }]}
                                    style={{ flex: 1, minWidth: '150px' }}
                                >
                                    <Input placeholder="username" />
                                </Form.Item>
                            </div>

                            {syncMethod !== 'rclone' && (
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                    <Form.Item
                                        name="password"
                                        label="密码"
                                        style={{ flex: 1, minWidth: '200px' }}
                                    >
                                        <Input.Password placeholder="密码（可选，如使用私钥）" />
                                    </Form.Item>

                                    <Form.Item
                                        name="privateKey"
                                        label="私钥文件路径"
                                        style={{ flex: 1, minWidth: '200px' }}
                                    >
                                        <Input placeholder="/path/to/private/key" />
                                    </Form.Item>
                                </div>
                            )}

                            {syncMethod === 'rclone' && (
                                <Form.Item
                                    name="remote"
                                    label="Rclone远程名称"
                                    rules={[{ required: true, message: '请输入Rclone远程名称' }]}
                                >
                                    <Input placeholder="myremote" />
                                </Form.Item>
                            )}

                            <Form.Item
                                name="basePath"
                                label="远程基础路径"
                                rules={[{ required: true, message: '请输入远程基础路径' }]}
                            >
                                <Input placeholder="/data/uploads" />
                            </Form.Item>

                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={isConnecting}
                                    icon={<PlayCircleOutlined />}
                                >
                                    测试连接
                                </Button>

                                {connectionStatus && (
                                    <div>
                                        {connectionStatus === 'success' ? (
                                            <Tag color="green" icon={<CheckCircleOutlined />}>
                                                连接成功
                                            </Tag>
                                        ) : (
                                            <Tag color="red" icon={<ExclamationCircleOutlined />}>
                                                连接失败
                                            </Tag>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Form>
                    </TabPane>

                    <TabPane tab="文件选择" key="files">
                        <div style={{ marginBottom: 16 }}>
                            <Alert
                                message="选择要同步的文件"
                                description={`已选择 ${selectedRowKeys.length} 个文件。选择文件后，可以开始同步或生成同步脚本。`}
                                type="info"
                                showIcon
                            />
                        </div>

                        <Table
                            rowSelection={rowSelection}
                            columns={columns}
                            dataSource={files}
                            rowKey="id"
                            pagination={{
                                pageSize: 10,
                                showSizeChanger: true,
                                showQuickJumper: true,
                                showTotal: (total, range) =>
                                    `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
                            }}
                            scroll={{ x: 800 }}
                        />
                    </TabPane>

                    <TabPane tab="执行同步" key="sync">
                        <div style={{ marginBottom: 16 }}>
                            <Space>
                                <Button
                                    type="primary"
                                    onClick={startSync}
                                    loading={isSyncing}
                                    disabled={selectedRowKeys.length === 0 || !syncConfig.host}
                                    icon={<CloudSyncOutlined />}
                                    size="large"
                                >
                                    开始同步 ({selectedRowKeys.length} 个文件)
                                </Button>

                                <Button
                                    onClick={() => generateScript('download')}
                                    disabled={selectedRowKeys.length === 0}
                                    icon={<FileTextOutlined />}
                                >
                                    生成下载脚本
                                </Button>
                                
                                <Button
                                    onClick={() => generateScript('upload')}
                                    disabled={selectedRowKeys.length === 0}
                                    icon={<UploadOutlined />}
                                >
                                    生成上传脚本
                                </Button>
                            </Space>
                        </div>

                        {syncConfig.host && (
                            <Card size="small" title="同步配置" style={{ marginBottom: 16 }}>
                                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                    <div><strong>方法:</strong> {syncMethod.toUpperCase()}</div>
                                    <div><strong>主机:</strong> {syncConfig.host}:{syncConfig.port || 22}</div>
                                    <div><strong>用户:</strong> {syncConfig.username}</div>
                                    <div><strong>路径:</strong> {syncConfig.basePath}</div>
                                </div>
                            </Card>
                        )}

                        {syncResults.length > 0 && (
                            <Card title="同步结果" size="small">
                                <Table
                                    columns={resultColumns}
                                    dataSource={syncResults}
                                    rowKey="file"
                                    pagination={false}
                                    size="small"
                                />
                            </Card>
                        )}
                    </TabPane>
                </Tabs>
            </Card>
        </div>
    );
};

export default RemoteSync;