import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Modal,
  Form,
  message,
  Popconfirm,
  Space,
  Upload,
  Divider,
  Tooltip
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  DownloadOutlined,
  ClearOutlined,
  SearchOutlined
} from '@ant-design/icons';
import axios from '../util/axios';

const { Search } = Input;

const Dictionary = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
  });
  const [searchText, setSearchText] = useState('');

  // 模态框状态
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();

  // 获取字典数据
  const fetchData = async (page = 1, pageSize = 50, search = '') => {
    try {
      setLoading(true);
      const response = await axios.get('/api/dictionary', {
        params: {
          page,
          pageSize,
          search
        }
      });

      if (response.data.success) {
        setData(response.data.data);
        setPagination(prev => ({
          ...prev,
          current: page,
          pageSize,
          total: response.data.pagination.total
        }));
      }
    } catch (error) {
      console.error('获取字典数据失败:', error);
      message.error('获取字典数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 搜索处理
  const handleSearch = (value) => {
    setSearchText(value);
    fetchData(1, pagination.pageSize, value);
  };

  // 分页处理
  const handleTableChange = (paginationConfig) => {
    fetchData(paginationConfig.current, paginationConfig.pageSize, searchText);
  };

  // 添加/编辑字典条目
  const handleSubmit = async (values) => {
    try {
      setLoading(true);

      if (editingRecord) {
        // 编辑
        const response = await axios.put(`/api/dictionary/${editingRecord.id}`, values);
        if (response.data.success) {
          message.success('字典条目更新成功');
          setModalVisible(false);
          form.resetFields();
          setEditingRecord(null);
          fetchData(pagination.current, pagination.pageSize, searchText);
        }
      } else {
        // 添加
        const response = await axios.post('/api/dictionary', values);
        if (response.data.success) {
          message.success('字典条目添加成功');
          setModalVisible(false);
          form.resetFields();
          fetchData(pagination.current, pagination.pageSize, searchText);
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else {
        message.error('操作失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 删除单个条目
  const handleDelete = async (id) => {
    try {
      setLoading(true);
      const response = await axios.delete(`/api/dictionary/${id}`);
      if (response.data.success) {
        message.success('删除成功');
        fetchData(pagination.current, pagination.pageSize, searchText);
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    } finally {
      setLoading(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的条目');
      return;
    }

    try {
      setLoading(true);
      const response = await axios.delete('/api/dictionary', {
        data: { ids: selectedRowKeys }
      });
      if (response.data.success) {
        message.success(response.data.message);
        setSelectedRowKeys([]);
        fetchData(pagination.current, pagination.pageSize, searchText);
      }
    } catch (error) {
      console.error('批量删除失败:', error);
      message.error('批量删除失败');
    } finally {
      setLoading(false);
    }
  };

  // 增加使用频次
  const handleIncrementFrequency = async (id) => {
    try {
      const response = await axios.post(`/api/dictionary/${id}/frequency`);
      if (response.data.success) {
        message.success('使用频次已更新');
        fetchData(pagination.current, pagination.pageSize, searchText);
      }
    } catch (error) {
      console.error('更新使用频次失败:', error);
      message.error('更新使用频次失败');
    }
  };

  // 打开编辑模态框
  const handleEdit = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      english: record.english,
      chinese: record.chinese
    });
    setModalVisible(true);
  };

  // 打开添加模态框
  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalVisible(true);
  };

  // 导出数据
  const handleExport = async () => {
    try {
      // 获取所有数据
      const response = await axios.get('/api/dictionary', {
        params: {
          page: 1,
          pageSize: 10000, // 获取大量数据
          search: searchText
        }
      });

      if (response.data.success) {
        const csvContent = [
          ['英文', '中文', '使用频次', '创建时间'].join(','),
          ...response.data.data.map(item => [
            item.english,
            item.chinese,
            item.frequency,
            new Date(item.created_at).toLocaleString()
          ].join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `dictionary_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();

        message.success('导出成功');
      }
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  // 解析CSV文件
  const parseCSV = (text) => {
    const lines = text.split('\n');
    const dictionaries = [];

    // 检测是否有标题行
    const firstLine = lines[0]?.trim();
    const hasHeader = firstLine && (
      firstLine.includes('英文') ||
      firstLine.includes('english') ||
      firstLine.includes('English') ||
      firstLine.includes('中文') ||
      firstLine.includes('chinese') ||
      firstLine.includes('Chinese')
    );

    const startIndex = hasHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        // 处理CSV中的引号和逗号
        const columns = line.split(',').map(col => col.replace(/^"|"$/g, '').trim());
        const [english, chinese, frequency] = columns;

        if (english && chinese) {
          dictionaries.push({
            english: english.trim(),
            chinese: chinese.trim(),
            frequency: parseInt(frequency) || 0
          });
        }
      }
    }

    return dictionaries;
  };

  // 解析JSON文件
  const parseJSON = (text) => {
    try {
      const data = JSON.parse(text);
      const dictionaries = [];

      if (Array.isArray(data)) {
        data.forEach(item => {
          if (item.english && item.chinese) {
            dictionaries.push({
              english: item.english.toString().trim(),
              chinese: item.chinese.toString().trim(),
              frequency: parseInt(item.frequency) || 0
            });
          }
        });
      } else if (typeof data === 'object') {
        // 处理对象格式 {"hello": "你好", "world": "世界"}
        Object.entries(data).forEach(([english, chinese]) => {
          if (english && chinese) {
            dictionaries.push({
              english: english.toString().trim(),
              chinese: chinese.toString().trim(),
              frequency: 0
            });
          }
        });
      }

      return dictionaries;
    } catch (error) {
      throw new Error('JSON格式错误');
    }
  };

  // 解析TXT文件
  const parseTXT = (text) => {
    const lines = text.split('\n');
    const dictionaries = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        // 支持多种分隔符：制表符、空格、冒号、等号
        const separators = ['\t', ':', '=', '  ', ' '];
        let english = '', chinese = '';

        for (const sep of separators) {
          if (trimmedLine.includes(sep)) {
            const parts = trimmedLine.split(sep);
            if (parts.length >= 2) {
              english = parts[0].trim();
              chinese = parts[1].trim();
              break;
            }
          }
        }

        if (english && chinese) {
          dictionaries.push({
            english,
            chinese,
            frequency: 0
          });
        }
      }
    }

    return dictionaries;
  };

  // 导入数据处理
  const handleImport = async (file) => {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const maxFileSize = 10 * 1024 * 1024; // 10MB

    // 检查文件大小
    if (file.size > maxFileSize) {
      message.error('文件大小不能超过10MB');
      return false;
    }

    // 检查文件类型
    if (!['csv', 'json', 'txt'].includes(fileExtension)) {
      message.error('只支持CSV、JSON、TXT格式的文件');
      return false;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setLoading(true);
        const text = e.target.result;
        let dictionaries = [];

        // 根据文件类型解析
        switch (fileExtension) {
          case 'csv':
            dictionaries = parseCSV(text);
            break;
          case 'json':
            dictionaries = parseJSON(text);
            break;
          case 'txt':
            dictionaries = parseTXT(text);
            break;
          default:
            throw new Error('不支持的文件格式');
        }

        if (dictionaries.length === 0) {
          message.warning('未找到有效的字典数据，请检查文件格式');
          return;
        }

        // 数据验证和清理
        const validDictionaries = dictionaries.filter(dict => {
          const englishValid = dict.english && dict.english.length <= 100;
          const chineseValid = dict.chinese && dict.chinese.length <= 200;
          return englishValid && chineseValid;
        });

        if (validDictionaries.length === 0) {
          message.warning('没有找到符合要求的字典数据');
          return;
        }

        if (validDictionaries.length !== dictionaries.length) {
          message.warning(`过滤掉了 ${dictionaries.length - validDictionaries.length} 条无效数据`);
        }

        // 显示导入预览
        Modal.confirm({
          title: '确认导入',
          content: (
            <div>
              <p>准备导入 <strong>{validDictionaries.length}</strong> 条字典数据</p>
              <p>文件类型: <strong>{fileExtension.toUpperCase()}</strong></p>
              <p>示例数据:</p>
              <ul style={{ maxHeight: '200px', overflow: 'auto' }}>
                {validDictionaries.slice(0, 5).map((dict, index) => (
                  <li key={index}>
                    {dict.english} → {dict.chinese}
                    {dict.frequency > 0 && ` (频次: ${dict.frequency})`}
                  </li>
                ))}
                {validDictionaries.length > 5 && <li>...</li>}
              </ul>
            </div>
          ),
          okText: '确认导入',
          cancelText: '取消',
          onOk: async () => {
            try {
              const response = await axios.post('/api/dictionary/import', {
                dictionaries: validDictionaries
              });

              if (response.data.success) {
                message.success(response.data.message);
                fetchData(pagination.current, pagination.pageSize, searchText);
              }
            } catch (error) {
              console.error('导入失败:', error);
              if (error.response?.data?.message) {
                message.error(error.response.data.message);
              } else {
                message.error('导入失败，请检查数据格式');
              }
            }
          }
        });

      } catch (error) {
        console.error('文件解析失败:', error);
        message.error(`文件解析失败: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      message.error('文件读取失败');
      setLoading(false);
    };

    reader.readAsText(file, 'UTF-8');
    return false; // 阻止默认上传行为
  };

  // 清空所有数据
  const handleClearAll = async () => {
    try {
      setLoading(true);
      const response = await axios.delete('/api/dictionary/clear-all');
      if (response.data.success) {
        message.success(response.data.message);
        setSelectedRowKeys([]);
        fetchData(1, pagination.pageSize, searchText);
      }
    } catch (error) {
      console.error('清空数据失败:', error);
      message.error('清空数据失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '序号',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: '使用次数',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 100,
      sorter: (a, b) => a.frequency - b.frequency,
      render: (frequency, record) => (
        <Tooltip title="点击增加使用频次">
          <Button
            type="link"
            size="small"
            onClick={() => handleIncrementFrequency(record.id)}
          >
            {frequency}
          </Button>
        </Tooltip>
      ),
    },
    {
      title: '英文',
      dataIndex: 'english',
      key: 'english',
      width: 200,
      sorter: (a, b) => a.english.localeCompare(b.english),
    },
    {
      title: '中文',
      dataIndex: 'chinese',
      key: 'chinese',
      width: 200,
    },
    {
      title: '日文',
      key: 'japanese',
      width: 200,
      render: () => '-' // 预留字段
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个字典条目吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="字典管理"
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加字典
            </Button>
            <Upload
              accept=".csv,.json,.txt"
              beforeUpload={handleImport}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>
                批量导入字典
              </Button>
            </Upload>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Search
              placeholder="搜索英文或中文"
              allowClear
              style={{ width: 300 }}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              批量删除 ({selectedRowKeys.length})
            </Button>
            <Divider type="vertical" />
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
            >
              导出字典
            </Button>
            <Popconfirm
              title="确定要清空所有字典数据吗？此操作不可恢复！"
              onConfirm={handleClearAll}
              okText="确定"
              cancelText="取消"
            >
              <Button
                danger
                icon={<ClearOutlined />}
              >
                清空字典
              </Button>
            </Popconfirm>
          </Space>
        </div>

        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          size="middle"
        />
      </Card>

      {/* 添加/编辑模态框 */}
      <Modal
        title={editingRecord ? '修改字典' : '添加字典'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingRecord(null);
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label="英文"
            name="english"
            rules={[
              { required: true, message: '请输入英文' },
              { max: 100, message: '英文长度不能超过100个字符' }
            ]}
          >
            <Input placeholder="请输入英文" />
          </Form.Item>

          <Form.Item
            label="中文"
            name="chinese"
            rules={[
              { required: true, message: '请输入中文' },
              { max: 200, message: '中文长度不能超过200个字符' }
            ]}
          >
            <Input placeholder="请输入中文" />
          </Form.Item>

          <Form.Item
            label="日文"
            name="japanese"
          >
            <Input placeholder="请输入日文（可选）" disabled />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setModalVisible(false);
                form.resetFields();
                setEditingRecord(null);
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                确定保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Dictionary;