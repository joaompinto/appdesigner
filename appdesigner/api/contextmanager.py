from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from pathlib import Path
import json
from filemanager import FileManager

def create_router(managed_dir: Path) -> APIRouter:
    router = APIRouter()
    file_manager = FileManager()
    file_manager.set_managed_directory(managed_dir)

    class ContextData(BaseModel):
        contexts: Dict[str, Any]

    def load_contexts() -> Dict[str, Any]:
        """Load contexts from JSON file."""
        contexts_file = file_manager.get_contexts_file()
        if not contexts_file.exists():
            return {}
        
        try:
            with open(contexts_file, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Invalid contexts file format")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load contexts: {str(e)}")

    def save_contexts(contexts: Dict[str, Any]) -> None:
        """Save contexts to JSON file."""
        contexts_file = file_manager.get_contexts_file()
        try:
            with open(contexts_file, 'w') as f:
                json.dump(contexts, f, indent=2)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save contexts: {str(e)}")

    @router.get("/contexts")
    async def get_contexts() -> Dict[str, Any]:
        """Get all saved contexts."""
        return load_contexts()

    @router.post("/contexts")
    async def update_contexts(data: ContextData) -> Dict[str, str]:
        """Update saved contexts."""
        try:
            save_contexts(data.contexts)
            return {"status": "success", "message": "Contexts saved successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/contexts")
    async def delete_contexts() -> Dict[str, str]:
        """Delete all saved contexts."""
        try:
            contexts_file = file_manager.get_contexts_file()
            if contexts_file.exists():
                contexts_file.unlink()
            return {"status": "success", "message": "Contexts deleted successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete contexts: {str(e)}")

    return router