import os
import signal
import subprocess
import sys
import time


def main() -> int:
    port = os.getenv("PORT", "8000")
    processes = [
        subprocess.Popen(
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
        ),
        subprocess.Popen(
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
        ),
    ]

    print(
        f"[taskiq-service] bridge_port={port} bridge_pid={processes[0].pid} "
        f"worker_pid={processes[1].pid}",
        flush=True,
    )

    def stop_processes(signum: int, _frame=None) -> None:
        print(f"[taskiq-service] stopping signal={signum}", flush=True)
        for process in processes:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGTERM, stop_processes)
    signal.signal(signal.SIGINT, stop_processes)

    try:
        while True:
            for process in processes:
                return_code = process.poll()
                if return_code is not None:
                    print(
                        f"[taskiq-service] child_exited pid={process.pid} "
                        f"return_code={return_code}",
                        flush=True,
                    )
                    stop_processes(signal.SIGTERM)
                    return return_code or 1
            time.sleep(0.5)
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    raise SystemExit(main())
