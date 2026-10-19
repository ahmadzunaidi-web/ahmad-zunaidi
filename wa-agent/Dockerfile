# Untested template - build and verify in your own environment before relying on it.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/wa-agent.db
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
VOLUME /data
EXPOSE 3000
# NODE_ENV=production requires ADMIN_TOKEN at runtime (docker run -e ADMIN_TOKEN=...)
CMD ["npx", "tsx", "src/index.ts"]
