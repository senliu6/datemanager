import React from 'react';
import { Upload, Card, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const { Dragger } = Upload;

const UploadPage = () => {
  const uploadProps = {
    name: 'file',
    multiple: true,
    directory: true,
    action: '/api/upload',
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        message.success(`${info.file.name} 上传成功`);
      } else if (status === 'error') {
        message.error(`${info.file.name} 上传失败`);
      }
    },
    onDrop(e) {
      console.log('Dropped files', e.dataTransfer.files);
    },
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card title="文件上传">
        <Dragger {...uploadProps} className="upload-dragger">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件/文件夹到此区域上传</p>
          <p className="ant-upload-hint">
            支持单个或批量上传，严禁上传公司内部资料或其他违禁文件
          </p>
        </Dragger>
      </Card>
    </div>
  );
};

export default UploadPage;