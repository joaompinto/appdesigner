from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Tuple, Any, Optional
from pathlib import Path
import os
import json
import shutil
import re
import sys
from filemanager import FileManager, FileManagerError

router = APIRouter()

def log_error(msg: str, exc: Exception = None):
    """Log error message to stderr with optional exception details."""
    error_msg = f"ERROR: {msg}"
    if exc:
        error_msg += f" - {type(exc).__name__}: {str(exc)}"
    print(error_msg, file=sys.stderr)

# Initialize FileManager with managed directory
file_manager = FileManager()
managed_dir = os.getenv('MANAGED_APP_DIR')
if managed_dir:
    file_manager.set_managed_directory(Path(managed_dir))

# File utilities
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

def get_relative_path(file_path: Path, base_dir: Path) -> str:
    try:
        return str(file_path.relative_to(base_dir))
    except ValueError:
        return str(file_path)

# Add token counting utility
def estimate_tokens(text: str) -> int:
    """Estimate token count using GPT tokenization rules."""
    # Simple estimation: split on whitespace and punctuation
    tokens = re.findall(r'\w+|[^\w\s]', text)
    # Add 20% overhead for special tokens and subword tokenization
    return int(len(tokens) * 1.2)

def scan_directory(base_dir: Path, subpath: str = '') -> List[Dict[str, Any]]:
    """Recursively scan directory and return all files and directories."""
    results = []
    target_dir = base_dir / subpath if subpath else base_dir
    
    try:
        for entry in target_dir.iterdir():  # Use iterdir() instead of glob
            if entry.name.startswith('.'):
                continue
            
            rel_path = get_relative_path(entry, base_dir)
            if entry.is_file() and is_text_file(str(entry)):
                success, content = read_file_safely(str(entry))
                tokens = estimate_tokens(content) if success else 0
                
                results.append({
                    "path": rel_path,
                    "name": entry.name,
                    "type": "file",
                    "size": entry.stat().st_size,  # Add file size
                    "tokens": tokens  # Add token count
                })
            elif entry.is_dir():
                results.append({
                    "path": rel_path,
                    "name": entry.name,
                    "type": "directory"
                })
    except Exception as e:
        print(f"Error scanning directory {target_dir}: {e}")
        return []
    
    return sorted(results, key=lambda x: (x['type'] != 'directory', x['path']))

@router.get("/files")
async def get_files(path: str = '') -> List[Dict[str, str]]:
    """Get list of files in the managed directory or specified subdirectory."""
    print(f"Scanning directory with path: {path}")  # Debug log
    
    managed_dir = os.getenv('MANAGED_APP_DIR')
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")
    
    base_dir = Path(managed_dir)
    if not base_dir.exists():
        raise HTTPException(status_code=404, detail="Managed directory not found")

    # If path is provided, validate it
    if path:
        target_dir = base_dir / path
        if not target_dir.exists():
            raise HTTPException(status_code=404, detail=f"Directory not found: {path}")
        if not target_dir.is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")
        if not str(target_dir).startswith(str(base_dir)):  # Security check
            raise HTTPException(status_code=403, detail="Access denied")

    return scan_directory(base_dir, path)

@router.get("/file")
async def get_file(path: str) -> Dict[str, Any]:
    """Get contents of a specific file."""
    managed_dir = os.getenv('MANAGED_APP_DIR')
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")

    file_path = Path(managed_dir) / path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    
    if not is_text_file(str(file_path)):
        raise HTTPException(status_code=400, detail="Not a text file")
    
    success, content = read_file_safely(str(file_path))
    if not success:
        raise HTTPException(status_code=500, detail="Failed to read file")
    
    # Add file size to response
    file_stat = file_path.stat()
    return {
        "path": path, 
        "content": content,
        "size": file_stat.st_size,
        "tokens": estimate_tokens(content)  # Add token count
    }

class FileContent(BaseModel):
    content: str

@router.post("/file")
async def update_file(path: str, file_content: FileContent) -> Dict[str, str]:
    """Update or create a file with new content."""
    managed_dir = os.getenv('MANAGED_APP_DIR')
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")

    file_path = Path(managed_dir) / path

    try:
        # Create directories if they don't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write content to file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(file_content.content)
        
        return {
            "status": "success",
            "message": f"File {path} updated successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update file: {str(e)}")

@router.delete("/file")
async def delete_file(path: str) -> Dict[str, str]:
    """Delete a file or directory."""
    managed_dir = os.getenv('MANAGED_APP_DIR')
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")

    file_path = Path(managed_dir) / path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    try:
        if file_path.is_dir():
            shutil.rmtree(file_path)
        else:
            file_path.unlink()
        
        return {
            "status": "success",
            "message": f"{'Directory' if file_path.is_dir() else 'File'} {path} deleted successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")

@router.post("/directory")
async def create_directory(path: str) -> Dict[str, str]:
    """Create a new directory."""
    managed_dir = os.getenv('MANAGED_APP_DIR')
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")

    dir_path = Path(managed_dir) / path
    try:
        dir_path.mkdir(parents=True, exist_ok=True)
        return {
            "status": "success",
            "message": f"Directory {path} created successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create directory: {str(e)}")

class ContextData(BaseModel):
    contexts: Dict[str, Any]

# Add context management routes
@router.get("/contexts")
async def get_contexts() -> Dict[str, Any]:
    """Get all saved contexts."""
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")
    try:
        return file_manager.load_contexts()
    except FileManagerError as e:
        error_detail = {
            "error": "Failed to load contexts",
            "type": type(e).__name__,
            "message": str(e),
            "location": "get_contexts"
        }
        log_error("Failed to load contexts", e)
        raise HTTPException(status_code=500, detail=error_detail)
    except Exception as e:
        error_detail = {
            "error": "Unexpected error loading contexts",
            "type": type(e).__name__,
            "message": str(e),
            "location": "get_contexts"
        }
        log_error("Unexpected error in get_contexts", e)
        raise HTTPException(status_code=500, detail=error_detail)

@router.post("/contexts")
async def update_contexts(data: ContextData) -> Dict[str, str]:
    """Update saved contexts."""
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")
    try:
        contexts = {}
        base_dir = Path(managed_dir)
        
        for name, context in data.contexts.items():
            # Convert items to list and add type information
            items_with_types = []
            for item in context.get('items', []):
                item_path = base_dir / item
                item_type = 'directory' if item_path.is_dir() else 'file'
                items_with_types.append({
                    'path': item,
                    'type': item_type
                })
            
            contexts[name] = {
                **context,
                'items': items_with_types
            }
            
        file_manager.save_contexts(contexts)
        return {"status": "success", "message": "Contexts saved successfully"}
    except Exception as e:
        error_detail = {
            "error": "Failed to save contexts",
            "type": type(e).__name__,
            "message": str(e),
            "location": "update_contexts",
            "context_count": len(data.contexts) if data.contexts else 0
        }
        log_error("Failed to save contexts", e)
        raise HTTPException(status_code=500, detail=error_detail)

@router.delete("/contexts")
async def delete_contexts() -> Dict[str, str]:
    """Delete all saved contexts."""
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")
    try:
        file_manager.delete_contexts()
        return {"status": "success", "message": "Contexts deleted successfully"}
    except Exception as e:
        error_detail = {
            "error": "Failed to delete contexts",
            "type": type(e).__name__,
            "message": str(e),
            "location": "delete_contexts"
        }
        log_error("Failed to delete contexts", e)
        raise HTTPException(status_code=500, detail=error_detail)
