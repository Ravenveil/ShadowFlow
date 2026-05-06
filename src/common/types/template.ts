/**
 * Template system types — Collaboration Quad-View (Epic 7)
 *
 * Aligned with Python WorkflowTemplateSpec + AgentRosterEntry + GroupTemplateSpec
 * in shadowflow/highlevel.py. Fields use snake_case; camel conversion happens
 * at the fetch boundary via src/adapter/caseConverter.ts (AR18).
 */

// ============================================================================
// Agent Roster (UI-layer lightweight display info)
// ============================================================================

export interface AgentRosterEntry {
  id: string;
  name: string;
  soul: string;
  llm: string;
  tools: string[];
}

// ============================================================================
// Group Template (default group-chat within a template)
// ============================================================================

export interface GroupTemplate {
  id: string;
  name: string;
  agents: string[];
  policy_matrix: string;
}

// ============================================================================
// Template (extends WorkflowTemplateSpec with Quad-View fields)
// ============================================================================

export interface Template {
  template_id: string;
  version: string;
  name: string;
  description: string;

  /** FR-Identity: user role in this template context */
  user_role: string;

  /** FR-OpsRoom: default persistent group-chat name */
  default_ops_room_name: string;

  /** FR-BriefBoard-Alias: UI alias for BriefBoard per template */
  brief_board_alias: string;

  /** Agent roster for Inbox / AgentDM / TemplateSwitcher display */
  agent_roster: AgentRosterEntry[];

  /** Default group-chat definitions for '+ New Group' flow */
  group_roster: GroupTemplate[];

  /** Template switcher icon color */
  theme_color: string;

  // Workflow fields (typed loosely here; detailed types in workflow.ts)
  parameters: Record<string, any>;
  agents: any[];
  nodes: any[];
  flow: any;
  policy_matrix: any;
  activation: any;
  stages: any[];
  defaults: Record<string, any>;
  metadata: Record<string, any>;
}
