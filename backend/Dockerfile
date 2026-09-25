FROM node:22-alpine

# Install native dependencies required by Prisma and other build engines
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install packages
RUN npm install

# Copy application files
COPY . .

EXPOSE 5000

CMD ["npm", "run", "dev"]
