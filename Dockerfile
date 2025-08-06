# ==============================================================================
# Dockerfile for Nonprofit Fund Accounting Application
# ==============================================================================
# This Dockerfile creates a production-ready image for the Node.js application.
# It uses a multi-stage build approach for optimization and security.

# --- Stage 1: Build Dependencies ---
# Use a Node.js 18 LTS Alpine image for a small footprint
FROM node:18-alpine AS builder

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker cache
# This layer is only rebuilt if these files change
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# --- Stage 2: Production Image ---
# Use a fresh, lightweight Node.js Alpine image for the final stage
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy dependencies from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy the rest of the application code
COPY . .

# For security, create a non-root user and switch to it
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose the port the application runs on
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Database connection details should be passed as environment variables
# when running the container, for example, via docker-compose.yml.
# ENV PGHOST=db
# ENV PGPORT=5432
# ENV PGDATABASE=fund_accounting_db
# ENV PGUSER=postgres
# ENV PGPASSWORD=your_secure_password

# Healthcheck to ensure the application is running correctly
# We need to install curl for this to work on Alpine
USER root
RUN apk add --no-cache curl
USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# The command to start the application
CMD [ "node", "server.js" ]
