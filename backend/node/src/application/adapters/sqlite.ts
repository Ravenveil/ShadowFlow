/**
 * adapters/sqlite — SQLite 连接层唯一入口（目标形态：连接层上移 adapters，
 * 业务 DAO 留在各业务包 infra/）。实现见 ./sqlite-impl。
 */
export * from './sqlite-impl';
