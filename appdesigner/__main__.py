import multiprocessing
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
from .processmanager import app as process_manager_app
from .appcontroller import start_managed_app
import json
import os

logger = logging.getLogger(__name__)
app = typer.Typer()

def copy_starter_template(target_dir: Path) -> bool:
    starter_dir = Path(__file__).parent / 'starter'
    if not starter_dir.exists():
        logger.error("Starter template directory not found")
        return False
    try:
        shutil.copytree(starter_dir, target_dir)
        logger.info(f"Created new app directory from template: {target_dir}")
        return True
    except Exception as e:
        logger.error(f"Failed to create app directory: {e}")
        return False

class ServerLauncher:
    def __init__(self):
        self.process_manager = None
        self.managed_app_pid = None
        self.main_app_pid = None
        self.manager_url = None
        self.main_app_url = None

    def start_process_manager(self, port: int = 5000) -> bool:
        try:
            # Redirect stdin to /dev/null for the process manager
            with open(os.devnull, 'r') as devnull:
                os.dup2(devnull.fileno(), sys.stdin.fileno())
                
            self.process_manager = multiprocessing.Process(
                target=uvicorn.run,
                args=(process_manager_app,),
                kwargs={
                    "host": "127.0.0.1",
                    "port": port,
                    "log_level": "error",
                    "reload": True
                }
            )
            self.process_manager.daemon = True
            self.process_manager.start()
            self.manager_url = f"http://localhost:{port}"
            return self._wait_for_manager(port)
        except Exception as e:
            logger.error(f"Failed to start ProcessManager: {e}")
            return False

    def _wait_for_manager(self, port: int, timeout: int = 10) -> bool:
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                requests.get(f"http://localhost:{port}/process/list")
                return True
            except requests.exceptions.ConnectionError:
                time.sleep(0.1)
        return False

    def start_managed_app(self, app_dir: Path) -> bool:
        if not app_dir.exists():
            logger.warning(f"App directory does not exist: {app_dir}")
            if typer.confirm("Create new app from starter template?"):
                if not copy_starter_template(app_dir):
                    return False
            else:
                return False

        try:
            config = {
                "app_path": "main:app",
                "host": "127.0.0.1",
                "port": 8001,
                "reload": True,
                "initial_dir": str(app_dir)
            }
            response = requests.post(f"{self.manager_url}/process/start", json=config)
            if response.status_code == 200:
                self.managed_app_pid = response.json()["pid"]
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to start managed app: {e}")
            return False

    def _wait_for_main_app(self, port: int, timeout: int = 10) -> bool:
        logger.info("Waiting for main app to start...")
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                # Check both process health and endpoint availability
                if self.main_app_pid and not self.check_process_health(self.main_app_pid):
                    return False
                    
                response = requests.get(f"http://localhost:{port}/health")
                if response.status_code == 200:
                    logger.info("Main app is ready")
                    return True
            except requests.exceptions.ConnectionError:
                time.sleep(0.1)
        logger.error("Timeout waiting for main app")
        return False

    def start_main_app(self, port: int = 8000) -> bool:
        try:
            main_app_dir = Path(__file__).parent
            config = {
                "app_path": "appdesigner.main:app",
                "host": "127.0.0.1",
                "port": port,
                "reload": True,
                "initial_dir": str(main_app_dir)
            }
            response = requests.post(f"{self.manager_url}/process/start", json=config)
            if response.status_code == 200:
                self.main_app_pid = response.json()["pid"]
                self.main_app_url = f"http://localhost:{port}"
                logger.info(f"Main app started on {self.main_app_url}")
                return self._wait_for_main_app(port)
            else:
                logger.error(f"Failed to start main app: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Failed to start Main App: {e}")
            return False

    def check_process_health(self, pid: int) -> bool:
        try:
            response = requests.get(f"{self.manager_url}/process/health/{pid}")
            return response.status_code == 200 and response.json()["status"] == "running"
        except Exception:
            return False

    def monitor_processes(self):
        """Check health of all managed processes"""
        all_healthy = True
        if self.main_app_pid and not self.check_process_health(self.main_app_pid):
            logger.error("Main app process is not healthy")
            all_healthy = False
        if self.managed_app_pid and not self.check_process_health(self.managed_app_pid):
            logger.error("Managed app process is not healthy")
            all_healthy = False
        return all_healthy

    def cleanup(self):
        try:
            if self.main_app_pid:
                requests.post(f"{self.manager_url}/process/stop/{self.main_app_pid}")
            if self.managed_app_pid:
                requests.post(f"{self.manager_url}/process/stop/{self.managed_app_pid}")
            if self.process_manager:
                self.process_manager.terminate()
                self.process_manager.join(timeout=5)
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

def signal_handler(signum, frame):
    logger.info(f"Received signal {signum}")
    sys.exit(0)

@app.command()
def start(
    managed_appdir: Path = typer.Argument(..., help="Directory containing the managed app"),
    main_port: int = typer.Option(8000, "--port", "-p"),
    manager_port: int = typer.Option(5000, "--manager-port", "-m")
):
    """Start the application servers"""
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    launcher = ServerLauncher()
    try:
        if not launcher.start_process_manager(manager_port):
            logger.error("Failed to start process manager")
            sys.exit(1)
            
        if not launcher.start_managed_app(managed_appdir):
            logger.error("Failed to start managed app")
            sys.exit(1)

        if not launcher.start_main_app(main_port):
            logger.error("Failed to start main app")
            sys.exit(1)
        
        while True:
            if not launcher.monitor_processes():
                logger.error("One or more processes are unhealthy")
                break
            time.sleep(5)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        launcher.cleanup()

if __name__ == "__main__":
    app()