FROM node:24-alpine AS deps

WORKDIR /app

COPY ./package.json ./yarn.lock ./.yarnrc.yml ./tsconfig.base.json ./nx.json /app/
COPY ./.yarn/releases /app/.yarn/releases
COPY ./.yarn/patches /app/.yarn/patches

COPY ./packages/twenty-widgets/package.json /app/packages/twenty-widgets/
COPY ./packages/twenty-shared/package.json /app/packages/twenty-shared/

RUN yarn workspaces focus twenty-widgets && yarn cache clean && npx nx reset

FROM deps AS build

COPY ./packages/twenty-shared /app/packages/twenty-shared
COPY ./packages/twenty-widgets /app/packages/twenty-widgets

RUN npx nx build twenty-widgets

FROM node:24-alpine AS runner

RUN npm install -g serve

COPY --from=build /app/packages/twenty-widgets/build /app/build

EXPOSE 4175

CMD ["serve", "-s", "/app/build", "-l", "4175"]
