from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .api.agent import router as agent_router
from .api.process import router as process_router
from pathlib import Path

app = FastAPI()

# Ensure static directory exists
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)

# Mount the static directory
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include the routers
app.include_router(agent_router)
app.include_router(process_router)
