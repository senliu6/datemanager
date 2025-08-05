const axios = require('axios');

async function testPointcloudAPI() {
    const baseURL = 'http://localhost:3001';
    const folderPath = 'mem_insert_0521_1621';
    const episodeKey = 'episode_000000';
    
    console.log('🧪 测试点云API...');
    
    try {
        // 测试不同质量级别的点云数据获取
        const qualities = ['low', 'medium', 'high'];
        
        for (const quality of qualities) {
            console.log(`\n📊 测试质量级别: ${quality}`);
            
            const response = await axios.get(`${baseURL}/api/lerobot/pointcloud/${encodeURIComponent(folderPath)}/${episodeKey}`, {
                params: { quality },
                headers: {
                    'Authorization': 'Bearer your-test-token' // 需要替换为实际token
                }
            });
            
            if (response.data.success) {
                const data = response.data.data;
                console.log(`✅ 成功获取点云数据 (${quality}):`);
                console.log(`   - Episode Key: ${data.episodeKey}`);
                console.log(`   - Quality: ${data.quality}`);
                console.log(`   - Source: ${data.source}`);
                console.log(`   - cam_top 点数: ${data.pointcloud_data?.cam_top?.length || 0}`);
                console.log(`   - cam_right_wrist 点数: ${data.pointcloud_data?.cam_right_wrist?.length || 0}`);
            } else {
                console.log(`❌ 获取点云数据失败 (${quality}):`, response.data.message);
            }
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error.response?.data || error.message);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    testPointcloudAPI();
}

module.exports = { testPointcloudAPI };