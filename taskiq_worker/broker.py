from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

try:
    from taskiq_worker.config import (
        TASKIQ_QUEUE_NAME,
        TASKIQ_REDIS_URL,
        TASKIQ_RESULT_EXPIRE_SECONDS,
    )
except ModuleNotFoundError:
    from config import (
        TASKIQ_QUEUE_NAME,
        TASKIQ_REDIS_URL,
        TASKIQ_RESULT_EXPIRE_SECONDS,
    )


result_backend = RedisAsyncResultBackend(
    redis_url=TASKIQ_REDIS_URL,
    result_ex_time=TASKIQ_RESULT_EXPIRE_SECONDS,
)

broker = RedisStreamBroker(
    url=TASKIQ_REDIS_URL,
    queue_name=TASKIQ_QUEUE_NAME,
).with_result_backend(result_backend)
