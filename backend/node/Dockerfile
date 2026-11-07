### ShadowFlow Node.js Skill Studio backend ###
# Story 0.x - dev image. Builds the Node-side server (RunSession, ACP, CLI bridge).
# In production we'd use a multi-stage build + node:20-alpine slim runtime; for
# dev hot-reload we simply mount ./server as a volume and run `tsx watch`.

FROM node:20-alpine

WORKDIR /app

# Install OS-level deps for better-sqlite3 + puppeteer-core peer libs.
RUN apk add --no-cache python3 make g++ libc6-compat

# Install JS deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source (will be overlaid by a bind-mount in dev compose).
COPY . .

EXPOSE 8002

# Default to dev (tsx watch). For prod use: CMD ["npm", "run", "start:prod"].
CMD ["npm", "run", "dev"]
