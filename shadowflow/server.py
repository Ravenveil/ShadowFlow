import logging
import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Dict, List

from shadowflow.runtime import (
    ActivationTrainingDataset,
    ArtifactLineageProjection,
    ChatMessageRequest,
    ChatSession,
    ChatSessionCreateRequest,
    ChatSessionRecord,
    ChatTurnResult,
    ChildRunRequest,
    CheckpointLineageProjection,
    MemoryRelationProjection,
    ResumeRequest,
    RunGraph,
    RunResult,
    RunSummary,
    RuntimeRequest,
    RuntimeService,
    TaskTreeProjection,
    WorkflowDefinition,
    WorkflowGraph,
)

logger = logging.getLogger("shadowflow.server")

app = FastAPI(title="ShadowFlow API", version="0.3.0")
runtime_service = RuntimeService()

# Story 0.1 AC2: start even when API keys are absent (BYOK policy, S1 red line).
# Keys are primarily supplied by the browser via localStorage; server-side slots
# exist only for offline bridge / CLI smoke. Missing keys surface as a warning.
_OPTIONAL_KEYS = ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY")


def _detect_missing_keys() -> List[str]:
    return [k for k in _OPTIONAL_KEYS if not os.environ.get(k)]


@app.on_event("startup")
async def _warn_on_missing_keys() -> None:
    missing = _detect_missing_keys()
    app.state.missing_keys = missing
    if missing:
        # Never log key values — only the names. Respects Cross-Cutting Security.
        logger.warning(
            "ShadowFlow starting without server-side keys: %s. "
            "UI will prompt the user to paste keys into localStorage (BYOK).",
            ", ".join(missing),
        )
    else:
        logger.info("ShadowFlow starting with all optional server-side keys present.")


@app.middleware("http")
async def _missing_key_warning_header(request: Request, call_next):
    response = await call_next(request)
    missing = getattr(app.state, "missing_keys", None)
    if missing:
        # Clients (including the web UI) can read this header to decide whether
        # to prompt the user for a localStorage key. Comma-separated for easy parsing.
        response.headers["X-Shadowflow-Warning"] = "API key missing: " + ",".join(missing)
    return response


# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    payload: Dict[str, Any] = {
        "name": "ShadowFlow",
        "version": "0.3.0",
        "status": "running",
        "capabilities": {
            "runtime": True,
            "workflow_graph": True,
            "run_panel": True,
            "chat_session": True,
        },
    }
    missing = getattr(app.state, "missing_keys", None)
    if missing:
        payload["warning"] = "API key missing"
        payload["missing_keys"] = missing
    return payload

@app.post("/workflow/validate")
async def validate_workflow(workflow: WorkflowDefinition):
    try:
        return runtime_service.validate_workflow(workflow)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/workflow/run", response_model=RunResult)
async def run_workflow(request: RuntimeRequest):
    try:
        return await runtime_service.run(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflow/graph", response_model=WorkflowGraph)
async def export_workflow_graph(workflow: WorkflowDefinition):
    try:
        return runtime_service.export_workflow_graph(workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/runs", response_model=List[RunSummary])
async def list_runs():
    return runtime_service.list_runs()


@app.get("/runs/{run_id}", response_model=RunResult)
async def get_run(run_id: str):
    result = runtime_service.get_run(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.post("/runs/{run_id}/children", response_model=RunResult)
async def spawn_child_run(run_id: str, request: ChildRunRequest):
    try:
        return await runtime_service.spawn_child_run(run_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/runs/{run_id}/graph", response_model=RunGraph)
async def get_run_graph(run_id: str):
    result = runtime_service.export_run_graph(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/task-tree", response_model=TaskTreeProjection)
async def get_task_tree(run_id: str):
    result = runtime_service.export_task_tree(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/artifact-lineage", response_model=ArtifactLineageProjection)
async def get_artifact_lineage(run_id: str):
    result = runtime_service.export_artifact_lineage(run_id=run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/memory-graph", response_model=MemoryRelationProjection)
async def get_memory_relation_graph(run_id: str):
    result = runtime_service.export_memory_relation_graph(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/checkpoint-lineage", response_model=CheckpointLineageProjection)
async def get_checkpoint_lineage(run_id: str):
    result = runtime_service.export_checkpoint_lineage(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/training-dataset", response_model=ActivationTrainingDataset)
async def get_activation_training_dataset(run_id: str):
    result = runtime_service.export_activation_training_dataset(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/checkpoints/{checkpoint_id}")
async def get_checkpoint(checkpoint_id: str):
    checkpoint = runtime_service.get_checkpoint(checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail=f"Checkpoint not found: {checkpoint_id}")
    return checkpoint


@app.post("/runs/{run_id}/resume", response_model=RunResult)
async def resume_run(run_id: str, request: ResumeRequest):
    try:
        return await runtime_service.resume(run_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/chat/sessions", response_model=List[ChatSessionRecord])
async def list_chat_sessions():
    return runtime_service.list_chat_sessions()


@app.post("/chat/sessions", response_model=ChatSession)
async def create_chat_session(request: ChatSessionCreateRequest):
    try:
        return runtime_service.create_chat_session(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/chat/sessions/{session_id}", response_model=ChatSession)
async def get_chat_session(session_id: str):
    session = runtime_service.get_chat_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Chat session not found: {session_id}")
    return session


@app.post("/chat/sessions/{session_id}/messages", response_model=ChatTurnResult)
async def send_chat_message(session_id: str, request: ChatMessageRequest):
    try:
        return await runtime_service.send_chat_message(session_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/health")
async def health():
    return {"status": "healthy", "runtime": "contract"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
