const db = require('../config/db')();
const fs = require('fs');
const path = require('path');

const createFileTable = () => {
  const createSql = `
    CREATE TABLE IF NOT EXISTS files (
                                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                                       fileName TEXT NOT NULL,
                                       originalName TEXT NOT NULL,
                                       size INTEGER NOT NULL,
                                       duration TEXT DEFAULT '未知',
                                       project TEXT DEFAULT '未分类',
                                       uploader TEXT NOT NULL,
                                       uploadTime DATETIME DEFAULT CURRENT_TIMESTAMP,
                                       task TEXT DEFAULT '处理中',
                                       annotation INTEGER DEFAULT 0,
                                       tags TEXT DEFAULT '[]',
                                       path TEXT NOT NULL,
                                       status TEXT DEFAULT 'active',
                                       chunked BOOLEAN DEFAULT 0,
                                       md5 TEXT,
                                       folderPath TEXT DEFAULT '未分类'
    )
  `;
  db.run(createSql, (err) => {
    if (err) {
      console.error('创建文件表失败:', err.message);
      return;
    }
    console.log('文件表创建成功或已存在');
  });
};


// recreateTable 方法用于删除旧表并创建新表
const recreateTable = () => {
  return new Promise((resolve, reject) => {
    const dropSql = 'DROP TABLE IF EXISTS files';
    db.run(dropSql, (err) => {
      if (err) {
        console.error('删除文件表失败:', err.message);
        reject(err);
        return;
      }
      createFileTable(); // 创建新表
      resolve();
    });
  });
};


const File = {
  createTable: createFileTable,

  create: (file) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO files (
          fileName, originalName, size, duration, project,
          uploader, task, annotation, tags, path, status,
          chunked, md5, folderPath
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        file.fileName,
        file.originalName,
        file.size,
        file.duration || '未知',
        file.project || '未分类',
        file.uploader,
        file.task || '处理中',
        file.annotation || 0,
        JSON.stringify(file.tags || []),
        file.path,
        file.status || 'active',
        file.chunked || false,
        file.md5 || null,
        file.folderPath || '未分类'
      ];

      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ id: this.lastID, ...file });
      });
    });
  },

  findAll: (options = {}) => {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM files';
      let params = [];
      
      // 支持where条件查询
      if (options.where) {
        const whereConditions = [];
        const whereParams = [];
        
        for (const [key, value] of Object.entries(options.where)) {
          whereConditions.push(`${key} = ?`);
          whereParams.push(value);
        }
        
        if (whereConditions.length > 0) {
          sql += ' WHERE ' + whereConditions.join(' AND ');
          params = whereParams;
        }
      }
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const files = rows.map(row => ({
          ...row,
          tags: JSON.parse(row.tags)
        }));
        resolve(files);
      });
    });
  },

  findById: (id) => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM files WHERE id = ?';
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }
        const file = {
          ...row,
          tags: JSON.parse(row.tags)
        };
        resolve(file);
      });
    });
  },

  findByOriginalName: (originalName) => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM files WHERE originalName = ?';
      db.all(sql, [originalName], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }
        const files = rows.map(row => ({
          ...row,
          tags: JSON.parse(row.tags)
        }));
        resolve(files);
      });
    });
  },

  findByHash: (md5Hash) => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM files WHERE md5 = ? LIMIT 1';
      db.get(sql, [md5Hash], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }
        const file = {
          ...row,
          tags: JSON.parse(row.tags)
        };
        resolve(file);
      });
    });
  },

  countByPath: (filePath) => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM files WHERE path = ?';
      db.get(sql, [filePath], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row.count);
      });
    });
  },

  getFileContent: (id) => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT path, originalName FROM files WHERE id = ?';
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }
        const extension = row.originalName.split('.').pop().toLowerCase();
        const filePath = row.path;
        if (extension === 'txt') {
          fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
              reject(err);
              return;
            }
            resolve({ content, extension, path: `/uploads/${path.basename(filePath)}` });
          });
        } else if (extension === 'npy') {
          fs.readFile(filePath, (err, buffer) => {
            if (err) {
              reject(err);
              return;
            }
            const headerLen = buffer.readUInt32LE(10);
            const header = buffer.slice(10, 10 + headerLen).toString('ascii');
            resolve({ content: header, extension, path: `/uploads/${path.basename(filePath)}` });
          });
        } else {
          resolve({ content: null, extension, path: `/uploads/${path.basename(filePath)}` });
        }
      });
    });
  },

  update: (id, updates) => {
    return new Promise((resolve, reject) => {
      const validColumns = [
        'fileName', 'originalName', 'size', 'duration', 'project',
        'uploader', 'task', 'annotation', 'tags', 'path', 'status',
        'chunked', 'md5', 'folderPath'
      ];

      const updates_filtered = {};
      for (let key in updates) {
        if (validColumns.includes(key)) {
          updates_filtered[key] = updates[key];
        }
      }

      if (Object.keys(updates_filtered).length === 0) {
        resolve(null);
        return;
      }

      const sets = Object.keys(updates_filtered).map(key => {
        if (key === 'tags') {
          updates_filtered[key] = JSON.stringify(updates_filtered[key]);
        }
        return `${key} = ?`;
      }).join(', ');

      const sql = `UPDATE files SET ${sets} WHERE id = ?`;
      const params = [...Object.values(updates_filtered), id];

      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        resolve({ id, ...updates_filtered });
      });
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM files WHERE id = ?';
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  },

  deleteAll: () => {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM files';
      db.run(sql, [], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  },

  deleteMany: (conditions) => {
    return new Promise((resolve, reject) => {
      const whereClause = Object.keys(conditions)
          .map(key => {
            if (typeof conditions[key] === 'object' && conditions[key].$like) {
              return `${key} LIKE ?`;
            }
            return `${key} = ?`;
          })
          .join(' AND ');
      const params = Object.values(conditions).map(val =>
          typeof val === 'object' && val.$like ? `${val.$like}%` : val
      );
      const sql = `DELETE FROM files WHERE ${whereClause}`;
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }
};


createFileTable();
// recreateTable().then(() => console.log('表已重建'));

module.exports = File;