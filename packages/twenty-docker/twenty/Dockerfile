FROM node:20-alpine AS common-deps

WORKDIR /app

# Copy only the necessary files for dependency resolution
COPY ./package.json ./yarn.lock ./.yarnrc.yml ./tsconfig.base.json ./nx.json /app/
COPY ./.yarn/releases /app/.yarn/releases
COPY ./.yarn/patches /app/.yarn/patches

# Copy package.json of all workspaces
COPY ./packages/twenty-emails/package.json /app/packages/twenty-emails/
COPY ./packages/twenty-server/package.json /app/packages/twenty-server/
COPY ./packages/twenty-server/patches /app/packages/twenty-server/patches
COPY ./packages/twenty-ui/package.json /app/packages/twenty-ui/
COPY ./packages/twenty-shared/package.json /app/packages/twenty-shared/
COPY ./packages/twenty-front/package.json /app/packages/twenty-front/
COPY ./packages/twenty-sdk/package.json /app/packages/twenty-sdk/
# COPY ./packages/twenty-widgets/package.json /app/packages/twenty-widgets/

# Install all dependencies once to speed up builds
RUN yarn install && yarn cache clean && npx nx reset


# -----------------------------
# Build the backend
# -----------------------------
FROM common-deps AS twenty-server-build

# Copy source code
COPY ./packages/twenty-emails /app/packages/twenty-emails
COPY ./packages/twenty-shared /app/packages/twenty-shared
COPY ./packages/twenty-server /app/packages/twenty-server

# Build backend
RUN npx nx run twenty-server:build

# Focus production dependencies
RUN yarn workspaces focus --production twenty-emails twenty-shared twenty-server


# -----------------------------
# Build the frontend
# -----------------------------
FROM common-deps AS twenty-front-build

ARG REACT_APP_SERVER_BASE_URL

# Copy source code
COPY ./packages/twenty-front /app/packages/twenty-front
COPY ./packages/twenty-ui /app/packages/twenty-ui
COPY ./packages/twenty-shared /app/packages/twenty-shared
COPY ./packages/twenty-sdk /app/packages/twenty-sdk

RUN yarn install && yarn cache clean && npx nx reset

# Build frontend inside Docker
RUN npx nx run twenty-front:lingui:compile && npx nx build twenty-front


# -----------------------------
# Build the widgets
# -----------------------------
# FROM common-deps AS twenty-widgets-build

# Copy source code
# COPY ./packages/twenty-shared /app/packages/twenty-shared
# COPY ./packages/twenty-widgets /app/packages/twenty-widgets

# Build widgets inside Docker
# RUN npx nx run twenty-shared:build && npx nx run twenty-widgets:build


# -----------------------------
# Final runtime image
# -----------------------------
FROM node:24-alpine AS twenty

# Install tools
RUN apk add --no-cache curl jq postgresql-client
RUN npm install -g tsx serve

# Copy entrypoint
COPY ./packages/twenty-docker/twenty/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app/packages/twenty-server

# Environment variables
ARG REACT_APP_SERVER_BASE_URL
ENV REACT_APP_SERVER_BASE_URL=$REACT_APP_SERVER_BASE_URL

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

# Copy built applications from previous stages
COPY --chown=1000:1000 --from=twenty-server-build /app /app
COPY --chown=1000:1000 --from=twenty-front-build /app/packages/twenty-front/build /app/packages/twenty-server/dist/front
# COPY --chown=1000:1000 --from=twenty-widgets-build /app/packages/twenty-widgets/build /app/packages/twenty-widgets/build

# Set metadata and permissions
LABEL org.opencontainers.image.source=https://github.com/twentyhq/twenty
LABEL org.opencontainers.image.description="Consistent runtime for backend and frontend"

RUN mkdir -p /app/.local-storage /app/packages/twenty-server/.local-storage && \
    chown -R 1000:1000 /app

USER 1000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/main"]
