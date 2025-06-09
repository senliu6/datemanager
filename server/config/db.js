const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/datemanager.db');

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