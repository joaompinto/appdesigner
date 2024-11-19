import shutil
import os
from pathlib import Path
import requests
import time
import subprocess
import sys
import signal
import threading
from .history import ChangeHistory
import logging
from .agent import Agent  # Update import

logger = logging.getLogger(__name__)

class ServerController:
    def __init__(self, manager_url: str = "http://localhost:5000"):
        self.process_pid = None
        self.manager_url = manager_url
        self.temp_dir = None  # Add temp_dir initialization
        self.history = ChangeHistory()
        self.output_buffer = []  # Initialize output buffer
        self.agent = Agent()  # Use Agent instead of APIAgent

    def start_server(self, starter_dir: Path) -> bool:
        logger.info("Starting managed server...")
        try:
            # Set temp_dir to starter_dir
            self.temp_dir = Path(starter_dir)
            
            response = requests.post(
                f"{self.manager_url}/process/create", 
                json={
                    "command": f"{sys.executable} -m uvicorn main:app --port=9000 --reload",
                    "work_dir": str(starter_dir)
                }
            )
            response.raise_for_status()
            self.process_pid = response.json()["pid"]
            
            return self._wait_for_startup()
            
        except Exception as e:
            logger.error(f"Failed to start server: {e}")
            return False

    def _wait_for_startup(self, timeout: int = 10) -> bool:
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                response = requests.get(f"{self.manager_url}/process/logs/{self.process_pid}")
                if response.status_code == 200:
                    logs = response.json()["logs"]
                    logger.info(f"[Managed App] {logs}")
                    if "Application startup complete" in logs:
                        return True
                    if "Error" in logs or "Exception" in logs:
                        return False
            except Exception as e:
                logger.error(f"Error checking logs: {e}")
            time.sleep(0.5)
        return False

    def get_output(self) -> str:
        """Get the current output from the managed server process."""
        if not self.process_pid:
            return "Server not running"
        try:
            response = requests.get(f"{self.manager_url}/process/logs/{self.process_pid}")
            if response.status_code == 200:
                return response.json()["logs"]
            return f"Error fetching logs: {response.status_code}"
        except Exception as e:
            return f"Error: {str(e)}"

    def process_instruction(self, instruction: str) -> tuple[str, str]:
        """Process an instruction and return both result and raw output."""
        try:
            # Process request using Agent with managed directory
            result, raw_output = self.agent.process_instruction(instruction, self.temp_dir)
            
            # Handle results
            self.output_buffer.append(f"Instruction: {instruction}")
            self.output_buffer.append(f"Result: {result}")

            return result, raw_output

        except Exception as e:
            error_msg = f"Error processing instruction: {str(e)}"
            self.output_buffer.append(error_msg)
            return error_msg, str(e)

    def __del__(self):
        if self.process_pid:
            try:
                requests.post(f"{self.manager_url}/process/terminate/{self.process_pid}")
            except:
                pass

server_controller = ServerController()

def start_managed_app(starter_dir='starter'):
    print("Starting ServerController...")
    return server_controller.start_server(starter_dir)

if __name__ == "__main__":
    start_managed_app()