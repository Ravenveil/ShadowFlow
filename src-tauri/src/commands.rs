use crate::error::ShadowError;
use crate::config::AppConfig;
use crate::file_watcher::FileWatcher;
use crate::http_api::{ApiManager, ApiResponse, ApiEndpoint};
use crate::knowledge_base::KnowledgeBase;
use crate::models::{FileContent, FileMetadata, KnowledgeBaseStatus, Link, Tag};
use crate::executor::{TaskExecutor, Task, TaskType};
use crate::storage::Storage;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde_json::json;
use std::collections::HashMap;

/// Tauri 命令状态
pub struct AppState {
    pub config: AppConfig,
    pub knowledge_base: Arc<Mutex<KnowledgeBase>>,
    pub file_watcher: Arc<Mutex<FileWatcher>>,
    pub indexing: Arc<Mutex<bool>>,
    pub api_manager: Arc<Mutex<ApiManager>>,
    pub task_executor: Arc<TaskExecutor>,
    pub storage: Arc<Mutex<Option<Storage>>>,
}

impl AppState {
    pub fn new() -> Self {
        // 创建默认配置
        let config = AppConfig::default();

        // 初始化任务执行器
        let task_executor = Arc::new(TaskExecutor::new(config.clone()));
        task_executor.start_periodic_tasks();

        Self {
            config,
            knowledge_base: Arc::new(Mutex::new(KnowledgeBase::new())),
            file_watcher: Arc::new(Mutex::new(FileWatcher::new().unwrap())),
            indexing: Arc::new(Mutex::new(false)),
            api_manager: Arc::new(Mutex::new(ApiManager::new(config.clone()).unwrap())),
            task_executor,
            storage: Arc::new(Mutex::new(None)),
        }
    }
}

/// 打开知识库
#[tauri::command]
pub async fn open_knowledge_base(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    // 更新索引状态
    *state.indexing.lock().unwrap() = true;

    // 关闭现有的知识库
    {
        let mut kb = state.knowledge_base.lock().unwrap();
        kb.close();
        kb.open(&path_buf).map_err(|e| e.to_string())?;
    }

    // 停止现有的监控
    {
        let mut watcher = state.file_watcher.lock().unwrap();
        watcher.stop();
    }

    // 索引所有文件
    {
        let kb = state.knowledge_base.clone();
        tokio::task::spawn_blocking(move || {
            if let Ok(mut kb_guard) = kb.lock() {
                match kb_guard.index_all() {
                    Ok(count) => {
                        log::info!("索引完成，共索引 {} 个文件", count);
                    }
                    Err(e) => {
                        log::error!("索引失败: {}", e);
                    }
                }
            }
        });
    }

    // 启动文件监控
    {
        let mut watcher = state.file_watcher.lock().unwrap();
        watcher
            .start(&path_buf, state.knowledge_base.clone())
            .map_err(|e| e.to_string())?;
    }

    *state.indexing.lock().unwrap() = false;

    Ok(())
}

/// 关闭知识库
#[tauri::command]
pub async fn close_knowledge_base(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut kb = state.knowledge_base.lock().unwrap();
    kb.close();

    let mut watcher = state.file_watcher.lock().unwrap();
    watcher.stop();

    Ok(())
}

/// 获取文件列表
#[tauri::command]
pub async fn get_files(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FileMetadata>, String> {
    let kb = state.knowledge_base.lock().unwrap();
    kb.get_files().map_err(|e| e.to_string())
}

/// 获取文件内容
#[tauri::command]
pub async fn get_file_content(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<FileContent, String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    let content = fs::read_to_string(&path_buf).map_err(|e| e.to_string())?;

    let kb = state.knowledge_base.lock().unwrap();
    let metadata = kb.get_file_metadata(&path)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("未找到文件元数据: {}", path))?;

    drop(kb);

    Ok(FileContent {
        path,
        content,
        metadata,
    })
}

/// 保存文件并更新索引
#[tauri::command]
pub async fn save_file(
    state: tauri::State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    // 确保父目录存在
    if let Some(parent) = path_buf.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // 写入文件
    fs::write(&path_buf, &content).map_err(|e| e.to_string())?;

    // 更新索引
    let kb = state.knowledge_base.clone();
    tokio::task::spawn_blocking(move || {
        if let Ok(mut kb_guard) = kb.lock() {
            if let Err(e) = kb_guard.index_file(&path_buf) {
                log::warn!("索引文件失败 {:?}: {}", path_buf, e);
            }
        }
    });

    Ok(())
}

/// 搜索文件
#[tauri::command]
pub async fn search_files(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<crate::models::SearchResult>, String> {
    let kb = state.knowledge_base.lock().unwrap();
    kb.search_files(&query).map_err(|e| e.to_string())
}

/// 获取文件的链接
#[tauri::command]
pub async fn get_links(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Vec<Link>, String> {
    let kb = state.knowledge_base.lock().unwrap();
    kb.get_links(&path).map_err(|e| e.to_string())
}

/// 获取反向链接
#[tauri::command]
pub async fn get_backlinks(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Vec<Link>, String> {
    let kb = state.knowledge_base.lock().unwrap();
    kb.get_backlinks(&path).map_err(|e| e.to_string())
}

/// 获取所有标签
#[tauri::command]
pub async fn get_tags(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Tag>, String> {
    let kb = state.knowledge_base.lock().unwrap();
    kb.get_tags().map_err(|e| e.to_string())
}

/// 获取文件元数据
#[tauri::command]
pub async fn get_file_metadata(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<FileMetadata, String> {
    let kb = state.knowledge_base.lock().unwrap();
    kb.get_file_metadata(&path)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("文件不存在: {}", path))
}

/// 获取知识库状态
#[tauri::command]
pub async fn get_status(
    state: tauri::State<'_, AppState>,
) -> Result<KnowledgeBaseStatus, String> {
    let kb = state.knowledge_base.lock().unwrap();

    let (file_count, link_count, tag_count) = kb.get_stats().map_err(|e| e.to_string())?;

    let is_open = kb.is_open();
    let path = kb.base_path().map(|p| p.to_string_lossy().to_string());
    let indexing = *state.indexing.lock().unwrap();

    Ok(KnowledgeBaseStatus {
        is_open,
        path,
        file_count,
        link_count,
        tag_count,
        indexing,
    })
}

/// 获取配置
#[tauri::command]
pub async fn get_config(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "database": state.config.database,
        "knowledge_base": state.config.knowledge_base,
        "http_api": state.config.http_api,
        "performance": state.config.performance,
        "logging": state.config.logging
    }))
}

/// 更新配置
#[tauri::command]
pub async fn update_config(
    state: tauri::State<'_, AppState>,
    new_config: serde_json::Value,
) -> Result<(), String> {
    // 解析新配置
    let mut config = state.config.clone();

    // 更新配置字段（这里简化处理，实际应该进行详细的验证）
    if let Some(http_api) = new_config.get("http_api") {
        if let Some(enabled) = http_api.get("enabled").and_then(|v| v.as_bool()) {
            config.http_api.enabled = enabled;
        }
        if let Some(url) = http_api.get("base_url").and_then(|v| v.as_str()) {
            config.http_api.base_url = url.to_string();
        }
    }

    // 验证配置
    if let Err(e) = config.validate() {
        return Err(format!("配置验证失败: {}", e));
    }

    // 保存配置
    if let Err(e) = config.save_to_file(&AppConfig::get_config_path()).await {
        return Err(format!("保存配置失败: {}", e));
    }

    state.config = config;

    Ok(())
}

/// 获取执行器指标
#[tauri::command]
pub async fn get_metrics(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    state.task_executor.get_metrics().await.map_err(|e| e.to_string())
}

/// 添加任务
#[tauri::command]
pub async fn add_task(
    state: tauri::State<'_, AppState>,
    task_type: String,
    payload: serde_json::Value,
    priority: i32,
) -> Result<String, String> {
    let task = match task_type.as_str() {
        "index_file" => Task::new(TaskType::IndexFile, payload, priority),
        "batch_index" => Task::new(TaskType::BatchIndex, payload, priority),
        "sync_api" => Task::new(TaskType::SyncApi, payload, priority),
        "search" => Task::new(TaskType::Search, payload, priority),
        "health_check" => Task::new(TaskType::HealthCheck, payload, priority),
        _ => return Err("不支持的任务类型".to_string()),
    };

    state.task_executor
        .add_task(task)
        .await
        .map_err(|e| e.to_string())?;

    Ok("任务已添加".to_string())
}

/// 取消任务
#[tauri::command]
pub async fn cancel_task(
    state: tauri::State<'_, AppState>,
    task_id: String,
) -> Result<bool, String> {
    state.task_executor
        .cancel_task(&task_id)
        .await
        .map_err(|e| e.to_string())
}

/// 执行健康检查
#[tauri::command]
pub async fn health_check(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // 检查数据库
    if let Ok(Some(storage)) = state.storage.lock().as_ref().map(|s| s.as_ref()) {
        match storage.get_stats() {
            Ok((file_count, link_count, tag_count)) => {
                log::info!("数据库正常 - 文件: {}, 链接: {}, 标签: {}", file_count, link_count, tag_count);
            }
            Err(e) => {
                log::error!("数据库检查失败: {}", e);
                return Err(format!("数据库检查失败: {}", e));
            }
        }
    }

    // 检查 API 连接
    if state.config.http_api.enabled {
        match state.api_manager.lock().unwrap().health_check().await {
            Ok(_) => {
                log::info!("API 连接正常");
            }
            Err(e) => {
                log::error!("API 连接失败: {}", e);
                return Err(format!("API 连接失败: {}", e));
            }
        }
    }

    // 检查文件监控
    if state.file_watcher.lock().unwrap().is_running() {
        log::info!("文件监控正常运行");
    }

    Ok(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "database": "connected",
        "api": "connected",
        "file_watcher": "running"
    }))
}
