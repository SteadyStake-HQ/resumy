import httpx

from taskiq_worker.broker import broker
from taskiq_worker.config import TASK_INTERNAL_REQUEST_TIMEOUT_SECONDS


@broker.task(task_name="resume_analysis.process_resume_task")
async def process_resume_task(
    task_id: str,
    app_base_url: str,
    internal_token: str,
) -> dict:
    async with httpx.AsyncClient(timeout=TASK_INTERNAL_REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{app_base_url.rstrip('/')}/api/internal/tasks/resume/process",
            json={"taskId": task_id},
            headers={
                "Content-Type": "application/json",
                "x-task-internal-token": internal_token,
            },
        )
        response.raise_for_status()
        return response.json()
