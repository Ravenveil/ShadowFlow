mod commands;
mod config;
mod error;
mod file_watcher;
mod http_api;
mod knowledge_base;
mod models;
mod storage;

use commands::{
    AppState, close_knowledge_base, get_backlinks, get_file_content, get_file_metadata, get_files,
    get_links, get_status, get_tags, open_knowledge_base, save_file, search_files,
    get_config, update_config, get_metrics, add_task, cancel_task, health_check
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            open_knowledge_base,
            close_knowledge_base,
            get_files,
            get_file_content,
            save_file,
            search_files,
            get_links,
            get_backlinks,
            get_tags,
            get_file_metadata,
            get_status,
            get_config,
            update_config,
            get_metrics,
            add_task,
            cancel_task,
            health_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
