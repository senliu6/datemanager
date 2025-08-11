const { Client } = require('ssh2');
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class RemoteSyncService {
    constructor() {
        this.activeConnections = new Map();
    }

    // SSH连接测试
    async testSSHConnection(config) {
        return new Promise((resolve, reject) => {
            const conn = new Client();
            
            conn.on('ready', () => {
                conn.end();
                resolve({ success: true, message: 'SSH连接成功' });
            });
            
            conn.on('error', (err) => {
                reject(new Error(`SSH连接失败: ${err.message}`));
            });
            
            conn.connect({
                host: config.host,
                port: config.port || 22,
                username: config.username,
                password: config.password,
                privateKey: config.privateKey ? fs.readFileSync(config.privateKey) : undefined,
                readyTimeout: 10000
            });
        });
    }

    // SFTP文件传输
    async sftpTransfer(config, localPath, remotePath, options = {}) {
        const sftp = new SftpClient();
        
        try {
            await sftp.connect({
                host: config.host,
                port: config.port || 22,
                username: config.username,
                password: config.password,
                privateKey: config.privateKey ? fs.readFileSync(config.privateKey) : undefined,
            });

            console.log(`开始SFTP传输: ${localPath} -> ${remotePath}`);
            
            // 创建远程目录
            const remoteDir = path.dirname(remotePath);
            await sftp.mkdir(remoteDir, true);
            
            // 上传文件
            const result = await sftp.fastPut(localPath, remotePath, {
                step: (total_transferred, chunk, total) => {
                    const progress = Math.round((total_transferred / total) * 100);
                    if (options.onProgress) {
                        options.onProgress(progress, total_transferred, total);
                    }
                }
            });
            
            await sftp.end();
            return { success: true, message: 'SFTP传输完成', result };
            
        } catch (error) {
            await sftp.end();
            throw new Error(`SFTP传输失败: ${error.message}`);
        }
    }

    // Rsync同步
    async rsyncTransfer(config, localPath, remotePath, options = {}) {
        return new Promise((resolve, reject) => {
            const args = [
                '-avz',
                '-e', `ssh -p ${config.port || 22}`,
                localPath,
                `${config.username}@${config.host}:${remotePath}`
            ];

            if (options.excludePatterns) {
                options.excludePatterns.forEach(pattern => {
                    args.push('--exclude', pattern);
                });
            }

            if (options.dryRun) {
                args.push('--dry-run');
            }

            console.log(`开始Rsync同步: rsync ${args.join(' ')}`);

            const rsync = spawn('rsync', args);
            let output = '';
            let errorOutput = '';

            rsync.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                if (options.onProgress) {
                    options.onProgress(text);
                }
            });

            rsync.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            rsync.on('close', (code) => {
                if (code === 0) {
                    resolve({ 
                        success: true, 
                        message: 'Rsync同步完成', 
                        exitCode: code,
                        output 
                    });
                } else {
                    reject(new Error(`Rsync同步失败 (退出码: ${code}): ${errorOutput}`));
                }
            });

            rsync.on('error', (error) => {
                reject(new Error(`Rsync执行失败: ${error.message}`));
            });
        });
    }

    // Rclone同步
    async rcloneTransfer(config, localPath, remotePath, options = {}) {
        return new Promise((resolve, reject) => {
            const args = [
                'copy',
                localPath,
                `${config.remote}:${remotePath}`,
                '--progress',
                '--stats', '1s'
            ];

            if (options.dryRun) {
                args.push('--dry-run');
            }

            if (options.excludePatterns) {
                options.excludePatterns.forEach(pattern => {
                    args.push('--exclude', pattern);
                });
            }

            console.log(`开始Rclone同步: rclone ${args.join(' ')}`);

            const rclone = spawn('rclone', args);
            let output = '';
            let errorOutput = '';

            rclone.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                if (options.onProgress) {
                    options.onProgress(text);
                }
            });

            rclone.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            rclone.on('close', (code) => {
                if (code === 0) {
                    resolve({ 
                        success: true, 
                        message: 'Rclone同步完成', 
                        output 
                    });
                } else {
                    reject(new Error(`Rclone同步失败 (退出码: ${code}): ${errorOutput}`));
                }
            });

            rclone.on('error', (error) => {
                reject(new Error(`Rclone执行失败: ${error.message}`));
            });
        });
    }

    // 批量文件同步
    async batchSync(config, fileList, options = {}) {
        const results = [];
        const method = options.method || 'sftp';
        
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const localPath = file.localPath;
            const remotePath = file.remotePath || path.join(config.basePath || '/tmp', file.filename);
            
            try {
                console.log(`同步文件 ${i + 1}/${fileList.length}: ${file.filename}`);
                
                let result;
                switch (method) {
                    case 'sftp':
                        result = await this.sftpTransfer(config, localPath, remotePath, {
                            onProgress: (progress, transferred, total) => {
                                if (options.onFileProgress) {
                                    options.onFileProgress(i, file.filename, progress, transferred, total);
                                }
                            }
                        });
                        break;
                    case 'rsync':
                        result = await this.rsyncTransfer(config, localPath, remotePath, {
                            onProgress: (output) => {
                                if (options.onFileProgress) {
                                    options.onFileProgress(i, file.filename, output);
                                }
                            }
                        });
                        break;
                    case 'rclone':
                        result = await this.rcloneTransfer(config, localPath, remotePath, {
                            onProgress: (output) => {
                                if (options.onFileProgress) {
                                    options.onFileProgress(i, file.filename, output);
                                }
                            }
                        });
                        break;
                    default:
                        throw new Error(`不支持的同步方法: ${method}`);
                }
                
                results.push({
                    file: file.filename,
                    success: true,
                    result
                });
                
            } catch (error) {
                console.error(`文件同步失败: ${file.filename}`, error);
                results.push({
                    file: file.filename,
                    success: false,
                    error: error.message
                });
                
                if (options.stopOnError) {
                    break;
                }
            }
        }
        
        return results;
    }

    // 生成同步脚本
    generateSyncScript(config, fileList, options = {}) {
        const method = options.method || 'rsync';
        const direction = options.direction || 'download'; // download 或 upload
        let script = '#!/bin/bash\n\n';
        script += '# 自动生成的同步脚本\n';
        script += `# 生成时间: ${new Date().toISOString()}\n`;
        script += `# 同步方向: ${direction === 'upload' ? '上传到平台' : '从平台下载'}\n\n`;
        
        switch (method) {
            case 'rsync':
                script += `# Rsync同步脚本\n`;
                script += `HOST="${config.host}"\n`;
                script += `USER="${config.username}"\n`;
                script += `PORT="${config.port || 22}"\n`;
                script += `REMOTE_PATH="${config.basePath || '/tmp'}"\n\n`;
                
                if (direction === 'upload') {
                    script += `# 上传脚本 - 从本地上传到平台\n`;
                    script += `LOCAL_BASE_PATH="/path/to/your/local/folder"  # 请修改为实际的本地路径\n\n`;
                    script += `echo "开始上传文件到平台..."\n\n`;
                    
                    fileList.forEach(file => {
                        script += `echo "上传: ${file.filename}"\n`;
                        script += `rsync -avz --progress -e "ssh -p $PORT" "$LOCAL_BASE_PATH/${file.filename}" "$USER@$HOST:$REMOTE_PATH/${file.filename}"\n`;
                        script += `if [ $? -eq 0 ]; then\n`;
                        script += `    echo "✅ ${file.filename} 上传成功"\n`;
                        script += `else\n`;
                        script += `    echo "❌ ${file.filename} 上传失败"\n`;
                        script += `fi\n\n`;
                    });
                } else {
                    script += `# 下载脚本 - 从平台下载到本地\n`;
                    script += `LOCAL_BASE_PATH="./downloads"  # 本地下载目录\n`;
                    script += `mkdir -p "$LOCAL_BASE_PATH"\n\n`;
                    script += `echo "开始从平台下载文件..."\n\n`;
                    
                    fileList.forEach(file => {
                        script += `echo "下载: ${file.filename}"\n`;
                        script += `rsync -avz --progress -e "ssh -p $PORT" "$USER@$HOST:${file.localPath}" "$LOCAL_BASE_PATH/${file.filename}"\n`;
                        script += `if [ $? -eq 0 ]; then\n`;
                        script += `    echo "✅ ${file.filename} 下载成功"\n`;
                        script += `else\n`;
                        script += `    echo "❌ ${file.filename} 下载失败"\n`;
                        script += `fi\n\n`;
                    });
                }
                break;
                
            case 'scp':
                script += `# SCP传输脚本\n`;
                script += `HOST="${config.host}"\n`;
                script += `USER="${config.username}"\n`;
                script += `PORT="${config.port || 22}"\n`;
                script += `REMOTE_PATH="${config.basePath || '/tmp'}"\n\n`;
                
                fileList.forEach(file => {
                    script += `echo "传输: ${file.filename}"\n`;
                    script += `scp -P $PORT "${file.localPath}" "$USER@$HOST:$REMOTE_PATH/${file.filename}"\n`;
                    script += `if [ $? -eq 0 ]; then\n`;
                    script += `    echo "✅ ${file.filename} 传输成功"\n`;
                    script += `else\n`;
                    script += `    echo "❌ ${file.filename} 传输失败"\n`;
                    script += `fi\n\n`;
                });
                break;
                
            case 'rclone':
                script += `# Rclone同步脚本\n`;
                script += `REMOTE="${config.remote}"\n`;
                script += `REMOTE_PATH="${config.basePath || '/'}"\n\n`;
                
                fileList.forEach(file => {
                    script += `echo "同步: ${file.filename}"\n`;
                    script += `rclone copy "${file.localPath}" "$REMOTE:$REMOTE_PATH" --progress\n`;
                    script += `if [ $? -eq 0 ]; then\n`;
                    script += `    echo "✅ ${file.filename} 同步成功"\n`;
                    script += `else\n`;
                    script += `    echo "❌ ${file.filename} 同步失败"\n`;
                    script += `fi\n\n`;
                });
                break;
        }
        
        script += 'echo "同步脚本执行完成"\n';
        return script;
    }
}

module.exports = new RemoteSyncService();