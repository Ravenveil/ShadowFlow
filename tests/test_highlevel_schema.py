import json
import subprocess
import sys
from pathlib import Path

import yaml

from agentgraph.highlevel import SpecRegistry, TemplateCompiler, summarize_workflow_definition
from agentgraph.runtime import WorkflowDefinition


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE_REGISTRY_ROOT = ROOT / "examples" / "highlevel" / "minimal-registry"


def test_spec_registry_loads_example_highlevel_specs():
    registry = SpecRegistry.load_from_root(EXAMPLE_REGISTRY_ROOT)

    assert "filesystem" in registry.tools
    assert "docs_review" in registry.skills
    assert "reviewer" in registry.roles
    assert "docs_reviewer" in registry.agents
    assert "docs-review-template" in registry.templates


def test_template_compiler_builds_workflow_definition_from_example_registry():
    registry = SpecRegistry.load_from_root(EXAMPLE_REGISTRY_ROOT)
    template = registry.get_template("docs-review-template")

    workflow = TemplateCompiler(registry).compile(template, parameters={"goal": "Audit onboarding docs"})

    assert isinstance(workflow, WorkflowDefinition)
    assert workflow.workflow_id == "docs-review-template"
    assert workflow.entrypoint == "reviewer"
    assert workflow.nodes[0].type == "agent.execute"
    assert workflow.nodes[0].config["prompt"] == "Review the docs for goal: Audit onboarding docs"
    assert workflow.nodes[0].config["agent_ref"] == "docs_reviewer"
    assert workflow.nodes[0].config["tool_refs"] == ["filesystem"]
    assert workflow.edges[0].to_id == "END"


def test_template_agent_assignment_is_compiled_into_prompt_and_config(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "tools" / "filesystem.yaml").write_text(
        yaml.safe_dump(
            {
                "tool_id": "filesystem",
                "version": "0.1",
                "kind": "builtin",
                "name": "Filesystem",
                "runtime": {"builtin": "filesystem"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "skills" / "review.yaml").write_text(
        yaml.safe_dump(
            {
                "skill_id": "review",
                "version": "0.1",
                "name": "Review",
                "instructions": {"procedure": ["Inspect carefully"]},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "roles" / "reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "reviewer",
                "version": "0.1",
                "name": "Reviewer",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "reviewer_agent.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "reviewer_agent",
                "version": "0.1",
                "name": "Reviewer Agent",
                "role": "reviewer",
                "skills": ["review"],
                "tools": ["filesystem"],
                "executor": {"kind": "cli", "provider": "claude"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "templates" / "review.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "review",
                "version": "0.1",
                "name": "Review",
                "parameters": {"goal": {"type": "string", "required": True}},
                "agents": [
                    {
                        "id": "reviewer",
                        "ref": "reviewer_agent",
                        "assignment": {
                            "focus": "Only assess release risk",
                            "deliverable": "Risk report",
                            "owned_topics": ["regression", "tests"],
                        },
                    }
                ],
                "flow": {"entrypoint": "reviewer", "edges": [{"from": "reviewer", "to": "END", "type": "final"}]},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    registry = SpecRegistry.load_from_root(registry_root)
    workflow = TemplateCompiler(registry).compile(registry.get_template("review"), parameters={"goal": "Audit release"})
    node = workflow.nodes[0]
    assert node.config["assignment"]["focus"] == "Only assess release risk"
    assert node.config["assignment"]["owned_topics"] == ["regression", "tests"]
    assert "Current Assignment:" in node.config["prompt"]
    assert "Only assess release risk" in node.config["prompt"]
    assert "Risk report" in node.config["prompt"]


def test_template_policy_matrix_and_stages_compile_into_node_config_and_summary(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "tools" / "filesystem.yaml").write_text(
        yaml.safe_dump(
            {
                "tool_id": "filesystem",
                "version": "0.1",
                "kind": "builtin",
                "name": "Filesystem",
                "runtime": {"builtin": "filesystem"},
                "policy": {"trust_level": "internal", "side_effects": "read_only"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "skills" / "review.yaml").write_text(
        yaml.safe_dump(
            {
                "skill_id": "review",
                "version": "0.1",
                "name": "Review",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "roles" / "reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "reviewer",
                "version": "0.1",
                "name": "Reviewer",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "reviewer_agent.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "reviewer_agent",
                "version": "0.1",
                "name": "Reviewer Agent",
                "role": "reviewer",
                "skills": ["review"],
                "tools": ["filesystem"],
                "executor": {"kind": "cli", "provider": "claude"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "templates" / "governed_review.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "governed_review",
                "version": "0.1",
                "name": "Governed Review",
                "parameters": {"goal": {"type": "string", "required": True}},
                "agents": [{"id": "reviewer", "ref": "reviewer_agent"}],
                "flow": {"entrypoint": "reviewer", "edges": [{"from": "reviewer", "to": "END", "type": "final"}]},
                "policy_matrix": {
                    "agents": {
                        "reviewer": {
                            "tools": ["filesystem"],
                            "side_effects": "read_only",
                            "requires_confirmation": True,
                        }
                    }
                },
                "stages": [
                    {
                        "stage_id": "review",
                        "name": "Review",
                        "lane": "quality",
                        "agents": ["reviewer"],
                        "approval_required": True,
                    }
                ],
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    registry = SpecRegistry.load_from_root(registry_root)
    workflow = TemplateCompiler(registry).compile(
        registry.get_template("governed_review"),
        parameters={"goal": "Audit release"},
    )
    node = workflow.nodes[0]
    assert node.config["template_stage"]["stage_id"] == "review"
    assert node.config["template_stage"]["lane"] == "quality"
    assert node.config["template_policy"]["side_effects"] == "read_only"
    assert node.config["assignment"]["approval_required"] is True
    workflow_summary = summarize_workflow_definition(workflow)
    assert workflow_summary["stage_ids"] == ["review"]
    assert workflow_summary["lanes"] == ["quality"]
    assert workflow_summary["agents"][0]["policy"]["requires_confirmation"] is True


def test_template_compile_rejects_read_only_policy_for_write_capable_tool(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "tools" / "writer_api.yaml").write_text(
        yaml.safe_dump(
            {
                "tool_id": "writer_api",
                "version": "0.1",
                "kind": "api",
                "name": "Writer API",
                "runtime": {"provider": "openai"},
                "policy": {"trust_level": "external", "side_effects": "write"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "roles" / "publisher.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "publisher",
                "version": "0.1",
                "name": "Publisher",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "publisher_agent.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "publisher_agent",
                "version": "0.1",
                "name": "Publisher Agent",
                "role": "publisher",
                "tools": ["writer_api"],
                "executor": {"kind": "api", "provider": "openai"},
                "policy": {"allow_side_effects": False},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "templates" / "publish.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "publish",
                "version": "0.1",
                "name": "Publish",
                "agents": [{"id": "publish", "ref": "publisher_agent"}],
                "flow": {"entrypoint": "publish", "edges": [{"from": "publish", "to": "END", "type": "final"}]},
                "policy_matrix": {
                    "agents": {
                        "publish": {
                            "tools": ["writer_api"],
                            "side_effects": "read_only",
                        }
                    }
                },
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    registry = SpecRegistry.load_from_root(registry_root)
    template = registry.get_template("publish")
    try:
        TemplateCompiler(registry).compile(template)
    except ValueError as exc:
        assert "read_only" in str(exc)
    else:
        raise AssertionError("expected policy matrix validation to fail")


def test_template_validation_allows_backward_stage_edge_by_default(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "roles" / "worker.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "worker",
                "version": "0.1",
                "name": "Worker",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "agent_a.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "agent_a",
                "version": "0.1",
                "name": "Agent A",
                "role": "worker",
                "executor": {"kind": "cli", "provider": "claude"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "agent_b.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "agent_b",
                "version": "0.1",
                "name": "Agent B",
                "role": "worker",
                "executor": {"kind": "cli", "provider": "claude"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "templates" / "bad_flow.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "bad_flow",
                "version": "0.1",
                "name": "Bad Flow",
                "agents": [
                    {"id": "plan", "ref": "agent_a"},
                    {"id": "review", "ref": "agent_b"},
                ],
                "flow": {
                    "entrypoint": "plan",
                    "edges": [
                        {"from": "plan", "to": "review", "type": "default"},
                        {"from": "review", "to": "plan", "type": "default"},
                    ],
                },
                "stages": [
                    {"stage_id": "plan", "agents": ["plan"]},
                    {"stage_id": "review", "agents": ["review"]},
                ],
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    registry = SpecRegistry.load_from_root(registry_root)
    assert registry.get_template("bad_flow").flow.entrypoint == "plan"


def test_template_validation_rejects_backward_stage_edge_when_enforced(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "roles" / "worker.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "worker",
                "version": "0.1",
                "name": "Worker",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    for agent_id in ("agent_a", "agent_b"):
        (registry_root / "agents" / f"{agent_id}.yaml").write_text(
            yaml.safe_dump(
                {
                    "agent_id": agent_id,
                    "version": "0.1",
                    "name": agent_id,
                    "role": "worker",
                    "executor": {"kind": "cli", "provider": "claude"},
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
    (registry_root / "templates" / "bad_flow.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "bad_flow",
                "version": "0.1",
                "name": "Bad Flow",
                "agents": [
                    {"id": "plan", "ref": "agent_a"},
                    {"id": "review", "ref": "agent_b"},
                ],
                "flow": {
                    "entrypoint": "plan",
                    "enforce_stage_order": True,
                    "edges": [
                        {"from": "plan", "to": "review", "type": "default"},
                        {"from": "review", "to": "plan", "type": "default"},
                    ],
                },
                "stages": [
                    {"stage_id": "plan", "agents": ["plan"]},
                    {"stage_id": "review", "agents": ["review"]},
                ],
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    try:
        SpecRegistry.load_from_root(registry_root)
    except ValueError as exc:
        assert "moves backward across stages" in str(exc)
    else:
        raise AssertionError("expected stage-order validation to fail")


def test_template_policy_validation_uses_overridden_agent_shape(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "tools" / "filesystem.yaml").write_text(
        yaml.safe_dump(
            {
                "tool_id": "filesystem",
                "version": "0.1",
                "kind": "builtin",
                "name": "Filesystem",
                "runtime": {"builtin": "filesystem"},
                "policy": {"trust_level": "internal", "side_effects": "read_only"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "tools" / "writer_api.yaml").write_text(
        yaml.safe_dump(
            {
                "tool_id": "writer_api",
                "version": "0.1",
                "kind": "api",
                "name": "Writer API",
                "runtime": {"provider": "openai"},
                "policy": {"trust_level": "external", "side_effects": "write"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "roles" / "publisher.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "publisher",
                "version": "0.1",
                "name": "Publisher",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "publisher_agent.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "publisher_agent",
                "version": "0.1",
                "name": "Publisher Agent",
                "role": "publisher",
                "tools": ["writer_api"],
                "executor": {"kind": "api", "provider": "openai"},
                "policy": {"allow_side_effects": True},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "templates" / "publish.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "publish",
                "version": "0.1",
                "name": "Publish",
                "agents": [
                    {
                        "id": "publish",
                        "ref": "publisher_agent",
                        "overrides": {
                            "tools": ["filesystem"],
                            "policy": {"allow_side_effects": False},
                        },
                    }
                ],
                "flow": {"entrypoint": "publish", "edges": [{"from": "publish", "to": "END", "type": "final"}]},
                "policy_matrix": {
                    "agents": {
                        "publish": {
                            "tools": ["filesystem"],
                            "side_effects": "read_only",
                        }
                    }
                },
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    registry = SpecRegistry.load_from_root(registry_root)
    workflow = TemplateCompiler(registry).compile(registry.get_template("publish"))
    assert workflow.nodes[0].config["tool_refs"] == ["filesystem"]


def test_spec_registry_supports_agent_extends(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "tools" / "filesystem.yaml").write_text(
        yaml.safe_dump(
            {
                "tool_id": "filesystem",
                "version": "0.1",
                "kind": "builtin",
                "name": "Filesystem",
                "runtime": {"builtin": "filesystem"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "skills" / "code_review.yaml").write_text(
        yaml.safe_dump(
            {
                "skill_id": "code_review",
                "version": "0.1",
                "name": "Code Review",
                "instructions": {"procedure": ["Inspect the diff"]},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "roles" / "reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "reviewer",
                "version": "0.1",
                "name": "Reviewer",
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "base_reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "base_reviewer",
                "version": "0.1",
                "name": "Base Reviewer",
                "role": "reviewer",
                "skills": ["code_review"],
                "tools": ["filesystem"],
                "executor": {"kind": "cli", "provider": "claude"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "child_reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "child_reviewer",
                "version": "0.1",
                "name": "Child Reviewer",
                "extends": "base_reviewer",
                "prompt_template": "Review for {{ goal }}",
                "executor": {"kind": "cli", "provider": "codex"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "templates" / "review.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "review",
                "version": "0.1",
                "name": "Review",
                "parameters": {"goal": {"type": "string", "required": True}},
                "agents": [{"id": "reviewer", "ref": "child_reviewer"}],
                "flow": {
                    "entrypoint": "reviewer",
                    "edges": [{"from": "reviewer", "to": "END", "type": "final"}],
                },
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    registry = SpecRegistry.load_from_root(registry_root)
    template = registry.get_template("review")
    workflow = TemplateCompiler(registry).compile(template, parameters={"goal": "release patch"})

    node = workflow.nodes[0]
    assert node.config["agent_ref"] == "child_reviewer"
    assert node.config["tool_refs"] == ["filesystem"]
    assert node.config["skill_refs"] == ["code_review"]
    assert node.config["executor"]["provider"] == "codex"
    assert node.config["prompt"] == "Review for release patch"


def test_spec_registry_supports_role_extends_and_prompt_includes_role_policy(tmp_path):
    registry_root = tmp_path / "registry"
    for dirname in ("tools", "skills", "roles", "agents", "templates"):
        (registry_root / dirname).mkdir(parents=True, exist_ok=True)

    (registry_root / "tools" / "filesystem.yaml").write_text(
        yaml.safe_dump(
            {
                "tool_id": "filesystem",
                "version": "0.1",
                "kind": "builtin",
                "name": "Filesystem",
                "runtime": {"builtin": "filesystem"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "skills" / "review.yaml").write_text(
        yaml.safe_dump(
            {
                "skill_id": "review",
                "version": "0.1",
                "name": "Review",
                "instructions": {"procedure": ["Inspect carefully"]},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "roles" / "base_reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "base_reviewer",
                "version": "0.1",
                "name": "Base Reviewer",
                "objectives": ["Find important risk"],
                "responsibilities": ["Check behavior"],
                "decision_policy": {"priorities": ["risk first"]},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "roles" / "strict_reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "role_id": "strict_reviewer",
                "version": "0.1",
                "name": "Strict Reviewer",
                "extends": "base_reviewer",
                "constraints": ["Do not implement fixes during review"],
                "style": {"tone": "direct", "verbosity": "medium"},
                "decision_policy": {"escalation_triggers": ["Expected behavior is unclear"]},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "agents" / "reviewer.yaml").write_text(
        yaml.safe_dump(
            {
                "agent_id": "reviewer",
                "version": "0.1",
                "name": "Reviewer",
                "role": "strict_reviewer",
                "skills": ["review"],
                "tools": ["filesystem"],
                "executor": {"kind": "cli", "provider": "claude"},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    (registry_root / "templates" / "review.yaml").write_text(
        yaml.safe_dump(
            {
                "template_id": "review",
                "version": "0.1",
                "name": "Review",
                "parameters": {"goal": {"type": "string", "required": True}},
                "agents": [{"id": "reviewer", "ref": "reviewer"}],
                "flow": {"entrypoint": "reviewer", "edges": [{"from": "reviewer", "to": "END", "type": "final"}]},
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    registry = SpecRegistry.load_from_root(registry_root)
    role = registry.get_role("strict_reviewer")
    assert role.objectives == ["Find important risk"]
    assert role.constraints == ["Do not implement fixes during review"]
    assert role.decision_policy.priorities == ["risk first"]
    assert role.decision_policy.escalation_triggers == ["Expected behavior is unclear"]

    workflow = TemplateCompiler(registry).compile(registry.get_template("review"), parameters={"goal": "Audit release"})
    prompt = workflow.nodes[0].config["prompt"]
    assert "Objectives:" in prompt
    assert "Decision Priorities:" in prompt
    assert "Escalate When:" in prompt
    assert "Style: tone=direct, verbosity=medium" in prompt


def test_cli_compile_command_outputs_compiled_workflow_json():
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "compile",
            "--template",
            "docs-review-template",
            "--registry-root",
            str(EXAMPLE_REGISTRY_ROOT),
            "--var",
            "goal=Audit docs landing page",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["workflow_id"] == "docs-review-template"
    assert payload["entrypoint"] == "reviewer"
    assert payload["nodes"][0]["config"]["prompt"] == "Review the docs for goal: Audit docs landing page"


def test_cli_registry_commands_expose_example_registry():
    counts_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "registry",
            "counts",
            "--registry-root",
            str(EXAMPLE_REGISTRY_ROOT),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert counts_completed.returncode == 0, counts_completed.stderr
    counts_payload = json.loads(counts_completed.stdout)
    assert counts_payload["tools"] >= 1
    assert counts_payload["templates"] >= 1

    list_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "registry",
            "list",
            "--registry-root",
            str(EXAMPLE_REGISTRY_ROOT),
            "--kind",
            "agents",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert list_completed.returncode == 0, list_completed.stderr
    list_payload = json.loads(list_completed.stdout)
    assert any(item["agent_id"] == "docs_reviewer" for item in list_payload)

    get_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "registry",
            "get",
            "--registry-root",
            str(EXAMPLE_REGISTRY_ROOT),
            "--kind",
            "templates",
            "--id",
            "docs-review-template",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert get_completed.returncode == 0, get_completed.stderr
    get_payload = json.loads(get_completed.stdout)
    assert get_payload["template_id"] == "docs-review-template"


def test_cli_init_commands_scaffold_specs_and_support_compile(tmp_path):
    registry_root = tmp_path / "registry"

    tool_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "tool",
            "--registry-root",
            str(registry_root),
            "--id",
            "filesystem",
            "--kind",
            "builtin",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert tool_completed.returncode == 0, tool_completed.stderr

    role_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "role",
            "--registry-root",
            str(registry_root),
            "--id",
            "reviewer",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert role_completed.returncode == 0, role_completed.stderr

    skill_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "skill",
            "--registry-root",
            str(registry_root),
            "--id",
            "docs_review",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert skill_completed.returncode == 0, skill_completed.stderr

    agent_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "agent",
            "--registry-root",
            str(registry_root),
            "--id",
            "docs_reviewer",
            "--role",
            "reviewer",
            "--skill",
            "docs_review",
            "--tool",
            "filesystem",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert agent_completed.returncode == 0, agent_completed.stderr

    template_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "template",
            "--registry-root",
            str(registry_root),
            "--id",
            "docs_review_template",
            "--agent-ref",
            "docs_reviewer",
            "--agent-node-id",
            "reviewer",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert template_completed.returncode == 0, template_completed.stderr

    compile_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "compile",
            "--template",
            "docs_review_template",
            "--registry-root",
            str(registry_root),
            "--var",
            "goal=Review docs quickly",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert compile_completed.returncode == 0, compile_completed.stderr
    workflow_payload = json.loads(compile_completed.stdout)
    assert workflow_payload["workflow_id"] == "docs_review_template"
    assert workflow_payload["nodes"][0]["config"]["agent_ref"] == "docs_reviewer"
    assert workflow_payload["edges"][0]["to"] == "END"


def test_cli_compile_supports_summary_json():
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "compile",
            "--template",
            "docs-review-template",
            "--registry-root",
            str(EXAMPLE_REGISTRY_ROOT),
            "--var",
            "goal=Audit docs landing page",
            "--summary",
            "json",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["workflow"]["workflow_id"] == "docs-review-template"
    assert payload["summary"]["entrypoint"] == "reviewer"
    assert payload["summary"]["node_count"] == 1


def test_cli_presets_list_and_init_workflow(tmp_path):
    registry_root = tmp_path / "preset-registry"
    workflow_output = tmp_path / "compiled" / "review.yaml"

    presets_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "presets",
            "list",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert presets_completed.returncode == 0, presets_completed.stderr
    presets_payload = json.loads(presets_completed.stdout)
    assert any(item["preset_id"] == "single-reviewer" for item in presets_payload)

    patterns_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "patterns",
            "list",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert patterns_completed.returncode == 0, patterns_completed.stderr
    patterns_payload = json.loads(patterns_completed.stdout)
    assert any(item["preset_id"] == "single-reviewer" for item in patterns_payload)

    init_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "workflow",
            "--registry-root",
            str(registry_root),
            "--id",
            "docs_review_pack",
            "--pattern",
            "single-reviewer",
            "--goal",
            "Review the docs",
            "--output",
            str(workflow_output),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert init_completed.returncode == 0, init_completed.stderr
    init_payload = json.loads(init_completed.stdout)
    assert init_payload["summary"]["workflow_id"] == "docs_review_pack"
    assert workflow_output.exists()
    compiled_payload = yaml.safe_load(workflow_output.read_text(encoding="utf-8"))
    assert compiled_payload["workflow_id"] == "docs_review_pack"
    assert compiled_payload["nodes"][0]["config"]["executor"]["provider"] == "claude"


def test_cli_init_workflow_supports_assignment_overrides(tmp_path):
    registry_root = tmp_path / "preset-registry"
    workflow_output = tmp_path / "compiled" / "review.yaml"

    init_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "workflow",
            "--registry-root",
            str(registry_root),
            "--id",
            "feature_lane",
            "--preset",
            "planner-coder-reviewer",
            "--goal",
            "Ship a feature safely",
            "--assign",
            "planner.focus=Only define the execution milestones",
            "--assign",
            "reviewer.owned_topics=regression,tests",
            "--output",
            str(workflow_output),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert init_completed.returncode == 0, init_completed.stderr
    payload = json.loads(init_completed.stdout)
    reviewer_summary = next(item for item in payload["summary"]["agents"] if item["node_id"] == "reviewer")
    assert reviewer_summary["assignment"]["owned_topics"] == ["regression", "tests"]
    compiled_payload = yaml.safe_load(workflow_output.read_text(encoding="utf-8"))
    planner_node = next(node for node in compiled_payload["nodes"] if node["id"] == "planner")
    reviewer_node = next(node for node in compiled_payload["nodes"] if node["id"] == "reviewer")
    assert planner_node["config"]["assignment"]["focus"] == "Only define the execution milestones"
    assert reviewer_node["config"]["assignment"]["owned_topics"] == ["regression", "tests"]
    assert "Current Assignment:" in planner_node["config"]["prompt"]


def test_cli_role_presets_and_init_role_with_preset(tmp_path):
    registry_root = tmp_path / "role-registry"

    presets_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "role-presets",
            "list",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert presets_completed.returncode == 0, presets_completed.stderr
    presets_payload = json.loads(presets_completed.stdout)
    assert any(item["preset_id"] == "reviewer" for item in presets_payload)

    init_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "role",
            "--registry-root",
            str(registry_root),
            "--id",
            "strict_reviewer",
            "--preset",
            "reviewer",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert init_completed.returncode == 0, init_completed.stderr
    role_payload = yaml.safe_load((registry_root / "roles" / "strict_reviewer.yaml").read_text(encoding="utf-8"))
    assert role_payload["metadata"]["preset_id"] == "reviewer"
    assert role_payload["decision_policy"]["priorities"]
    assert role_payload["collaboration"]["handoff_outputs"]


def test_cli_scaffold_non_interactive_materializes_preset_and_compiles(tmp_path):
    registry_root = tmp_path / "scaffold-registry"
    workflow_output = tmp_path / "compiled" / "workflow.yaml"

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "scaffold",
            "--registry-root",
            str(registry_root),
            "--preset",
            "planner-coder-reviewer",
            "--workflow-id",
            "feature_lane",
            "--goal",
            "Ship a safe feature plan",
            "--provider",
            "codex",
            "--executor-kind",
            "cli",
            "--output",
            str(workflow_output),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["preset_id"] == "planner-coder-reviewer"
    assert payload["summary"]["node_count"] == 3
    assert workflow_output.exists()
    compiled_payload = yaml.safe_load(workflow_output.read_text(encoding="utf-8"))
    assert compiled_payload["entrypoint"] == "planner"
    assert len(compiled_payload["nodes"]) == 3


def test_cli_init_workflow_supports_task_kind_pattern_recommendation(tmp_path):
    registry_root = tmp_path / "taskkind-registry"
    workflow_output = tmp_path / "compiled" / "workflow.yaml"

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "workflow",
            "--registry-root",
            str(registry_root),
            "--id",
            "research_lane",
            "--task-kind",
            "research",
            "--goal",
            "Collect evidence and package a final summary",
            "--output",
            str(workflow_output),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["preset_id"] == "research-review-publish"
    compiled_payload = yaml.safe_load(workflow_output.read_text(encoding="utf-8"))
    assert compiled_payload["entrypoint"] == "research"


def test_cli_init_workflow_does_not_materialize_registry_when_output_exists(tmp_path):
    registry_root = tmp_path / "atomic-registry"
    workflow_output = tmp_path / "compiled" / "existing.yaml"
    workflow_output.parent.mkdir(parents=True, exist_ok=True)
    workflow_output.write_text("already here", encoding="utf-8")

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "init",
            "workflow",
            "--registry-root",
            str(registry_root),
            "--id",
            "docs_review_pack",
            "--pattern",
            "single-reviewer",
            "--goal",
            "Review the docs",
            "--output",
            str(workflow_output),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode != 0
    assert "workflow output already exists" in completed.stderr
    assert not registry_root.exists()


def test_cli_registry_export_and_import_round_trip(tmp_path):
    export_root = tmp_path / "exported"
    imported_root = tmp_path / "imported"

    export_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "registry",
            "export",
            "--registry-root",
            str(EXAMPLE_REGISTRY_ROOT),
            "--output-root",
            str(export_root),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert export_completed.returncode == 0, export_completed.stderr
    export_payload = json.loads(export_completed.stdout)
    assert export_payload["written"]

    import_completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "registry",
            "import",
            "--registry-root",
            str(imported_root),
            "--source-root",
            str(export_root),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert import_completed.returncode == 0, import_completed.stderr
    imported_registry = SpecRegistry.load_from_root(imported_root)
    assert "docs_reviewer" in imported_registry.agents
    assert "docs-review-template" in imported_registry.templates
