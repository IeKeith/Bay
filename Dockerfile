# ==============================================================================
# Multi-Stage Production Dockerfile for Garden-to-Table Host
# Packages both React frontend and FastAPI backend into a single container.
# Compatible with Google Cloud Run, Railway, Render, AWS ECS, and Docker.
# ==============================================================================

# --- Stage 1: Build Frontend SPA ---
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Copy existing static public assets (images, mediapipe) so they are included in output
COPY public/ /public/
RUN npm run build

# --- Stage 2: Production Python Backend ---
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy compiled frontend and static assets to /app/public
COPY --from=frontend-builder /public /app/public

EXPOSE 8080

# Start Uvicorn bound to 0.0.0.0 and the dynamic PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
