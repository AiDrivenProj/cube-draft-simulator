# 🐳 Docker Guide - Cube Draft Simulator

## 📋 Prerequisites

- Docker installed on your system
- Docker Compose installed (usually included with Docker Desktop)

## 🚀 Starting the Application

### Method 1: Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### Method 2: Docker Direct

```bash
# Build the image
docker build -t cubedraft-simulator .

# Run the container
docker run -d -p 0.0.0.0:3000:80 --name cubedraft-simulator cubedraft-simulator

# Stop the container
docker stop cubedraft-simulator
docker rm cubedraft-simulator
```

## 🌐 Accessing the Application

### On your computer
Open your browser and navigate to:
- `http://localhost:3000`

### From other devices on the same WiFi network

1. **Find your local IP address:**
   ```bash
   # On Mac/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Or
   ipconfig getifaddr en0
   ```

2. **Access from the other device:**
   - Open the browser on your phone, tablet, or other computer
   - Navigate to `http://<YOUR-IP>:3000`
   - Example: `http://192.168.1.100:3000`

## 🔧 Useful Commands

```bash
# Rebuild the image after code changes
docker-compose up -d --build

# View running containers
docker ps

# View real-time logs
docker-compose logs -f

# Restart the container
docker-compose restart

# Stop and remove everything
docker-compose down
```

## 🔒 Security Notes

- Binding to `0.0.0.0:3000` allows access from any device on your local network
- Ensure your firewall allows connections on port 3000
- Do not expose this configuration to the Internet without further security measures

## 🐛 Troubleshooting

### Container fails to start
```bash
# Check logs for errors
docker-compose logs

# Verify port 3000 is not already in use
lsof -i :3000
```

### Cannot access from other devices
1. Verify the container is running: `docker ps`
2. Check your Mac's firewall
3. Ensure devices are on the same WiFi network
4. Verify IP address with `ipconfig getifaddr en0`

### Code changes are not reflected
```bash
# Rebuild the image
docker-compose down
docker-compose up -d --build
```
