const db = require('../config/db')();

// 修复用户权限的脚本
const fixUserPermissions = () => {
    console.log('开始修复用户权限...');
    
    // 获取所有用户
    const sql = 'SELECT id, role, permissions FROM users';
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('获取用户列表失败:', err.message);
            return;
        }
        
        rows.forEach(user => {
            let currentPermissions = [];
            try {
                currentPermissions = JSON.parse(user.permissions || '[]');
            } catch (e) {
                currentPermissions = [];
            }
            
            // 根据角色确定默认权限
            let defaultPermissions = [];
            switch (user.role) {
                case '管理员':
                    defaultPermissions = ['overview', 'upload', 'data', 'users', 'settings'];
                    break;
                case '审核员':
                    defaultPermissions = ['overview', 'upload', 'data'];
                    break;
                case '采集员':
                    defaultPermissions = ['overview', 'upload'];
                    break;
                default:
                    defaultPermissions = ['overview'];
            }
            
            // 合并现有权限和默认权限，去重
            const mergedPermissions = [...new Set([...currentPermissions, ...defaultPermissions])];
            
            // 更新用户权限
            const updateSql = 'UPDATE users SET permissions = ? WHERE id = ?';
            db.run(updateSql, [JSON.stringify(mergedPermissions), user.id], function(err) {
                if (err) {
                    console.error(`更新用户 ${user.id} 权限失败:`, err.message);
                } else {
                    console.log(`✅ 用户 ${user.id} (${user.role}) 权限已更新:`, mergedPermissions);
                }
            });
        });
        
        console.log('用户权限修复完成');
    });
};

// 如果直接运行此脚本
if (require.main === module) {
    fixUserPermissions();
    
    // 5秒后退出
    setTimeout(() => {
        process.exit(0);
    }, 5000);
}

module.exports = { fixUserPermissions };