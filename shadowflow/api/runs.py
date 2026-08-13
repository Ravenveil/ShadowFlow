"""Runs projection API — 暴露 RuntimeService 的 6 个 projection 端点.

对应前端 src/api/runs.ts 的 6 个端点：
  GET /api/runs/{runId}/graph              → workflow execution graph
  GET /api/runs/{runId}/task-tree          → task tree projection
  GET /api/runs/{runId}/artifact-lineage   → artifact lineage graph
  GET /api/runs/{runId}/memory-graph       → memory relation graph
  GET /api/runs/{runId}/checkpoint-lineage → checkpoint lineage graph
  GET /api/runs/{runId}/training-dataset   → activation training dataset

数据来源：RuntimeService 的 export_* 方法（已实现，缺 HTTP 端点）。
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

from shadowflow.runtime.service import RuntimeService, get_service

router = APIRouter(tags=["runs"])


def _envelope(data: Any, **meta: Any) -> Dict[str, Any]:
    """统一返回格式 envelope."""
    return {"data": data, "meta": meta}


def _get_runtime() -> RuntimeService:
    """获取 RuntimeService singleton."""
    svc = get_service()
    if svc is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "RUNTIME_UNAVAILABLE",
                    "message": "RuntimeService not initialized",
                }
            },
        )
    return svc


@router.get("/runs/{run_id}/graph")
async def get_run_graph(run_id: str) -> Dict[str, Any]:
    """Get workflow execution graph for a run.

    Returns:
        RunGraph projection with nodes (workflow nodes) and edges (control flow).
    """
    runtime = _get_runtime()

    # 获取 workflow definition（从 RuntimeRequest 中获取）
    request = runtime.get_request_context(run_id)
    if request is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run {run_id!r} not found"}},
        )

    # 使用 RuntimeService 的 export_workflow_graph
    graph = runtime.export_workflow_graph(workflow=request.workflow)
    return _envelope(graph.model_dump(mode="json") if hasattr(graph, "model_dump") else graph)


@router.get("/runs/{run_id}/task-tree")
async def get_task_tree(run_id: str) -> Dict[str, Any]:
    """Get task tree projection for a run.

    Returns:
        TaskTreeProjection with run/task/step hierarchy.
    """
    runtime = _get_runtime()
    projection = runtime.export_task_tree(run_id)
    if projection is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run {run_id!r} not found"}},
        )

    return _envelope(projection.model_dump(mode="json"))


@router.get("/runs/{run_id}/artifact-lineage")
async def get_artifact_lineage(run_id: str) -> Dict[str, Any]:
    """Get artifact lineage graph for a run.

    Returns:
        ArtifactLineageProjection with artifact ancestry edges.
    """
    runtime = _get_runtime()
    projection = runtime.export_artifact_lineage(run_id=run_id)
    if projection is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run {run_id!r} not found"}},
        )

    return _envelope(projection.model_dump(mode="json"))


@router.get("/runs/{run_id}/memory-graph")
async def get_memory_graph(run_id: str) -> Dict[str, Any]:
    """Get memory relation graph for a run.

    Returns:
        MemoryRelationProjection with memory event/handoff/activation edges.
    """
    runtime = _get_runtime()
    projection = runtime.export_memory_relation_graph(run_id)
    if projection is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run {run_id!r} not found"}},
        )

    return _envelope(projection.model_dump(mode="json"))


@router.get("/runs/{run_id}/checkpoint-lineage")
async def get_checkpoint_lineage(run_id: str) -> Dict[str, Any]:
    """Get checkpoint lineage graph for a run.

    Returns:
        CheckpointLineageProjection with checkpoint ancestry edges.
    """
    runtime = _get_runtime()
    projection = runtime.export_checkpoint_lineage(run_id)
    if projection is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run {run_id!r} not found"}},
        )

    return _envelope(projection.model_dump(mode="json"))


@router.get("/runs/{run_id}/training-dataset")
async def get_training_dataset(run_id: str) -> Dict[str, Any]:
    """Get activation training dataset for a run.

    Returns:
        ActivationTrainingDataset with activation samples for RL training.
    """
    runtime = _get_runtime()
    projection = runtime.export_activation_training_dataset(run_id)
    if projection is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run {run_id!r} not found"}},
        )

    return _envelope(projection.model_dump(mode="json"))
