import threading
from pathlib import Path
import typer
import logging
from typing import Optional
import uvicorn
import requests
import time
import sys
import signal
import shutil
import subprocess
import json
import os
import tempfile
from rich.console import Console
from rich.prompt import Confirm

logger = logging.getLogger(__name__)
app = typer.Typer()
console = Console()

class ProcessManager:
    def __init__(self):
        self.processes = []
        self.running = True
        signal.signal(signal.SIGINT, self.handle_shutdown)
        signal.signal(signal.SIGTERM, self.handle_shutdown)
        
    def add_process(self, process):
        self.processes.append(process)
        
    def handle_shutdown(self, signum, frame):
        console.log("\n[bold red]Force terminating processes...[/bold red]")
        self.running = False
        for process in self.processes:
            if process.poll() is None:  # If process is still running
                try:
                    process.kill()  # Force kill immediately
                    console.log(f"[red]Killed process {process.pid}[/red]")
                except Exception as e:
                    console.log(f"[red]Error killing process: {e}[/red]")
        sys.exit(1)  # Exit with error code to ensure everything stops

def copy_starter_template(target_dir: Path) -> bool:
    starter_dir = Path(__file__).parent.parent / 'starter'
    if not starter_dir.exists():
        console.log("[bold red]Starter template directory not found[/bold red]")
        return False
    try:
        shutil.copytree(starter_dir, target_dir)
        console.log(f"[bold green]Created new app directory from template: {target_dir}[/bold green]")
        return True
    except Exception as e:
        console.log(f"[bold red]Failed to create app directory: {e}[/bold red]")
        return False

def start_managed_app(process_manager, managed_app_dir: Path, port: int, logs_dir: Path):
    stdout_file = logs_dir / "managed_app_stdout.log"
    stderr_file = logs_dir / "managed_app_stderr.log"
    
    while process_manager.running:
        console.log(f"[bold blue]Starting managed app from directory: {managed_app_dir} on port {port}[/bold blue]")
        console.log(f"[blue]Log files:[/blue]")
        console.log(f"  [dim]stdout:[/dim] {stdout_file}")
        console.log(f"  [dim]stderr:[/dim] {stderr_file}")
        
        with open(stdout_file, 'w') as stdout_f, open(stderr_file, 'w') as stderr_f:
            process = subprocess.Popen(
                ["uvicorn", "main:app", "--reload", "--port", str(port)],
                stdout=stdout_f,
                stderr=stderr_f,
                cwd=managed_app_dir
            )
            process_manager.add_process(process)
            
            while process_manager.running and process.poll() is None:
                time.sleep(1)
            
            if not process_manager.running:
                break

def start_designer_app(process_manager, port: int, managed_app_dir: Path, logs_dir: Path):
    script_dir = Path(__file__).parent
    while process_manager.running:
        console.log(f"[bold blue]Starting designer app from directory: {script_dir} on port {port}[/bold blue]")
        process = subprocess.Popen(
            ["uvicorn", "main:app", "--reload", "--port", str(port)],
            env={
                **os.environ,
                "MANAGED_APP_DIR": str(managed_app_dir),
                "LOGS_DIR": str(logs_dir)
            },
            cwd=script_dir
        )
        process_manager.add_process(process)
        
        while process_manager.running and process.poll() is None:
            time.sleep(1)
            
        if not process_manager.running:
            break

def get_logs_dir() -> Path:
    """Create and return a temporary directory for logs."""
    logs_dir = Path(tempfile.mkdtemp(prefix="appdesigner_logs_"))
    return logs_dir

def manage_processes(managed_app_dir: Path, managed_app_port: int, designer_app_port: int, start_managed_app: bool = False):
    # Create temporary logs directory
    logs_dir = get_logs_dir()
    process_manager = ProcessManager()
    
    try:
        designer_app = threading.Thread(
            target=start_designer_app, 
            args=(process_manager, designer_app_port, managed_app_dir, logs_dir),
            daemon=True
        )
        
        if start_managed_app:
            managed_app = threading.Thread(
                target=start_managed_app, 
                args=(process_manager, managed_app_dir, managed_app_port, logs_dir),
                daemon=True
            )
            managed_app.start()
        
        designer_app.start()
        
        while process_manager.running:
            if not designer_app.is_alive():
                console.log("[bold red]Designer app has stopped unexpectedly[/bold red]")
                process_manager.handle_shutdown(None, None)
            time.sleep(1)
    except KeyboardInterrupt:
        process_manager.handle_shutdown(None, None)
    finally:
        # Clean up temporary logs directory
        shutil.rmtree(logs_dir, ignore_errors=True)

@app.command()
def run(
    managed_app_dir: Path,
    managed_app_port: int = 8000,
    designer_app_port: int = 8001,
    start_managed_app: bool = False
):
    if not managed_app_dir.exists():
        console.log(f"[bold red]Managed app directory {managed_app_dir} does not exist[/bold red]")
        if Confirm.ask("[bold yellow]Managed app directory does not exist. Do you want to create it from the starter template?[/bold yellow]"):
            if not copy_starter_template(managed_app_dir):
                console.log("[bold red]Failed to create managed app directory from starter template[/bold red]")
                sys.exit(1)
        else:
            sys.exit(1)

    manage_processes(managed_app_dir, managed_app_port, designer_app_port, start_managed_app)

if __name__ == "__main__":
    app()
