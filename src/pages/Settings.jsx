import React, { useEffect, useState } from 'react';
import { Card, Button, Table, message, Modal, Space, Form, Input, Select, DatePicker, Row, Col, Descriptions, Tag, Divider } from 'antd';
import { SearchOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import axios from '../util/axios';
import moment from 'moment';

const { RangePicker } = DatePicker;

const Settings = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchAuditLogs = async (filters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // 添加筛选参数
      if (filters.username) {
        params.append('username', filters.username);
      }
      if (filters.actions && filters.actions.length > 0) {
        // 多选操作类型，传递为数组
        filters.actions.forEach(action => {
          params.append('actions', action);
        });
      }
      if (filters.dateRange && filters.dateRange.length === 2) {
        params.append('startDate', filters.dateRange[0].format('YYYY-MM-DD 00:00:00'));
        params.append('endDate', filters.dateRange[1].format('YYYY-MM-DD 23:59:59'));
      }

      const url = `/api/audit/logs${params.toString() ? '?' + params.toString() : ''}`;
      const response = await axios.get(url);

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

  // 处理筛选
  const handleSearch = (values) => {
    fetchAuditLogs(values);
  };

  // 重置筛选
  const handleReset = () => {
    form.resetFields();
    fetchAuditLogs();
  };

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

  // 操作类型选项
  const actionOptions = [
    { label: '登录', value: 'login' },
    { label: '访问数据', value: 'access_data' },
    { label: '上传文件', value: 'upload_file' },
    { label: '删除文件', value: 'delete_file' },
  ];

  // 版本信息
  const versionInfo = {
    name: 'LeRobot数据管理系统',
    version: '1.0.0',
    buildDate: '2024-01-15',
    description: '机器人数据集管理和可视化平台',
    author: '开发团队',
    dependencies: {
      react: '^18.2.0',
      antd: '^5.26.1',
      'react-three-fiber': '^8.18.0',
      'plotly.js': '^3.0.1'
    }
  };

  // 获取系统运行时信息
  const getRuntimeInfo = () => {
    const now = new Date();
    const uptime = now.getTime() - (performance.timeOrigin || 0);
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      currentTime: now.toLocaleString('zh-CN'),
      uptime: `${uptimeHours}小时${uptimeMinutes}分钟`,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language
    };
  };

  const runtimeInfo = getRuntimeInfo();

  return (
    <div>
      {/* 版本信息 */}
      <Card 
        title={
          <Space>
            <InfoCircleOutlined />
            版本信息
          </Space>
        } 
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Descriptions title="系统信息" bordered size="small" column={1}>
              <Descriptions.Item label="系统名称">
                <Tag color="blue">{versionInfo.name}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="版本号">
                <Tag color="green">v{versionInfo.version}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="构建日期">
                {versionInfo.buildDate}
              </Descriptions.Item>
              <Descriptions.Item label="系统描述">
                {versionInfo.description}
              </Descriptions.Item>
              <Descriptions.Item label="开发团队">
                {versionInfo.author}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions title="运行环境" bordered size="small" column={1}>
              <Descriptions.Item label="当前时间">
                {runtimeInfo.currentTime}
              </Descriptions.Item>
              <Descriptions.Item label="运行时长">
                {runtimeInfo.uptime}
              </Descriptions.Item>
              <Descriptions.Item label="操作系统">
                {runtimeInfo.platform}
              </Descriptions.Item>
              <Descriptions.Item label="浏览器语言">
                {runtimeInfo.language}
              </Descriptions.Item>
              <Descriptions.Item label="浏览器信息">
                <div style={{ wordBreak: 'break-all', fontSize: '12px' }}>
                  {runtimeInfo.userAgent.substring(0, 80)}...
                </div>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
        
        <Divider />
        
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Descriptions title="核心依赖" bordered size="small" column={4}>
              {Object.entries(versionInfo.dependencies).map(([name, version]) => (
                <Descriptions.Item key={name} label={name}>
                  <Tag color="cyan">{version}</Tag>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Col>
        </Row>


      </Card>

      {/* 筛选表单 */}
      <Card title="筛选条件" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSearch}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                label="用户名"
                name="username"
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label="操作类型"
                name="actions"
              >
                <Select
                  mode="multiple"
                  placeholder="请选择操作类型"
                  allowClear
                  options={actionOptions}
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="时间范围"
                name="dateRange"
              >
                <RangePicker
                  style={{ width: '100%' }}
                  placeholder={['开始时间', '结束时间']}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item label=" ">
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SearchOutlined />}
                    loading={loading}
                  >
                    搜索
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                  >
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

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
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
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