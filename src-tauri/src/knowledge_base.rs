use crate::error::ShadowError;
use crate::models::{FileMetadata, SearchResult};
use crate::storage::Storage;
use chrono::{DateTime, Utc};
use regex::Regex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::fs;
use uuid::Uuid;
use walkdir::WalkDir;

/// 知识库核心逻辑
pub struct KnowledgeBase {
    storage: Option<Storage>,
    base_path: Option<PathBuf>,
    config: KnowledgeBaseConfig,
    link_regex: Regex,
    tag_regex: Regex,
}

#[derive(Debug, Clone)]
pub struct KnowledgeBaseConfig {
    pub ignored_dirs: Vec<String>,
    pub ignored_files: Vec<String>,
}

impl Default for KnowledgeBaseConfig {
    fn default() -> Self {
        Self {
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

impl KnowledgeBase {
    /// 创建新的知识库实例
    pub fn new() -> Self {
        Self {
            storage: None,
            base_path: None,
            config: KnowledgeBaseConfig::default(),
            link_regex: Regex::new(r"\[\[([^\]]+)\]\]").unwrap(),
            tag_regex: Regex::new(r"#([A-Za-z0-9_\u4e00-\u9fa5]+)").unwrap(),
        }
    }

    /// 设置配置
    pub fn with_config(mut self, config: KnowledgeBaseConfig) -> Self {
        self.config = config;
        self
    }

    /// 打开知识库
    pub fn open(&mut self, path: &Path) -> Result<(), ShadowError> {
        if !path.exists() {
            return Err(ShadowError::InvalidPath(format!("路径不存在: {}", path.display())));
        }

        let db_path = path.join(".shadow").join("index.db");

        // 确保 .shadow 目录存在
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }

        self.storage = Some(Storage::open(&db_path)?);
        self.base_path = Some(path.to_path_buf());

        Ok(())
    }

    /// 关闭知识库
    pub fn close(&mut self) {
        self.storage = None;
        self.base_path = None;
    }

    /// 获取基础路径
    pub fn base_path(&self) -> Option<&Path> {
        self.base_path.as_deref()
    }

    /// 检查是否已打开
    pub fn is_open(&self) -> bool {
        self.storage.is_some() && self.base_path.is_some()
    }

    /// 提取文件元数据
    pub fn extract_metadata(&self, file_path: &Path) -> Result<FileMetadata, ShadowError> {
        let content = fs::read_to_string(file_path)?;

        let file_name = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled");

        // 提取标题（第一个 # 开头的行）
        let title = content
            .lines()
            .find(|line| line.trim().starts_with('#'))
            .map(|line| {
                let line = line.trim();
                line.trim_start_matches('#')
                    .trim_start_matches(' ')
                    .trim()
                    .to_string()
            })
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| file_name.to_string());

        // 提取内容预览（前 3 行非空内容，最多 200 字符）
        let content_preview: String = content
            .lines()
            .filter(|line| !line.trim().is_empty() && !line.trim().starts_with('#'))
            .take(3)
            .collect::<Vec<&str>>()
            .join("\n")
            .chars()
            .take(200)
            .collect();

        // 统计词数和字符数
        let char_count = content.chars().count() as i64;
        let word_count = content.split_whitespace().count() as i64;

        // 获取文件时间
        let metadata = fs::metadata(file_path)?;
        let created_at = DateTime::<Utc>::from(metadata.created()?).with_timezone(&Utc);
        let modified_at = DateTime::<Utc>::from(metadata.modified()?).with_timezone(&Utc);

        Ok(FileMetadata {
            id: Uuid::new_v4().to_string(),
            path: file_path.to_string_lossy().to_string(),
            title,
            content_preview,
            created_at,
            modified_at,
            word_count,
            char_count,
        })
    }

    /// 从内容提取链接 [[WikiLink]]
    pub fn extract_links(&self, content: &str) -> Vec<String> {
        self.link_regex
            .captures_iter(content)
            .map(|cap| cap[1].to_string())
            .collect()
    }

    /// 从内容提取标签 #TagName
    pub fn extract_tags(&self, content: &str) -> Vec<String> {
        let tags: Vec<String> = self.tag_regex
            .captures_iter(content)
            .map(|cap| cap[1].to_string())
            .collect();

        // 去重
        let mut unique_tags = std::collections::HashSet::new();
        tags.into_iter().filter(|t| unique_tags.insert(t.clone())).collect()
    }

    /// 索引单个文件
    pub fn index_file(&self, file_path: &Path) -> Result<(), ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;

        // 检查文件扩展名
        let ext = file_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        if ext != "md" && ext != "markdown" {
            return Ok(());
        }

        // 提取元数据
        let metadata = self.extract_metadata(file_path)?;

        // 存储文件元数据
        storage.upsert_file(&metadata)?;

        // 读取内容并提取标签和链接
        let content = fs::read_to_string(file_path)?;

        // 处理标签
        let tags = self.extract_tags(&content);
        self.update_tags(&metadata.id, &tags)?;

        // 处理链接
        let links = self.extract_links(&content);
        self.update_links(&metadata.id, &metadata.path, &links)?;

        Ok(())
    }

    /// 更新文件的标签
    fn update_tags(&self, file_id: &str, tags: &[String]) -> Result<(), ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;

        // 删除旧的标签关联
        storage.delete_file_tags(file_id)?;

        // 创建标签并关联
        for tag_name in tags {
            let tag_id = Uuid::new_v4().to_string();

            // 检查标签是否已存在
            let existing_tags = storage.get_all_tags()?;
            let existing_tag = existing_tags.iter().find(|t| t.name == *tag_name);

            if let Some(tag) = existing_tag {
                storage.link_file_tag(file_id, &tag.id)?;
            } else {
                use crate::models::Tag;
                storage.upsert_tag(&Tag {
                    id: tag_id.clone(),
                    name: tag_name.clone(),
                    count: 1,
                })?;
                storage.link_file_tag(file_id, &tag_id)?;
            }
        }

        // 更新标签计数
        let all_tags = storage.get_all_tags()?;
        for tag in &all_tags {
            let tag_id = &tag.id;
            let count = storage.get_file_tags(tag_id)?.len() as i64;
            storage.upsert_tag(&crate::models::Tag {
                id: tag_id.clone(),
                name: tag.name.clone(),
                count,
            })?;
        }

        Ok(())
    }

    /// 更新文件的链接
    fn update_links(&self, file_id: &str, file_path: &str, links: &[String]) -> Result<(), ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;

        // 删除旧的链接
        storage.delete_file_links(file_id)?;

        // 创建新链接
        for (index, target_title) in links.iter().enumerate() {
            use crate::models::Link;
            storage.upsert_link(&Link {
                id: Uuid::new_v4().to_string(),
                source_file_id: file_id.to_string(),
                source_file_path: file_path.to_string(),
                target_title: target_title.clone(),
                position: index as i64,
            })?;
        }

        Ok(())
    }

    /// 索引整个知识库目录
    pub fn index_all(&self) -> Result<usize, ShadowError> {
        let base_path = self.base_path.as_ref().ok_or(ShadowError::NotInitialized)?;

        let mut count = 0;

        for entry in WalkDir::new(base_path)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                let path = e.path();
                let file_name = path.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");

                // 检查是否在忽略目录中
                for component in path.components() {
                    if let std::path::Component::Normal(name) = component {
                        if let Some(name_str) = name.to_str() {
                            if self.config.ignored_dirs.contains(&name_str.to_string()) {
                                return false;
                            }
                        }
                    }
                }

                // 检查是否在忽略文件中
                if path.is_file() && self.config.ignored_files.contains(&file_name.to_string()) {
                    return false;
                }

                true
            })
            .filter_map(|e| e.ok())
        {
            if entry.path().is_file() {
                if let Err(e) = self.index_file(entry.path()) {
                    log::warn!("索引文件失败 {:?}: {}", entry.path(), e);
                } else {
                    count += 1;
                }
            }
        }

        Ok(count)
    }

    /// 获取文件列表
    pub fn get_files(&self) -> Result<Vec<FileMetadata>, ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;
        storage.get_all_files()
    }

    /// 根据路径获取文件元数据
    pub fn get_file_metadata(&self, path: &str) -> Result<Option<FileMetadata>, ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;
        storage.get_file_by_path(path)
    }

    /// 获取文件的链接
    pub fn get_links(&self, path: &str) -> Result<Vec<crate::models::Link>, ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;

        if let Some(file) = storage.get_file_by_path(path)? {
            storage.get_file_links(&file.id)
        } else {
            Ok(vec![])
        }
    }

    /// 获取反向链接
    pub fn get_backlinks(&self, path: &str) -> Result<Vec<crate::models::Link>, ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;
        storage.get_backlinks(path)
    }

    /// 获取所有标签
    pub fn get_tags(&self) -> Result<Vec<crate::models::Tag>, ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;
        storage.get_all_tags()
    }

    /// 搜索文件
    pub fn search_files(&self, query: &str) -> Result<Vec<SearchResult>, ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;
        let files = storage.get_all_files()?;

        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        for file in &files {
            let mut score = 0.0;
            let mut matched_tags = Vec::new();
            let mut matched_content = Vec::new();

            // 标题匹配（权重最高）
            if file.title.to_lowercase().contains(&query_lower) {
                score += 2.0;
            }

            // 路径匹配
            if file.path.to_lowercase().contains(&query_lower) {
                score += 1.5;
            }

            // 内容预览匹配
            if file.content_preview.to_lowercase().contains(&query_lower) {
                score += 1.0;
                matched_content.push(file.content_preview.clone());
            }

            // 标签匹配
            if let Ok(tags) = storage.get_file_tags(&file.id) {
                for tag in &tags {
                    if tag.name.to_lowercase().contains(&query_lower) {
                        score += 0.5;
                        matched_tags.push(tag.name.clone());
                    }
                }
            }

            // 只有得分大于 0 才添加结果
            if score > 0.0 {
                results.push(SearchResult {
                    file: file.clone(),
                    score,
                    matched_tags,
                    matched_content,
                });
            }
        }

        // 按分数排序
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        Ok(results)
    }

    /// 删除文件索引
    pub fn delete_file_index(&self, path: &str) -> Result<bool, ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;
        storage.delete_file(path)
    }

    /// 获取统计信息
    pub fn get_stats(&self) -> Result<(i64, i64, i64), ShadowError> {
        let storage = self.storage.as_ref().ok_or(ShadowError::NotInitialized)?;
        storage.get_stats()
    }
}
