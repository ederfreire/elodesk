FROM node:21.6.2 AS builder

WORKDIR /app

# git é necessário para instalar @itsukichan/baileys via URL do GitHub
RUN apt-get update && apt-get install -y git python3 build-essential && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY scripts ./scripts/
RUN npm install --force

# Falha cedo se o Baileys não foi instalado (evita imagem quebrada em runtime)
RUN node -e "require('@itsukichan/baileys') || require('@whiskeysockets/baileys')" \
    && echo "✅ Baileys instalado com sucesso"

COPY . .
RUN npm run build && mkdir -p /app/public /app/config

FROM node:21.6.2

RUN apt-get update && apt-get install -y \
    postgresql-client \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.sequelizerc ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/config ./config
RUN mkdir -p /app/public /app/private

EXPOSE 8080

CMD ["node", "dist/server.js"]
