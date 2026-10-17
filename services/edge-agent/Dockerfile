# Base image of the club box agent: Ubuntu 24.04 (Python 3.12) + FFmpeg.
# Build from the repo root, because the agent is a member of the uv workspace:
#   docker build -f services/edge-agent/Dockerfile -t edge-agent .
# NVENC/CUDA (GPU encoding) comes later, together with the recorder.

FROM ghcr.io/astral-sh/uv:0.13.1 AS uv

FROM ubuntu:24.04 AS build
COPY --from=uv /uv /usr/local/bin/uv
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.12 python3.12-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON=/usr/bin/python3.12 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src
COPY pyproject.toml uv.lock ./
COPY packages/config/pyproject.toml packages/config/brand.py packages/config/
COPY packages/contracts/pyproject.toml packages/contracts/
COPY ml/pyproject.toml ml/
COPY services/edge-agent services/edge-agent
RUN uv sync --locked --no-dev --no-editable --package edge-agent

FROM ubuntu:24.04
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.12 ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /var/lib/edge-agent --create-home edge
COPY --from=build /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    EDGE_DATA_DIR=/var/lib/edge-agent
USER edge
WORKDIR /var/lib/edge-agent
VOLUME ["/var/lib/edge-agent"]
ENTRYPOINT ["/usr/bin/tini", "--", "edge-agent"]
