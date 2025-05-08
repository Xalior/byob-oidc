# Docker Setup for NBN OIDC Provider

This document provides instructions for building, running, and deploying the NBN OIDC Provider application using Docker.

## Prerequisites

- Docker installed on your machine
- Docker Compose installed on your machine (optional, but recommended)

## Building the Docker Image

You can build the Docker image using either Docker directly or Docker Compose.

The Docker image uses Node.js version 22.14.0 as specified in the project's .nvmrc file.

### Using Docker

```bash
docker build -t nbn-oidc-provider .
```

### Using Docker Compose

```bash
docker-compose build
```

## Running the Application Locally

### Using Docker

```bash
# Create a directory for your data if it doesn't exist
mkdir -p data

# Run the container with the data volume mounted
docker run -p 3000:3000 -v $(pwd)/data:/app/data nbn-oidc-provider
```

### Using Docker Compose

```bash
docker-compose up
```

## Deploying to Another Server

To deploy the application to another server, you have several options:

### Option 1: Build on the Target Server

1. Copy your project files to the target server
2. Build and run the Docker image on the target server using the commands above

### Option 2: Push to a Docker Registry

1. Build the image locally
2. Tag the image for your registry:
   ```bash
   docker tag nbn-oidc-provider your-registry.com/your-username/nbn-oidc-provider
   ```
3. Push the image to the registry:
   ```bash
   docker push your-registry.com/your-username/nbn-oidc-provider
   ```
4. On the target server, pull and run the image:
   ```bash
   docker pull your-registry.com/your-username/nbn-oidc-provider
   docker run -p 3000:3000 -v /path/to/data:/app/data your-registry.com/your-username/nbn-oidc-provider
   ```

### Option 3: Export/Import the Image

1. Build the image locally
2. Save the image to a tar file:
   ```bash
   docker save -o nbn-oidc-provider.tar nbn-oidc-provider
   ```
3. Transfer the tar file to the target server
4. Load the image on the target server:
   ```bash
   docker load -i nbn-oidc-provider.tar
   ```
5. Run the container:
   ```bash
   docker run -p 3000:3000 -v /path/to/data:/app/data nbn-oidc-provider
   ```

## Data Volume

The application expects configuration files to be in the `/data` directory. This directory is mounted as a volume in the Docker container.

The data directory is used for:
- Page formatter (page.ts)
- JSON Web Key Set (jkws.json)

## Environment Variables

You can configure the application by setting environment variables when running the container. See the _env_sample file for all available options.

```bash
docker run -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e DATABASE_URL=mysql://user:password@host:port/database \
  -e CACHE_URL=redis://host:port/ \
  nbn-oidc-provider
```

Or in your docker-compose.yml file:

```yaml
environment:
  - NODE_ENV=production
  - DATABASE_URL=mysql://user:password@host:port/database
  - CACHE_URL=redis://host:port/
```

## Security Considerations

- Always use secure passwords and connection strings
- Consider using Docker secrets or environment variables for sensitive information
- Ensure your data volume is properly secured on the host system
- Use HTTPS for all external connections