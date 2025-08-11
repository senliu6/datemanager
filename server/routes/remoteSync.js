const express = require('express');
const remoteSyncService = require('../services/remoteSyncService');
const File = require('../models/file');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const { logAction } = require('../models/auditLog');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 测试远程连接
router.post('/test-connection', authenticateToken, checkPermission('data'), async (req, res) => {
    try {
        const { host, port, username, password, privateKey } = req.body;
        
        if (!host || !username) {
            return res.status(400).json({
                success: false,
                message: '主机地址和用户名是必需的'
            });
        }

        const config = { host, port, username, password, privateKey };
        const result = await remoteSyncService.testSSHConnection(config);
        
        await logAction({
            userId: req.user.id,
            username: req.user.username,
            action: 'test_remote_connection',
            details: `测试远程连接: ${username}@${host}:${port || 22}`,
            ipAddress: req.ip,
        });

        res.json(result);
    } catch (error) {
        console.error('测试连接失败:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 获取同步配置模板
router.get('/config-template', authenticateToken, checkPermission('data'), (req, res) => {
    const templates = {
        ssh: {
            name: 'SSH/SFTP',
            config: {
                host: '192.168.1.100',
                port: 22,
                username: 'user',
                password: '',
                privateKey: '', // 私钥文件路径
                basePath: '/data/uploads'
            }
        },
        rsync: {
            name: 'Rsync',
            config: {
                host: '192.168.1.100',
                port: 22,
                username: 'user',
                basePath: '/data/uploads',
                excludePatterns: ['*.tmp', '*.log']
            }
        },
        rclone: {
            name: 'Rclone',
            config: {
                remote: 'myremote', // rclone配置的远程名称
                basePath: '/uploads',
                excludePatterns: ['*.tmp', '*.log']
            }
        }
    };

    res.json({
        success: true,
        data: templates
    });
});

// 同步选中的文件
router.post('/sync-files', authenticateToken, checkPermission('data'), async (req, res) => {
    try {
        const { fileIds, config, method = 'sftp', options = {} } = req.body;
        
        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '请选择要同步的文件'
            });
        }

        if (!config || !config.host) {
            return res.status(400).json({
                success: false,
                message: '请提供有效的远程服务器配置'
            });
        }

        // 获取文件信息
        const files = [];
        for (const id of fileIds) {
            const file = await File.findById(id);
            if (file && fs.existsSync(file.path)) {
                files.push({
                    id: file.id,
                    filename: file.originalName,
                    localPath: file.path,
                    remotePath: path.join(config.basePath || '/tmp', file.folderPath || '', file.originalName),
                    size: file.size
                });
            }
        }

        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: '没有找到可同步的文件'
            });
        }

        console.log(`开始同步 ${files.length} 个文件，方法: ${method}`);

        // 执行同步
        const results = await remoteSyncService.batchSync(config, files, {
            method,
            stopOnError: options.stopOnError || false,
            onFileProgress: (index, filename, progress) => {
                console.log(`文件 ${index + 1}/${files.length}: ${filename} - ${progress}`);
            }
        });

        // 统计结果
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        await logAction({
            userId: req.user.id,
            username: req.user.username,
            action: 'sync_files',
            details: `同步文件到 ${config.host}，成功: ${successCount}，失败: ${failureCount}`,
            ipAddress: req.ip,
        });

        res.json({
            success: true,
            message: `同步完成，成功: ${successCount}，失败: ${failureCount}`,
            data: {
                totalFiles: files.length,
                successCount,
                failureCount,
                results
            }
        });

    } catch (error) {
        console.error('文件同步失败:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 生成同步脚本
router.post('/generate-script', authenticateToken, checkPermission('data'), async (req, res) => {
    try {
        const { fileIds, config, method = 'rsync', options = {} } = req.body;
        
        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '请选择要同步的文件'
            });
        }

        // 获取文件信息
        const files = [];
        for (const id of fileIds) {
            const file = await File.findById(id);
            if (file && fs.existsSync(file.path)) {
                files.push({
                    filename: file.originalName,
                    localPath: file.path,
                    remotePath: path.join(config.basePath || '/tmp', file.folderPath || '', file.originalName)
                });
            }
        }

        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: '没有找到可同步的文件'
            });
        }

        const script = remoteSyncService.generateSyncScript(config, files, { method, ...options });
        
        // 设置响应头为脚本文件
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="sync_script_${method}.sh"`);
        
        await logAction({
            userId: req.user.id,
            username: req.user.username,
            action: 'generate_sync_script',
            details: `生成${method}同步脚本，包含${files.length}个文件`,
            ipAddress: req.ip,
        });

        res.send(script);

    } catch (error) {
        console.error('生成同步脚本失败:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 获取同步状态
router.get('/sync-status', authenticateToken, checkPermission('data'), (req, res) => {
    // 这里可以实现实时同步状态查询
    res.json({
        success: true,
        data: {
            activeSyncs: 0,
            completedSyncs: 0,
            failedSyncs: 0
        }
    });
});

module.exports = router;