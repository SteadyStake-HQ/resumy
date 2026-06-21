# Taskiq Worker

This sidecar runs background resume jobs for the Next.js app using Taskiq and Redis.

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r taskiq_worker/requirements.txt
```

## Run the bridge

```bash
uvicorn taskiq_worker.bridge:app --host 127.0.0.1 --port 8001
```

## Run the worker

```bash
taskiq worker taskiq_worker.broker:broker taskiq_worker.tasks --workers 1 --max-async-tasks 1
```

The bridge receives enqueue requests from Next.js, while the Taskiq worker pulls jobs from Redis and calls back into the internal Next.js processing route.

## Deploy on Railway

Create a separate Railway service for the worker and set its root directory to:

```text
taskiq_worker
```

Railpack will use `railpack.json` in this directory and start the HTTP bridge
and Taskiq worker together:

```bash
python run_service.py
```

Set the worker service variables to match the app and Redis services:

```text
TASKIQ_REDIS_URL=...
TASKIQ_QUEUE_NAME=resume_analysis
TASK_INTERNAL_TOKEN=the-same-long-random-value-used-by-vercel
TASK_INTERNAL_REQUEST_TIMEOUT_SECONDS=300
```

Generate a public Railway domain for the service and set its health-check path
to `/health`. A healthy response confirms that the bridge can reach Redis.

Set these variables on the Vercel app:

```text
TASKIQ_BRIDGE_URL=https://your-worker-service.up.railway.app
TASK_INTERNAL_TOKEN=the-same-long-random-value-used-by-railway
APP_BASE_URL=https://your-app.vercel.app
```

Do not add `/enqueue/resume` to `TASKIQ_BRIDGE_URL`; the app adds that path.
