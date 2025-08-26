import React, { useEffect, useState } from 'react';
import { Card, Button, Table, message, Modal, Space, Form, Input, Select, DatePicker, Row, Col, Descriptions, Tag, Tabs } from 'antd';
import { SearchOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import axios from '../util/axios';
import moment from 'moment';

const { RangePicker } = DatePicker;

const Settings = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
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
        // 更新分页信息
        setPagination(prev => ({
          ...prev,
          total: response.data.data.length
        }));
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

  // 获取系统信息
  const fetchSystemInfo = async () => {
    setSystemLoading(true);
    try {
      const response = await axios.get('/api/system/info');
      if (response.data.success) {
        setSystemInfo(response.data.data);
      } else {
        message.error('获取系统信息失败');
      }
    } catch (error) {
      console.error('获取系统信息失败:', error);
      message.error('获取系统信息失败');
    } finally {
      setSystemLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
    fetchSystemInfo();
  }, []);

  // 处理筛选
  const handleSearch = (values) => {
    fetchAuditLogs(values);
  };

  // 重置筛选
  const handleReset = () => {
    form.resetFields();
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchAuditLogs();
  };

  // 处理分页变化
  const handleTableChange = (paginationInfo) => {
    setPagination(paginationInfo);
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
          delete_folder: '删除文件夹',
          create_user: '创建用户',
          update_user: '更新用户',
          delete_user: '删除用户',
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
    { label: '删除文件夹', value: 'delete_folder' },
    { label: '创建用户', value: 'create_user' },
    { label: '更新用户', value: 'update_user' },
    { label: '删除用户', value: 'delete_user' },
  ];

  // Tab项配置
  const tabItems = [
    {
      key: 'system',
      label: (
        <span>
          <InfoCircleOutlined />
          系统信息
        </span>
      ),
      children: (
        <Card>
          {systemLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              加载系统信息中...
            </div>
          ) : systemInfo ? (
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Descriptions title="应用信息" bordered size="small" column={1}>
                  <Descriptions.Item label="应用名称">
                    <Tag color="blue">{systemInfo.application.name}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="版本号">
                    <Tag color="green">v{systemInfo.application.version}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="应用描述">
                    {systemInfo.application.description}
                  </Descriptions.Item>
                  <Descriptions.Item label="开发团队">
                    {systemInfo.application.author}
                  </Descriptions.Item>
                </Descriptions>
              </Col>
              <Col span={12}>
                <Descriptions title="服务器信息" bordered size="small" column={1}>
                  <Descriptions.Item label="启动时间">
                    {systemInfo.server.startTime}
                  </Descriptions.Item>
                  <Descriptions.Item label="运行时长">
                    <Tag color="orange">{systemInfo.server.uptime}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Node.js版本">
                    <Tag color="green">{systemInfo.server.nodeVersion}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="服务器平台">
                    {systemInfo.server.platform} ({systemInfo.server.arch})
                  </Descriptions.Item>
                  <Descriptions.Item label="进程ID">
                    {systemInfo.server.pid}
                  </Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>
          ) : (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              无法获取系统信息
            </div>
          )}
        </Card>
      ),
    },
    {
      key: 'logs',
      label: '操作记录',
      children: (
        <div>
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
                ...pagination,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (page, pageSize) => {
                  setPagination(prev => ({ ...prev, current: page, pageSize }));
                },
                onShowSizeChange: (current, size) => {
                  setPagination(prev => ({ ...prev, current: 1, pageSize: size }));
                }
              }}
              onChange={handleTableChange}
            />
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Tabs defaultActiveKey="system" items={tabItems} />

      {/* 删除操作记录确认模态框 */}
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