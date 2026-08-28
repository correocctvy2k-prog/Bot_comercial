FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY cctv-automation-final/package*.json ./
RUN npm ci --omit=dev

COPY cctv-automation-final/ ./

# El refresco transitorio de mantenimiento reutiliza el cliente Trello existente.
COPY ["CRM_Frontend/Table Trello/backend/package.json", "CRM_Frontend/Table Trello/backend/package-lock.json", "/opt/trello-backend/"]
RUN cd /opt/trello-backend && npm ci --omit=dev
COPY ["CRM_Frontend/Table Trello/backend/src", "/opt/trello-backend/src"]

RUN mkdir -p /var/lib/skylab-security/data /var/lib/skylab-security/logs \
    /var/lib/skylab-security/reports /var/lib/skylab-security/output \
    /var/lib/skylab-security/state /var/lib/skylab-security/trello

EXPOSE 3003
CMD ["npm", "run", "api"]
