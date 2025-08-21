const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 加载配置
const config = require('./environment');

// 根据配置设置数据库路径
const dbPath = path.resolve(config.DB_PATH);

// 确保数据库目录存在
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const connectDB = () => {
  try {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`SQLite 连接错误: ${err.message}`);
        process.exit(1);
      }
      console.log('SQLite 数据库连接成功');
    });

    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');

    return db;
  } catch (error) {
    console.error(`SQLite 连接错误: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;