# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Construir la aplicación para producción
# Las variables VITE_ se inyectan aquí desde el entorno o archivo .env
RUN npm run build

# Stage 2: Servir con Nginx
FROM nginx:stable-alpine

# Copiar el build del stage anterior
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer el puerto 80 (interno del contenedor)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
