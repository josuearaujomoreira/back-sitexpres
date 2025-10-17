# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Certifica que dotenv vai ler o .env
ENV NODE_ENV=production

CMD ["node", "server.js"]
