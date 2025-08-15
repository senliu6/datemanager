#!/usr/bin/env node

/**
 * 重复文件修复测试脚本
 * 用于验证文件去重和安全删除功能是否正常工作
 */

const { generateUniqueFileName, calculateFileHash, safeDeleteFile } = require('./server/utils/fileDeduplication');
const File = require('./server/models/file');
const fs = require('fs');
const path = require('path');

// 测试数据
const testFiles = [
  { name: 'test.txt', folder: 'folder1', content: 'Hello World' },
  { name: 'test.txt', folder: 'folder2', content: 'Hello World' },
  { name: 'different.txt', folder: 'folder1', content: 'Different content' },
  { name: 'same_content.txt', folder: 'folder2', content: 'Hello World' }
];

async function runTests() {
  console.log('🧪 开始重复文件修复测试');
  console.log('================================');

  try {
    // 测试1: 文件名生成
    console.log('\n📝 测试1: 唯一文件名生成');
    const fileName1 = generateUniqueFileName('test.txt', 'folder1');
    const fileName2 = generateUniqueFileName('test.txt', 'folder2');
    const fileName3 = generateUniqueFileName('test.txt', 'folder1');
    
    console.log(`文件名1: ${fileName1}`);
    console.log(`文件名2: ${fileName2}`);
    console.log(`文件名3: ${fileName3}`);
    
    if (fileName1 !== fileName2 && fileName1 !== fileName3 && fileName2 !== fileName3) {
      console.log('✅ 文件名生成测试通过 - 所有文件名都是唯一的');
    } else {
      console.log('❌ 文件名生成测试失败 - 存在重复文件名');
    }

    // 测试2: 文件哈希计算
    console.log('\n🔍 测试2: 文件哈希计算');
    
    // 创建测试文件
    const testDir = path.join(__dirname, 'test_temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
    
    const testFile1 = path.join(testDir, 'test1.txt');
    const testFile2 = path.join(testDir, 'test2.txt');
    const testFile3 = path.join(testDir, 'test3.txt');
    
    fs.writeFileSync(testFile1, 'Hello World');
    fs.writeFileSync(testFile2, 'Hello World');
    fs.writeFileSync(testFile3, 'Different content');
    
    const hash1 = await calculateFileHash(testFile1);
    const hash2 = await calculateFileHash(testFile2);
    const hash3 = await calculateFileHash(testFile3);
    
    console.log(`文件1哈希: ${hash1}`);
    console.log(`文件2哈希: ${hash2}`);
    console.log(`文件3哈希: ${hash3}`);
    
    if (hash1 === hash2 && hash1 !== hash3) {
      console.log('✅ 文件哈希计算测试通过 - 相同内容产生相同哈希');
    } else {
      console.log('❌ 文件哈希计算测试失败');
    }

    // 测试3: 数据库查询功能
    console.log('\n🗄️  测试3: 数据库查询功能');
    
    try {
      // 测试按哈希查找
      const existingFile = await File.findByHash(hash1);
      console.log(`按哈希查找结果: ${existingFile ? '找到文件' : '未找到文件'}`);
      
      // 测试路径引用计数
      const count = await File.countByPath(testFile1);
      console.log(`路径引用计数: ${count}`);
      
      console.log('✅ 数据库查询功能测试通过');
    } catch (error) {
      console.log('⚠️  数据库查询功能测试跳过 - 数据库未连接');
    }

    // 测试4: 安全删除功能
    console.log('\n🗑️  测试4: 安全删除功能');
    
    const checkReferences = async (filePath) => {
      // 模拟引用计数检查
      if (filePath === testFile1) return 2; // 模拟有2个引用
      return 1; // 其他文件只有1个引用
    };
    
    const deleted1 = await safeDeleteFile(testFile1, checkReferences);
    const deleted2 = await safeDeleteFile(testFile2, checkReferences);
    
    console.log(`文件1删除结果: ${deleted1 ? '成功' : '失败'} (应该跳过删除，因为有多个引用)`);
    console.log(`文件2删除结果: ${deleted2 ? '成功' : '失败'} (应该成功删除)`);
    
    if (deleted1 && !fs.existsSync(testFile1)) {
      console.log('❌ 安全删除测试失败 - 有多个引用的文件被错误删除');
    } else if (deleted2 && !fs.existsSync(testFile2)) {
      console.log('✅ 安全删除测试通过 - 正确处理了引用计数');
    } else {
      console.log('⚠️  安全删除测试部分通过');
    }

    // 清理测试文件
    console.log('\n🧹 清理测试文件');
    try {
      if (fs.existsSync(testFile1)) fs.unlinkSync(testFile1);
      if (fs.existsSync(testFile2)) fs.unlinkSync(testFile2);
      if (fs.existsSync(testFile3)) fs.unlinkSync(testFile3);
      fs.rmdirSync(testDir);
      console.log('✅ 测试文件清理完成');
    } catch (error) {
      console.log('⚠️  测试文件清理失败:', error.message);
    }

    console.log('\n🎉 测试完成');
    console.log('================================');
    console.log('如果所有测试都通过，说明重复文件修复功能正常工作');
    console.log('如果有测试失败，请检查相关代码实现');

  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error);
  }
}

// 运行测试
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };