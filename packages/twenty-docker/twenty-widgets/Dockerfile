FROM node:24-alpine AS deps

WORKDIR /app

COPY . .

RUN yarn install --immutable

FROM deps AS build

RUN yarn nx build twenty-widgets

FROM node:24-alpine AS runner

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/packages/twenty-widgets/build ./build

EXPOSE 4175

CMD ["serve", "-s", "build", "-l", "4175"]
