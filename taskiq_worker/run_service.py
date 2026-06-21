import os
from pathlib import Path
import signal
import subprocess
import sys
import time


WORKER_DIR = Path(__file__).resolve().parent


def start_bridge(port: str) -> subprocess.Popen:
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "bridge:app",
            "--host",
            "0.0.0.0",
            "--port",
            port,
        ],
        cwd=WORKER_DIR,
    )


def start_worker() -> subprocess.Popen:
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "taskiq",
            "worker",
            "broker:broker",
            "tasks",
            "--workers",
            "1",
            "--max-async-tasks",
            "1",
        ],
        cwd=WORKER_DIR,
    )


def main() -> int:
    port = os.getenv("PORT", "8000")
    bridge = start_bridge(port)
    worker = start_worker()
    stopping = False

    print(
        f"[taskiq-service] worker_dir={WORKER_DIR} bridge_port={port} "
        f"bridge_pid={bridge.pid} worker_pid={worker.pid}",
        flush=True,
    )

    def stop_processes(signum: int, _frame=None) -> None:
        nonlocal stopping
        stopping = True
        print(f"[taskiq-service] stopping signal={signum}", flush=True)
        for process in (bridge, worker):
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGTERM, stop_processes)
    signal.signal(signal.SIGINT, stop_processes)

    try:
        while not stopping:
            bridge_code = bridge.poll()
            if bridge_code is not None:
                print(
                    f"[taskiq-service] bridge_exited return_code={bridge_code}",
                    flush=True,
                )
                if worker.poll() is None:
                    worker.terminate()
                return bridge_code or 1

            worker_code = worker.poll()
            if worker_code is not None:
                print(
                    f"[taskiq-service] worker_exited return_code={worker_code}; "
                    "restarting_in=2s",
                    flush=True,
                )
                time.sleep(2)
                if not stopping:
                    worker = start_worker()
                    print(
                        f"[taskiq-service] worker_restarted worker_pid={worker.pid}",
                        flush=True,
                    )

            time.sleep(0.5)
    finally:
        for process in (bridge, worker):
            if process.poll() is None:
                process.terminate()
        for process in (bridge, worker):
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
