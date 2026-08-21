FROM python:3.11-slim

WORKDIR /app

# Copia os requisitos e instala as dependências do Python
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código do backend e os recursos estáticos do frontend
COPY backend/ ./backend/
COPY static/ ./static/

# Configura variável de ambiente para a porta do Cloud Run (GCP injeta PORT dinamicamente)
ENV PORT=8080

# Executa o servidor ASGI uvicorn
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
