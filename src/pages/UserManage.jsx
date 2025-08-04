import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, Switch, Modal, Form, Input, Select, message } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';

const { Option } = Select;

const UserManage = () => {
  const [users, setUsers] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USERS, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
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
    }
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const url = editingUser ? `${API_ENDPOINTS.USERS}/${editingUser.id}` : API_ENDPOINTS.USERS;
      const method = editingUser ? 'put' : 'post';
      const response = await axios[method](url, values, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
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
      const response = await axios.delete(`${API_ENDPOINTS.USERS}/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
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
                    { status: checked ? '启用' : '禁用' },
                    { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
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
            <a onClick={() => showModal(record)}>编辑</a>
            {!record.isAdmin && <a onClick={() => handleDelete(record.id)}>删除</a>}
          </Space>
      ),
    },
  ];

  const permissionOptions = [
    { label: '概览', value: 'overview' },
    { label: '上传', value: 'upload' },
    { label: '数据', value: 'data' },
    { label: '用户', value: 'users' },
    { label: '设置', value: 'settings' },
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
            visible={isModalVisible}
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
              <Select disabled={editingUser?.isAdmin}>
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
            >
              <Select mode="multiple" options={permissionOptions} />
            </Form.Item>
          </Form>
        </Modal>
      </Card>
  );
};

export default UserManage;