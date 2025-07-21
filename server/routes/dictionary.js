const express = require('express');
const Dictionary = require('../models/dictionary');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const { logAction } = require('../models/auditLog');

const router = express.Router();

// 内存缓存
let dictionaryCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 清除缓存
const clearCache = () => {
  dictionaryCache = null;
  cacheTimestamp = null;
  console.log('字典缓存已清除');
};

// 检查缓存是否有效
const isCacheValid = () => {
  return dictionaryCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION);
};

// 获取字典列表
router.get('/', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { page = 1, pageSize = 50, search = '' } = req.query;
    
    // 如果有搜索条件，不使用缓存
    if (search || !isCacheValid()) {
      const result = await Dictionary.findAll({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        search
      });
      
      // 只有在没有搜索条件时才缓存
      if (!search) {
        dictionaryCache = result;
        cacheTimestamp = Date.now();
        console.log('字典数据已缓存');
      }
      
      res.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: Math.ceil(result.total / result.pageSize)
        }
      });
    } else {
      console.log('使用字典缓存数据');
      res.json({
        success: true,
        data: dictionaryCache.data,
        pagination: {
          total: dictionaryCache.total,
          page: dictionaryCache.page,
          pageSize: dictionaryCache.pageSize,
          totalPages: Math.ceil(dictionaryCache.total / dictionaryCache.pageSize)
        }
      });
    }

    // 记录访问操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'access_dictionary',
      details: `访问字典列表 - 页码: ${page}, 搜索: ${search || '无'}`,
      ipAddress: req.ip,
    });
  } catch (error) {
    console.error('获取字典列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取字典列表失败',
      error: error.message
    });
  }
});

// 添加字典条目
router.post('/', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { english, chinese } = req.body;
    
    if (!english || !chinese) {
      return res.status(400).json({
        success: false,
        message: '英文和中文都是必填项'
      });
    }
    
    const dictionary = await Dictionary.create({ english, chinese });
    
    // 清除缓存
    clearCache();
    
    // 记录添加操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'add_dictionary',
      details: `添加字典条目: ${english} -> ${chinese}`,
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: '字典条目添加成功',
      data: dictionary
    });
  } catch (error) {
    console.error('添加字典条目失败:', error);
    
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({
        success: false,
        message: '该英文单词已存在'
      });
    }
    
    res.status(500).json({
      success: false,
      message: '添加字典条目失败',
      error: error.message
    });
  }
});

// 更新字典条目
router.put('/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { id } = req.params;
    const { english, chinese } = req.body;
    
    if (!english || !chinese) {
      return res.status(400).json({
        success: false,
        message: '英文和中文都是必填项'
      });
    }
    
    const dictionary = await Dictionary.update(id, { english, chinese });
    
    if (!dictionary) {
      return res.status(404).json({
        success: false,
        message: '字典条目不存在'
      });
    }
    
    // 清除缓存
    clearCache();
    
    // 记录更新操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'update_dictionary',
      details: `更新字典条目: ${english} -> ${chinese}`,
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: '字典条目更新成功',
      data: dictionary
    });
  } catch (error) {
    console.error('更新字典条目失败:', error);
    
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({
        success: false,
        message: '该英文单词已存在'
      });
    }
    
    res.status(500).json({
      success: false,
      message: '更新字典条目失败',
      error: error.message
    });
  }
});

// 删除字典条目
router.delete('/:id', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const dictionary = await Dictionary.findById(id);
    if (!dictionary) {
      return res.status(404).json({
        success: false,
        message: '字典条目不存在'
      });
    }
    
    const deleted = await Dictionary.delete(id);
    
    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: '删除字典条目失败'
      });
    }
    
    // 清除缓存
    clearCache();
    
    // 记录删除操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_dictionary',
      details: `删除字典条目: ${dictionary.english} -> ${dictionary.chinese}`,
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: '字典条目删除成功'
    });
  } catch (error) {
    console.error('删除字典条目失败:', error);
    res.status(500).json({
      success: false,
      message: '删除字典条目失败',
      error: error.message
    });
  }
});

// 批量删除字典条目
router.delete('/', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要删除的字典条目ID列表'
      });
    }
    
    const deletedCount = await Dictionary.deleteMany(ids);
    
    // 清除缓存
    clearCache();
    
    // 记录批量删除操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'batch_delete_dictionary',
      details: `批量删除字典条目: ${deletedCount} 个`,
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: `成功删除 ${deletedCount} 个字典条目`
    });
  } catch (error) {
    console.error('批量删除字典条目失败:', error);
    res.status(500).json({
      success: false,
      message: '批量删除字典条目失败',
      error: error.message
    });
  }
});

// 增加使用频次
router.post('/:id/frequency', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const dictionary = await Dictionary.incrementFrequency(id);
    
    if (!dictionary) {
      return res.status(404).json({
        success: false,
        message: '字典条目不存在'
      });
    }
    
    // 清除缓存
    clearCache();
    
    res.json({
      success: true,
      message: '使用频次更新成功',
      data: dictionary
    });
  } catch (error) {
    console.error('更新使用频次失败:', error);
    res.status(500).json({
      success: false,
      message: '更新使用频次失败',
      error: error.message
    });
  }
});

// 批量导入字典数据
router.post('/import', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const { dictionaries } = req.body;
    
    if (!dictionaries || !Array.isArray(dictionaries) || dictionaries.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要导入的字典数据'
      });
    }
    
    // 数据验证和清理
    const validDictionaries = [];
    const errors = [];
    
    dictionaries.forEach((dict, index) => {
      const errors_for_item = [];
      
      // 验证英文字段
      if (!dict.english || typeof dict.english !== 'string') {
        errors_for_item.push('英文字段不能为空');
      } else if (dict.english.length > 100) {
        errors_for_item.push('英文长度不能超过100个字符');
      }
      
      // 验证中文字段
      if (!dict.chinese || typeof dict.chinese !== 'string') {
        errors_for_item.push('中文字段不能为空');
      } else if (dict.chinese.length > 200) {
        errors_for_item.push('中文长度不能超过200个字符');
      }
      
      // 验证频次字段
      const frequency = parseInt(dict.frequency) || 0;
      if (frequency < 0) {
        errors_for_item.push('使用频次不能为负数');
      }
      
      if (errors_for_item.length > 0) {
        errors.push({
          index: index + 1,
          data: dict,
          errors: errors_for_item
        });
      } else {
        validDictionaries.push({
          english: dict.english.trim(),
          chinese: dict.chinese.trim(),
          frequency: Math.min(frequency, 999999) // 限制最大频次
        });
      }
    });
    
    // 如果有验证错误，返回详细信息
    if (errors.length > 0 && validDictionaries.length === 0) {
      return res.status(400).json({
        success: false,
        message: '所有数据都存在验证错误',
        errors: errors.slice(0, 10), // 只返回前10个错误
        totalErrors: errors.length
      });
    }
    
    // 检查重复数据
    const uniqueDictionaries = [];
    const duplicates = [];
    const seenEnglish = new Set();
    
    validDictionaries.forEach((dict, index) => {
      const englishLower = dict.english.toLowerCase();
      if (seenEnglish.has(englishLower)) {
        duplicates.push({
          index: index + 1,
          english: dict.english,
          chinese: dict.chinese
        });
      } else {
        seenEnglish.add(englishLower);
        uniqueDictionaries.push(dict);
      }
    });
    
    if (uniqueDictionaries.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有有效的字典数据可以导入'
      });
    }
    
    // 执行批量导入
    const result = await Dictionary.batchImport(uniqueDictionaries);
    
    // 清除缓存
    clearCache();
    
    // 记录导入操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'import_dictionary',
      details: `批量导入字典数据: 成功 ${result.successCount} 个，失败 ${result.failedCount} 个，重复 ${duplicates.length} 个，验证错误 ${errors.length} 个`,
      ipAddress: req.ip,
    });
    
    // 构建响应消息
    let message = `成功导入 ${result.successCount} 个字典条目`;
    const warnings = [];
    
    if (result.failedCount > 0) {
      warnings.push(`${result.failedCount} 个条目导入失败`);
    }
    if (duplicates.length > 0) {
      warnings.push(`${duplicates.length} 个重复条目已跳过`);
    }
    if (errors.length > 0) {
      warnings.push(`${errors.length} 个条目存在验证错误`);
    }
    
    if (warnings.length > 0) {
      message += `，${warnings.join('，')}`;
    }
    
    res.json({
      success: true,
      message,
      data: {
        total: dictionaries.length,
        successful: result.successCount,
        failed: result.failedCount,
        duplicates: duplicates.length,
        validationErrors: errors.length,
        duplicateItems: duplicates.slice(0, 5), // 返回前5个重复项
        errorItems: errors.slice(0, 5) // 返回前5个错误项
      }
    });
  } catch (error) {
    console.error('批量导入字典失败:', error);
    res.status(500).json({
      success: false,
      message: '批量导入字典失败',
      error: error.message
    });
  }
});

// 清空所有字典数据
router.delete('/clear-all', authenticateToken, checkPermission('data'), async (req, res) => {
  try {
    const deletedCount = await Dictionary.deleteAll();
    
    // 清除缓存
    clearCache();
    
    // 记录清空操作
    await logAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'clear_all_dictionary',
      details: `清空所有字典数据: ${deletedCount} 个`,
      ipAddress: req.ip,
    });
    
    res.json({
      success: true,
      message: `成功清空 ${deletedCount} 个字典条目`
    });
  } catch (error) {
    console.error('清空字典数据失败:', error);
    res.status(500).json({
      success: false,
      message: '清空字典数据失败',
      error: error.message
    });
  }
});

module.exports = router;