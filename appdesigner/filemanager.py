import os
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple
from fastapi import HTTPException

class NoChangesFoundError(Exception):
    """Raised when no change instructions were found in the response."""
    pass

class FileManagerError(Exception):
    """Base exception for FileManager errors."""
    pass

class FileManager:
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.managed_dir = None
        self.contexts_file = None  # Add this line

    def set_managed_directory(self, directory: Path):
        """Set the directory containing managed files."""
        self.managed_dir = Path(directory)
        self.contexts_file = self.managed_dir / "contexts.json"  # Add this line

    def get_managed_files(self, extensions=None) -> Dict[str, str]:
        """Get all managed files with their contents."""
        if not extensions:
            extensions = ['.py', '.js', '.html', '.css', '.json', '.txt', '.md']
            
        managed_files = {}
        if not self.managed_dir or not self.managed_dir.exists():
            return managed_files

        for root, _, files in os.walk(self.managed_dir):
            for file in files:
                filepath = Path(root) / file
                if filepath.suffix in extensions:
                    try:
                        relative_path = filepath.relative_to(self.managed_dir)
                        managed_files[str(relative_path)] = self.read_file(str(filepath))
                    except Exception as e:
                        if self.verbose:
                            print(f"Could not read file {filepath}: {e}")
        return managed_files

    def get_relative_path(self, absolute_path: str) -> str:
        """Convert absolute path to relative path from managed directory."""
        try:
            return str(Path(absolute_path).relative_to(self.managed_dir))
        except ValueError:
            return absolute_path

    def apply_file_changes(self, changes: Dict[str, str]) -> Dict[str, Dict[str, str]]:
        """Apply changes to files in managed directory."""
        results = {}
        for filepath, content in changes.items():
            try:
                full_path = self.managed_dir / filepath
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(content, encoding='utf-8')
                abs_path = str(full_path.absolute())
                results[abs_path] = {
                    "status": "success",
                    "relative_path": self.get_relative_path(abs_path)
                }
            except Exception as e:
                abs_path = str(full_path.absolute())
                results[abs_path] = {
                    "status": f"error: {str(e)}",
                    "relative_path": self.get_relative_path(abs_path)
                }
        return results

    def read_file(self, filename: str) -> str:
        """Read and validate file content."""
        path = Path(filename)
        if not path.exists():
            raise FileNotFoundError(f"File '{filename}' does not exist")
        return path.read_text(encoding='utf-8')

    def parse_edit_instructions(self, response: str) -> List[Dict[str, Any]]:
        """Parse edit instructions from response text."""
        instructions = []
        in_file_section = False
        in_content_section = False
        filename = None
        content_lines = []
        
        for line in response.splitlines():
            stripped_line = line.strip()
            
            if '<outputfile>' in stripped_line:
                in_file_section = True
                content_lines = []
                continue
            elif '</outputfile>' in stripped_line:
                if filename and content_lines:
                    instructions.append({
                        'action': 'replace',
                        'filename': filename,
                        'content': '\n'.join(content_lines)
                    })
                in_file_section = False
                in_content_section = False
                filename = None
                content_lines = []
                continue
                
            if not in_file_section:
                continue
                
            if '<filename>' in stripped_line and '</filename>' in stripped_line:
                filename = stripped_line[stripped_line.find('<filename>')+10:stripped_line.find('</filename>')].strip()
                continue
                
            if '<content>' in stripped_line:
                in_content_section = True
                continue
            elif '</content>' in stripped_line:
                in_content_section = False
                continue
            
            if in_content_section:
                content_lines.append(line)

        if not instructions:
            raise NoChangesFoundError("No valid change instructions found")

        return instructions

    def get_contexts_file(self) -> Path:
        """Get the path to the contexts file in the managed directory."""
        if not self.managed_dir:
            raise ValueError("Managed directory not set")
        return self.managed_dir / "contexts.json"

    def load_contexts(self) -> Dict[str, Any]:
        """Load contexts from JSON file."""
        if not self.contexts_file or not self.contexts_file.exists():
            return {}
        
        try:
            with open(self.contexts_file, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            raise FileManagerError("Invalid contexts file format") from e
        except Exception as e:
            raise FileManagerError(f"Failed to load contexts: {str(e)}") from e

    def save_contexts(self, contexts: Dict[str, Any]) -> None:
        """Save contexts to JSON file."""
        if not self.contexts_file:
            raise FileManagerError("No contexts file path set")
            
        try:
            with open(self.contexts_file, 'w') as f:
                json.dump(contexts, f, indent=2)
        except Exception as e:
            raise FileManagerError(f"Failed to save contexts: {str(e)}") from e

    def delete_contexts(self) -> None:
        """Delete the contexts file."""
        try:
            if self.contexts_file and self.contexts_file.exists():
                self.contexts_file.unlink()
        except Exception as e:
            raise FileManagerError(f"Failed to delete contexts: {str(e)}") from e

    def get_file_content(self, filepath: str) -> str:
        """Get content of a specific file from the managed directory."""
        try:
            full_path = self.managed_dir / filepath
            if not full_path.exists():
                raise FileNotFoundError(f"File '{filepath}' does not exist")
            return full_path.read_text(encoding='utf-8')
        except Exception as e:
            if self.verbose:
                print(f"Could not read file {filepath}: {e}")
            raise FileManagerError(f"Error reading file {filepath}: {str(e)}")

def read_file_safely(filepath: str) -> Tuple[bool, str]:
    """Try to read a file with different encodings, return success and content."""
    encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
    
    for encoding in encodings:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                content = f.read()
                if '\0' in content:  # Binary file check
                    return False, ''
                return True, content
        except (UnicodeDecodeError, UnicodeError):
            continue
        except Exception:
            return False, ''
    return False, ''

def is_text_file(filepath: str) -> bool:
    """Check if a file is likely to be text-based."""
    text_extensions = {
        '.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.json', '.xml',
        '.yaml', '.yml', '.ini', '.conf', '.sh', '.bash', '.zsh', '.fish',
        '.cpp', '.c', '.h', '.hpp', '.java', '.kt', '.rs', '.go', '.rb',
        '.php', '.pl', '.pm', '.r', '.scala', '.sql', '.vue', '.jsx', '.tsx'
    }
    
    if Path(filepath).suffix.lower() in text_extensions:
        return True
    
    is_text, _ = read_file_safely(filepath)
    return is_text
