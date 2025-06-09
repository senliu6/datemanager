const db = require('../config/db')();

const createFileTable = () => {
  const sql = `
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
      status TEXT DEFAULT 'active'
    )
  `;

  db.run(sql, (err) => {
    if (err) {
      console.error('创建文件表失败:', err.message);
      return;
    }
    console.log('文件表创建成功或已存在');
  });
};

const File = {
  createTable: createFileTable,

  create: (file) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO files (
          fileName, originalName, size, duration, project,
          uploader, task, annotation, tags, path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        file.status || 'active'
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

  findAll: () => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM files';
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        // 将tags从JSON字符串转回数组
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
        // 将tags从JSON字符串转回数组
        const file = {
          ...row,
          tags: JSON.parse(row.tags)
        };
        resolve(file);
      });
    });
  },

  update: (id, updates) => {
    return new Promise((resolve, reject) => {
      const validColumns = [
        'fileName', 'originalName', 'size', 'duration', 'project',
        'uploader', 'task', 'annotation', 'tags', 'path', 'status'
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
  }
};

// 创建表
createFileTable();

module.exports = File;