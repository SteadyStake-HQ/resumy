from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from taskiq_worker.tasks import process_resume_task


app = FastAPI(title="Resume Foundry Taskiq Bridge")


class ResumeEnqueueRequest(BaseModel):
    taskId: str
    appBaseUrl: str
    internalToken: str


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/enqueue/resume")
async def enqueue_resume_task(payload: ResumeEnqueueRequest):
    if not payload.taskId.strip():
        raise HTTPException(status_code=400, detail="taskId is required.")

    task = await process_resume_task.kiq(
        payload.taskId.strip(),
        payload.appBaseUrl.strip(),
        payload.internalToken.strip(),
    )

    return {
        "queued": True,
        "taskId": payload.taskId,
        "taskiqId": getattr(task, "task_id", None),
    }


@app.post("/enqueue/tailor")
async def enqueue_tailor_task(payload: ResumeEnqueueRequest):
    if not payload.taskId.strip():
        raise HTTPException(status_code=400, detail="taskId is required.")

    task = await process_resume_task.kiq(
        payload.taskId.strip(),
        payload.appBaseUrl.strip(),
        payload.internalToken.strip(),
    )

    return {
        "queued": True,
        "taskId": payload.taskId,
        "taskiqId": getattr(task, "task_id", None),
    }
