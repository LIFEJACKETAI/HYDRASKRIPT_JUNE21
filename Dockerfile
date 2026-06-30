FROM node:20-slim

# Install FFmpeg and system dependencies
RUN apt-get update && apt-get install -y ffmpeg openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for caching
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js app
RUN npm run build

# EXPOSE the correct port for Coolify
EXPOSE 3020

# Start the app on the correct port
CMD ["sh", "-c", "PORT=3020 npm start"]