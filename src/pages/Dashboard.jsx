import React, { useEffect, useRef, useState } from 'react';
import { Card, Row, Col, Statistic, message } from 'antd';
import * as echarts from 'echarts';
import { CloudUploadOutlined, ClockCircleOutlined, TagOutlined, FileOutlined } from '@ant-design/icons';
import axios from '../util/axios';

const Dashboard = () => {
  const dataChartRef = useRef(null);
  const durationChartRef = useRef(null);
  const labelChartRef = useRef(null);
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalDuration: '00:00:00',
    totalAnnotations: 0
  });

  const fetchStats = async () => {
    try {

      const response = await axios.get('/api/stats');
      const { totalFiles, monthlyStats } = response.data.data;
      
      setStats(prev => ({
        ...prev,
        totalFiles
      }));

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
    } catch (error) {
      message.error('获取统计数据失败');
      console.error('获取统计数据失败:', error);
    }
  };

  useEffect(() => {
    fetchStats();

    // 数据时长统计图表
    const durationChart = echarts.init(durationChartRef.current);
    durationChart.setOption({
      title: { text: '数据时长' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月', '6月'] },
      yAxis: { type: 'value' },
      series: [{
        data: [3, 0, 0, 2, 1, 0],
        type: 'line',
        smooth: true,
        areaStyle: {}
      }]
    });

    // 标注统计图表
    const labelChart = echarts.init(labelChartRef.current);
    labelChart.setOption({
      title: { text: '标注统计' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['动作技能', '操作物体', '操作目标'] },
      yAxis: { type: 'value' },
      series: [{
        data: [7, 4, 2],
        type: 'bar'
      }]
    });

    const handleResize = () => {
      dataChartRef.current && echarts.init(dataChartRef.current).resize();
      durationChart.resize();
      labelChart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      dataChartRef.current && echarts.init(dataChartRef.current).dispose();
      durationChart.dispose();
      labelChart.dispose();
    };
  }, []);

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="数据总数"
              value={stats.totalFiles}
              prefix={<FileOutlined />}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="新增时长"
              value={stats.totalDuration}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="标注总数"
              value={stats.totalAnnotations}
              prefix={<TagOutlined />}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="上传进度"
              value={100}
              prefix={<CloudUploadOutlined />}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card>
            <div ref={dataChartRef} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div ref={durationChartRef} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div ref={labelChartRef} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;