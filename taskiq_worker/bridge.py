import asyncio
import logging

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from redis.asyncio import from_url

try:
    from taskiq_worker.config import (
        TASKIQ_QUEUE_NAME,
        TASKIQ_REDIS_URL,
        TASK_INTERNAL_TOKEN,
    )
except ModuleNotFoundError:
    from config import TASKIQ_QUEUE_NAME, TASKIQ_REDIS_URL, TASK_INTERNAL_TOKEN


app = FastAPI(title="Resume Foundry Taskiq Bridge")
logger = logging.getLogger("taskiq.bridge")


class ResumeEnqueueRequest(BaseModel):
    taskId: str
    appBaseUrl: str
    internalToken: str
    debugId: str = ""


@app.get("/health")
async def health():
    return {
        "ok": True,
        "bridge": "running",
        "queue": TASKIQ_QUEUE_NAME,
    }


@app.get("/ready")
async def ready():
    client = None
    try:
        client = from_url(TASKIQ_REDIS_URL)
        await asyncio.wait_for(client.ping(), timeout=5)
        return {
            "ok": True,
            "bridge": "running",
            "redis": "connected",
            "queue": TASKIQ_QUEUE_NAME,
        }
    except Exception as error:
        logger.exception("[taskiq:health] redis ping failed")
        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "redis": "unreachable",
                "errorType": type(error).__name__,
            },
        ) from error
    finally:
        if client is not None:
            await client.aclose()


def validate_bridge_token(provided_token: str | None) -> None:
    if not TASK_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="TASK_INTERNAL_TOKEN is not configured on the worker service.",
        )

    if provided_token != TASK_INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")


async def enqueue(payload: ResumeEnqueueRequest, route: str):
    task_id = payload.taskId.strip()
    debug_id = payload.debugId.strip() or task_id

    if not task_id:
        raise HTTPException(status_code=400, detail="taskId is required.")

    logger.info(
        "[taskiq:bridge] enqueue_started route=%s debug_id=%s task_id=%s",
        route,
        debug_id,
        task_id,
    )

    try:
        try:
            from taskiq_worker.tasks import process_resume_task
        except ModuleNotFoundError:
            from tasks import process_resume_task

        task = await process_resume_task.kiq(
            task_id,
            payload.appBaseUrl.strip(),
            payload.internalToken.strip(),
            debug_id,
        )
    except Exception as error:
        logger.exception(
            "[taskiq:bridge] enqueue_failed route=%s debug_id=%s task_id=%s",
            route,
            debug_id,
            task_id,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "queued": False,
                "debugId": debug_id,
                "errorType": type(error).__name__,
                "message": str(error)[:500],
            },
        ) from error

    taskiq_id = getattr(task, "task_id", None)
    logger.info(
        "[taskiq:bridge] enqueue_completed route=%s debug_id=%s task_id=%s taskiq_id=%s",
        route,
        debug_id,
        task_id,
        taskiq_id,
    )

    return {
        "queued": True,
        "taskId": task_id,
        "taskiqId": taskiq_id,
        "debugId": debug_id,
    }


@app.post("/enqueue/resume")
async def enqueue_resume_task(
    payload: ResumeEnqueueRequest,
    x_task_internal_token: str | None = Header(default=None),
):
    validate_bridge_token(x_task_internal_token)
    return await enqueue(payload, "resume")


@app.post("/enqueue/tailor")
async def enqueue_tailor_task(
    payload: ResumeEnqueueRequest,
    x_task_internal_token: str | None = Header(default=None),
):
    validate_bridge_token(x_task_internal_token)
    return await enqueue(payload, "tailor")
