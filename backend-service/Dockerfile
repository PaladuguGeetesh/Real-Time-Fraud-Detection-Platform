FROM node:26-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Prisma Client is generated from prisma/schema.prisma into
# node_modules/.prisma/client. This must happen at build time -- if
# left to a runtime step, the app crashes on its first Prisma call
# with no generated client to import.
RUN npx prisma generate

EXPOSE 4000

CMD ["node", "src/server.js"]
