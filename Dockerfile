# ENTASBURADA production imaji (Render / herhangi bir Docker ortami)
# Calisma zamani: Next.js (port 3000) + poppler + pdfplumber (admin PDF import icin)

FROM node:22-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @entas/web build

FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages pdfplumber \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY --from=build /app /app
# git'e dahil seed (ilk acilista bos diske kopyalanir)
RUN if [ -d /app/data ]; then mv /app/data /app/data-seed; fi

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/var/data
ENV CATALOG_PYTHON_BIN=/usr/bin/python3

COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
