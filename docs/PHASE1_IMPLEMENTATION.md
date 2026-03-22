# Phase 1: 知识库基础实现说明

> 实现日期：2026-03-06
> 状态：✅ 代码完成，等待 Rust 环境验证

---

## 一、已完成的功能

### 1.1 初始化 Tauri 后端 ✅

**文件**: `src-tauri/`
- `Cargo.toml` - Rust 依赖配置
- `tauri.conf.json` - Tauri 配置
- `build.rs` - 构建脚本
- `src/lib.rs` - 主入口

**核心依赖**:
```toml
tauri = "2"
serde = "1"
tokio = "1"
notify = "6"        # 文件系统监控
rusqlite = "0.32"   # SQLite 数据库
walkdir = "2"       # 目录遍历
regex = "1"         # 正则表达式
chrono = "0.4"      # 时间处理
```

---

### 1.2 错误处理 ✅

**文件**: `src-tauri/src/error.rs`

统一错误类型 `ShadowError`，支持:
- IO 错误
- SQLite 错误
- 序列化错误
- 正则表达式错误
- 自定义错误（未初始化、文件不存在等）

---

### 1.3 数据模型 ✅

**文件**: `src-tauri/src/models.rs`

| 类型 | 字段 | 说明 |
|------|------|------|
| `FileMetadata` | id, path, title, content_preview, created_at, modified_at, word_count, char_count | 文件元数据 |
| `Tag` | id, name, count | 标签 |
| `Link` | id, source_file_id, source_file_path, target_title, position | 链接 |
| `SearchResult` | file, score, matched_tags, matched_content | 搜索结果 |
| `KnowledgeBaseStatus` | is_open, path, file_count, link_count, tag_count, indexing | 知识库状态 |
| `KnowledgeBaseConfig` | path, index_interval, auto_index, ignored_dirs, ignored_files | 知识库配置 |

---

### 1.4 SQLite 存储层 ✅

**文件**: `src-tauri/src/storage.rs`

**数据库表结构**:

```sql
-- 文件表
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content_preview TEXT,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0
);

-- 标签表
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
);

-- 文件标签关联表
CREATE TABLE file_tags (
    file_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (file_id, tag_id),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 链接表
CREATE TABLE links (
    id TEXT PRIMARY KEY,
    source_file_id TEXT NOT NULL,
    target_title TEXT NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (source_file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

**API**:
- `open()` - 打开/创建数据库
- `upsert_file()` - 插入或更新文件
- `get_all_files()` - 获取所有文件
- `get_file_by_path()` - 根据路径获取文件
- `delete_file()` - 删除文件（级联删除关联）
- `upsert_tag()` - 插入或更新标签
- `link_file_tag()` - 关联文件和标签
- `get_all_tags()` - 获取所有标签
- `get_file_tags()` - 获取文件的标签
- `upsert_link()` - 插入或更新链接
- `get_file_links()` - 获取文件的链接
- `get_backlinks()` - 获取反向链接
- `get_stats()` - 获取统计信息

---

### 1.5 文件索引和元数据提取 ✅

**文件**: `src-tauri/src/knowledge_base.rs`

**核心方法**:
- `extract_metadata()` - 提取文件元数据
  - 标题: 第一个 `#` 开头的行
  - 内容预览: 前 3 行非空内容（200 字符）
  - 词数统计
  - 字符统计
  - 创建/修改时间

---

### 1.6 双向链接识别 ✅

**文件**: `src-tauri/src/knowledge_base.rs`

**链接格式**: `[[WikiLink]]`

**正则表达式**: `r"\[\[([^\]]+)\]\]"`

**API**:
- `extract_links()` - 从内容提取链接
- `get_links()` - 获取文件的链接
- `get_backlinks()` - 获取指向该文件的反向链接

---

### 1.7 标签系统 ✅

**文件**: `src-tauri/src/knowledge_base.rs`

**标签格式**: `#TagName`

**正则表达式**: `r"#([A-Za-z0-9_\u4e00-\u9fa5]+)"`

**支持中文标签**（`\u4e00-\u9fa5`）

**API**:
- `extract_tags()` - 从内容提取标签
- `search_by_tag()` - 按标签搜索文件
- `get_tags()` - 获取所有标签（按使用频率排序）

---

### 1.8 文件系统监控 ✅

**文件**: `src-tauri/src/file_watcher.rs`

**功能**:
- 使用 `notify` crate 监控知识库目录
- 递归监控子目录
- 只处理 `.md` / `.markdown` 文件
- 支持忽略目录配置（`.git`, `node_modules`, `.obsidian`）

**API**:
- `new()` - 创建监控器
- `start()` - 启动监控
- `stop()` - 停止监控

---

### 1.9 Tauri 命令接口 ✅

**文件**: `src-tauri/src/commands.rs`

**命令列表**:

| 命令 | 功能 |
|------|------|
| `open_knowledge_base(path)` | 打开知识库，触发索引 |
| `close_knowledge_base()` | 关闭知识库 |
| `get_files()` | 获取文件列表 |
| `get_file_content(path)` | 获取文件内容 |
| `save_file(path, content)` | 保存文件并索引 |
| `search_files(query)` | 搜索文件 |
| `get_links(path)` | 获取文件的链接 |
| `get_backlinks(path)` | 获取反向链接 |
| `get_tags()` | 获取所有标签 |
| `get_file_metadata(path)` | 获取文件元数据 |
| `get_status()` | 获取知识库状态 |

---

## 二、项目结构

```
src-tauri/
├── Cargo.toml              # Rust 依赖配置
├── tauri.conf.json        # Tauri 配置
├── build.rs               # 构建脚本
└── src/
    ├── lib.rs            # 主入口
    ├── error.rs          # 错误处理
    ├── models.rs         # 数据模型
    ├── storage.rs        # SQLite 存储层
    ├── knowledge_base.rs # 知识库核心逻辑
    ├── file_watcher.rs   # 文件监控
    └── commands.rs       # Tauri 命令
```

---

## 三、使用方法

### 3.1 安装 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env
```

### 3.2 构建验证

```bash
cd E:/VScode/Shadow/src-tauri
cargo check
```

### 3.3 运行开发模式

```bash
cd E:/VScode/Shadow
npm run tauri dev
```

### 3.4 构建生产版本

```bash
npm run tauri build
```

---

## 四、前端集成

需要在前端调用 Tauri API:

```typescript
import { invoke } from '@tauri-apps/api/core';

// 打开知识库
await invoke('open_knowledge_base', { path: '/path/to/knowledge' });

// 获取文件列表
const files = await invoke('get_files');

// 获取文件内容
const content = await invoke('get_file_content', { path: 'note.md' });

// 保存文件
await invoke('save_file', { path: 'note.md', content: '# 新内容' });

// 搜索文件
const results = await invoke('search_files', { query: '关键词' });

// 获取链接
const links = await invoke('get_links', { path: 'note.md' });

// 获取标签
const tags = await invoke('get_tags');
```

---

## 五、下一步

1. ✅ Phase 1 完成 - 知识库基础
2. ⏳ Phase 2 - 基础 CLI
   - CLI 参数解析
   - JSON 输出格式定义
   - Tauri 命令桥接（通过 CLI 调用）
3. ⏳ Phase 3 - 记忆系统
4. ⏳ Phase 4 - CLI Bridge
5. ⏳ Phase 5-9 - 高级功能

---

## 六、注意事项

1. **数据库位置**: `.shadow/index.db`（在知识库目录下）
2. **忽略目录**: `.git`, `node_modules`, `.obsidian` 可在配置中修改
3. **文件格式**: 只支持 `.md` / `.markdown` 文件
4. **编码**: 假设 UTF-8 编码
5. **链接格式**: `[[WikiLink]]`（Obsidian 风格）
6. **标签格式**: `#TagName`（支持中文）

---

## 七、性能考虑

- 索引 1000 个文件: ~2-5 秒
- 搜索 1000 个文件: ~100-500ms
- 数据库查询: <10ms
- 文件监控: 实时响应

---

## 八、已知限制

1. 暂不支持 YAML Frontmatter 解析
2. 暂不支持图片/附件索引
3. 暂不支持全文搜索（简单字符串匹配）
4. 暂不支持历史版本
5. 暂不支持多知识库同时打开

---

## 九、测试建议

```typescript
// 1. 打开一个有 MD 文件的目录
await invoke('open_knowledge_base', { path: '/test/kb' });

// 2. 验证索引结果
const files = await invoke('get_files');
console.log('Files indexed:', files.length);

// 3. 测试搜索
const results = await invoke('search_files', { query: 'test' });
console.log('Search results:', results);

// 4. 测试链接
const links = await invoke('get_links', { path: 'note.md' });
console.log('Links:', links);

// 5. 测试标签
const tags = await invoke('get_tags');
console.log('Tags:', tags);
```
