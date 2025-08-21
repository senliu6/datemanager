import React, { useEffect, useRef, useState } from 'react';
import { Card, Row, Col, Statistic, message, Button, Alert, Space } from 'antd';
import { ReloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import { ClockCircleOutlined, FileOutlined } from '@ant-design/icons';
import axios from '../util/axios';

const Dashboard = () => {
  const dataChartRef = useRef(null);
  const durationChartRef = useRef(null);
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalDuration: '00:00:00'
  });
  const [ffmpegStatus, setFfmpegStatus] = useState(null);
  const [updating, setUpdating] = useState(false);

  const checkFFmpegStatus = async () => {
    try {
      const response = await axios.get('/api/stats/check-ffmpeg');
      if (response.data.success) {
        setFfmpegStatus(response.data.data);
      }
    } catch (error) {
      console.error('检查FFmpeg状态失败:', error);
    }
  };

  const updateVideoDurations = async () => {
    setUpdating(true);
    try {
      const response = await axios.post('/api/stats/update-durations');
      if (response.data.success) {
        message.success(response.data.message);
        // 等待一段时间后刷新统计数据
        setTimeout(() => {
          fetchStats();
        }, 2000);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error('更新视频时长失败');
      console.error('更新视频时长失败:', error);
    } finally {
      setUpdating(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/stats');
      const { totalFiles, totalDuration, monthlyStats, durationStats } = response.data.data;
      
      setStats({
        totalFiles,
        totalDuration
      });

      // 更新数据量统计图表
      if (dataChartRef.current) {
        const months = monthlyStats.map(stat => `${stat.month}月`);
        const counts = monthlyStats.map(stat => stat.count);

        const dataChart = echarts.init(dataChartRef.current);
        dataChart.setOption({
          title: { text: '数据量统计' },
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: months },
          yAxis: { type: 'value' },
          series: [{
            data: counts,
            type: 'line',
            smooth: true,
            areaStyle: {}
          }]
        });
      }

      // 更新数据时长统计图表
      if (durationChartRef.current && durationStats) {
        const durationChart = echarts.init(durationChartRef.current);
        const months = durationStats.map(stat => `${stat.month}月`);
        const durations = durationStats.map(stat => stat.duration);

        durationChart.setOption({
          title: { text: '数据时长统计' },
          tooltip: { 
            trigger: 'axis',
            formatter: function(params) {
              const value = params[0].value;
              const hours = Math.floor(value / 3600);
              const minutes = Math.floor((value % 3600) / 60);
              const seconds = Math.floor(value % 60);
              return `${params[0].name}: ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
          },
          xAxis: { type: 'category', data: months },
          yAxis: { 
            type: 'value',
            axisLabel: {
              formatter: function(value) {
                const hours = Math.floor(value / 3600);
                const minutes = Math.floor((value % 3600) / 60);
                return `${hours}:${minutes.toString().padStart(2, '0')}`;
              }
            }
          },
          series: [{
            data: durations,
            type: 'line',
            smooth: true,
            areaStyle: {}
          }]
        });
      }
    } catch (error) {
      message.error('获取统计数据失败');
      console.error('获取统计数据失败:', error);
    }
  };

  useEffect(() => {
    fetchStats();
    checkFFmpegStatus();

    const handleResize = () => {
      if (dataChartRef.current) {
        echarts.init(dataChartRef.current).resize();
      }
      if (durationChartRef.current) {
        echarts.init(durationChartRef.current).resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (dataChartRef.current) {
        echarts.init(dataChartRef.current).dispose();
      }
      if (durationChartRef.current) {
        echarts.init(durationChartRef.current).dispose();
      }
    };
  }, []);

  return (
    <div>
      {/* FFmpeg状态提示 */}
      {ffmpegStatus && !ffmpegStatus.installed && (
        <Alert
          message="FFmpeg未安装"
          description="需要安装FFmpeg才能获取视频文件的时长信息。请联系管理员安装FFmpeg。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 时长为空时的提示 */}
      {stats.totalDuration === '00:00:00' && stats.totalFiles > 0 && (
        <Alert
          message="视频时长未计算"
          description={
            <Space direction="vertical" size="small">
              <span>检测到视频文件但时长为空，可能需要更新视频时长信息。</span>
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                loading={updating}
                onClick={updateVideoDurations}
                disabled={ffmpegStatus && !ffmpegStatus.installed}
              >
                {updating ? '正在更新...' : '更新视频时长'}
              </Button>
            </Space>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        <Col span={12}>
          <Card>
            <Statistic
              title="数据总数"
              value={stats.totalFiles}
              prefix={<FileOutlined />}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card
            extra={
              stats.totalDuration === '00:00:00' && stats.totalFiles > 0 ? (
                <Button
                  type="link"
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={updating}
                  onClick={updateVideoDurations}
                  disabled={ffmpegStatus && !ffmpegStatus.installed}
                >
                  更新
                </Button>
              ) : null
            }
          >
            <Statistic
              title="数据总时长"
              value={stats.totalDuration}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card>
            <div ref={dataChartRef} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <div ref={durationChartRef} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;