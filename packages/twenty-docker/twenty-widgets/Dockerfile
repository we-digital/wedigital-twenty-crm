FROM node:24-alpine AS deps

WORKDIR /app

COPY . .

RUN yarn install --immutable

FROM deps AS build

RUN yarn nx build twenty-widgets

FROM node:24-alpine AS widget-mrz-input-build

WORKDIR /widget

RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

COPY packages/twenty-widgets/submodules/widget-mrz-input ./

RUN pnpm install --frozen-lockfile && pnpm exec vite build --base /widget-mrz-input/

FROM nginx:alpine AS runner

COPY --from=build /app/packages/twenty-widgets/build /usr/share/nginx/html
COPY --from=widget-mrz-input-build /widget/dist /usr/share/nginx/html/widget-mrz-input
COPY packages/twenty-docker/twenty-widgets/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4175

CMD ["nginx", "-g", "daemon off;"]
