# The PWA as a static site behind nginx. Build from the repo root (it needs the shared packages):
#   docker build -f apps/pwa/Dockerfile -t tvandj-pwa .
#   docker run -p 8080:80 tvandj-pwa

# The build is platform-independent (it outputs static files), so it runs natively even when
# the image is built for another architecture.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci --no-audit --no-fund
# Optional: IMDb and Rotten Tomatoes ratings. Baked into the bundle, so anyone using the app can read it.
ARG EXPO_PUBLIC_OMDB_API_KEY
ENV EXPO_PUBLIC_OMDB_API_KEY=$EXPO_PUBLIC_OMDB_API_KEY
# Metro needs roughly 3 GB+ of memory here (Docker/Podman VMs default to 2 GB).
RUN npm run build:pwa

FROM nginx:1.29-alpine
COPY apps/pwa/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/pwa/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
