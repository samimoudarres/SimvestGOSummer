# Production-shaped Simvest: Vite client bundle + Express API on one port (same-origin /api).
# TLS terminates at your host/reverse proxy; this container speaks HTTP only.

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# QA scripts call Massive (needs MASSIVE_API_KEY). Render only injects env at runtime, not
# during `docker build`, so default to compile-only. Local: docker build --build-arg RUN_QA_CHECKS=1 .
ARG RUN_QA_CHECKS=0
RUN if [ "$RUN_QA_CHECKS" = "1" ]; then npm run qa:phase7-automation; \
    else npm run build; fi

ENV NODE_ENV=production
ENV SIMVEST_SERVE_DIST=true

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "server/index.ts"]
