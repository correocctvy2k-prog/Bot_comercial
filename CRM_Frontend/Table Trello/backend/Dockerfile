FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev

# Copiar código del backend
COPY . .

# Crear directorio para la base de datos sqlite
RUN mkdir -p data

# Exponer el puerto del backend
EXPOSE 3003

ENV NODE_ENV=production
ENV PORT=3003
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/skylab-tareas.db

CMD ["npm", "start"]
