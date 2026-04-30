"""python -m app.queue で consumer を起動"""

import asyncio
from app.queue.consumer import run_consumer

asyncio.run(run_consumer())
