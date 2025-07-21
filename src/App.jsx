import React, { useEffect, useState } from 'react';
import { Layout, Menu, Button, message } from 'antd';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  CloudUploadOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  BookOutlined,
} from '@ant-design/icons';
import axios from './util/axios';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import DataList from './pages/DataList';
import FileDetail from './pages/FileDetail';
import UserManage from './pages/UserManage';
import Settings from './pages/Settings';
import Dictionary from './pages/Dictionary';
import logo from './assets/logo.png'; // 假设 logo 图片在 src/assets/logo.png

const { Header, Sider, Content } = Layout;

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('/api/user')
        .then(response => {
          if (response.data.success) {
            setUser(response.data.data);
            if (location.pathname === '/login') {
              navigate('/');
            }
          } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            navigate('/login');
          }
        })
        .catch(error => {
          console.error('验证用户失败:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
        });
    } else {
      navigate('/login');
    }
  }, [navigate, location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    message.success('已退出登录');
    navigate('/login');
  };

  const selectedKey = location.pathname.startsWith('/data')
    ? '/data'
    : location.pathname === '/'
      ? '/'
      : location.pathname;

  const menuItems = [
    { key: '/', icon: <BarChartOutlined />, label: '概览', permission: 'overview' },
    { key: '/upload', icon: <CloudUploadOutlined />, label: '上传', permission: 'upload' },
    { key: '/data', icon: <DatabaseOutlined />, label: '数据', permission: 'data' },
    { key: '/dictionary', icon: <BookOutlined />, label: '字典', permission: 'data' },
    { key: '/users', icon: <UserOutlined />, label: '用户', permission: 'users' },
    { key: '/settings', icon: <SettingOutlined />, label: '设置', permission: 'settings' },
  ].filter(item => user?.permissions.includes(item.permission));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={
          user ? (
            <Layout>
              <Sider theme="light">
                <div style={{ height: 40, margin: 16 }} >
                  <img
                    src={logo}
                    alt="Logo"
                    style={{ height: 40, objectFit: 'contain' }}
                  />
                </div>
                <Menu
                  mode="inline"
                  selectedKeys={[selectedKey]}
                  items={menuItems}
                  onClick={({ key }) => navigate(key)}
                />
              </Sider>
              <Layout>
                <Header style={{
                  padding: '0 24px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span
                    style={{ height: 40, objectFit: 'contain' }}
                  />

                  <Button
                    type="primary"
                    icon={<LogoutOutlined />}
                    onClick={handleLogout}
                  >
                    退出登录
                  </Button>
                </Header>
                <Content style={{ margin: '24px 16px', padding: 24, background: '#fff' }}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/upload" element={<Upload />} />
                    <Route path="/data" element={<DataList />} />
                    <Route path="/data/:id" element={<FileDetail />} />
                    <Route path="/dictionary" element={<Dictionary />} />
                    <Route path="/users" element={<UserManage />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Content>
              </Layout>
            </Layout>
          ) : (
            <Login />
          )
        } />
      </Routes>
    </Layout>
  );
};

export default App;