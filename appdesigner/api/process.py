from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from ..appcontroller import server_controller

router = APIRouter()

@router.get("/process-output")
async def get_process_output():
    """
    Retrieves the latest server output and formats it for safe HTML display.
    Returns server logs with HTML special characters escaped to prevent XSS,
    while preserving newline formatting.
    """
    output = server_controller.get_output()
    # Escape HTML characters and preserve newlines
    escaped_output = output.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return HTMLResponse(content=escaped_output)
