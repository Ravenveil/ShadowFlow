from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Dict, List

from agentgraph.runtime import (
    ChatMessageRequest,
    ChatSession,
    ChatSessionCreateRequest,
    ChatSessionRecord,
    ChatTurnResult,
    ResumeRequest,
    RunGraph,
    RunResult,
    RunSummary,
    RuntimeRequest,
    RuntimeService,
    WorkflowDefinition,
    WorkflowGraph,
)

app = FastAPI(title="AgentGraph API", version="0.1.0")
runtime_service = RuntimeService()

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
    return {
        "name": "AgentGraph",
        "version": "0.1.0",
        "status": "running",
        "capabilities": {
            "runtime": True,
            "workflow_graph": True,
            "run_panel": True,
            "chat_session": True,
        },
    }

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


@app.get("/runs/{run_id}/graph", response_model=RunGraph)
async def get_run_graph(run_id: str):
    result = runtime_service.export_run_graph(run_id)
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
