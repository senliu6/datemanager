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

// 格式化IP地址，移除IPv6映射前缀
const formatIpAddress = (ip) => {
    if (ip && ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    return ip;
};

const logAction = ({ userId, username, action, details, ipAddress }) => {
    // 格式化IP地址
    const formattedIp = formatIpAddress(ipAddress);
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO audit_logs (userId, username, action, details, ipAddress) VALUES (?, ?, ?, ?, ?)`,
            [userId, username, action, details, formattedIp],
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

const deleteAllAuditLogs = () => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM audit_logs`, [], (err) => {
            if (err) {
                console.error('删除操作日志失败:', err);
                reject(err);
            } else {
                console.log('所有操作日志已删除');
                resolve();
            }
        });
    });
};

module.exports = { createAuditLogTable, logAction, findAllAuditLogs, deleteAllAuditLogs };