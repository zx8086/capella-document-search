#Dockerfile

# Use the official Bun image
FROM oven/bun:latest

# Set the working directory
WORKDIR /app

# Copy package.json and bun.lockb (if you're using one)
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the application
RUN bun run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["bun", "./build/index.js"]
