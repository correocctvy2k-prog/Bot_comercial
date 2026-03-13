# Usamos una imagen base de Node.js actual (Soportada por Supabase)
FROM node:20-bullseye

# 1. Instalar Python 3 y pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    # Librerías necesarias para matplotlib y otras dependencias gráficas
    libgl1-mesa-glx \
    iputils-ping \
    net-tools \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3 /usr/bin/python

# 2. Configurar directorio de trabajo
WORKDIR /app

# 3. Instalar dependencias de Python
# Copiamos primero el requirements.txt para aprovechar el caché de Docker
COPY requirements.txt .
# Instalamos las dependencias globalmente en el contenedor (no hace falta venv aquí)
# Nota: En Debian Bullseye (node:18-bullseye), pip es antiguo y no requiere ni soporta --break-system-packages
RUN pip3 install --no-cache-dir -r requirements.txt

# 4. Instalar dependencias de Node.js
COPY package*.json ./
RUN npm install --production

# 5. Copiar el código fuente
COPY . .

# 6. Crear directorio temporal para gráficos (si no existe)
RUN mkdir -p temp

# 7. Comando de inicio
CMD ["npm", "start"]
