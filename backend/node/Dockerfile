### ShadowFlow Node.js Skill Studio backend ###
# Story 0.x - dev image. Builds the Node-side server (RunSession, ACP, CLI bridge).
# 用 Debian slim（glibc）：本机 WSL2 VM 里 node:20-alpine(musl) 的 node 二进制
# 直接 Segmentation fault（node:18 正常、node:20-slim 正常），故弃用 alpine。
# For dev hot-reload we mount the source as a volume and run `tsx watch`.

FROM docker.m.daocloud.io/library/node:20-slim

WORKDIR /app

# OS deps: better-sqlite3 编译链（python3/make/g++）+ wget（healthcheck 用）。
# npm 换 npmmirror 避免默认源超慢。
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ wget \
    && rm -rf /var/lib/apt/lists/* \
    && npm config set registry https://registry.npmmirror.com

# Install JS deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source (will be overlaid by a bind-mount in dev compose).
COPY . .

EXPOSE 8002

# Default to dev (tsx watch). For prod use: CMD ["npm", "run", "start:prod"].
CMD ["npm", "run", "dev"]
