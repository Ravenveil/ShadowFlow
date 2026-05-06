#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[tokio::test]
    async fn test_config_creation() {
        let config = AppConfig::default();
        assert!(!config.database.path.is_empty());
        assert!(config.http_api.enabled);
    }

    #[tokio::test]
    async fn test_config_save_load() {
        let config = AppConfig::default();
        let dir = tempdir().unwrap();
        let config_path = dir.path().join("test_config.toml");

        // 保存配置
        assert!(config.save_to_file(&config_path).await.is_ok());

        // 加载配置
        let loaded_config = AppConfig::load_from_file(&config_path).await.unwrap();
        assert_eq!(loaded_config.database.path, config.database.path);
    }

    #[tokio::test]
    async fn test_task_executor() {
        let config = AppConfig::default();
        let executor = TaskExecutor::new(config);

        let task = Task::new(
            TaskType::HealthCheck,
            serde_json::json!({"service": "test"}),
            5
        );

        assert!(executor.add_task(task).await.is_ok());

        // 等待任务完成
        tokio::time::sleep(Duration::from_millis(500)).await;

        let metrics = executor.get_metrics().await;
        assert!(metrics["completed_tasks"].as_i64().unwrap() >= 1);
    }

    #[tokio::test]
    async fn test_http_client() {
        let config = AppConfig::default();
        let client = HttpClient::new(config);

        // 注意：这个测试需要真实的 HTTP 服务器
        // 这里只测试客户端创建
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_knowledge_base() {
        let dir = tempdir().unwrap();
        let kb_path = dir.path();
        let db_path = kb_path.join(".shadow").join("index.db");

        // 创建测试 Markdown 文件
        let test_file = kb_path.join("test.md");
        fs::write(&test_file, "# 测试文件\n\n这是一个测试文件。\n\n标签: #test").unwrap();

        let mut kb = KnowledgeBase::new();
        kb.open(kb_path).unwrap();

        // 索引文件
        assert!(kb.index_file(&test_file).is_ok());

        // 获取文件列表
        let files = kb.get_files().unwrap();
        assert_eq!(files.len(), 1);

        // 提取标签
        let content = fs::read_to_string(&test_file).unwrap();
        let tags = kb.extract_tags(&content);
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0], "test");

        // 提取链接
        let links = kb.extract_links(&content);
        assert!(links.is_empty());
    }
}