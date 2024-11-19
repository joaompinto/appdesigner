from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path
import os
import time  # Add this import
from typing import Optional, List, Dict, Tuple, Any
from filemanager import FileManager
from claude import APIAgent
from history import ChangeHistory
from pydantic import BaseModel
from rich.console import Console
from markdown import markdown  # Add this import

router = APIRouter()
history_manager = ChangeHistory()
console = Console()  # Add console instance

def format_size(size_bytes):
    """Convert size in bytes to human readable format"""
    for unit in ['bytes', 'KB', 'MB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:3.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} GB"

class Agent:
    def __init__(self):
        self.api_agent = APIAgent(system_prompt="""You are a helpful programming assistant.
When providing file changes:
1. Only include actual file content between <content> tags
""")
        self.file_manager = FileManager()
        self.history = ChangeHistory()
        
        # Initialize managed directory from environment
        managed_dir = os.getenv('MANAGED_APP_DIR')
        if (managed_dir):
            self.set_managed_directory(Path(managed_dir))
        
        self.file_changes = []  # Keep this for current changes
        self.sent_files = []    # Keep this for current files
        self.current_instruction = None  # Add this for tracking current instruction
        self.query_system_prompt = """You are a helpful programming assistant.
Analyze the files and provide clear, concise answers to questions about them.
Format your response using markdown for better readability.
Do not suggest or make any changes to the files unless explicitly asked."""
        self.last_stdout_size = 0
        self.last_stderr_size = 0
        self.stdout_logs = []
        self.stderr_logs = []
        # Remove accumulated lists

    def set_managed_directory(self, directory: Path):
        """Set the directory containing files to be managed."""
        self.file_manager.set_managed_directory(directory)

    def get_file_changes(self, content: str, instruction: str, target_name: str = None, filename: str = None) -> str:
        """Get file changes from Claude API."""
        return self.api_agent.request(content)

    def analyze_file(self, filename: str) -> str:
        """Analyze a file's content."""
        return self.api_agent.analyze_file(filename)

    def process_file_changes(self, files: List[str], response: str) -> Dict:
        """Process changes for multiple files based on API response."""
        try:
            instructions = self.file_manager.parse_edit_instructions(response)
            result = self.file_manager.process_changes(files, instructions)
            # Track successful changes
            if not isinstance(result, dict) or 'error' not in result:
                self.file_changes.extend([
                    f"Updated {filename}" for filename in files
                ])
            return result
        except Exception as e:
            return {'error': str(e)}

    def create_file_content(self, instruction: str, filename: str = None) -> str:
        """Create new file content based on instruction."""
        return self.api_agent.create_file_content(instruction, filename)

    def get_update_suggestions(self, content: str, filename: str, reference_files: Dict[str, str]) -> str:
        """Get update suggestions for a file based on reference files."""
        return self.api_agent.get_update_suggestions(content, filename, reference_files)

    def format_file_prompt(self, files_dict: Dict[str, str], instruction: str) -> str:
        """Format a prompt with file context and instruction."""
        files_context = ""
        for filename, content in files_dict.items():
            files_context += f"""<inputfile>
<filename>{filename}</filename>
<content>
{content}
</content>
</inputfile>
"""
        return f"""Context (current files):
{files_context}

Instruction: {instruction}

Provide changes in this exact format:
<outputfile>
<filename>path/to/file</filename>
<content>
[actual file content here]
</content>
</outputfile>

Important: 
- Include only the actual file content between the content tags
"""

    def format_query_prompt(self, files_dict: Dict[str, str], question: str) -> str:
        """Format a prompt for querying about files without modification."""
        files_context = ""
        for filename, content in files_dict.items():
            files_context += f"""<inputfile>
<filename>{filename}</filename>
<content>
{content}
</content>
</inputfile>
"""
        return f"""Context (current files):
{files_context}

Question: {question}

Provide a clear, concise answer about the files without modifying them."""

    def process_user_instruction(self, instruction: str, counter: int, directory: Optional[Path] = None) -> Tuple[str, str]:
        try:
            if directory:
                self.set_managed_directory(directory)

            if not self.file_manager.managed_dir:
                raise ValueError("No managed directory set")

            self.current_instruction = instruction
            managed_files = self.file_manager.get_managed_files()
            
            # Handle query mode (instructions starting with !)
            if instruction.startswith('!'):
                question = instruction[1:].strip()  # Remove ! and trim
                # Create sent_files list without adding to accumulated_sent yet
                self.sent_files = [f"[{counter}] {instruction}"] + [
                    f"Sent {filename} ({format_size(os.path.getsize(os.path.join(self.file_manager.managed_dir, filename)))})"
                    for filename in managed_files.keys()
                ]
                
                # Use query-specific prompt
                prompt = self.format_query_prompt(managed_files, question)
                # Use query system prompt without keyword arg
                self.api_agent.system_prompt = self.query_system_prompt
                raw_response = self.api_agent.request(prompt)
                # Restore original system prompt
                self.api_agent.system_prompt = """You are a helpful programming assistant.
When providing file changes:
1. Only include actual file content between <content> tags
"""
                
                # Format response as HTML from markdown with code highlighting
                html_response = markdown(raw_response, extensions=['fenced_code', 'tables', 'codehilite'])
                # Add wrapping div for styling
                formatted_response = f'<div class="query-response">{html_response}</div>'
                return {"response": formatted_response, "type": "query"}, raw_response

            # Regular instruction handling
            # Create new changes list
            self.file_changes = [f"[{counter}] {instruction}"]
            self.sent_files = [f"[{counter}] {instruction}"] + [
                f"Sent {filename} ({format_size(os.path.getsize(os.path.join(self.file_manager.managed_dir, filename)))})"
                for filename in managed_files.keys()
            ]
            
            prompt = self.format_file_prompt(managed_files, instruction)
            raw_response = self.api_agent.request(prompt)
            changes = self._extract_changes(raw_response)
            
            if changes:
                results = self.file_manager.apply_file_changes(changes)
                # Track file changes with size information
                for filename, result in results.items():
                    file_path = os.path.join(self.file_manager.managed_dir, filename)
                    if os.path.exists(file_path):
                        file_size = format_size(os.path.getsize(file_path))
                        self.file_changes.append(f"{filename}: Updated ({file_size})")
                formatted_results = "\n".join([
                    f"{result['relative_path']}: Updated ({format_size(os.path.getsize(os.path.join(self.file_manager.managed_dir, result['relative_path'])))})" 
                    for result in results.values()
                ])
                message = f"Changes applied:\n{formatted_results}"
            else:
                message = "No changes needed"
                
            return message, raw_response

        except Exception as e:
            return str(e), ""

    def _extract_changes(self, response: str) -> Dict[str, str]:
        """Extract file changes from response."""
        changes = {}
        try:
            instructions = self.file_manager.parse_edit_instructions(response)
            for instr in instructions:
                if 'filename' in instr and 'content' in instr:
                    changes[instr['filename']] = instr['content']
        except Exception as e:
            if self.file_manager.verbose:
                print(f"Error extracting changes: {e}")
        return changes

agent = Agent()

class InstructionRequest(BaseModel):
    instruction: str
    counter: int

class InstructionResponse(BaseModel):
    response: str
    rawOutput: str
    processingTime: float  # Add this field

@router.post("/process-user-instructions", response_model=InstructionResponse)
async def process_instructions(request: InstructionRequest) -> Dict[str, Any]:
    try:
        start_time = time.time()  # Start timing
        
        if not agent.file_manager.managed_dir:
            managed_dir = os.getenv('MANAGED_APP_DIR')
            if not managed_dir:
                raise ValueError("No managed directory configured")
            agent.set_managed_directory(Path(managed_dir))
            
        response, raw_output = agent.process_user_instruction(request.instruction, request.counter)
        
        # Calculate processing time
        processing_time = round(time.time() - start_time, 2)
        
        # Add console logging with timing
        console.print("\n[bold blue]Processing Result:[/bold blue]")
        console.print(f"[green]Message:[/green] {response}")
        console.print(f"[cyan]Processing Time:[/cyan] {processing_time}s")
        console.print("\n[yellow]Raw Response:[/yellow]")
        console.print(raw_output)
        
        # Prepare raw output for frontend display
        formatted_raw = raw_output.replace('\n', '\\n').replace('\r', '\\r')
        
        # Extract response from dict if it's a query response
        final_response = response["response"] if isinstance(response, dict) else response
        
        return {
            "response": final_response,
            "rawOutput": formatted_raw,
            "processingTime": processing_time  # Add processing time to response
        }
    except Exception as e:
        console.print(f"\n[bold red]Error:[/bold red] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/history")
async def get_history():
    """Get the file change history"""
    changes = history_manager.get_changes()
    formatted_changes = [{
        "timestamp": change["timestamp"],
        "filename": change["filename"],
        "instruction": change["instruction"],
        "content": change["content"]
    } for change in changes]
    return formatted_changes

@router.get("/api/logs")
async def get_logs():
    """Get the complete logs"""
    try:
        logs_dir = os.getenv('LOGS_DIR')
        if not logs_dir:
            return {"stdout": "", "stderr": "", "files": "", "sent": ""}

        logs_dir = Path(logs_dir)
        stdout_path = logs_dir / "managed_app_stdout.log"
        stderr_path = logs_dir / "managed_app_stderr.log"

        # Get complete stdout content
        stdout_content = ""
        if stdout_path.exists():
            with open(stdout_path, 'r') as f:
                stdout_content = f.read()

        # Get complete stderr content
        stderr_content = ""
        if stderr_path.exists():
            with open(stderr_path, 'r') as f:
                stderr_content = f.read()

        # Just return current changes, accumulation handled by frontend
        files_content = "\n".join(agent.file_changes)
        sent_content = "\n".join(agent.sent_files)  # Fix typo in string join

        # Clear current changes after sending
        agent.file_changes = []
        agent.sent_files = []

        return {
            "stdout": stdout_content,
            "stderr": stderr_content,
            "files": files_content,
            "sent": sent_content
        }
    except Exception as e:
        console.print(f"[red]Error reading logs:[/red] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))