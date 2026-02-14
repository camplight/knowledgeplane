# KnowledgePlane Benchmarks - Docker Image
# Python 3.11 with pinned dependencies for reproducible benchmarking

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copy requirements file with researched, pinned versions
COPY requirements-docker.txt ./

# Install Python dependencies from researched requirements
# PyTorch 2.2.0 (recommended stable version) with CPU-only build
RUN pip install torch==2.2.0 torchvision==0.17.0 torchaudio==2.2.0 --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements-docker.txt

# Copy benchmark files
COPY *.py ./
COPY tests/ ./tests/
COPY demos/ ./demos/

# Create output directory
RUN mkdir -p output

# Test imports to verify everything works
RUN python3 -c "import torch; import numpy; import sentence_transformers; import datasets; import faiss; print('All imports successful!')"

# Default command runs a quick validation test
CMD ["python3", "bench_hotpotqa.py", "--n", "20", "--mock_kp", "--run_vector", "false"]
