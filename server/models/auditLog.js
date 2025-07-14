const db = require('../config/db')();

const createAuditLogTable = () => {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                      userId INTEGER NOT NULL,
                                                      username TEXT NOT NULL,
                                                      action TEXT NOT NULL,
                                                      details TEXT,
                                                      ipAddress TEXT,
                                                      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('创建 AuditLog 表失败:', err);
                reject(err);
            } else {
                console.log('AuditLog 表创建成功或已存在');
                resolve();
            }
        });
    });
};

const logAction = ({ userId, username, action, details, ipAddress }) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO audit_logs (userId, username, action, details, ipAddress) VALUES (?, ?, ?, ?, ?)`,
            [userId, username, action, details, ipAddress],
            (err) => {
                if (err) {
                    console.error('记录操作日志失败:', err);
                    reject(err);
                } else {
                    console.log(`记录操作: ${username} - ${action}`);
                    resolve();
                }
            }
        );
    });
};

const findAllAuditLogs = () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM audit_logs ORDER BY timestamp DESC`, [], (err, rows) => {
            if (err) {
                console.error('查询操作日志失败:', err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

module.exports = { createAuditLogTable, logAction, findAllAuditLogs };