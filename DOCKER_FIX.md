# Docker Compose SQLite Permission Fix

## Problem

When running the application with Docker Compose, you may encounter errors related to the session database, such as:
- "no such table: sessions"
- "unable to open database file"
- "database is locked"

These errors do NOT occur when running directly with PM2 (outside Docker).

## Root Cause

The issue is a **volume permission problem**:

1. The Dockerfile creates a non-root user `app` (UID 1001) for security
2. Docker Compose mounts the host's `./data` directory into the container
3. The host's `./data` directory is owned by `root` (UID 0)
4. The `app` user inside the container cannot write to files owned by `root`

When mounting a host directory as a volume, Docker preserves the host's file ownership and permissions, which overrides any permissions set in the Dockerfile.

## Solution

An **entrypoint script** (`docker-entrypoint.sh`) fixes permissions at container startup:

1. Runs as `root` initially (before switching users)
2. Changes ownership of `/app/data` to the `app` user
3. Switches to the `app` user and starts the application

This approach:
- ✅ Maintains security (app runs as non-root)
- ✅ Works with volume mounts
- ✅ Automatically fixes permissions on every container start
- ✅ No manual intervention required

## Files Changed

### 1. `docker-entrypoint.sh` (NEW)
```bash
#!/bin/sh
set -e

# Fix permissions for the data directory
# This ensures the 'app' user can read/write the database
if [ -d "/app/data" ]; then
  echo "Fixing permissions for /app/data..."
  if ! chown -R app:app /app/data; then
    echo "ERROR: Failed to change ownership of /app/data" >&2
    exit 1
  fi
  echo "Permissions fixed successfully"
fi

# Switch to app user and execute the command
echo "Starting application as user 'app'..."
exec su-exec app "$@"
```

### 2. `Dockerfile` (UPDATED)
- Added `su-exec` package for lightweight user switching
- Copied entrypoint script and made it executable
- Set `ENTRYPOINT` to use the script
- Removed `USER app` directive (script handles user switching)

## Usage

### Build and Run

```bash
# Build the image
docker-compose build

# Start the application
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Expected Output

You should see in the logs:
```
Fixing permissions for /app/data...
Permissions fixed successfully
Starting application as user 'app'...
[INFO] Loading static assets from ./dist/client...
[SUCCESS] TanStack Start handler initialized
[SUCCESS] Server listening on http://localhost:4000
```

### Verify Permissions

Inside the container:
```bash
docker-compose exec superlogs ls -la /app/data
```

Should show:
```
total 60
drwxr-xr-x 2 app app  4096 Dec 12 13:05 .
drwxr-xr-x 1 app app  4096 Dec 12 13:05 ..
-rw-r--r-- 1 app app 53248 Dec 12 13:05 supervisor-logs.db
```

All files and the directory itself should be owned by `app:app`.

## Migration from PM2

If you were previously running with PM2 and have an existing database owned by root:

```bash
# Stop the PM2 process
pm2 stop all

# Fix permissions on the host (optional, but recommended)
sudo chown -R 1001:1001 ./data

# Start with Docker Compose
docker-compose up -d
```

The entrypoint script will automatically fix permissions even if you skip the `chown` step above.

## Troubleshooting

### Container fails to start

Check logs:
```bash
docker-compose logs superlogs
```

### Permission denied errors persist

Ensure the entrypoint script is executable:
```bash
docker-compose exec superlogs ls -l /usr/local/bin/docker-entrypoint.sh
```

Should show: `-rwxr-xr-x`

### Database locked errors

This can happen if:
1. Multiple instances are running (check with `docker-compose ps` and `pm2 list`)
2. The database file is corrupted (backup and remove `./data/*.db-*` files)

## Security Notes

- The container starts as `root` briefly to fix permissions
- The application runs as `app` (UID 1001) - a non-root user
- This is the standard pattern for handling volume permissions in Docker
- The `su-exec` utility is more lightweight than `gosu` or `sudo`
