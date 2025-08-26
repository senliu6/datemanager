const db = require('../config/db')();

const createUploadRecordTable = () => {
    const createSql = `
    CREATE TABLE IF NOT EXISTS upload_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER,
      username TEXT NOT NULL,
      total_files INTEGER DEFAULT 0,
      completed_files INTEGER DEFAULT 0,
      failed_files INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      completed_size INTEGER DEFAULT 0,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      status TEXT DEFAULT 'in_progress',
      folder_path TEXT,
      notes TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

    db.run(createSql, (err) => {
        if (err) {
            console.error('创建上传记录表失败:', err.message);
            return;
        }
        console.log('上传记录表创建成功或已存在');
    });
};

const UploadRecord = {
    createTable: createUploadRecordTable,

    create: (record) => {
        return new Promise((resolve, reject) => {
            const sql = `
        INSERT INTO upload_records (
          session_id, user_id, username, total_files, completed_files, 
          failed_files, total_size, completed_size, start_time, end_time,
          status, folder_path, notes, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

            const params = [
                record.session_id,
                record.user_id || null,
                record.username,
                record.total_files || 0,
                record.completed_files || 0,
                record.failed_files || 0,
                record.total_size || 0,
                record.completed_size || 0,
                record.start_time || new Date().toISOString(),
                record.end_time || null,
                record.status || 'in_progress',
                record.folder_path || null,
                record.notes || null,
                record.ip_address || null
            ];

            db.run(sql, params, function (err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ id: this.lastID, ...record });
            });
        });
    },

    findAll: (options = {}) => {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM upload_records ORDER BY created_at DESC';
            let params = [];

            if (options.limit) {
                sql += ' LIMIT ?';
                params.push(options.limit);
            }

            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    },

    findById: (id) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM upload_records WHERE id = ?';
            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    },

    findBySessionId: (sessionId) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM upload_records WHERE session_id = ?';
            db.get(sql, [sessionId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    },

    findByUserId: (userId, limit = 50) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM upload_records WHERE user_id = ? OR username = ? ORDER BY created_at DESC LIMIT ?';
            db.all(sql, [userId, userId, limit], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    },

    update: (id, updates) => {
        return new Promise((resolve, reject) => {
            const validColumns = [
                'total_files', 'completed_files', 'failed_files', 'total_size',
                'completed_size', 'end_time', 'status', 'folder_path', 'notes', 'updated_at'
            ];

            const filteredUpdates = {};
            for (let key in updates) {
                if (validColumns.includes(key)) {
                    filteredUpdates[key] = updates[key];
                }
            }

            // 自动更新 updated_at
            filteredUpdates.updated_at = new Date().toISOString();

            if (Object.keys(filteredUpdates).length === 0) {
                resolve(null);
                return;
            }

            const sets = Object.keys(filteredUpdates).map(key => `${key} = ?`).join(', ');
            const sql = `UPDATE upload_records SET ${sets} WHERE id = ?`;
            const params = [...Object.values(filteredUpdates), id];

            db.run(sql, params, function (err) {
                if (err) {
                    reject(err);
                    return;
                }
                if (this.changes === 0) {
                    resolve(null);
                    return;
                }
                resolve({ id, ...filteredUpdates });
            });
        });
    },

    updateBySessionId: (sessionId, updates) => {
        return new Promise((resolve, reject) => {
            const validColumns = [
                'total_files', 'completed_files', 'failed_files', 'total_size',
                'completed_size', 'end_time', 'status', 'folder_path', 'notes', 'updated_at'
            ];

            const filteredUpdates = {};
            for (let key in updates) {
                if (validColumns.includes(key)) {
                    filteredUpdates[key] = updates[key];
                }
            }

            // 自动更新 updated_at
            filteredUpdates.updated_at = new Date().toISOString();

            if (Object.keys(filteredUpdates).length === 0) {
                resolve(null);
                return;
            }

            const sets = Object.keys(filteredUpdates).map(key => `${key} = ?`).join(', ');
            const sql = `UPDATE upload_records SET ${sets} WHERE session_id = ?`;
            const params = [...Object.values(filteredUpdates), sessionId];

            db.run(sql, params, function (err) {
                if (err) {
                    reject(err);
                    return;
                }
                if (this.changes === 0) {
                    resolve(null);
                    return;
                }
                resolve({ session_id: sessionId, ...filteredUpdates });
            });
        });
    },

    delete: (id) => {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM upload_records WHERE id = ?';
            db.run(sql, [id], function (err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes > 0);
            });
        });
    },

    // 获取用户的上传统计
    getUserStats: (userId) => {
        return new Promise((resolve, reject) => {
            const sql = `
        SELECT 
          COUNT(*) as total_sessions,
          SUM(total_files) as total_files,
          SUM(completed_files) as completed_files,
          SUM(failed_files) as failed_files,
          SUM(total_size) as total_size,
          SUM(completed_size) as completed_size
        FROM upload_records 
        WHERE user_id = ?
      `;

            db.get(sql, [userId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    },

    // 删除用户的所有上传记录
    deleteAllByUserId: (userId) => {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM upload_records WHERE user_id = ?';
            db.run(sql, [userId], function (err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes);
            });
        });
    }
};

// 创建表
createUploadRecordTable();

module.exports = UploadRecord;