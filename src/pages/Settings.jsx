import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Space, Radio, Table, message } from 'antd';
import axios from '../util/axios';
import moment from 'moment';

const Settings = () => {
  const [form] = Form.useForm();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/audit-logs');
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

  const onFinish = (values) => {
    console.log('Success:', values);
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
        <Card title="存储设置">
          <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              initialValues={{
                storage: 'local',
                region: 'shanghai',
              }}
          >
            <Form.Item
                name="storage"
                label="存储方式"
                rules={[{ required: true }]}
            >
              <Radio.Group>
                <Space direction="vertical">
                  <Radio value="local">腾讯云COS 上海</Radio>
                  <Radio value="aliyun">阿里云OSS 北京</Radio>
                  <Radio value="aws">AMAZON S3 美西</Radio>
                  <Radio value="azure">AZURE BLOB STORAGE 美东</Radio>
                  <Radio value="cloudflare">CLOUDFLARE R2 新加坡</Radio>
                  <Radio value="minio">自建云存储MINIO 私有云</Radio>
                </Space>
              </Radio.Group>
            </Form.Item>

            <Form.Item
                name="region"
                label="区域选择"
                rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="shanghai">上海</Select.Option>
                <Select.Option value="beijing">北京</Select.Option>
                <Select.Option value="guangzhou">广州</Select.Option>
                <Select.Option value="chengdu">成都</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
                name="bucket"
                label="存储桶名称"
                rules={[{ required: true }]}
            >
              <Input placeholder="请输入存储桶名称" />
            </Form.Item>

            <Form.Item
                name="accessKey"
                label="Access Key"
                rules={[{ required: true }]}
            >
              <Input.Password placeholder="请输入Access Key" />
            </Form.Item>

            <Form.Item
                name="secretKey"
                label="Secret Key"
                rules={[{ required: true }]}
            >
              <Input.Password placeholder="请输入Secret Key" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit">
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card title="系统设置" style={{ marginTop: 24 }}>
          <Form
              layout="vertical"
              initialValues={{
                uploadLimit: 500,
                fileTypes: ['mp4', 'avi', 'mov'],
                compression: 'high',
              }}
          >
            <Form.Item
                name="uploadLimit"
                label="上传大小限制(MB)"
                rules={[{ required: true }]}
            >
              <Input type="number" />
            </Form.Item>

            <Form.Item
                name="fileTypes"
                label="允许的文件类型"
                rules={[{ required: true }]}
            >
              <Select mode="tags" style={{ width: '100%' }} placeholder="请选择文件类型">
                <Select.Option value="mp4">MP4</Select.Option>
                <Select.Option value="avi">AVI</Select.Option>
                <Select.Option value="mov">MOV</Select.Option>
                <Select.Option value="mkv">MKV</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
                name="compression"
                label="压缩质量"
                rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="low">低质量 (快速)</Select.Option>
                <Select.Option value="medium">中等质量 (平衡)</Select.Option>
                <Select.Option value="high">高质量 (较慢)</Select.Option>
                <Select.Option value="lossless">无损 (最慢)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit">
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card title="操作记录" style={{ marginTop: 24 }}>
          <Table
              columns={columns}
              dataSource={logs}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
          />
        </Card>
      </div>
  );
};

export default Settings;