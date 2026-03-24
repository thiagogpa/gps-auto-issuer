FROM node:18-alpine

# Install Chromium and its dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    tzdata

ENV TZ=America/Sao_Paulo \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

ENV NODE_ENV=production

# Copy the package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the application
COPY . .

# Run as unprivileged user
RUN addgroup -S app && adduser -S app -G app && \
    mkdir -p /app/output && \
    chown -R app:app /app
USER app

# Run the script when the container starts
CMD ["node", "src/index.js"]
