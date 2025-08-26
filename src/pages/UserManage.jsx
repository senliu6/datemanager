import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, Switch, Modal, Form, Input, Select, message, Popconfirm } from 'antd';
import { UserAddOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from '../util/axios';
import { API_ENDPOINTS } from '../config/api';

const { Option } = Select;

const UserManage = () => {
  const [users, setUsers] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USERS);
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      message.error('获取用户列表失败');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showModal = (user = null) => {
    setEditingUser(user);
    if (user) {
      form.setFieldsValue({
        username: user.username,
        role: user.role,
        department: user.department,
        email: user.email,
        status: user.status,
        permissions: user.permissions,
      });
    } else {
      form.resetFields();
      // 新用户默认给概览权限
      form.setFieldsValue({
        permissions: ['overview']
      });
    }
    setIsModalVisible(true);
  };

  // 角色变更时的权限建议
  const handleRoleChange = (role) => {
    const currentPermissions = form.getFieldValue('permissions') || [];
    let suggestedPermissions = [];
    
    switch (role) {
      case '管理员':
        suggestedPermissions = ['overview', 'upload', 'data', 'users', 'settings'];
        break;
      case '审核员':
        suggestedPermissions = ['overview', 'upload', 'data'];
        break;
      case '采集员':
        suggestedPermissions = ['overview', 'upload'];
        break;
      default:
        suggestedPermissions = ['overview'];
    }
    
    // 合并当前权限和建议权限，去重
    const mergedPermissions = [...new Set([...currentPermissions, ...suggestedPermissions])];
    form.setFieldsValue({ permissions: mergedPermissions });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const url = editingUser ? `${API_ENDPOINTS.USERS}/${editingUser.id}` : API_ENDPOINTS.USERS;
      const method = editingUser ? 'put' : 'post';
      const response = await axios[method](url, values);
      if (response.data.success) {
        // 记录操作日志
        const action = editingUser ? 'update_user' : 'create_user';
        const details = editingUser 
          ? `更新用户: ${editingUser.username} -> ${values.username}, 角色: ${values.role}`
          : `创建用户: ${values.username}, 角色: ${values.role}`;
        
        try {
          await axios.post('/api/audit/logs', {
            action,
            details,
            targetUser: values.username
          });
        } catch (logError) {
          console.warn('记录操作日志失败:', logError);
        }

        message.success(editingUser ? '用户更新成功' : '用户创建成功');
        fetchUsers();
        setIsModalVisible(false);
        form.resetFields();
      }
    } catch (error) {
      message.error(editingUser ? '用户更新失败' : '用户创建失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      // 先获取要删除的用户信息，用于记录日志
      const userToDelete = users.find(user => user.id === id);
      
      const response = await axios.delete(`${API_ENDPOINTS.USERS}/${id}`);
      if (response.data.success) {
        // 记录删除操作日志
        try {
          await axios.post('/api/audit/logs', {
            action: 'delete_user',
            details: `删除用户: ${userToDelete?.username || 'Unknown'}, 角色: ${userToDelete?.role || 'Unknown'}`,
            targetUser: userToDelete?.username || 'Unknown'
          });
        } catch (logError) {
          console.warn('记录操作日志失败:', logError);
        }

        message.success('用户删除成功');
        fetchUsers();
      }
    } catch (error) {
      message.error(error.response?.data?.message || '用户删除失败');
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: role => (
          <Tag color={role === '管理员' ? 'red' : role === '采集员' ? 'blue' : 'green'}>{role}</Tag>
      ),
    },
    { title: '部门', dataIndex: 'department', key: 'department' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => (
          <Switch
              checked={status === '启用'}
              disabled={record.isAdmin}
              onChange={(checked) => {
                axios.put(
                    `${API_ENDPOINTS.USERS}/${record.id}`,
                    { status: checked ? '启用' : '禁用' }
                ).then(() => {
                  message.success('状态更新成功');
                  fetchUsers();
                }).catch(() => message.error('状态更新失败'));
              }}
          />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
          <Space size="middle">
            <Button type="link" onClick={() => showModal(record)}>编辑</Button>
            {!record.isAdmin && (
              <Popconfirm
                title="确定要删除这个用户吗？"
                description="删除后无法恢复，请谨慎操作。"
                onConfirm={() => handleDelete(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
      ),
    },
  ];

  const permissionOptions = [
    { label: '概览', value: 'overview' },
    { label: '上传', value: 'upload' },
    { label: '数据管理', value: 'data' },
    { label: '用户管理', value: 'users' },
    { label: '系统设置', value: 'settings' },
  ];

  return (
      <Card
          title="用户管理"
          extra={
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>
              添加用户
            </Button>
          }
      >
        <Table columns={columns} dataSource={users} rowKey="id" />
        <Modal
            title={editingUser ? '编辑用户' : '添加用户'}
            open={isModalVisible}
            onOk={handleOk}
            onCancel={() => setIsModalVisible(false)}
            okText="确认"
            cancelText="取消"
        >
          <Form form={form} layout="vertical">
            <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input disabled={!!editingUser} />
            </Form.Item>
            <Form.Item
                name="password"
                label="密码"
                rules={[{ required: !editingUser, message: '请输入密码' }]}
            >
              <Input.Password />
            </Form.Item>
            <Form.Item
                name="role"
                label="角色"
                rules={[{ required: true, message: '请选择角色' }]}
            >
              <Select 
                disabled={editingUser?.isAdmin}
                onChange={handleRoleChange}
              >
                <Option value="管理员">管理员</Option>
                <Option value="采集员">采集员</Option>
                <Option value="审核员">审核员</Option>
              </Select>
            </Form.Item>
            <Form.Item name="department" label="部门">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入有效邮箱' }]}>
              <Input />
            </Form.Item>
            <Form.Item
                name="permissions"
                label="页面权限"
                rules={[{ required: true, message: '请选择页面权限' }]}
                extra="权限说明：概览(首页统计)、上传(文件上传)、数据管理(文件管理+字典管理)、用户管理、系统设置"
            >
              <Select 
                mode="multiple" 
                options={permissionOptions}
                placeholder="请选择用户可以访问的功能模块"
              />
            </Form.Item>
          </Form>
        </Modal>
      </Card>
  );
};

export default UserManage;