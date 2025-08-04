const fs = require('fs');
const path = require('path');

// 检查关键文件是否存在
console.log('🔍 检查关键文件...');

const filesToCheck = [
    'src/components/LeRobotEpisodeCard.jsx',
    'src/pages/DataList.jsx',
    'server/routes/lerobot.js',
    'server/routes/lerobot-stream.js'
];

filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        console.log(`✅ ${file} - ${Math.round(stats.size/1024)}KB`);
    } else {
        console.log(`❌ ${file} - 不存在`);
    }
});

// 检查服务器是否运行
const { spawn } = require('child_process');
const checkServer = spawn('curl', ['-s', 'http://localhost:3001/api/health'], { stdio: 'pipe' });

checkServer.on('close', (code) => {
    if (code === 0) {
        console.log('✅ 服务器运行正常');
    } else {
        console.log('❌ 服务器可能未运行');
    }
});

// 检查数据文件
console.log('\n📁 检查上传文件...');
const uploadsDir = 'Uploads';
if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    const parquetFiles = files.filter(f => f.endsWith('.parquet'));
    const videoFiles = files.filter(f => f.endsWith('.mp4') || f.endsWith('.mov'));
    
    console.log(`Parquet文件: ${parquetFiles.length}`);
    console.log(`视频文件: ${videoFiles.length}`);
    
    // 显示一些示例文件
    if (parquetFiles.length > 0) {
        console.log('示例Parquet文件:', parquetFiles.slice(0, 3));
    }
} else {
    console.log('❌ Uploads目录不存在');
}