FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts index.html ./
COPY server ./server
COPY src ./src
COPY public ./public

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
CMD ["node", "dist-server/index.js"]
