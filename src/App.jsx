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
  // CloudSyncOutlined,
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
// import RemoteSync from './pages/RemoteSync';
import logo from './assets/logo.png'; // 假设 logo 图片在 src/assets/logo.png

const { Header, Sider, Content } = Layout;

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token) {
      // 如果有保存的用户信息，先使用它
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          console.error('解析用户信息失败:', e);
        }
      }
      
      // 然后验证 token 是否有效
      axios.get('/api/user')
        .then(response => {
          if (response.data.success) {
            setUser(response.data.data);
            localStorage.setItem('user', JSON.stringify(response.data.data));
            if (location.pathname === '/login') {
              navigate('/');
            }
          } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            navigate('/login');
          }
        })
        .catch(error => {
          console.error('验证用户失败:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
          navigate('/login');
        });
    } else {
      // 没有 token，清理用户状态并跳转到登录页
      localStorage.removeItem('user');
      setUser(null);
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
    // { key: '/remote-sync', icon: <CloudSyncOutlined />, label: '远程同步', permission: 'data' },
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
                    {/* <Route path="/remote-sync" element={<RemoteSync />} /> */}
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