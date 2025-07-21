项目架构分析
🏗️ 整体架构
这是一个前后端分离的全栈Web应用，采用现代化的技术栈：

前端: React + Vite + Ant Design
后端: Node.js + Express + SQLite
数据处理: Python脚本处理LeRobot数据集
3D可视化: Three.js + React Three Fiber
📁 项目结构
datemanager/
├── src/                    # 前端React应用
├── server/                 # 后端Node.js服务
├── Uploads/               # 文件上传存储目录
└── 配置文件
前端架构 (React + Vite)
🎨 技术栈
框架: React 18 + React Router DOM
UI库: Ant Design 5.x
构建工具: Vite
3D渲染: Three.js + @react-three/fiber + @react-three/drei
图表: Chart.js + React-Chartjs-2 + Plotly.js
HTTP客户端: Axios
其他: Moment.js, React Player, JSZip
🧩 页面结构
src/
├── pages/
│   ├── Login.jsx          # 登录页面
│   ├── Dashboard.jsx      # 概览仪表板
│   ├── Upload.jsx         # 文件上传
│   ├── DataList.jsx       # 数据列表
│   ├── FileDetail.jsx     # 文件详情
│   ├── UserManage.jsx     # 用户管理
│   └── Settings.jsx       # 系统设置
├── components/
│   └── LeRobotEpisodeCard.jsx  # LeRobot数据可视化组件
└── util/
└── axios.js           # HTTP请求配置
🔐 权限系统
基于JWT的身份认证
角色权限控制（管理员、普通用户）
路由级权限保护
后端架构 (Node.js + Express)
⚙️ 技术栈
框架: Express.js
数据库: SQLite (通过原生sqlite3)
认证: JWT + bcrypt
文件处理: Multer
数据处理: Python脚本集成
其他: CORS, Archiver, Rimraf
🗂️ 模块结构
server/
├── routes/               # 路由模块
│   ├── auth.js          # 认证相关
│   ├── files.js         # 文件管理
│   ├── folders.js       # 文件夹管理
│   ├── users.js         # 用户管理
│   ├── lerobot.js       # LeRobot数据处理
│   ├── stats.js         # 统计数据
│   └── audit.js         # 操作日志
├── models/              # 数据模型
│   ├── user.js          # 用户模型
│   ├── file.js          # 文件模型
│   └── auditLog.js      # 审计日志模型
├── middleware/          # 中间件
│   └── auth.js          # 认证中间件
├── services/            # 服务层
│   └── cacheService.js  # 缓存服务
├── config/              # 配置
│   ├── db.js            # 数据库配置
│   └── cors.js          # CORS配置
└── parse_lerobot.py     # Python数据处理脚本
🛡️ 安全特性
JWT令牌认证
密码bcrypt加密
权限中间件保护
IP地址记录和格式化
操作审计日志
核心功能实现
📊 1. 数据管理系统
文件上传: 支持多种格式（视频、数据文件）
文件组织: 按文件夹结构管理
批量操作: 批量下载、删除
存储统计: 文件大小、数量统计
🤖 2. LeRobot数据集处理
这是项目的核心特色功能：

数据解析
Python集成: 使用pandas、numpy处理Parquet文件
多质量级别: low/medium/high/full四种质量预设
智能采样: 根据数据量自动调整采样率
缓存机制: 解析结果缓存，提升性能
3D点云可视化
实时渲染: Three.js渲染点云数据
多相机视角: cam_top、cam_right_wrist等
交互控制: 缩放、旋转、重置相机
颜色映射: 基于Z轴高度的颜色编码
数据同步播放
视频播放: 支持多格式视频同步播放
数据联动: 视频时间轴与点云、电机数据同步
图表展示: 电机状态实时图表
📈 3. 数据可视化
仪表板: 系统概览、统计图表
实时图表: Chart.js绘制电机数据曲线
3D场景: WebGL渲染的3D点云场景
响应式设计: 适配不同屏幕尺寸
👥 4. 用户管理
角色系统: 管理员、普通用户
权限控制: 细粒度权限管理
操作审计: 完整的操作日志记录
⚡ 5. 性能优化
缓存策略: 多级缓存（内存、文件）
数据压缩: gzip压缩缓存数据
懒加载: 按需加载大数据集
并行处理: Python多进程处理
数据流架构
前端请求 → Express路由 → 权限验证 → 业务逻辑 → 数据库/Python脚本 → 缓存 → 响应
LeRobot数据处理流程
上传: 用户上传Parquet/视频文件
解析: Python脚本解析数据，提取点云、电机数据
缓存: 解析结果按质量级别缓存
可视化: 前端3D渲染点云，同步播放视频
交互: 实时数据联动和用户交互
技术亮点
🚀 创新特性
机器人数据可视化: 专门针对LeRobot数据集的可视化方案
多模态数据同步: 视频、点云、传感器数据时间同步
智能数据处理: 自适应质量和采样策略
WebGL 3D渲染: 高性能点云实时渲染
🔧 工程实践
前后端分离: 清晰的架构边界
模块化设计: 高内聚低耦合
错误处理: 完善的错误边界和异常处理
性能监控: 操作日志和性能统计
这个项目是一个专业的机器人数据管理和可视化平台，特别适用于处理和分析LeRobot数据集，具有很强的实用性和扩展性。