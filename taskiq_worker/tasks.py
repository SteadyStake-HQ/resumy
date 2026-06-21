import logging

import httpx

try:
    from taskiq_worker.broker import broker
    from taskiq_worker.config import TASK_INTERNAL_REQUEST_TIMEOUT_SECONDS
except ModuleNotFoundError:
    from broker import broker
    from config import TASK_INTERNAL_REQUEST_TIMEOUT_SECONDS


logger = logging.getLogger("taskiq.worker")


@broker.task(task_name="resume_analysis.process_resume_task")
async def process_resume_task(
    task_id: str,
    app_base_url: str,
    internal_token: str,
    debug_id: str = "",
) -> dict:
    correlation_id = debug_id or task_id
    callback_url = f"{app_base_url.rstrip('/')}/api/internal/tasks/resume/process"
    logger.info(
        "[taskiq:worker] callback_started debug_id=%s task_id=%s",
        correlation_id,
        task_id,
    )

    async with httpx.AsyncClient(timeout=TASK_INTERNAL_REQUEST_TIMEOUT_SECONDS) as client:
        try:
            response = await client.post(
                callback_url,
                json={"taskId": task_id, "debugId": correlation_id},
                headers={
                    "Content-Type": "application/json",
                    "x-task-internal-token": internal_token,
                    "x-task-debug-id": correlation_id,
                },
            )
            logger.info(
                "[taskiq:worker] callback_response debug_id=%s task_id=%s status=%s",
                correlation_id,
                task_id,
                response.status_code,
            )
            response.raise_for_status()
            result = response.json()
            logger.info(
                "[taskiq:worker] callback_completed debug_id=%s task_id=%s",
                correlation_id,
                task_id,
            )
            return result
        except Exception:
            logger.exception(
                "[taskiq:worker] callback_failed debug_id=%s task_id=%s",
                correlation_id,
                task_id,
            )
            raise
