"""FastAPI エントリーポイント"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import webhook_lark, search, briefing, summary, pipedrive, companies, candidates
from app.core.config import settings
from app.queue.producer import close_redis

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

app = FastAPI(
    title="wheelsUp RAG API",
    description="Lark × Pipedrive 商談ナレッジ統合システム",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(webhook_lark.router, tags=["Webhook"])
app.include_router(pipedrive.router, tags=["Webhook"])
app.include_router(search.router, tags=["Search"])
app.include_router(briefing.router, tags=["Briefing"])
app.include_router(summary.router, tags=["Summary"])
app.include_router(companies.router, tags=["Companies"])
app.include_router(candidates.router, tags=["Candidates"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_redis()
