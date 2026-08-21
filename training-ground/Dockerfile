FROM python:3.12-bookworm

WORKDIR /app

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY docker-install-host.sh /docker-install-host.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh /docker-install-host.sh && chmod +x /docker-entrypoint.sh /docker-install-host.sh

COPY pyproject.toml /app/pyproject.toml
COPY src /app/src

# CUDA 13.0 wheel (ADR 0013). Do not install torch from PyPI (CPU / wrong CUDA).
RUN pip install --no-cache-dir torch==2.13.0 --index-url https://download.pytorch.org/whl/cu130 \
 && pip install --no-cache-dir -e .

# ONNX + ExecuTorch 1.4.1 (matches torch 2.13). --no-deps so it cannot pull a PyPI torch (ADR 0014).
# onnxscript is required by torch 2.13's dynamo ONNX exporter.
RUN pip install --no-cache-dir onnx onnxscript pyyaml flatbuffers packaging "ruamel.yaml" tabulate \
 && pip install --no-cache-dir --no-deps executorch==1.4.1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["python", "--version"]
