import React from 'react';
import { Collapse, List, Typography, Tag, Alert } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

const FailedFilesCollapse = ({ failedFiles, failedCount }) => {
    // 格式化文件大小
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (failedCount === 0) return null;

    return (
        <>
            <Alert
                message={`${failedCount} 个文件上传失败`}
                type="error"
                showIcon
                style={{ marginTop: 16 }}
            />
            
            <Collapse
                style={{ marginTop: 8 }}
                items={[
                    {
                        key: 'failed-files',
                        label: (
                            <span>
                                <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                                查看失败文件详情 ({failedCount} 个)
                            </span>
                        ),
                        children: (
                            <List
                                size="small"
                                dataSource={failedFiles}
                                renderItem={(item) => (
                                    <List.Item
                                        style={{ 
                                            padding: '8px 0',
                                            borderBottom: '1px solid #f0f0f0'
                                        }}
                                    >
                                        <List.Item.Meta
                                            title={
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Typography.Text strong>{item.name}</Typography.Text>
                                                    <Tag color="red">失败</Tag>
                                                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                                        {formatFileSize(item.size)}
                                                    </Typography.Text>
                                                </div>
                                            }
                                            description={
                                                <div>
                                                    <div style={{ color: '#ff4d4f', marginBottom: 4 }}>
                                                        错误: {item.error}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#999' }}>
                                                        失败时间: {item.failedAt}
                                                    </div>
                                                </div>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        )
                    }
                ]}
            />
        </>
    );
};

export default FailedFilesCollapse;