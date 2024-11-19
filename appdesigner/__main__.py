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

def start_managed_app(managed_app_dir: Path, port: int, logs_dir: Path):
    stdout_file = logs_dir / "managed_app_stdout.log"
    stderr_file = logs_dir / "managed_app_stderr.log"
    
    while True:
        console.log(f"[bold blue]Starting managed app from directory: {managed_app_dir} on port {port}[/bold blue]")
        console.log(f"[bold blue]Logs will be written to: {logs_dir}[/bold blue]")
        
        with open(stdout_file, 'w') as stdout_f, open(stderr_file, 'w') as stderr_f:
            process = subprocess.Popen(
                ["uvicorn", "main:app", "--reload", "--port", str(port)],
                stdout=stdout_f,
                stderr=stderr_f,
                cwd=managed_app_dir
            )
            process.wait()
            
            if stdout_file.exists():
                with open(stdout_file) as f:
                    output = f.read()
                    if output:
                        console.log(f"[bold green]Managed app output: {output}[/bold green]")
            
            if stderr_file.exists():
                with open(stderr_file) as f:
                    errors = f.read()
                    if errors:
                        console.log(f"[bold red]Managed app error: {errors}[/bold red]")
        
        time.sleep(5)

def start_designer_app(port: int, managed_app_dir: Path, logs_dir: Path):
    script_dir = Path(__file__).parent
    while True:
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
        process.wait()
        if process.returncode != 0:
            console.log("[bold red]Designer app failed to start[/bold red]")
            sys.exit(1)
        time.sleep(5)

def manage_processes(managed_app_dir: Path, managed_app_port: int, designer_app_port: int):
    logs_dir = Path(tempfile.mkdtemp(prefix="appdesigner_logs_"))
    
    managed_app = threading.Thread(
        target=start_managed_app, 
        args=(managed_app_dir, managed_app_port, logs_dir),
        daemon=True
    )
    designer_app = threading.Thread(
        target=start_designer_app, 
        args=(designer_app_port, managed_app_dir, logs_dir),
        daemon=True
    )
    
    managed_app.start()
    designer_app.start()
        
    try:
        while True:
            if not designer_app.is_alive():
                console.log("[bold red]Designer app has stopped unexpectedly[/bold red]")
                sys.exit(1)
            time.sleep(1)
    except KeyboardInterrupt:
        console.log("[bold yellow]Terminating applications...[/bold yellow]")
        shutil.rmtree(logs_dir, ignore_errors=True)
        sys.exit(0)

@app.command()
def run(managed_app_dir: Path, managed_app_port: int = 8000, designer_app_port: int = 8001):
    if not managed_app_dir.exists():
        console.log(f"[bold red]Managed app directory {managed_app_dir} does not exist[/bold red]")
        if Confirm.ask("[bold yellow]Managed app directory does not exist. Do you want to create it from the starter template?[/bold yellow]"):
            if not copy_starter_template(managed_app_dir):
                console.log("[bold red]Failed to create managed app directory from starter template[/bold red]")
                sys.exit(1)
        else:
            sys.exit(1)

    manage_processes(managed_app_dir, managed_app_port, designer_app_port)

if __name__ == "__main__":
    app()
