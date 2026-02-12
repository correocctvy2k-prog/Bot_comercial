# Usamos una imagen base de Node.js (Debian Bullseye es estable y fácil de configurar con Python)
FROM node:18-bullseye

# 1. Instalar Python 3 y pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    # Librerías necesarias para matplotlib y otras dependencias gráficas
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# 2. Configurar directorio de trabajo
WORKDIR /app

# 3. Instalar dependencias de Python
# Copiamos primero el requirements.txt para aprovechar el caché de Docker
COPY requirements.txt .
# Instalamos las dependencias globalmente en el contenedor (no hace falta venv aquí)
# --break-system-packages es necesario en versiones recientes de pip en Debian/Ubuntu
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# 4. Instalar dependencias de Node.js
COPY package*.json ./
RUN npm install --production

# 5. Copiar el código fuente
COPY . .

# 6. Crear directorio temporal para gráficos (si no existe)
RUN mkdir -p temp

# 7. Comando de inicio
CMD ["npm", "start"]
