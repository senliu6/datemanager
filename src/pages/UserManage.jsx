import React from 'react';
import { Table, Card, Button, Space, Tag, Switch } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';

const UserManage = () => {
  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: role => (
        <Tag color={role === '管理员' ? 'red' : 'green'}>{role}</Tag>
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: status => (
        <Switch defaultChecked={status === '启用'} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space size="middle">
          <a>编辑</a>
          <a>删除</a>
        </Space>
      ),
    },
  ];

  const data = [
    {
      key: '1',
      username: 'puxk',
      role: '管理员',
      department: '研发部',
      email: 'puxk@example.com',
      status: '启用',
    },
    {
      key: '2',
      username: 'iodemo',
      role: '普通用户',
      department: '测试部',
      email: 'iodemo@example.com',
      status: '启用',
    },
  ];

  return (
    <Card
      title="用户管理"
      extra={
        <Button type="primary" icon={<UserAddOutlined />}>
          添加用户
        </Button>
      }
    >
      <Table columns={columns} dataSource={data} />
    </Card>
  );
};

export default UserManage;