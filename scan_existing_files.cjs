#!/usr/bin/env node

// ===========================================
// 数据管理平台 - 现有文件扫描脚本
// 功能：扫描上传目录并注册到数据库
// ===========================================

const fs = require('fs');
const path = require('path');

// 加载文件模型
const File = require('./server/models/file');

// 配置参数
const UPLOADS_DIR = '/app/Uploads';

// 扫描目录并注册文件
async function scanAndRegisterFiles() {
    console.log('🔍 开始扫描上传目录:', UPLOADS_DIR);
    
    if (!fs.existsSync(UPLOADS_DIR)) {
        console.error('❌ 上传目录不存在:', UPLOADS_DIR);
        process.exit(1);
    }
    
    let totalFiles = 0;
    let registeredFiles = 0;
    let skippedFiles = 0;
    let errorFiles = 0;
    
    // 递归扫描目录
    async function scanDirectory(dirPath, relativePath = '') {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                // 递归扫描子目录
                const newRelativePath = relativePath ? path.join(relativePath, item) : item;
                await scanDirectory(fullPath, newRelativePath);
            } else if (stats.isFile()) {
                totalFiles++;
                
                try {
                    // 检查文件是否已经在数据库中
                    const existingFiles = await File.findByOriginalName(item);
                    const existingFile = existingFiles.find(f => f.path === fullPath);
                    
                    if (existingFile) {
                        console.log(`⏭️  跳过已存在的文件: ${item}`);
                        skippedFiles++;
                        continue;
                    }
                    
                    // 生成唯一的文件名
                    const timestamp = Date.now();
                    const randomNum = Math.floor(Math.random() * 1000000000);
                    const ext = path.extname(item);
                    const fileName = `${timestamp}-${randomNum}${ext}`;
                    
                    // 确定文件夹路径
                    let folderPath = relativePath || '未分类';
                    
                    // 创建文件记录
                    const fileData = await File.create({
                        fileName: fileName,
                        originalName: item,
                        size: stats.size,
                        duration: '未知',
                        path: fullPath,
                        uploader: 'upload_user',
                        tags: [],
                        chunked: false,
                        folderPath: folderPath
                    });
                    
                    console.log(`✅ 注册成功: ${item} (ID: ${fileData.id}, 大小: ${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
                    registeredFiles++;
                    
                } catch (error) {
                    console.error(`❌ 注册失败: ${item} - ${error.message}`);
                    errorFiles++;
                }
            }
        }
    }
    
    try {
        await scanDirectory(UPLOADS_DIR);
        
        console.log('\n📊 扫描完成统计:');
        console.log(`   总文件数: ${totalFiles}`);
        console.log(`   新注册: ${registeredFiles}`);
        console.log(`   已存在: ${skippedFiles}`);
        console.log(`   失败: ${errorFiles}`);
        
        if (registeredFiles > 0) {
            console.log('\n🎉 文件注册完成！现在可以在数据管理平台的Web界面中查看这些文件。');
        } else {
            console.log('\n💡 没有新文件需要注册。');
        }
        
    } catch (error) {
        console.error('❌ 扫描过程出错:', error);
        process.exit(1);
    }
}

// 执行扫描
scanAndRegisterFiles().catch(error => {
    console.error('❌ 程序执行出错:', error);
    process.exit(1);
});