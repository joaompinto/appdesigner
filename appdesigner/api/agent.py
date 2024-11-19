from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from ..agent import Agent
from ..history import ChangeHistory
from ..appcontroller import server_controller  # Add this import to get the global controller
from pathlib import Path

router = APIRouter()
history_manager = ChangeHistory()
agent = Agent()

@router.post("/process-user-instructions")
async def process_user_instructions(data: dict):
    instruction = data.get('instruction', '')
    if not instruction:
        raise HTTPException(status_code=400, detail="No instruction provided")

    try:
        # Get managed directory from server controller
        if not server_controller.temp_dir:
            raise HTTPException(status_code=500, detail="No managed directory available")
            
        # Process instruction with the managed directory
        result, raw_output = agent.process_instruction(instruction, server_controller.temp_dir)
        
        # Record in history if changes were made
        if "success" in result:
            history_manager.add_change(instruction=instruction, changes=result)
        
        return {
            "response": result,
            "raw_output": raw_output
        }
    except Exception as e:
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
