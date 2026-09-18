# WhatsApp Web koprusu — Render'da ayri bir servis olarak calisir.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     chromium ca-certificates fonts-liberation libnss3 libatk-bridge2.0-0 \
     libatk1.0-0 libcups2 libdrm2 libgbm1 libasound2 libpangocairo-1.0-0 \
     libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxkbcommon0 \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=8080
ENV SESSION_DIR=/var/data/wa-session

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

EXPOSE 8080
CMD ["node", "server.js"]
