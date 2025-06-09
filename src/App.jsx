import React from 'react';
import { Layout, Menu } from 'antd';
import { Routes, Route, useNavigate } from 'react-router-dom';
import {
  CloudUploadOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  UserOutlined,
  SettingOutlined
} from '@ant-design/icons';

import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import DataList from './pages/DataList';
import UserManage from './pages/UserManage';
import Settings from './pages/Settings';

const { Header, Sider, Content } = Layout;

const App = () => {
  const navigate = useNavigate();

  const menuItems = [
    { key: '/', icon: <BarChartOutlined />, label: '概览' },
    { key: '/upload', icon: <CloudUploadOutlined />, label: '上传' },
    { key: '/data', icon: <DatabaseOutlined />, label: '数据' },
    { key: '/users', icon: <UserOutlined />, label: '用户' },
    { key: '/settings', icon: <SettingOutlined />, label: '设置' }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light">
        <div style={{ height: 32, margin: 16, background: '#001529' }} />
        <Menu
          mode="inline"
          defaultSelectedKeys={['/']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: '#fff' }} />
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/data" element={<DataList />} />
            <Route path="/users" element={<UserManage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;