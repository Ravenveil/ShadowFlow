use crate::error::ShadowError;
use crate::models::{FileMetadata, Link, Tag};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::path::Path;
use uuid::Uuid;

/// SQLite 存储层
pub struct Storage {
    conn: Option<Connection>,
}

impl Storage {
    /// 打开/创建数据库
    pub fn open(db_path: &Path) -> Result<Self, ShadowError> {
        let conn = Connection::open(db_path)?;
        let storage = Self { conn: Some(conn) };
        storage.init_schema()?;
        Ok(storage)
    }

    /// 初始化数据库表结构
    fn init_schema(&self) -> Result<(), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        // 文件表
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                content_preview TEXT,
                created_at TEXT NOT NULL,
                modified_at TEXT NOT NULL,
                word_count INTEGER NOT NULL DEFAULT 0,
                char_count INTEGER NOT NULL DEFAULT 0
            )
            "#,
            [],
        )?;

        // 标签表
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                count INTEGER NOT NULL DEFAULT 0
            )
            "#,
            [],
        )?;

        // 文件标签关联表
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS file_tags (
                file_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (file_id, tag_id),
                FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            )
            "#,
            [],
        )?;

        // 链接表
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS links (
                id TEXT PRIMARY KEY,
                source_file_id TEXT NOT NULL,
                target_title TEXT NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (source_file_id) REFERENCES files(id) ON DELETE CASCADE
            )
            "#,
            [],
        )?;

        // 创建索引以提高查询性能
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_title ON files(title)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_file_id)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_title)",
            [],
        )?;

        Ok(())
    }

    /// 插入或更新文件
    pub fn upsert_file(&self, metadata: &FileMetadata) -> Result<(), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        conn.execute(
            r#"
            INSERT INTO files (id, path, title, content_preview, created_at, modified_at, word_count, char_count)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                content_preview = excluded.content_preview,
                modified_at = excluded.modified_at,
                word_count = excluded.word_count,
                char_count = excluded.char_count
            "#,
            params![
                metadata.id,
                metadata.path,
                metadata.title,
                metadata.content_preview,
                metadata.created_at.to_rfc3339(),
                metadata.modified_at.to_rfc3339(),
                metadata.word_count,
                metadata.char_count,
            ],
        )?;

        Ok(())
    }

    /// 获取所有文件
    pub fn get_all_files(&self) -> Result<Vec<FileMetadata>, ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let mut stmt = conn.prepare(
            "SELECT id, path, title, content_preview, created_at, modified_at, word_count, char_count FROM files ORDER BY modified_at DESC"
        )?;

        let files = stmt.query_map([], |row| {
            Ok(FileMetadata {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                content_preview: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                modified_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                word_count: row.get(6)?,
                char_count: row.get(7)?,
            })
        })?;

        files.collect::<Result<Vec<_>, _>>().map_err(ShadowError::from)
    }

    /// 根据路径获取文件
    pub fn get_file_by_path(&self, path: &str) -> Result<Option<FileMetadata>, ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let mut stmt = conn.prepare(
            "SELECT id, path, title, content_preview, created_at, modified_at, word_count, char_count FROM files WHERE path = ?1"
        )?;

        let mut rows = stmt.query(params![path])?;

        if let Some(row) = rows.next()? {
            Ok(Some(FileMetadata {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                content_preview: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                modified_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                word_count: row.get(6)?,
                char_count: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// 删除文件（级联删除关联）
    pub fn delete_file(&self, path: &str) -> Result<bool, ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let affected = conn.execute("DELETE FROM files WHERE path = ?1", params![path])?;
        Ok(affected > 0)
    }

    /// 插入或更新标签
    pub fn upsert_tag(&self, tag: &Tag) -> Result<(), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        conn.execute(
            r#"
            INSERT INTO tags (id, name, count)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(name) DO UPDATE SET
                count = excluded.count
            "#,
            params![tag.id, tag.name, tag.count],
        )?;

        Ok(())
    }

    /// 关联文件和标签
    pub fn link_file_tag(&self, file_id: &str, tag_id: &str) -> Result<(), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        conn.execute(
            "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?1, ?2)",
            params![file_id, tag_id],
        )?;

        Ok(())
    }

    /// 获取所有标签
    pub fn get_all_tags(&self) -> Result<Vec<Tag>, ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let mut stmt = conn.prepare(
            "SELECT id, name, count FROM tags ORDER BY count DESC"
        )?;

        let tags = stmt.query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
            })
        })?;

        tags.collect::<Result<Vec<_>, _>>().map_err(ShadowError::from)
    }

    /// 获取文件的标签
    pub fn get_file_tags(&self, file_id: &str) -> Result<Vec<Tag>, ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT t.id, t.name, t.count
            FROM tags t
            INNER JOIN file_tags ft ON t.id = ft.tag_id
            WHERE ft.file_id = ?1
            ORDER BY t.count DESC
            "#
        )?;

        let tags = stmt.query_map(params![file_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
            })
        })?;

        tags.collect::<Result<Vec<_>, _>>().map_err(ShadowError::from)
    }

    /// 删除文件的所有标签关联
    pub fn delete_file_tags(&self, file_id: &str) -> Result<(), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        conn.execute(
            "DELETE FROM file_tags WHERE file_id = ?1",
            params![file_id],
        )?;

        Ok(())
    }

    /// 插入或更新链接
    pub fn upsert_link(&self, link: &Link) -> Result<(), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        conn.execute(
            r#"
            INSERT INTO links (id, source_file_id, target_title, position)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(id) DO UPDATE SET
                position = excluded.position
            "#,
            params![link.id, link.source_file_id, link.target_title, link.position],
        )?;

        Ok(())
    }

    /// 获取文件的链接
    pub fn get_file_links(&self, file_id: &str) -> Result<Vec<Link>, ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT l.id, l.source_file_id, f.path, l.target_title, l.position
            FROM links l
            INNER JOIN files f ON l.source_file_id = f.id
            WHERE l.source_file_id = ?1
            ORDER BY l.position
            "#
        )?;

        let links = stmt.query_map(params![file_id], |row| {
            Ok(Link {
                id: row.get(0)?,
                source_file_id: row.get(1)?,
                source_file_path: row.get(2)?,
                target_title: row.get(3)?,
                position: row.get(4)?,
            })
        })?;

        links.collect::<Result<Vec<_>, _>>().map_err(ShadowError::from)
    }

    /// 获取反向链接（指向某个文件的链接）
    pub fn get_backlinks(&self, file_path: &str) -> Result<Vec<Link>, ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT l.id, l.source_file_id, f.path, l.target_title, l.position
            FROM links l
            INNER JOIN files f ON l.source_file_id = f.id
            WHERE l.target_title = (
                SELECT title FROM files WHERE path = ?1
            )
            ORDER BY l.position
            "#
        )?;

        let links = stmt.query_map(params![file_path], |row| {
            Ok(Link {
                id: row.get(0)?,
                source_file_id: row.get(1)?,
                source_file_path: row.get(2)?,
                target_title: row.get(3)?,
                position: row.get(4)?,
            })
        })?;

        links.collect::<Result<Vec<_>, _>>().map_err(ShadowError::from)
    }

    /// 删除文件的所有链接
    pub fn delete_file_links(&self, file_id: &str) -> Result<(), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        conn.execute(
            "DELETE FROM links WHERE source_file_id = ?1",
            params![file_id],
        )?;

        Ok(())
    }

    /// 获取统计信息
    pub fn get_stats(&self) -> Result<(i64, i64, i64), ShadowError> {
        let conn = self.conn.as_ref().ok_or(ShadowError::NotInitialized)?;

        let file_count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))?;
        let link_count: i64 = conn.query_row("SELECT COUNT(*) FROM links", [], |row| row.get(0))?;
        let tag_count: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;

        Ok((file_count, link_count, tag_count))
    }
}
