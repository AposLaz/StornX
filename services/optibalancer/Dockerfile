FROM node:22.23.3-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock tsconfig.base.json ./
COPY packages ./packages
COPY services/optibalancer ./services/optibalancer
RUN yarn install --frozen-lockfile && yarn workspace @stornx/event-contracts build && yarn workspace @stornx/platform build && yarn workspace @stornx/optibalancer build

FROM node:22.23.3-bookworm-slim AS production
ENV NODE_ENV=production TZ=UTC SERVICE_NAME=optibalancer
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY --from=build /app/package.json /app/yarn.lock ./
COPY --from=build /app/packages/event-contracts/package.json ./packages/event-contracts/
COPY --from=build /app/packages/platform/package.json ./packages/platform/
COPY --from=build /app/services/optibalancer/package.json ./services/optibalancer/
RUN yarn install --production --frozen-lockfile --ignore-scripts && yarn cache clean
COPY --from=build /app/packages/event-contracts/dist ./packages/event-contracts/dist
COPY --from=build /app/packages/platform/dist ./packages/platform/dist
COPY --from=build /app/services/optibalancer/dist ./services/optibalancer/dist
USER node
EXPOSE 3000
CMD ["node", "services/optibalancer/dist/index.js"]
