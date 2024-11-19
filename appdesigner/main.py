from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from api.agent import router as agent_router
from api.logs import router as logs_router
from api.filemanager import router as filemanager_router
from pathlib import Path

app = FastAPI()

# Set up static and template directories
BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse(
        "fileexplorer.html",
        {"request": request, "title": "App Designer - File Explorer"}
    )

@app.get("/preview")
async def read_preview():
    return FileResponse('static/preview.html')

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/favicon.ico")
async def favicon():
    return Response(content="")

# Include the routers
app.include_router(agent_router)
app.include_router(logs_router, prefix="/api")
app.include_router(filemanager_router, prefix="/api")
