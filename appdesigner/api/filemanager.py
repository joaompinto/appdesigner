from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Tuple, Any
from pathlib import Path
import os
import shutil

router = APIRouter()

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

@router.get("/files")
async def get_files() -> List[Dict[str, str]]:
    """Get list of all files in the managed directory."""
    managed_dir = os.getenv('MANAGED_APP_DIR')
    if not managed_dir:
        raise HTTPException(status_code=500, detail="No managed directory configured")
    
    base_dir = Path(managed_dir)
    if not base_dir.exists():
        raise HTTPException(status_code=404, detail="Managed directory not found")

    files = []
    for path in base_dir.rglob('*'):
        if path.name.startswith('.'):
            continue
            
        rel_path = get_relative_path(path, base_dir)
        files.append({
            "path": rel_path,
            "name": path.name,
            "type": "directory" if path.is_dir() else "file"
        })

    return files

@router.get("/file")
async def get_file(path: str) -> Dict[str, str]:
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
    
    return {"path": path, "content": content}

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
