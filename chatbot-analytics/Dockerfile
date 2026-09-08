# Panel Gerencial de Chatbots (Oskitar / Betty) — servicio del stack Skylab.
# Lee los logs de los bots (local o SSH), mantiene histórico y expone API JSON + SSE.
FROM node:20-alpine

# ssh2 puede compilar un binding nativo opcional (cpu-features); si faltan las
# herramientas cae a la implementación pura de JS, que nos sirve igual.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# El histórico acumulativo vive aquí (se monta como volumen desde compose).
RUN mkdir -p /app/data
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
