#Dockerfile

# Use the official Bun image as the base
FROM oven/bun:latest AS build

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

# List contents for debugging
RUN echo "Contents of /app after build:" && \
    ls -la /app && \
    echo "Contents of /app/build (if exists):" && \
    ls -la /app/build || echo "build directory does not exist" && \
    echo "Contents of /app/.svelte-kit (if exists):" && \
    ls -la /app/.svelte-kit || echo ".svelte-kit directory does not exist"

# Use a slim Bun image for the final stage
FROM oven/bun:latest

# Set the working directory
WORKDIR /app

# Copy package.json and install production dependencies
COPY --from=build /app/package.json .
RUN bun install --production --frozen-lockfile

# Copy the built application (adjust the path if necessary)
COPY --from=build /app/.svelte-kit ./.svelte-kit
COPY --from=build /app/build ./build

# List contents for debugging
RUN echo "Contents of /app in final stage:" && \
    ls -la /app && \
    echo "Contents of /app/build (if exists):" && \
    ls -la /app/build || echo "build directory does not exist" && \
    echo "Contents of /app/.svelte-kit (if exists):" && \
    ls -la /app/.svelte-kit || echo ".svelte-kit directory does not exist"

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]
