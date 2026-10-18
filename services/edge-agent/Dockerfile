# Base image of the club box agent: Ubuntu 24.04 (Python 3.12) + FFmpeg.
# Build from the repo root, because the agent is a member of the uv workspace:
#   docker build -f services/edge-agent/Dockerfile -t edge-agent .                # club image
#   docker build -f services/edge-agent/Dockerfile --target camsim -t camsim .    # simulator
# The default (last) target is the club image: it does not include the camera simulator.
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
COPY infra/hardware/pyproject.toml infra/hardware/
COPY services/edge-agent services/edge-agent
RUN uv sync --locked --no-dev --no-editable --package edge-agent

# Club venv: the same install without the camera simulator package.
FROM build AS build-club
RUN rm -rf /opt/venv/lib/python3.12/site-packages/edge_agent/camsim \
    && test ! -e /opt/venv/bin/edge-camsim

FROM ubuntu:24.04 AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.12 ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /var/lib/edge-agent --create-home edge
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    EDGE_DATA_DIR=/var/lib/edge-agent
WORKDIR /var/lib/edge-agent
VOLUME ["/var/lib/edge-agent"]

# Camera simulator, only for infra/camsim/docker-compose.yml. Never shipped to a club.
FROM runtime AS camsim
COPY --from=build /opt/venv /opt/venv
RUN printf '#!/bin/sh\nexec /opt/venv/bin/python3 -m edge_agent.camsim "$@"\n' \
        > /usr/local/bin/edge-camsim \
    && chmod 755 /usr/local/bin/edge-camsim
USER edge
ENTRYPOINT ["/usr/bin/tini", "--", "edge-camsim"]

# Club image (default target).
FROM runtime AS club
COPY --from=build-club /opt/venv /opt/venv
USER edge
ENTRYPOINT ["/usr/bin/tini", "--", "edge-agent"]
