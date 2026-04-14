use crate::error::ShadowError;
use serde::{Deserialize, Serialize};
use std::env;
use std::path::Path;
use tokio::fs;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub database: DatabaseConfig,
    pub knowledge_base: KnowledgeBaseConfig,
    pub http_api: HttpApiConfig,
    pub performance: PerformanceConfig,
    pub logging: LoggingConfig,
}

/// 数据库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub path: String,
    pub max_connections: Option<u32>,
    pub journal_mode: String,
    pub synchronous: String,
}

/// HTTP API 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpApiConfig {
    pub enabled: bool,
    pub base_url: String,
    pub auth_token: Option<String>,
    pub timeout_secs: u64,
    pub retry_attempts: u32,
    pub retry_delay_ms: u64,
}

/// 知识库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBaseConfig {
    pub ignored_dirs: Vec<String>,
    pub ignored_files: Vec<String>,
    pub index_extensions: Vec<String>,
    pub auto_index: bool,
    pub index_interval_secs: u64,
    pub max_file_size_mb: u64,
}

/// 性能配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    pub max_concurrent_indexing: usize,
    pub index_batch_size: usize,
    pub cache_enabled: bool,
    pub cache_size_mb: u64,
    pub enable_thread_pool: bool,
    pub thread_pool_size: usize,
}

/// 日志配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub file_path: Option<String>,
    pub max_file_size_mb: u64,
    pub max_files: usize,
    pub enable_json_format: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            database: DatabaseConfig {
                path: "./data/shadow.db".to_string(),
                max_connections: Some(10),
                journal_mode: "WAL".to_string(),
                synchronous: "NORMAL".to_string(),
            },
            knowledge_base: KnowledgeBaseConfig {
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
                    "target".to_string(),
                    ".next".to_string(),
                    ".cache".to_string(),
                ],
                ignored_files: vec![
                    ".DS_Store".to_string(),
                    "Thumbs.db".to_string(),
                    "*.log".to_string(),
                    "*.tmp".to_string(),
                ],
                index_extensions: vec!["md".to_string(), "markdown".to_string()],
                auto_index: true,
                index_interval_secs: 30,
                max_file_size_mb: 10,
            },
            http_api: HttpApiConfig {
                enabled: true,
                base_url: "https://api.example.com".to_string(),
                auth_token: None,
                timeout_secs: 30,
                retry_attempts: 3,
                retry_delay_ms: 1000,
            },
            performance: PerformanceConfig {
                max_concurrent_indexing: 4,
                index_batch_size: 100,
                cache_enabled: true,
                cache_size_mb: 100,
                enable_thread_pool: true,
                thread_pool_size: 4,
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                file_path: Some("./logs/shadow.log".to_string()),
                max_file_size_mb: 10,
                max_files: 5,
                enable_json_format: true,
            },
        }
    }
}

impl AppConfig {
    /// 从环境变量覆盖配置
    pub fn from_env(mut self) -> Result<Self, ShadowError> {
        // 数据库配置
        if let Ok(db_path) = env::var("SHADOW_DB_PATH") {
            self.database.path = db_path;
        }
        if let Ok(max_conn) = env::var("SHADOW_DB_MAX_CONNECTIONS") {
            self.database.max_connections = Some(max_conn.parse()?);
        }

        // 知识库配置
        if let Ok(ignored_dirs) = env::var("SHADOW_IGNORED_DIRS") {
            self.knowledge_base.ignored_dirs = ignored_dirs.split(',').map(|s| s.trim().to_string()).collect();
        }

        // HTTP API 配置
        if let Ok(api_url) = env::var("SHADOW_API_URL") {
            self.http_api.base_url = api_url;
        }
        if let Ok(token) = env::var("SHADOW_API_TOKEN") {
            self.http_api.auth_token = Some(token);
        }

        // 日志配置
        if let Ok(log_level) = env::var("SHADOW_LOG_LEVEL") {
            self.logging.level = log_level;
        }

        Ok(self)
    }

    /// 加载配置文件
    pub async fn load_from_file(path: &Path) -> Result<Self, ShadowError> {
        if !path.exists() {
            // 创建默认配置文件
            let default_config = Self::default();
            default_config.save_to_file(path).await?;
            return Ok(default_config);
        }

        let content = fs::read_to_string(path).await?;
        let config: AppConfig = toml::from_str(&content)?;

        // 从环境变量覆盖配置
        config.from_env()
    }

    /// 保存配置到文件
    pub async fn save_to_file(&self, path: &Path) -> Result<(), ShadowError> {
        // 确保目录存在
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let content = toml::to_string_pretty(self)?;
        fs::write(path, content).await?;

        Ok(())
    }

    /// 验证配置
    pub fn validate(&self) -> Result<(), ShadowError> {
        // 验证数据库配置
        if self.database.path.is_empty() {
            return Err(ShadowError::InvalidConfig("数据库路径不能为空".to_string()));
        }

        // 验证 HTTP API 配置
        if self.http_api.enabled {
            if self.http_api.base_url.is_empty() {
                return Err(ShadowError::InvalidConfig("HTTP API base URL 不能为空".to_string()));
            }
            if self.http_api.timeout_secs == 0 {
                return Err(ShadowError::InvalidConfig("HTTP API 超时时间必须大于 0".to_string()));
            }
        }

        // 验证性能配置
        if self.performance.max_concurrent_indexing == 0 {
            return Err(ShadowError::InvalidConfig("最大并发索引数必须大于 0".to_string()));
        }

        Ok(())
    }

    /// 获取配置路径
    pub fn get_config_path() -> std::path::PathBuf {
        // 优先检查环境变量
        if let Ok(path) = env::var("SHADOW_CONFIG_PATH") {
            return std::path::PathBuf::from(path);
        }

        // 默认路径：当前目录下的 config/shadow.toml
        let mut config_path = std::env::current_dir().unwrap_or_default();
        config_path.push("config");
        config_path.push("shadow.toml");
        config_path
    }

    /// 创建默认配置文件
    pub async fn create_default() -> Result<(), ShadowError> {
        let config_path = Self::get_config_path();
        let default_config = Self::default();
        default_config.save_to_file(&config_path).await?;
        Ok(())
    }

    /// 热重载配置
    pub async fn hot_reload(&mut self) -> Result<(), ShadowError> {
        let config_path = Self::get_config_path();
        let new_config = Self::load_from_file(&config_path).await?;

        *self = new_config;
        self.validate()?;

        Ok(())
    }
}