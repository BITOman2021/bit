import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db as dbm
from .config import settings
from .routers import admin, assets, auth, characters, projects, samkidz, studio
from .services import jobs

log = logging.getLogger("acs")


def migrate():
    cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parent.parent / "migrations"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.reload()
    dbm.init_engine()
    migrate()
    jobs.worker.start()
    yield
    jobs.worker.shutdown()


app = FastAPI(title="AI Cartoon Studio API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"], allow_credentials=False)

for r in (auth.router, projects.router, assets.router, characters.router, studio.router, admin.router, samkidz.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled(request, exc):
    log.exception("unhandled error")
    return JSONResponse({"detail": "internal_error"}, status_code=500)
