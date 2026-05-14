FROM python:3.13-slim

WORKDIR /work

COPY schema/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt pytest

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
