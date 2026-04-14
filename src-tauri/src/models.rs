use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 文件元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub id: String,
    pub path: String,
    pub title: String,
    pub content_preview: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub word_count: i64,
    pub char_count: i64,
}

/// 标签
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub count: i64,
}

/// 链接
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub id: String,
    pub source_file_id: String,
    pub source_file_path: String,
    pub target_title: String,
    pub position: i64,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub file: FileMetadata,
    pub score: f64,
    pub matched_tags: Vec<String>,
    pub matched_content: Vec<String>,
}

/// 知识库状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBaseStatus {
    pub is_open: bool,
    pub path: Option<String>,
    pub file_count: i64,
    pub link_count: i64,
    pub tag_count: i64,
    pub indexing: bool,
}

/// 知识库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBaseConfig {
    pub path: String,
    pub index_interval: u64,
    pub auto_index: bool,
    pub ignored_dirs: Vec<String>,
    pub ignored_files: Vec<String>,
}

impl Default for KnowledgeBaseConfig {
    fn default() -> Self {
        Self {
            path: String::new(),
            index_interval: 30,
            auto_index: true,
            ignored_dirs: vec![
                ".git".to_string(),
                "node_modules".to_string(),
                ".obsidian".to_string(),
                ".vscode".to_string(),
                "__pycache__".to_string(),
                ".venv".to_string(),
                "venv".to_string(),
                "dist".to_string(),
                "build".to_string(),
            ],
            ignored_files: vec![
                ".DS_Store".to_string(),
                "Thumbs.db".to_string(),
            ],
        }
    }
}

/// 文件内容（用于读取文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub metadata: FileMetadata,
}
