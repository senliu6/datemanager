import React, { useEffect, useState } from 'react';
import { Card, Button, Table, message, Modal, Space } from 'antd';
import axios from '../util/axios';
import moment from 'moment';

const Settings = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/audit/logs');
      if (response.data.success) {
        setLogs(response.data.data);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error('获取操作记录失败');
      console.error('获取操作记录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const handleDeleteLogs = async () => {
    try {
      const response = await axios.delete('/api/audit/logs');
      if (response.data.success) {
        message.success('操作记录已清空');
        setLogs([]);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error('删除操作记录失败');
      console.error('删除操作记录失败:', error);
    } finally {
      setDeleteModalVisible(false);
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      render: (action) => {
        const actionMap = {
          login: '登录',
          access_data: '访问数据',
          upload_file: '上传文件',
          delete_file: '删除文件',
        };
        return actionMap[action] || action;
      },
    },
    {
      title: '详情',
      dataIndex: 'details',
      key: 'details',
    },
    {
      title: 'IP 地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp) => moment(timestamp).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    },
  ];

  return (
    <div>
      <Card 
        title="操作记录" 
        extra={
          <Button 
            type="primary" 
            danger 
            onClick={() => setDeleteModalVisible(true)}
            disabled={logs.length === 0}
          >
            清空记录
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="确认删除"
        open={deleteModalVisible}
        onOk={handleDeleteLogs}
        onCancel={() => setDeleteModalVisible(false)}
        okText="确认删除"
        cancelText="取消"
      >
        <p>确定要删除所有操作记录吗？此操作不可恢复。</p>
      </Modal>
    </div>
  );
};

export default Settings;