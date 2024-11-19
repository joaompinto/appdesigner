import os
import signal
import psutil
import uvicorn
import requests
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from multiprocessing import Process
from datetime import datetime

class ProcessConfig(BaseModel):
    app_path: str
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = True
    initial_dir: Optional[str] = None

class ProcessInfo(BaseModel):
    pid: int
    app_path: str
    host: str
    port: int
    start_time: datetime
    status: str
    initial_dir: Optional[str] = None

app = FastAPI()
process_manager = None

class ProcessManager:
    def __init__(self):
        self.processes: Dict[int, ProcessInfo] = {}

    def start_uvicorn(self, config: ProcessConfig) -> Process:
        def run_server():
            if config.initial_dir:
                original_dir = os.getcwd()
                os.chdir(config.initial_dir)
            
            # Redirect stdin to /dev/null to avoid file descriptor issues
            with open(os.devnull, 'r') as devnull:
                os.dup2(devnull.fileno(), sys.stdin.fileno())
                
            try:
                uvicorn.run(
                    app=config.app_path,
                    host=config.host,
                    port=config.port,
                    reload=config.reload,
                    reload_includes=['*.py', '*.html', '*.js', '*.css'],  # Add file patterns to watch
                    log_level="info"
                )
            finally:
                if config.initial_dir:
                    os.chdir(original_dir)

        # Create process with new file descriptors
        process = Process(target=run_server)
        process.daemon = True  # Make process daemonic
        process.start()
        
        self.processes[process.pid] = ProcessInfo(
            pid=process.pid,
            app_path=config.app_path,
            host=config.host,
            port=config.port,
            start_time=datetime.now(),
            status="running",
            initial_dir=config.initial_dir
        )
        
        return process

    def stop_process(self, pid: int):
        if pid not in self.processes:
            raise ValueError(f"Process {pid} not found")

        try:
            process = psutil.Process(pid)
            process.terminate()
            process.wait(timeout=5)
            del self.processes[pid]
        except psutil.NoSuchProcess:
            del self.processes[pid]
        except psutil.TimeoutExpired:
            os.kill(pid, signal.SIGKILL)
            del self.processes[pid]

    def cleanup(self):
        for pid in list(self.processes.keys()):
            try:
                self.stop_process(pid)
            except Exception:
                continue

    def get_process_info(self, pid: int) -> Optional[ProcessInfo]:
        return self.processes.get(pid)

    def check_process_health(self, pid: int) -> bool:
        try:
            process = psutil.Process(pid)
            return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
        except psutil.NoSuchProcess:
            return False

    def get_process_status(self, pid: int) -> dict:
        info = self.get_process_info(pid)
        if not info:
            return {"status": "not_found"}
        
        is_healthy = self.check_process_health(pid)
        if not is_healthy:
            self.stop_process(pid)
            return {"status": "terminated"}
            
        return {"status": "running", "info": info.dict()}

@app.on_event("startup")
async def startup_event():
    global process_manager
    process_manager = ProcessManager()

@app.on_event("shutdown")
async def shutdown_event():
    if process_manager:
        process_manager.cleanup()

@app.post("/process/start")
async def start_process(config: ProcessConfig):
    try:
        process = process_manager.start_uvicorn(config)
        return {"status": "success", "pid": process.pid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/stop/{pid}")
async def stop_process(pid: int):
    try:
        process_manager.stop_process(pid)
        return {"status": "success", "message": f"Process {pid} stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/process/list")
async def list_processes():
    return {
        "processes": [
            {
                "pid": pid,
                "info": process.dict()
            } for pid, process in process_manager.processes.items()
        ]
    }

@app.get("/process/health/{pid}")
async def check_process_health(pid: int):
    try:
        status = process_manager.get_process_status(pid)
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)