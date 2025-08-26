import React, { useState, useEffect } from 'react';
import { Modal, List, Button, Typography, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from '../util/axios';

const UploadRecordsModal = ({ visible, onClose, refreshTrigger }) => {
    const [uploadRecords, setUploadRecords] = useState([]);
    const [loading, setLoading] = useState(false);

    // 加载上传记录
    const loadUploadRecords = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/upload-records');
            if (response.data.success) {
                setUploadRecords(response.data.data);
            }
        } catch (error) {
            console.error('加载上传记录失败:', error);
            message.error('加载上传记录失败');
        } finally {
            setLoading(false);
        }
    };

    // 删除上传记录
    const deleteUploadRecord = async (recordId) => {
        try {
            await axios.delete(`/api/upload-records/${recordId}`);
            await loadUploadRecords(); // 重新加载记录
            message.success('上传记录删除成功');
        } catch (error) {
            console.error('删除上传记录失败:', error);
            message.error('删除上传记录失败');
        }
    };

    // 格式化文件大小
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // 格式化时间
    const formatTime = (timeString) => {
        if (!timeString) return '-';
        return new Date(timeString).toLocaleString('zh-CN');
    };

    // 计算上传时长
    const calculateDuration = (startTime, endTime) => {
        if (!startTime) return '-';
        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : new Date();
        const duration = Math.floor((end - start) / 1000);
        
        if (duration < 60) return `${duration}秒`;
        if (duration < 3600) return `${Math.floor(duration / 60)}分${duration % 60}秒`;
        return `${Math.floor(duration / 3600)}时${Math.floor((duration % 3600) / 60)}分`;
    };

    // 获取状态标签
    const getStatusTag = (status) => {
        const statusMap = {
            'completed': { color: 'green', text: '已完成' },
            'completed_with_errors': { color: 'orange', text: '部分失败' },
            'in_progress': { color: 'blue', text: '进行中' },
            'failed': { color: 'red', text: '失败' }
        };
        const config = statusMap[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
    };

    useEffect(() => {
        if (visible) {
            loadUploadRecords();
        }
    }, [visible]);

    // 监听刷新触发器
    useEffect(() => {
        if (visible && refreshTrigger) {
            loadUploadRecords();
        }
    }, [refreshTrigger, visible]);

    return (
        <Modal
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '48px' }}>
                    <span>上传记录</span>
                    <Button 
                        type="text" 
                        icon={<ReloadOutlined />} 
                        size="small"
                        loading={loading}
                        onClick={loadUploadRecords}
                        title="刷新记录"
                    />
                </div>
            }
            open={visible}
            onCancel={onClose}
            footer={null}
            width={800}
        >

            <List
                loading={loading}
                dataSource={uploadRecords}
                renderItem={(record) => (
                    <List.Item
                        actions={[
                            <Button 
                                type="link" 
                                danger 
                                size="small"
                                onClick={() => {
                                    Modal.confirm({
                                        title: '确认删除',
                                        content: '确定要删除这条上传记录吗？',
                                        onOk: () => deleteUploadRecord(record.id)
                                    });
                                }}
                            >
                                删除
                            </Button>
                        ]}
                    >
                        <List.Item.Meta
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Typography.Text strong>
                                        {record.folder_path || '未分类'}
                                    </Typography.Text>
                                    {getStatusTag(record.status)}
                                </div>
                            }
                            description={
                                <div>
                                    <div>
                                        文件: {record.completed_files || 0}/{record.total_files || 0} 
                                        {record.failed_files > 0 && ` (失败: ${record.failed_files})`}
                                    </div>
                                    <div>
                                        大小: {formatFileSize(record.completed_size || 0)}/{formatFileSize(record.total_size || 0)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#999' }}>
                                        开始: {formatTime(record.start_time)} | 
                                        {record.end_time ? ` 结束: ${formatTime(record.end_time)} | ` : ' '}
                                        耗时: {calculateDuration(record.start_time, record.end_time)}
                                    </div>
                                    {record.notes && (
                                        <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                                            备注: {record.notes}
                                        </div>
                                    )}
                                </div>
                            }
                        />
                    </List.Item>
                )}
            />
        </Modal>
    );
};

export default UploadRecordsModal;