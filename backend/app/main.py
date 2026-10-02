import logging
import sys
from fastapi import FastAPI, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from app.core.security import verify_local_auth_token
from app.api import routes_parse, routes_chat, routes_providers, routes_logs

# Configure file logging
file_handler = logging.FileHandler("../payday.log")
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))

logging.basicConfig(level=logging.INFO, handlers=[file_handler, console_handler])

# Also attach it to uvicorn loggers so we get access logs
logging.getLogger("uvicorn.access").handlers = [file_handler, console_handler]
logging.getLogger("uvicorn.error").handlers = [file_handler, console_handler]

app = FastAPI(title="Payday Planner API")

# Allow Vite dev server to communicate with the FastAPI backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All /api routes will strictly enforce the X-Local-Auth-Token
api_router = APIRouter(dependencies=[Depends(verify_local_auth_token)])

api_router.include_router(routes_parse.router, tags=["parse"])
api_router.include_router(routes_chat.router, tags=["chat"])
api_router.include_router(routes_providers.router, tags=["providers"])
api_router.include_router(routes_logs.router, tags=["logs"])

@api_router.get("/health")
async def health_check():
    return {"status": "ok", "message": "Secure connection established."}

app.include_router(api_router, prefix="/api")
