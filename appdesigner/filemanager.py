import os
from pathlib import Path
from typing import List, Dict, Any, Tuple

class NoChangesFoundError(Exception):
    """Raised when no change instructions were found in the response."""
    pass

class FileManager:
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.managed_dir = None

    def set_managed_directory(self, directory: Path):
        """Set the directory containing managed files."""
        self.managed_dir = Path(directory)

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

    def apply_file_changes(self, changes: Dict[str, str]) -> Dict[str, str]:
        """Apply changes to files in managed directory."""
        results = {}
        for filepath, content in changes.items():
            try:
                full_path = self.managed_dir / filepath
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(content, encoding='utf-8')
                results[filepath] = "success"
            except Exception as e:
                results[filepath] = f"error: {str(e)}"
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
