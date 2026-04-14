# ShadowFlow Tauri 桌面应用

## 概述

ShadowFlow 是一个基于 Tauri 构建的轻量级、安全、高性能的桌面应用，类似于 LangGraph 的多智能体编排框架。

## 功能特性

### 1. 知识库管理
- 📁 支持 Markdown 文件索引
- 🔍 全文搜索（标题、路径、内容、标签）
- 🏷️ 自动提取标签和 Wiki 链接
- 📊 文件元数据统计

### 2. 文件系统监控
- 🔄 实时监控文件变化
- 🚫 智能忽略构建目录和系统文件
- ⚡ 自动更新索引

### 3. 本地存储 (SQLite)
- 💾 高效的 SQLite 数据库存储
- 🔄 支持事务和 WAL 模式
- 📈 优化的索引查询

### 4. HTTP API 集成
- 🌐 支持 RESTful API 调用
- 🔐 Token 认证
- 🔄 自动重试机制
- 📝 请求/响应日志

### 5. 任务执行器
- 🎯 异步任务队列
- ⚙️ 并发控制
- 📊 任务监控和指标
- 🔁 任务重试机制

## 技术架构

```
src/
├── commands.rs      # Tauri 命令接口
├── config.rs        # 配置管理
├── error.rs         # 错误处理
├── executor.rs      # 任务执行器
├── file_watcher.rs  # 文件监控
├── http_api.rs      # HTTP API 客户端
├── knowledge_base.rs # 知识库核心
├── lib.rs           # 主入口
├── models.rs         # 数据模型
└── storage.rs       # 存储层
```

## 配置文件

应用使用 `config/shadow.toml` 进行配置：

```toml
[database]
path = "./data/shadow.db"
journal_mode = "WAL"
synchronous = "NORMAL"

[knowledge_base]
ignored_dirs = [".git", "node_modules", ".vscode"]
auto_index = true
index_interval_secs = 30

[http_api]
enabled = true
base_url = "https://api.example.com"
timeout_secs = 30
retry_attempts = 3

[performance]
max_concurrent_indexing = 4
cache_enabled = true
thread_pool_size = 4

[logging]
level = "info"
enable_json_format = true
```

## API 接口

### 知识库操作
- `open_knowledge_base(path)` - 打开知识库
- `close_knowledge_base()` - 关闭知识库
- `get_files()` - 获取文件列表
- `get_file_content(path)` - 获取文件内容
- `save_file(path, content)` - 保存文件
- `search_files(query)` - 搜索文件

### 标签和链接
- `get_tags()` - 获取所有标签
- `get_links(path)` - 获取文件链接
- `get_backlinks(path)` - 获取反向链接
- `get_file_metadata(path)` - 获取文件元数据

### 配置管理
- `get_config()` - 获取当前配置
- `update_config(config)` - 更新配置

### 任务管理
- `add_task(type, payload, priority)` - 添加任务
- `cancel_task(task_id)` - 取消任务
- `get_metrics()` - 获取执行器指标
- `health_check()` - 健康检查

## 开发环境设置

### 安装依赖
```bash
cargo install tauri-cli
npm install -g @tauri-apps/cli
```

### 运行开发服务器
```bash
# 安装前端依赖
npm install

# 运行开发模式
npm run tauri dev
```

### 构建应用
```bash
# 构建前端
npm run build

# 构建桌面应用
npm run tauri build
```

## 测试

运行单元测试：
```bash
cargo test
```

运行集成测试：
```bash
cargo test --test integration
```

## 性能优化

1. **并发索引**：使用异步任务队列进行批量文件索引
2. **缓存机制**：文件内容缓存减少磁盘 I/O
3. **数据库优化**：使用 SQLite WAL 模式和适当索引
4. **内存管理**：使用 Arc<Mutex<>> 和 DashMap 优化并发访问

## 安全考虑

- ✅ 所有文件路径验证
- ✅ SQL 注入防护
- ✅ 配置文件权限验证
- ✅ API 请求超时和重试限制
- ✅ 敏感信息环境变量存储

## 部署

### Windows
```bash
npm run tauri build --target x86_64-pc-windows-msvc
```

### macOS
```bash
npm run tauri build --target x86_64-apple-darwin
npm run tauri build --target aarch64-apple-darwin
```

### Linux
```bash
npm run tauri build --target x86_64-unknown-linux-gnu
```

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 发起 Pull Request

## 许可证

MIT License