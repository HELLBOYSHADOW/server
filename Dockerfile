FROM node:22-bookworm-slim

WORKDIR /app

# Install Poppler for scanned-PDF rendering
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       poppler-utils \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Copy backend source code
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]