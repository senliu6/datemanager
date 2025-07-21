const db = require('../config/db')();

class Dictionary {
  // 创建字典表
  static createTable() {
    return new Promise((resolve, reject) => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS dictionaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          english TEXT NOT NULL UNIQUE,
          chinese TEXT NOT NULL,
          frequency INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      db.run(createTableSQL, (err) => {
        if (err) {
          console.error('创建字典表失败:', err);
          reject(err);
        } else {
          console.log('字典表创建成功');
          resolve();
        }
      });
    });
  }

  // 添加字典条目
  static create(data) {
    return new Promise((resolve, reject) => {
      const { english, chinese } = data;
      const sql = `
        INSERT INTO dictionaries (english, chinese, frequency)
        VALUES (?, ?, 0)
      `;
      
      db.run(sql, [english, chinese], function(err) {
        if (err) {
          console.error('添加字典条目失败:', err);
          reject(err);
        } else {
          // 获取刚插入的记录
          Dictionary.findById(this.lastID)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  // 获取所有字典条目
  static findAll(options = {}) {
    return new Promise((resolve, reject) => {
      const { page = 1, pageSize = 50, search = '' } = options;
      const offset = (page - 1) * pageSize;
      
      let sql = `
        SELECT id, english, chinese, frequency, created_at, updated_at
        FROM dictionaries
      `;
      let params = [];
      
      if (search) {
        sql += ` WHERE english LIKE ? OR chinese LIKE ?`;
        params = [`%${search}%`, `%${search}%`];
      }
      
      sql += ` ORDER BY frequency DESC, english ASC LIMIT ? OFFSET ?`;
      params.push(pageSize, offset);
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('获取字典列表失败:', err);
          reject(err);
          return;
        }
        
        // 获取总数
        let countSql = `SELECT COUNT(*) as total FROM dictionaries`;
        let countParams = [];
        
        if (search) {
          countSql += ` WHERE english LIKE ? OR chinese LIKE ?`;
          countParams = [`%${search}%`, `%${search}%`];
        }
        
        db.get(countSql, countParams, (countErr, countResult) => {
          if (countErr) {
            console.error('获取字典总数失败:', countErr);
            reject(countErr);
            return;
          }
          
          resolve({
            data: rows,
            total: countResult.total,
            page,
            pageSize
          });
        });
      });
    });
  }

  // 根据ID获取字典条目
  static findById(id) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, english, chinese, frequency, created_at, updated_at
        FROM dictionaries
        WHERE id = ?
      `;
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          console.error('获取字典条目失败:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 更新字典条目
  static update(id, data) {
    return new Promise((resolve, reject) => {
      const { english, chinese } = data;
      const sql = `
        UPDATE dictionaries
        SET english = ?, chinese = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      db.run(sql, [english, chinese, id], (err) => {
        if (err) {
          console.error('更新字典条目失败:', err);
          reject(err);
        } else {
          // 获取更新后的记录
          Dictionary.findById(id)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  // 删除字典条目
  static delete(id) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM dictionaries WHERE id = ?`;
      
      db.run(sql, [id], function(err) {
        if (err) {
          console.error('删除字典条目失败:', err);
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  // 批量删除字典条目
  static deleteMany(ids) {
    return new Promise((resolve, reject) => {
      const placeholders = ids.map(() => '?').join(',');
      const sql = `DELETE FROM dictionaries WHERE id IN (${placeholders})`;
      
      db.run(sql, ids, function(err) {
        if (err) {
          console.error('批量删除字典条目失败:', err);
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // 增加使用频次
  static incrementFrequency(id) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE dictionaries
        SET frequency = frequency + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      db.run(sql, [id], (err) => {
        if (err) {
          console.error('更新使用频次失败:', err);
          reject(err);
        } else {
          // 获取更新后的记录
          Dictionary.findById(id)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  // 批量导入字典数据
  static batchImport(dictionaries) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO dictionaries (english, chinese, frequency)
        VALUES (?, ?, ?)
      `;
      
      let successCount = 0;
      let processedCount = 0;
      
      if (dictionaries.length === 0) {
        resolve(0);
        return;
      }
      
      dictionaries.forEach((dict) => {
        db.run(sql, [dict.english, dict.chinese, dict.frequency || 0], (err) => {
          processedCount++;
          
          if (!err) {
            successCount++;
          } else {
            console.warn('导入字典条目失败:', dict, err.message);
          }
          
          // 所有条目都处理完成
          if (processedCount === dictionaries.length) {
            resolve(successCount);
          }
        });
      });
    });
  }

  // 清空所有字典数据
  static deleteAll() {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM dictionaries`;
      
      db.run(sql, function(err) {
        if (err) {
          console.error('清空字典数据失败:', err);
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }
}

module.exports = Dictionary;