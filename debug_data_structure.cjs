const axios = require('axios');

async function debugDataStructure() {
    try {
        console.log('🔍 调试数据结构...');
        
        // 模拟前端请求
        const response = await axios.post('http://localhost:3001/api/lerobot/parse', {
            folderPath: 'mem_insert_0521_1621',
            quality: 'medium'
        }, {
            // 暂时跳过认证，直接调试数据结构
        }
        });
        
        console.log('📊 API响应结构:');
        console.log('Success:', response.data.success);
        console.log('Data type:', response.data.data_type);
        console.log('Episodes count:', response.data.data?.length || 0);
        
        if (response.data.data && response.data.data.length > 0) {
            const firstEpisode = response.data.data[0];
            console.log('\n📋 第一个Episode结构:');
            console.log('Key:', firstEpisode.key);
            console.log('Has pointcloud:', firstEpisode.has_pointcloud);
            console.log('Frame count:', firstEpisode.frame_count);
            console.log('Motor data:', !!firstEpisode.motor_data);
            console.log('Pointcloud data:', !!firstEpisode.pointcloud_data);
            console.log('Pointcloud info:', firstEpisode.pointcloud_info);
            console.log('Video paths:', Object.keys(firstEpisode.video_paths || {}));
            
            // 如果没有点云数据，尝试单独请求
            if (firstEpisode.has_pointcloud && !firstEpisode.pointcloud_data) {
                console.log('\n🔄 尝试单独请求点云数据...');
                try {
                    const pointcloudResponse = await axios.get(`http://localhost:3001/api/lerobot/pointcloud/${firstEpisode.key}`, {
                        params: { 
                            quality: 'medium', 
                            folderPath: 'mem_insert_0521_1621' 
                        },
                        headers: { 
                            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3MzM0NTU0NzIsImV4cCI6MTczMzU0MTg3Mn0.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8' 
                        }
                    });
                    
                    console.log('✅ 点云数据请求成功:');
                    console.log('Source:', pointcloudResponse.data.source);
                    console.log('Quality:', pointcloudResponse.data.quality);
                    
                    const pointcloudData = pointcloudResponse.data.data;
                    if (pointcloudData && pointcloudData.pointcloud_data) {
                        console.log('Cam top frames:', pointcloudData.pointcloud_data.cam_top?.length || 0);
                        console.log('Cam right wrist frames:', pointcloudData.pointcloud_data.cam_right_wrist?.length || 0);
                        
                        // 检查第一帧数据
                        if (pointcloudData.pointcloud_data.cam_top && pointcloudData.pointcloud_data.cam_top[0]) {
                            console.log('第一帧cam_top点数:', pointcloudData.pointcloud_data.cam_top[0].length);
                            console.log('样本点:', pointcloudData.pointcloud_data.cam_top[0].slice(0, 3));
                        }
                    }
                } catch (pointcloudError) {
                    console.error('❌ 点云数据请求失败:', pointcloudError.response?.data || pointcloudError.message);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ 调试失败:', error.response?.data || error.message);
    }
}

// 运行调试
debugDataStructure();