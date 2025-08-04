const { spawn } = require('child_process');
const path = require('path');

async function testPythonScript() {
    console.log('🐍 直接测试Python脚本...');
    
    // 直接调用Python脚本，绕过API
    const pythonScript = path.join(__dirname, 'server/parse_lerobot.py');
    const args = [
        '--files', 'Uploads/1753778318778-414698807.parquet:episode_000000.parquet',
        '--folderPath', 'mem_insert_0521_1621',
        '--quality', 'medium'
    ];
    
    console.log(`执行: python3 ${pythonScript} ${args.join(' ')}`);
    
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python3', [pythonScript, ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: __dirname
        });
        
        let stdoutData = '';
        let stderrData = '';
        
        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log('Python stderr:', data.toString().trim());
        });
        
        pythonProcess.on('close', (code) => {
            console.log(`Python脚本退出码: ${code}`);
            
            if (code !== 0) {
                console.error('Python脚本失败:', stderrData);
                reject(new Error(stderrData));
                return;
            }
            
            try {
                const result = JSON.parse(stdoutData);
                console.log('✅ Python脚本执行成功');
                console.log('数据类型:', result.data_type);
                console.log('Episodes数量:', result.episodes?.length || 0);
                
                if (result.episodes && result.episodes[0]) {
                    const episode = result.episodes[0];
                    console.log('\n📊 第一个Episode数据:');
                    console.log('Key:', episode.key);
                    console.log('Frame count:', episode.frame_count);
                    console.log('Has motor data:', !!episode.motor_data);
                    console.log('Motor data length:', episode.motor_data?.motors?.length);
                    console.log('Has pointcloud:', episode.has_pointcloud);
                    console.log('Video paths:', episode.video_paths);
                    
                    // 检查视频路径
                    if (episode.video_paths) {
                        console.log('\n🎬 视频路径详情:');
                        Object.entries(episode.video_paths).forEach(([cam, path]) => {
                            console.log(`  ${cam}: ${path}`);
                        });
                    }
                }
                
                resolve(result);
            } catch (parseError) {
                console.error('JSON解析失败:', parseError.message);
                console.log('原始输出:', stdoutData.substring(0, 500));
                reject(parseError);
            }
        });
    });
}

testPythonScript().catch(console.error);