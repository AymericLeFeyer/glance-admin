# Interface d'admin de Glance. Aucun build : Node + `yaml` + le client ssh.
FROM node:24-alpine
ENV NODE_ENV=production
RUN apk add --no-cache openssh-client
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8084
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8084/api/info || exit 1
CMD ["node", "server/main.js"]
