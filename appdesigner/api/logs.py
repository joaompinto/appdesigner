import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from typing import Dict

router = APIRouter()

def get_logs_dir() -> Path:
    logs_dir = os.environ.get("LOGS_DIR")
    if not logs_dir:
        raise HTTPException(status_code=500, detail="Logs directory not configured")
    return Path(logs_dir)

@router.get("/logs")
async def get_logs() -> Dict[str, str]:
    logs_dir = get_logs_dir()
    stdout_file = logs_dir / "managed_app_stdout.log"
    stderr_file = logs_dir / "managed_app_stderr.log"
    
    logs = []
    
    for log_file in [stdout_file, stderr_file]:
        if log_file.exists():
            try:
                with open(log_file) as f:
                    content = f.read()
                    if content:
                        logs.append(f"=== {log_file.name} ===")
                        logs.append(content)
            except Exception as e:
                logs.append(f"Error reading {log_file.name}: {str(e)}")
    
    return {"logs": "\n".join(logs) if logs else "No logs available"}