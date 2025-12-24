FROM node:slim AS base

ENV TZ=UTC
WORKDIR /app
COPY package.json yarn.lock tsconfig.json ./
RUN yarn install --frozen-lockfile
COPY . .

# ---------- Build stage ----------
FROM base AS builder

RUN yarn build

# ---------- Production stage ----------
FROM node:slim AS production

ENV TZ=UTC
WORKDIR /app

RUN apt-get update && apt-get install -y curl bash
RUN curl -LO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x kubectl && mv kubectl /usr/local/bin/

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/yarn.lock ./

# Install only production dependencies
RUN yarn install --production --frozen-lockfile

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
