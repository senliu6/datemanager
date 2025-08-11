# 数据管理平台 - 一键上传功能部署指南

## 概述

本指南将帮助你部署一个完整的一键上传系统，允许局域网内的多个用户通过简单的脚本将文件夹上传到数据管理平台。

## 系统架构

```
局域网用户 → 上传脚本 → SSH/Rsync → 服务器 → 数据管理平台
```

## 部署步骤

### 第一步：服务器端配置

#### 1.1 创建专用上传用户

在服务器上以root权限运行：

```bash
# 给脚本执行权限
chmod +x setup_upload_user.sh

# 运行配置脚本
sudo ./setup_upload_user.sh
```

这个脚本会：
- 创建专用的 `upload_user` 用户
- 设置上传目录权限
- 配置SSH服务
- 生成临时密码
- 创建管理脚本

#### 1.2 配置防火墙（如果需要）

```bash
# Ubuntu/Debian
sudo ufw allow 22/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --reload
```

#### 1.3 验证配置

```bash
# 检查用户是否创建成功
id upload_user

# 检查上传目录
ls -la /app/Uploads

# 查看用户信息
cat /root/upload_user_info.txt
```

### 第二步：准备上传脚本

#### 2.1 修改脚本配置

根据你的实际服务器信息，修改脚本中的配置：

**Linux/macOS脚本 (simple_auto_upload.sh):**
```bash
SERVER_HOST="10.30.10.9"      # 改为你的服务器IP
SERVER_PORT="22"               # SSH端口
SERVER_USER="upload_user"      # 上传用户名
REMOTE_BASE_PATH="/app/Uploads" # 远程基础路径
```

**Windows脚本 (auto_upload.bat):**
```batch
set SERVER_HOST=10.30.10.9
set SERVER_PORT=22
set SERVER_USER=upload_user
set REMOTE_BASE_PATH=/app/Uploads
```

#### 2.2 测试脚本

在服务器上测试脚本是否正常工作：

```bash
# 创建测试目录
mkdir test_upload
cd test_upload

# 创建一些测试文件
echo "test file 1" > file1.txt
echo "test file 2" > file2.txt

# 复制上传脚本
cp ../simple_auto_upload.sh .

# 运行测试
./simple_auto_upload.sh
```

### 第三步：分发给用户

#### 3.1 创建用户包

为每个操作系统创建一个用户包：

**Linux/macOS用户包:**
```
upload_package_linux/
├── simple_auto_upload.sh
├── README.txt
└── 使用说明.txt
```

**Windows用户包:**
```
upload_package_windows/
├── auto_upload.bat
├── README.txt
└── 使用说明.txt
```

#### 3.2 创建使用说明

创建 `README.txt` 文件：

```
数据管理平台 - 一键上传工具使用说明

1. 将此脚本复制到要上传的文件夹中
2. 双击运行脚本（Linux/macOS需要在终端中运行）
3. 按照提示确认上传
4. 等待上传完成

注意事项：
- 首次使用需要配置SSH密钥
- 确保网络连接正常
- 大文件上传需要较长时间
- 上传完成后可在Web界面查看文件

如有问题请联系管理员。
```

### 第四步：用户首次配置

#### 4.1 Linux/macOS用户配置

用户首次使用时需要配置SSH密钥：

```bash
# 1. 给脚本执行权限
chmod +x simple_auto_upload.sh

# 2. 首次运行（会提示配置SSH密钥）
./simple_auto_upload.sh

# 3. 如果自动配置失败，手动配置：
ssh-keygen -t rsa -b 4096 -C "user@hostname"
ssh-copy-id -p 22 upload_user@10.30.10.9
```

#### 4.2 Windows用户配置

Windows用户需要先安装必要工具：

1. **安装Git for Windows（推荐）**
   - 下载：https://git-scm.com/download/win
   - 安装时选择"Use Git and optional Unix tools from the Command Prompt"

2. **或者安装WSL**
   - 在PowerShell中运行：`wsl --install`

3. **配置SSH密钥**
   ```bash
   # 在Git Bash中运行
   ssh-keygen -t rsa -b 4096 -C "user@hostname"
   ssh-copy-id -p 22 upload_user@10.30.10.9
   ```

### 第五步：管理和监控

#### 5.1 查看上传统计

```bash
# 运行统计脚本
/usr/local/bin/upload_stats.sh
```

#### 5.2 添加用户公钥

```bash
# 添加新用户的公钥
/usr/local/bin/add_upload_key.sh /path/to/user_public_key.pub

# 或直接添加公钥内容
/usr/local/bin/add_upload_key.sh "ssh-rsa AAAAB3NzaC1yc2E..."
```

#### 5.3 清理旧文件

```bash
# 清理30天前的上传文件
find /app/Uploads -type f -mtime +30 -delete

# 清理空目录
find /app/Uploads -type d -empty -delete
```

## 故障排除

### 常见问题

#### 1. 连接被拒绝
```
❌ 无法连接到服务器
```

**解决方案：**
- 检查服务器IP和端口
- 确认SSH服务正在运行：`sudo systemctl status sshd`
- 检查防火墙设置
- 验证网络连通性：`ping 10.30.10.9`

#### 2. 权限被拒绝
```
Permission denied (publickey,password)
```

**解决方案：**
- 重新配置SSH密钥
- 检查用户是否存在：`id upload_user`
- 验证公钥是否正确添加

#### 3. 磁盘空间不足
```
No space left on device
```

**解决方案：**
- 清理旧文件：`df -h` 查看磁盘使用情况
- 扩展磁盘空间
- 设置自动清理策略

#### 4. 上传中断
```
rsync: connection unexpectedly closed
```

**解决方案：**
- 重新运行脚本（rsync会自动续传）
- 检查网络稳定性
- 分批上传大文件

### 日志查看

#### 服务器端日志
```bash
# SSH连接日志
tail -f /var/log/auth.log

# 系统日志
tail -f /var/log/syslog
```

#### 客户端日志
```bash
# 查看上传日志
cat upload.log
```

## 安全建议

### 1. 网络安全
- 使用VPN或内网环境
- 限制SSH访问IP范围
- 定期更新系统和软件

### 2. 用户权限
- 使用专用上传用户，限制权限
- 定期轮换SSH密钥
- 监控异常登录

### 3. 数据安全
- 定期备份上传的数据
- 设置文件大小和数量限制
- 扫描上传文件的安全性

## 性能优化

### 1. 网络优化
```bash
# 在脚本中添加带宽限制
rsync -avz --progress --bwlimit=10000 ...
```

### 2. 并发控制
- 限制同时上传的用户数量
- 使用队列系统管理上传任务

### 3. 存储优化
- 使用SSD存储提高I/O性能
- 定期整理和压缩文件
- 实现分层存储策略

## 扩展功能

### 1. Web界面集成
- 在数据管理平台中显示上传进度
- 提供文件管理界面
- 实现用户权限管理

### 2. 通知系统
- 上传完成邮件通知
- 错误告警机制
- 统计报告生成

### 3. 自动化处理
- 文件格式转换
- 病毒扫描
- 元数据提取

---

## 联系支持

如果在部署过程中遇到问题，请：

1. 查看相关日志文件
2. 检查网络连接和权限
3. 参考故障排除部分
4. 联系系统管理员

**部署完成后，用户只需要将脚本放在要上传的文件夹中，双击运行即可实现一键上传！**