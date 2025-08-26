const db = require('../config/db')();
const bcrypt = require('bcrypt');

const createUserTable = () => {
    const createSql = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('管理员', '采集员', '审核员')),
      department TEXT,
      email TEXT,
      status TEXT DEFAULT '启用',
      permissions TEXT DEFAULT '[]',
      isAdmin BOOLEAN DEFAULT 0
    )
  `;
    db.run(createSql, (err) => {
        if (err) {
            console.error('创建用户表失败:', err.message);
            return;
        }
        console.log('用户表创建成功或已存在');

        // 初始化管理员账户
        const adminExistsSql = 'SELECT COUNT(*) as count FROM users WHERE role = "管理员"';
        db.get(adminExistsSql, [], (err, row) => {
            if (err) {
                console.error('检查管理员账户失败:', err.message);
                return;
            }
            if (row.count === 0) {
                bcrypt.hash('admin123', 10, (err, hash) => {
                    if (err) {
                        console.error('管理员密码加密失败:', err.message);
                        return;
                    }
                    db.run(
                        'INSERT INTO users (username, password, role, isAdmin, permissions) VALUES (?, ?, ?, ?, ?)',
                        ['admin', hash, '管理员', 1, JSON.stringify(['overview', 'upload', 'data', 'users', 'settings'])],
                        (err) => {
                            if (err) {
                                console.error('初始化管理员账户失败:', err.message);
                                return;
                            }
                            console.log('管理员账户初始化成功');
                        }
                    );
                });
            }
        });
    });
};

const User = {
    createTable: createUserTable,

    create: (user) => {
        return new Promise((resolve, reject) => {
            bcrypt.hash(user.password, 10, (err, hash) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // 使用前端传入的权限，如果没有则给默认的概览权限
                const permissions = user.permissions && user.permissions.length > 0 
                    ? user.permissions 
                    : ['overview'];
                
                const sql = `
          INSERT INTO users (username, password, role, department, email, status, permissions, isAdmin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
                const params = [
                    user.username,
                    hash,
                    user.role,
                    user.department || '',
                    user.email || '',
                    user.status || '启用',
                    JSON.stringify(permissions),
                    user.role === '管理员' ? 1 : 0
                ];
                db.run(sql, params, function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({ id: this.lastID, ...user, password: undefined });
                });
            });
        });
    },

    findByUsername: (username) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE username = ?';
            db.get(sql, [username], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!row) {
                    resolve(null);
                    return;
                }
                resolve({
                    ...row,
                    permissions: JSON.parse(row.permissions)
                });
            });
        });
    },

    findAll: () => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users';
            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows.map(row => ({
                    ...row,
                    permissions: JSON.parse(row.permissions)
                })));
            });
        });
    },

    update: (id, updates) => {
        return new Promise((resolve, reject) => {
            const validColumns = ['username', 'password', 'role', 'department', 'email', 'status', 'permissions'];
            const updates_filtered = {};
            for (let key in updates) {
                if (validColumns.includes(key)) {
                    updates_filtered[key] = updates[key];
                }
            }

            if (updates.password) {
                bcrypt.hash(updates.password, 10, (err, hash) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    updates_filtered.password = hash;
                    executeUpdate();
                });
            } else {
                executeUpdate();
            }

            function executeUpdate() {
                if (Object.keys(updates_filtered).length === 0) {
                    resolve(null);
                    return;
                }
                
                // 如果更新了角色但没有更新权限，保持现有权限不变
                // 权限应该由前端明确指定，不再自动分配
                
                const sets = Object.keys(updates_filtered).map(key => {
                    if (key === 'permissions') {
                        updates_filtered[key] = JSON.stringify(updates_filtered[key]);
                    }
                    return `${key} = ?`;
                }).join(', ');
                const sql = `UPDATE users SET ${sets} WHERE id = ?`;
                const params = [...Object.values(updates_filtered), id];
                db.run(sql, params, function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(this.changes > 0 ? { id, ...updates_filtered } : null);
                });
            }
        });
    },

    delete: (id) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT isAdmin FROM users WHERE id = ?';
            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (row && row.isAdmin) {
                    reject(new Error('不能删除管理员账户'));
                    return;
                }
                const deleteSql = 'DELETE FROM users WHERE id = ?';
                db.run(deleteSql, [id], function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(this.changes > 0);
                });
            });
        });
    },

    validatePassword: (username, password) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT password FROM users WHERE username = ?';
            db.get(sql, [username], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!row) {
                    resolve(false);
                    return;
                }
                bcrypt.compare(password, row.password, (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(result);
                });
            });
        });
    }
};

createUserTable();
module.exports = User;