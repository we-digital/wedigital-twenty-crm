FROM node:24-alpine AS common-deps

WORKDIR /app

COPY ./package.json ./yarn.lock ./.yarnrc.yml ./tsconfig.base.json ./nx.json /app/
COPY ./.yarn/releases /app/.yarn/releases
COPY ./.yarn/patches /app/.yarn/patches

COPY ./packages/twenty-emails/package.json /app/packages/twenty-emails/
COPY ./packages/twenty-server/package.json /app/packages/twenty-server/
COPY ./packages/twenty-server/patches /app/packages/twenty-server/patches
COPY ./packages/twenty-ui/package.json /app/packages/twenty-ui/
COPY ./packages/twenty-shared/package.json /app/packages/twenty-shared/
COPY ./packages/twenty-front/package.json /app/packages/twenty-front/
COPY ./packages/twenty-sdk/package.json /app/packages/twenty-sdk/
COPY ./packages/twenty-widgets/package.json /app/packages/twenty-widgets/

RUN yarn install && yarn cache clean && npx nx reset


FROM common-deps AS twenty-widgets-build

COPY ./packages/twenty-shared /app/packages/twenty-shared
COPY ./packages/twenty-widgets /app/packages/twenty-widgets

RUN npx nx run twenty-shared:build && npx nx run twenty-widgets:build


FROM node:24-alpine AS twenty-widgets

RUN npm install -g serve

WORKDIR /app

COPY --from=twenty-widgets-build /app/packages/twenty-widgets/build /app/build

EXPOSE 4175

CMD ["serve", "-s", "/app/build", "-l", "tcp://0.0.0.0:4175", "--no-request-logging"]
