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
