use crate::error::ShadowError;
use crate::knowledge_base::KnowledgeBase;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// 文件系统监控器
pub struct FileWatcher {
    watcher: Option<RecommendedWatcher>,
    base_path: Option<PathBuf>,
    knowledge_base: Option<Arc<Mutex<KnowledgeBase>>>,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
}

impl FileWatcher {
    /// 创建新的文件监控器
    pub fn new() -> Result<Self, ShadowError> {
        Ok(Self {
            watcher: None,
            base_path: None,
            knowledge_base: None,
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    /// 启动监控
    pub fn start(
        &mut self,
        base_path: &Path,
        knowledge_base: Arc<Mutex<KnowledgeBase>>,
    ) -> Result<(), ShadowError> {
        self.base_path = Some(base_path.to_path_buf());
        self.knowledge_base = Some(knowledge_base);

        let watched_paths = self.watched_paths.clone();
        let kb_path = base_path.to_path_buf();
        let kb = self.knowledge_base.clone().unwrap();

        let event_handler = move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                Self::handle_event(event, &kb_path, kb.clone(), watched_paths.clone());
            }
        };

        let config = notify::Config::default()
            .with_poll_interval(Duration::from_secs(2))
            .with_compare_contents(true);

        self.watcher = Some(notify::recommended_watcher(event_handler, config)?);

        if let Some(watcher) = &mut self.watcher {
            watcher.watch(base_path, RecursiveMode::Recursive)?;

            // 记录监控的路径
            let mut paths = self.watched_paths.lock().unwrap();
            paths.insert(base_path.to_path_buf());
        }

        log::info!("文件监控已启动: {}", base_path.display());

        Ok(())
    }

    /// 处理文件系统事件
    fn handle_event(
        event: notify::Event,
        base_path: &Path,
        knowledge_base: Arc<Mutex<KnowledgeBase>>,
        watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
    ) {
        // 检查是否在忽略的目录中
        for path in &event.paths {
            if Self::should_ignore(path, base_path) {
                continue;
            }
        }

        match event.kind {
            notify::EventKind::Create(_) | notify::EventKind::Modify(_) => {
                for path in &event.paths {
                    if path.is_file() && Self::is_markdown_file(path) {
                        if let Ok(mut kb) = knowledge_base.lock() {
                            if let Err(e) = kb.index_file(path) {
                                log::warn!("索引文件失败 {:?}: {}", path, e);
                            } else {
                                log::info!("文件已索引: {}", path.display());
                            }
                        }
                    }
                }
            }
            notify::EventKind::Remove(_) => {
                for path in &event.paths {
                    if let Ok(mut kb) = knowledge_base.lock() {
                        if let Err(e) = kb.delete_file_index(&path.to_string_lossy().to_string()) {
                            log::warn!("删除文件索引失败 {:?}: {}", path, e);
                        } else {
                            log::info!("文件索引已删除: {}", path.display());
                        }
                    }
                }
            }
            _ => {}
        }
    }

    /// 检查是否应该忽略此路径
    fn should_ignore(path: &Path, base_path: &Path) -> bool {
        let relative = if let Ok(rel) = path.strip_prefix(base_path) {
            rel
        } else {
            return false;
        };

        // 检查每个路径组件
        for component in relative.components() {
            if let std::path::Component::Normal(name) = component {
                if let Some(name_str) = name.to_str() {
                    // 忽略隐藏目录（以 . 开头）
                    if name_str.starts_with('.') && name_str != ".obsidian" {
                        return true;
                    }
                    // 忽略常见构建目录
                    if matches!(
                        name_str,
                        "node_modules" | "target" | "dist" | "build" | ".git" | "__pycache__"
                    ) {
                        return true;
                    }
                }
            }
        }

        // 忽略 .DS_Store 和 Thumbs.db
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            if matches!(file_name, ".DS_Store" | "Thumbs.db") {
                return true;
            }
        }

        false
    }

    /// 检查是否是 Markdown 文件
    fn is_markdown_file(path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext == "md" || ext == "markdown")
            .unwrap_or(false)
    }

    /// 停止监控
    pub fn stop(&mut self) {
        if let Some(watcher) = &mut self.watcher {
            let _ = watcher.unwatch(self.base_path.as_ref().unwrap());
            log::info!("文件监控已停止");
        }
        self.watcher = None;
        self.base_path = None;
        self.knowledge_base = None;
    }

    /// 检查是否正在运行
    pub fn is_running(&self) -> bool {
        self.watcher.is_some()
    }
}
