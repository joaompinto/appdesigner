
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
    
    if stdout_file.exists():
        with open(stdout_file) as f:
            logs.extend(f.readlines())
    
    if stderr_file.exists():
        with open(stderr_file) as f:
            logs.extend(f.readlines())
            
    return {"logs": "".join(logs)}