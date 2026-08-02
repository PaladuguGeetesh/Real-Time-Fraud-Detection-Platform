FROM python:3.12-slim

# Without this, Python block-buffers stdout when it isn't attached to
# a TTY (true of any containerized process) -- generator.py's print()
# progress lines would sit in the buffer instead of reaching
# `docker compose logs` in anything close to real time.
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python3", "generator.py"]
