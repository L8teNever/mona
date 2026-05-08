FROM python:3.11-slim
LABEL org.opencontainers.image.source=https://github.com/l8tenever/mona

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV MONA_DATA_DIR=/data
EXPOSE 5000
CMD ["python", "main.py"]

