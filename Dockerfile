# Interface d'admin de Glance : Node + `yaml` + client ssh. L'éditeur (CodeMirror)
# est compilé dans un premier stage, l'image finale n'a que les dépendances runtime.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
RUN apk add --no-cache openssh-client
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY --from=build /app/public/editor.bundle.js ./public/editor.bundle.js
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8084
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8084/api/info || exit 1
CMD ["./docker-entrypoint.sh"]
