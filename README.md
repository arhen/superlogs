# superlogs

A minimalist web-based log viewer for Supervisor process manager. Monitor and search your supervisor logs with a terminal-inspired UI.

## Features

- **Project Management** - Organize supervisors by project with environment tags (local, dev, staging, prod)
- **Log Viewer** with search, level filtering, and date range filtering
- **Log Tailing** - Real-time log updates with notification bar (tail -f style)
- **Log Export** - Export logs as TXT, JSON, or CSV
- **Config Parser** - View parsed supervisor configuration details
- **Dark/Light Mode** - Gruvbox-themed UI with theme toggle
- **Session Auth** - Secure login with bcrypt password hashing

## Tech Stack

- **Runtime**: Bun
- **Framework**: TanStack Start (React 19)
- **Database**: SQLite (bun:sqlite)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Theme**: Gruvbox (light default)

## Quick Start

### Local Development

```bash
# Install dependencies
bun install

# Create a user
bun run create-user admin yourpassword

# Start dev server
bun run dev
```

Open http://localhost:3000

### Production Build

```bash
bun run build
bun run start
```

## Container Deployment

### Using Docker

```bash
# Build and start
docker-compose up -d --build

# Create admin user
docker exec -it superlogs bun run create-user admin yourpassword
```

### Using Podman

```bash
# Build image
podman build -t superlogs .

# Run container
podman run -d \
  --name superlogs \
  -p 4000:4000 \
  -v ./data:/app/data:Z \
  -v /var/log/supervisor:/var/log/supervisor:ro,Z \
  -v /etc/supervisor/conf.d:/etc/supervisor/conf.d:ro,Z \
  -e NODE_ENV=production \
  -e PORT=4000 \
  --restart unless-stopped \
  superlogs

# Create admin user
podman exec -it superlogs bun run create-user admin yourpassword
```

Or using podman-compose:
```bash
podman-compose up -d --build
podman exec -it superlogs bun run create-user admin yourpassword
```

### Access the App

Open http://your-server:4000

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `DB_PATH` | `./data/supervisor-logs.db` | SQLite database path |
| `NODE_ENV` | `development` | Environment mode |

### Docker Volumes

Edit `docker-compose.yml` to mount your supervisor log directories:

```yaml
volumes:
  # Database persistence
  - ./data:/app/data
  
  # Mount your supervisor logs (read-only)
  - /var/log/supervisor:/var/log/supervisor:ro
  - /etc/supervisor/conf.d:/etc/supervisor/conf.d:ro
  
  # Add more log directories as needed
  - /path/to/project/logs:/logs/project:ro
```

## Nginx Reverse Proxy

Copy and edit the example config:

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/superlogs.conf
sudo nano /etc/nginx/sites-available/superlogs.conf  # Edit your domain
sudo ln -s /etc/nginx/sites-available/superlogs.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

For SSL, use certbot:
```bash
sudo certbot --nginx -d logs.yourdomain.com
```

## User Management

Create users via CLI:

```bash
# Local
bun run create-user <username> <password>

# Docker
docker exec -it superlogs bun run create-user <username> <password>
```

## Project Structure

```
src/
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   └── AppLayout.tsx
├── routes/          # TanStack Router pages
│   ├── index.tsx    # Project list
│   ├── login.tsx    # Login page
│   └── projects/    # Project & log viewer routes
├── server/          # Server-side code
│   ├── api.ts       # Server functions
│   ├── auth.ts      # Authentication
│   ├── db.ts        # SQLite database
│   └── supervisor.ts # Log parsing
└── styles.css       # Gruvbox theme
```

## Usage

1. **Login** with your created user
2. **Create a Project** - Give it a name and environment tag
3. **Add Supervisors** - Point to your supervisor config and log files
4. **View Logs** - Search, filter by level, export as needed
5. **Tail Logs** - Enable tailing to watch for new log entries

## License

MIT
