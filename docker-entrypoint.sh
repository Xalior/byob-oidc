#!/bin/sh
set -e

echo "Initializing database..."

# Generate database migrations if they don't exist
if [ ! -d "./drizzle" ] || [ -z "$(ls -A ./drizzle 2>/dev/null)" ]; then
  echo "Generating database migrations..."
  pnpm run db:generate
fi

# Push schema changes to the database
# This will create tables if they don't exist and update them if they do
echo "Pushing schema changes to the database..."
pnpm run db:push --force

# Run migrations to apply any pending migrations
# The updated migrate.js script will handle cases where tables already exist
echo "Checking and applying any pending migrations..."
pnpm run db:run-migrations

# Start the application
echo "Starting the application..."
exec pnpm start
