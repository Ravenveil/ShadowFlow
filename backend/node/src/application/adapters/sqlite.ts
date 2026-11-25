/**
 * adapters/sqlite — SQLite 连接层唯一入口（目标形态：连接层上移 adaptors，
 * 业务 DAO 留在各业务包 infra/）。现为本兼容壳：实现仍在 storage/sqlite，
 * 待批8收尾时把实现上移、storage/sqlite 变壳。
 */
export * from '../../storage/sqlite';
