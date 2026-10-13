import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app import database
from app.config import settings
from app.database import init_database
from app.routers.attendees import router as attendees_router
from app.routers.auth import router as auth_router
from app.routers.categories import router as categories_router
from app.routers.companies import router as companies_router
from app.routers.deletion_logs import router as deletion_logs_router
from app.routers.departments import router as departments_router
from app.routers.employees import router as employees_router
from app.routers.gate import router as gate_router
from app.routers.join_events import router as join_events_router
from app.routers.passes import router as passes_router
from app.routers.reports import router as reports_router

logger = logging.getLogger("srdm")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_database()
    if database.connection_error:
        logger.error("Database startup failed: %s", database.connection_error)
    else:
        logger.info("Connected to MariaDB")
    yield


app = FastAPI(title="SRDM API", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="srdm_session",
    max_age=12 * 60 * 60,
    same_site="lax",
    https_only=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://193.203.161.99:8443",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(companies_router)
app.include_router(deletion_logs_router)
app.include_router(departments_router)
app.include_router(categories_router)
app.include_router(employees_router)
app.include_router(join_events_router)
app.include_router(attendees_router)
app.include_router(passes_router)
app.include_router(gate_router)
app.include_router(reports_router)


@app.get("/api/health")
def health():
    if database.connection_error:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "database": "down", "detail": database.connection_error},
        )
    return {"ok": True, "database": "up"}
