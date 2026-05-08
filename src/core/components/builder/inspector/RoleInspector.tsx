/**
 * RoleInspector — 向后兼容薄包装（Story 8.3b）
 *
 * Story 8.3 创建了此文件作为 Inspector 入口。
 * Story 8.3b 将功能迁移到 RoleProfilePanel（5 分组手风琴）。
 * 此文件作为兼容层，BuilderPage.tsx 和已有测试无需修改。
 */
export { RoleProfilePanel as RoleInspector } from './RoleProfilePanel';
export type { RoleProfilePanelProps as RoleInspectorProps } from './RoleProfilePanel';
