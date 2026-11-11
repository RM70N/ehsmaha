FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web ./web
COPY scripts ./scripts
# قاعدة اللوحة (التدقيق/الجلسات/الصلاحيات) — اربطها بوحدة تخزين دائمة: -v admin-data:/app/data
VOLUME ["/app/data"]
EXPOSE 8787
RUN mkdir -p /app/data && chown -R node:node /app
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/auth/state || exit 1
CMD ["node", "server/index.js"]
