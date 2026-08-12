---
skill_id: editor-export-demo
name: editor-export-demo
description: "15.28 e2e test"
mode: blueprint
preview_type: yaml
source: editor-export
created_at: 2026-05-10T15:15:52.006Z
---

name: Demo Workflow
schema: shadowflow-workflow/v1
nodes:
  - id: agent-1
    type: agent
    role: Reader
  - id: gate-1
    type: approval-gate
edges:
  - source: agent-1
    target: gate-1
