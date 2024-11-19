import os
from typing import Optional, List, Dict, Tuple
from pathlib import Path
from .filemanager import FileManager
from .claude import APIAgent
from .history import ChangeHistory

class Agent:
    def __init__(self):
        self.api_agent = APIAgent()
        self.file_manager = FileManager()
        self.history = ChangeHistory()

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

Please provide changes in the following format:
<outputfile>
<filename>path/to/file</filename>
<content>
file content
</content>
</outputfile>"""

    def process_instruction(self, instruction: str, directory: Optional[Path] = None) -> Tuple[str, str]:
        """Process instruction and apply changes to managed directory."""
        if directory:
            self.set_managed_directory(directory)

        if not self.file_manager.managed_dir:
            raise ValueError("No managed directory set")

        try:
            # 1. Get current files context
            managed_files = self.file_manager.get_managed_files()
            
            # 2. Format prompt with context
            prompt = self.format_file_prompt(managed_files, instruction)
            
            # 3. Get response from Claude
            response = self.api_agent.request(prompt)
            
            # 4. Extract and apply changes
            changes = self._extract_changes(response)
            if changes:
                results = self.file_manager.apply_file_changes(changes)
                return f"Changes applied: {results}", response
                
            return "No changes needed", response

        except Exception as e:
            return f"Error: {str(e)}", ""

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
