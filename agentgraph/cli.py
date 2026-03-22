import argparse
import asyncio
import json
import sys
from pathlib import Path

import yaml

from agentgraph.runtime import RuntimeRequest, RuntimeService, WorkflowDefinition


runtime_service = RuntimeService()


def _load_workflow_definition(workflow_path: str) -> WorkflowDefinition:
    path = Path(workflow_path)
    with path.open("r", encoding="utf-8") as handle:
        if path.suffix.lower() in {".yaml", ".yml"}:
            payload = yaml.safe_load(handle)
        else:
            payload = json.load(handle)
    return WorkflowDefinition.model_validate(payload)


def _parse_input_payload(input_value: str) -> dict:
    try:
        parsed = json.loads(input_value)
    except json.JSONDecodeError:
        return {"message": input_value}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


async def validate_workflow(workflow_path: str) -> int:
    workflow = _load_workflow_definition(workflow_path)
    validation = runtime_service.validate_workflow(workflow)
    print(validation.model_dump_json(indent=2))
    return 0 if validation.valid else 1


async def run_workflow(workflow_path: str, input_value: str, user_id: str):
    workflow = _load_workflow_definition(workflow_path)
    request = RuntimeRequest(
        workflow=workflow,
        input=_parse_input_payload(input_value),
        metadata={"source_system": "cli", "user_id": user_id},
    )
    result = await runtime_service.run(request)
    print(result.model_dump_json(indent=2))
    return 0

def main():
    parser = argparse.ArgumentParser(description="AgentGraph CLI")
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    validate_parser = subparsers.add_parser('validate', help='Validate a workflow contract')
    validate_parser.add_argument('-w', '--workflow', required=True, help='Workflow JSON/YAML file')

    run_parser = subparsers.add_parser('run', help='Run a workflow')
    run_parser.add_argument('-w', '--workflow', required=True, help='Workflow JSON/YAML file')
    run_parser.add_argument('-i', '--input', required=True, help='Input text or JSON object')
    run_parser.add_argument('-u', '--user-id', default='default', help='User ID')
    
    serve_parser = subparsers.add_parser('serve', help='Start HTTP server')
    serve_parser.add_argument('--port', type=int, default=8000, help='Server port')
    serve_parser.add_argument('--host', default='0.0.0.0', help='Server host')
    
    args = parser.parse_args()
    
    if args.command == 'validate':
        sys.exit(asyncio.run(validate_workflow(args.workflow)))
    elif args.command == 'run':
        sys.exit(asyncio.run(run_workflow(args.workflow, args.input, args.user_id)))
    elif args.command == 'serve':
        from agentgraph.server import app
        import uvicorn
        uvicorn.run(app, host=args.host, port=args.port)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
