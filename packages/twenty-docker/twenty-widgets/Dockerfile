FROM node:24-alpine AS deps

WORKDIR /app

COPY . .

RUN yarn install --immutable

FROM deps AS build

RUN yarn nx build twenty-widgets

FROM node:24-alpine AS widget-mrz-input-build

WORKDIR /widget

COPY packages/twenty-widgets/submodules/pass-data-widget ./

RUN npm install && npm run build

FROM nginx:alpine AS runner

COPY --from=build /app/packages/twenty-widgets/build /usr/share/nginx/html
COPY --from=widget-mrz-input-build /widget/dist /usr/share/nginx/html/widget-mrz-input
COPY packages/twenty-docker/twenty-widgets/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4175

CMD ["nginx", "-g", "daemon off;"]
