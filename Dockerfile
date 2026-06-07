FROM node:20-slim

WORKDIR /app

RUN apt-get update --no-install-recommends && \
    apt-get install -y --no-install-recommends \
    build-essential \
    python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 5500

CMD ["node", "app.js"]
