use std::io;
use thiserror::Error;

/// 统一错误类型
#[derive(Error, Debug)]
pub enum ShadowError {
    #[error("IO 错误: {0}")]
    Io(#[from] io::Error),

    #[error("SQLite 错误: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("序列化错误: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("正则表达式错误: {0}")]
    Regex(#[from] regex::Error),

    #[error("知识库未初始化")]
    NotInitialized,

    #[error("文件不存在: {0}")]
    FileNotFound(String),

    #[error("无效的路径: {0}")]
    InvalidPath(String),

    #[error("数据库错误: {0}")]
    Database(String),

    #[error("文件监控错误: {0}")]
    Watcher(String),

    #[error("HTTP 错误: {0}")]
    HttpError(String),

    #[error("API 端点未找到: {0}")]
    ApiEndpointNotFound(String),

    #[error("配置错误: {0}")]
    InvalidConfig(String),

    #[error("网络错误: {0}")]
    NetworkError(String),

    #[error("认证失败: {0}")]
    AuthenticationError(String),

    #[error("权限不足: {0}")]
    PermissionDenied(String),

    #[error("配置解析错误: {0}")]
    ConfigParse(String),

    #[error("并发错误: {0}")]
    ConcurrencyError(String),

    #[error("任务已取消: {0}")]
    TaskCancelled(String),

    #[error("缓存错误: {0}")]
    CacheError(String),

    #[error("未知错误: {0}")]
    Unknown(String),
}

/// 将 ShadowError 转换为 Tauri 可接受的 String
impl From<ShadowError> for String {
    fn from(err: ShadowError) -> Self {
        err.to_string()
    }
}
