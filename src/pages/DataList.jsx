import React, { useState, useEffect } from 'react';
import { Table, Card, Input, Select, Button, Tag, Space, Tooltip, message } from 'antd';
import { SearchOutlined, SyncOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Search } = Input;

const DataList = () => {
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/files');
      const formattedData = response.data.data.map(file => ({
        key: file._id,
        fileName: file.originalName,
        tags: file.tags || [],
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        duration: file.duration || '未知',
        project: file.project || '未分类',
        uploader: file.uploader,
        uploadTime: new Date(file.uploadTime).toLocaleString(),
        task: file.task,
        annotation: file.annotation
      }));
      setData(formattedData);
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

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      render: (text, record) => (
        <Space>
          {text}
          {record.tags.map(tag => (
            <Tag key={tag} color="blue">{tag}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '文件大小',
      dataIndex: 'size',
      key: 'size',
      sorter: (a, b) => parseFloat(a.size) - parseFloat(b.size),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
    },
    {
      title: '项目',
      dataIndex: 'project',
      key: 'project',
      filters: [
        { text: '人类数据', value: '人类数据' },
        { text: '遥操作', value: '遥操作' },
      ],
      onFilter: (value, record) => record.project === value,
    },
    {
      title: '上传者',
      dataIndex: 'uploader',
      key: 'uploader',
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      sorter: (a, b) => new Date(a.uploadTime) - new Date(b.uploadTime),
    },
    {
      title: '任务',
      dataIndex: 'task',
      key: 'task',
      render: task => (
        <Tag color={task === '已完成' ? 'green' : 'processing'}>
          {task === '已完成' ? <CheckCircleOutlined /> : <SyncOutlined spin />}
          {task}
        </Tag>
      ),
    },
    {
      title: '标注',
      dataIndex: 'annotation',
      key: 'annotation',
      render: count => (
        <Tooltip title={`${count} 条标注`}>
          <Tag color="blue">{count}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space size="middle">
          <a>详情</a>
          <a>编辑</a>
          <a>删除</a>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card title="数据列表" extra={<Button type="primary" onClick={fetchData}>刷新</Button>}>
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Search
              placeholder="搜索文件名"
              allowClear
              style={{ width: 200 }}
              onSearch={(value) => console.log(value)}
            />
            <Select
              placeholder="选择项目"
              style={{ width: 120 }}
              allowClear
            >
              <Select.Option value="人类数据">人类数据</Select.Option>
              <Select.Option value="遥操作">遥操作</Select.Option>
            </Select>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
      </Card>
    </div>
  );
};

export default DataList;