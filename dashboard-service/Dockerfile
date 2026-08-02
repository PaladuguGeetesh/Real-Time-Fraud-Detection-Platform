# Stage 1: build the static files with Vite. Node/node_modules/source
# never leave this stage.
FROM node:26-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: serve the built dist/ folder only. No Node, no
# node_modules, no source -- just the static files and nginx.
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
