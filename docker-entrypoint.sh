#!/bin/sh
set -e

# Fix permissions for the data directory
# This ensures the 'app' user can read/write the database
if [ -d "/app/data" ]; then
  echo "Fixing permissions for /app/data..."
  chown -R app:app /app/data
fi

# Switch to app user and execute the command
echo "Starting application as user 'app'..."
exec su-exec app "$@"
