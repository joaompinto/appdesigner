from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path
import os
from typing import Optional, List, Dict, Tuple, Any
from filemanager import FileManager
from claude import APIAgent
from history import ChangeHistory
from pydantic import BaseModel
from rich.console import Console

router = APIRouter()
history_manager = ChangeHistory()
console = Console()  # Add console instance

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
        if managed_dir:
            self.set_managed_directory(Path(managed_dir))

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
            return self.file_manager.process_changes(files, instructions)
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
        from xml.sax.saxutils import escape
        
        files_context = ""
        for filename, content in files_dict.items():
            files_context += f"""<inputfile>
<filename>{escape(filename)}</filename>
<content>
{escape(content)}
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

    def process_user_instruction(self, instruction: str, directory: Optional[Path] = None) -> Tuple[str, str]:
        """Process instruction and apply changes to managed directory."""
        if directory:
            self.set_managed_directory(directory)

        if not self.file_manager.managed_dir:
            raise ValueError("No managed directory set")

        try:
            managed_files = self.file_manager.get_managed_files()
            prompt = self.format_file_prompt(managed_files, instruction)
            raw_response = self.api_agent.request(prompt)
            changes = self._extract_changes(raw_response)
            
            if changes:
                results = self.file_manager.apply_file_changes(changes)
                formatted_results = "\n".join([
                    f"{result['relative_path']}: {result['status']}" 
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

class InstructionResponse(BaseModel):
    response: str
    rawOutput: str

@router.post("/process-user-instructions", response_model=InstructionResponse)
async def process_instructions(request: InstructionRequest) -> Dict[str, Any]:
    try:
        if not agent.file_manager.managed_dir:
            managed_dir = os.getenv('MANAGED_APP_DIR')
            if not managed_dir:
                raise ValueError("No managed directory configured")
            agent.set_managed_directory(Path(managed_dir))
            
        response, raw_output = agent.process_user_instruction(request.instruction)
        
        # Add console logging
        console.print("\n[bold blue]Processing Result:[/bold blue]")
        console.print(f"[green]Message:[/green] {response}")
        console.print("\n[yellow]Raw Response:[/yellow]")
        console.print(raw_output)
        
        # Prepare raw output for frontend display
        formatted_raw = raw_output.replace('\n', '\\n').replace('\r', '\\r')
        
        return {
            "response": response,
            "rawOutput": formatted_raw
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
