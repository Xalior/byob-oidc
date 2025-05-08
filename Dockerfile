FROM node:22.14.0-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install

# Copy the rest of the application code
COPY . .

# Build the application
#RUN pnpm build

# Create a volume mount point for sensitive data
VOLUME /app/data

# Expose the port the app runs on
#EXPOSE 5000

# Create a startup script that initializes the database and starts the application
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Command to run the startup script
CMD ["/app/docker-entrypoint.sh"]
