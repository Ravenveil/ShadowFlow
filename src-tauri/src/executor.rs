use crate::error::ShadowError;
use crate::config::AppConfig;
use dashmap::DashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::{Semaphore, Mutex};
use tokio::time::{Duration, sleep};
use std::collections::HashMap;
use uuid::Uuid;

/// 任务类型
#[derive(Debug, Clone, PartialEq)]
pub enum TaskType {
    IndexFile,
    BatchIndex,
    SyncApi,
    Search,
    HealthCheck,
}

/// 任务状态
#[derive(Debug, Clone, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed(String),
    Cancelled,
}

/// 任务定义
#[derive(Debug, Clone)]
pub struct Task {
    pub id: String,
    pub task_type: TaskType,
    pub payload: serde_json::Value,
    pub priority: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub status: TaskStatus,
    pub retry_count: u32,
    pub max_retries: u32,
}

impl Task {
    pub fn new(task_type: TaskType, payload: serde_json::Value, priority: i32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            task_type,
            payload,
            priority,
            created_at: chrono::Utc::now(),
            status: TaskStatus::Pending,
            retry_count: 0,
            max_retries: 3,
        }
    }
}

/// 任务结果
#[derive(Debug)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub output: serde_json::Value,
    pub error: Option<String>,
    pub duration_ms: u64,
}

/// 任务执行器
pub struct TaskExecutor {
    tasks: DashMap<String, Task>,
    config: AppConfig,
    semaphore: Arc<Semaphore>,
    running_tasks: Arc<DashMap<String, tokio::task::JoinHandle<TaskResult>>>,
    pending_queue: Arc<Mutex<Vec<(String, Task)>>>,
    metrics: Arc<Mutex<ExecutorMetrics>>,
}

/// 执行器指标
#[derive(Debug, Default)]
struct ExecutorMetrics {
    total_tasks: AtomicUsize,
    completed_tasks: AtomicUsize,
    failed_tasks: AtomicUsize,
    running_tasks: AtomicUsize,
    total_duration_ms: AtomicUsize,
}

impl TaskExecutor {
    /// 创建新的任务执行器
    pub fn new(config: AppConfig) -> Self {
        let max_concurrent = config.performance.max_concurrent_indexing;

        Self {
            tasks: DashMap::new(),
            config,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            running_tasks: DashMap::new(),
            pending_queue: Arc::new(Mutex::new(Vec::new())),
            metrics: Arc::new(Mutex::new(ExecutorMetrics::default())),
        }
    }

    /// 添加任务
    pub async fn add_task(&self, task: Task) -> Result<(), ShadowError> {
        // 添加到任务映射
        self.tasks.insert(task.id.clone(), task.clone());

        // 添加到待处理队列
        {
            let mut queue = self.pending_queue.lock().await;
            queue.push((task.id.clone(), task));

            // 按优先级排序（优先级高的在前）
            queue.sort_by(|a, b| b.1.priority.cmp(&a.1.priority));
        }

        // 尝试执行任务
        self.process_queue().await;

        Ok(())
    }

    /// 处理任务队列
    async fn process_queue(&self) {
        while let Ok(permit) = self.semaphore.try_acquire() {
            let permit = permit;

            // 从队列获取任务
            let task = {
                let mut queue = self.pending_queue.lock().await;
                queue.pop()
            };

            if let Some((task_id, task)) = task {
                // 更新任务状态为运行中
                if let Some(mut t) = self.tasks.get_mut(&task_id) {
                    t.status = TaskStatus::Running;
                }

                // 更新指标
                self.metrics.lock().unwrap().running_tasks.fetch_add(1, Ordering::Relaxed);

                // 创建异步任务
                let task_handle = tokio::spawn(async move {
                    let start_time = std::time::Instant::now();

                    // 执行任务
                    let result = Self::execute_task(&task).await;

                    let duration = start_time.elapsed();

                    // 更新指标
                    {
                        let mut metrics = self.metrics.lock().unwrap();
                        metrics.running_tasks.fetch_sub(1, Ordering::Relaxed);
                        if result.success {
                            metrics.completed_tasks.fetch_add(1, Ordering::Relaxed);
                        } else {
                            metrics.failed_tasks.fetch_add(1, Ordering::Relaxed);
                        }
                        metrics.total_duration_ms.fetch_add(duration.as_millis() as usize, Ordering::Relaxed);
                    }

                    result
                });

                // 保存任务句柄
                self.running_tasks.insert(task_id.clone(), task_handle);

                // 释放信号量
                drop(permit);
            } else {
                break;
            }
        }
    }

    /// 执行单个任务
    async fn execute_task(task: &Task) -> TaskResult {
        let start_time = std::time::Instant::now();

        let result = match &task.task_type {
            TaskType::IndexFile => {
                // 执行文件索引任务
                Self::execute_index_task(&task.payload).await
            }
            TaskType::BatchIndex => {
                // 执行批量索引任务
                Self::execute_batch_index_task(&task.payload).await
            }
            TaskType::SyncApi => {
                // 执行 API 同步任务
                Self::execute_sync_task(&task.payload).await
            }
            TaskType::Search => {
                // 执行搜索任务
                Self::execute_search_task(&task.payload).await
            }
            TaskType::HealthCheck => {
                // 执行健康检查任务
                Self::execute_health_check_task(&task.payload).await
            }
        };

        let duration = start_time.elapsed();

        TaskResult {
            task_id: task.id.clone(),
            success: result.is_ok(),
            output: result.ok().unwrap_or(serde_json::json!({})),
            error: result.err().map(|e| e.to_string()),
            duration_ms: duration.as_millis() as u64,
        }
    }

    /// 执行文件索引任务
    async fn execute_index_task(payload: &serde_json::Value) -> Result<serde_json::Value, ShadowError> {
        let file_path = payload["path"].as_str().unwrap_or("");
        if file_path.is_empty() {
            return Err(ShadowError::InvalidPath("文件路径不能为空".to_string()));
        }

        // 模拟文件索引操作
        tokio::time::sleep(Duration::from_millis(100)).await;

        log::info!("文件索引完成: {}", file_path);

        Ok(serde_json::json!({
            "message": "文件索引完成",
            "path": file_path,
            "indexed_at": chrono::Utc::now().to_rfc3339()
        }))
    }

    /// 执行批量索引任务
    async fn execute_batch_index_task(payload: &serde_json::Value) -> Result<serde_json::Value, ShadowError> {
        let files = payload["files"].as_array().unwrap_or(&vec![]);
        let mut results = Vec::new();

        for file in files {
            if let Some(file_path) = file.as_str() {
                match Self::execute_index_task(&serde_json::json!({"path": file_path})).await {
                    Ok(result) => results.push(result),
                    Err(e) => results.push(serde_json::json!({
                        "error": e.to_string(),
                        "path": file_path
                    })),
                }
            }
        }

        Ok(serde_json::json!({
            "total_files": files.len(),
            "indexed_files": results.len(),
            "results": results
        }))
    }

    /// 执行同步任务
    async fn execute_sync_task(payload: &serde_json::Value) -> Result<serde_json::Value, ShadowError> {
        // 获取知识库路径
        let kb_path = payload["path"].as_str().unwrap_or("");
        if kb_path.is_empty() {
            return Err(ShadowError::InvalidPath("知识库路径不能为空".to_string()));
        }

        // 模拟同步操作
        tokio::time::sleep(Duration::from_secs(2)).await;

        log::info!("API 同步完成: {}", kb_path);

        Ok(serde_json::json!({
            "message": "同步完成",
            "path": kb_path,
            "synced_at": chrono::Utc::now().to_rfc3339()
        }))
    }

    /// 执行搜索任务
    async fn execute_search_task(payload: &serde_json::Value) -> Result<serde_json::Value, ShadowError> {
        let query = payload["query"].as_str().unwrap_or("");
        if query.is_empty() {
            return Err(ShadowError::InvalidConfig("搜索查询不能为空".to_string()));
        }

        // 模拟搜索操作
        tokio::time::sleep(Duration::from_millis(500)).await;

        Ok(serde_json::json!({
            "query": query,
            "results": [
                {
                    "title": "相关文档 1",
                    "path": "/path/to/doc1.md",
                    "score": 0.95
                },
                {
                    "title": "相关文档 2",
                    "path": "/path/to/doc2.md",
                    "score": 0.85
                }
            ],
            "searched_at": chrono::Utc::now().to_rfc3339()
        }))
    }

    /// 执行健康检查任务
    async fn execute_health_check_task(payload: &serde_json::Value) -> Result<serde_json::Value, ShadowError> {
        let service = payload["service"].as_str().unwrap_or("all");

        // 模拟健康检查
        tokio::time::sleep(Duration::from_millis(200)).await;

        Ok(serde_json::json!({
            "service": service,
            "status": "healthy",
            "timestamp": chrono::Utc::now().to_rfc3339()
        }))
    }

    /// 取消任务
    pub async fn cancel_task(&self, task_id: &str) -> Result<bool, ShadowError> {
        if let Some((_, task)) = self.tasks.get(task_id) {
            if let TaskStatus::Pending | TaskStatus::Running = task.status {
                // 从队列中移除
                {
                    let mut queue = self.pending_queue.lock().await;
                    queue.retain(|(id, _)| id != task_id);
                }

                // 取消正在运行的任务
                if let Some(task_handle) = self.running_tasks.remove(task_id) {
                    task_handle.abort();
                }

                // 更新任务状态
                if let Some(mut t) = self.tasks.get_mut(task_id) {
                    t.status = TaskStatus::Cancelled;
                }

                return Ok(true);
            }
        }

        Ok(false)
    }

    /// 获取任务状态
    pub fn get_task_status(&self, task_id: &str) -> Option<Task> {
        self.tasks.get(task_id).map(|t| t.clone())
    }

    /// 获取所有任务状态
    pub fn get_all_tasks(&self) -> Vec<Task> {
        self.tasks.iter().map(|t| t.value().clone()).collect()
    }

    /// 获取执行器指标
    pub async fn get_metrics(&self) -> serde_json::Value {
        let metrics = self.metrics.lock().unwrap();

        serde_json::json!({
            "total_tasks": metrics.total_tasks.load(Ordering::Relaxed),
            "completed_tasks": metrics.completed_tasks.load(Ordering::Relaxed),
            "failed_tasks": metrics.failed_tasks.load(Ordering::Relaxed),
            "running_tasks": metrics.running_tasks.load(Ordering::Relaxed),
            "average_duration_ms": if metrics.completed_tasks.load(Ordering::Relaxed) > 0 {
                metrics.total_duration_ms.load(Ordering::Relaxed) / metrics.completed_tasks.load(Ordering::Relaxed)
            } else {
                0
            },
            "pending_queue_size": self.pending_queue.lock().await.len(),
            "running_tasks_count": self.running_tasks.len()
        })
    }

    /// 启动定期任务
    pub fn start_periodic_tasks(&self) {
        let executor = self.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));

            loop {
                interval.tick().await;

                // 执行定期任务
                Self::execute_periodic_tasks(&executor).await;
            }
        });
    }

    /// 执行定期任务
    async fn execute_periodic_tasks(executor: &TaskExecutor) {
        // 健康检查任务
        let health_check_task = Task::new(
            TaskType::HealthCheck,
            serde_json::json!({"service": "database"}),
            1
        );

        if let Err(e) = executor.add_task(health_check_task).await {
            log::error!("添加健康检查任务失败: {}", e);
        }
    }
}

impl Clone for TaskExecutor {
    fn clone(&self) -> Self {
        Self {
            tasks: self.tasks.clone(),
            config: self.config.clone(),
            semaphore: self.semaphore.clone(),
            running_tasks: self.running_tasks.clone(),
            pending_queue: self.pending_queue.clone(),
            metrics: self.metrics.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_task_executor_creation() {
        let config = AppConfig::default();
        let executor = TaskExecutor::new(config);
        assert!(executor.get_all_tasks().is_empty());
    }

    #[tokio::test]
    async fn test_add_task() {
        let config = AppConfig::default();
        let executor = TaskExecutor::new(config);

        let task = Task::new(
            TaskType::IndexFile,
            serde_json::json!({"path": "/test.md"}),
            5
        );

        assert!(executor.add_task(task).await.is_ok());
        assert_eq!(executor.get_all_tasks().len(), 1);
    }

    #[tokio::test]
    async fn test_task_execution() {
        let config = AppConfig::default();
        let executor = TaskExecutor::new(config);

        let task = Task::new(
            TaskType::HealthCheck,
            serde_json::json!({"service": "test"}),
            5
        );

        let _ = executor.add_task(task).await;

        // 等待任务完成
        tokio::time::sleep(Duration::from_millis(500)).await;

        let metrics = executor.get_metrics().await;
        assert_eq!(metrics["completed_tasks"].as_i64().unwrap(), 1);
    }
}