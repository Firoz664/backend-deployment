# Deployment Guide

This guide covers the complete deployment setup for the Full Stack Auth Backend using Docker, Docker Compose, Nginx, Redis, MongoDB, and monitoring with Prometheus, Loki, and Grafana.

## Quick Start

1. **Clone and Setup**
   ```bash
   cd /path/to/backend
   cp .env.example .env.production
   # Edit .env.production with your actual values
   ```

2. **Deploy**
   ```bash
   ./deploy.sh
   ```

## Architecture

The deployment includes:

- **Backend API**: Node.js application in Docker container
- **Nginx**: Reverse proxy with load balancing and SSL termination
- **MongoDB**: Database with persistent storage
- **Redis**: Caching and session storage
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards
- **Loki**: Log aggregation
- **Promtail**: Log shipping
- **Jenkins CI/CD**: Automated build, test, and deployment pipeline

## Services and Ports

| Service | Internal Port | External Port | URL |
|---------|---------------|---------------|-----|
| Backend API | 9000 | - | http://localhost:8081 (via Nginx) |
| Nginx | 80/443 | 8081/4443 | http://localhost:8081 |
| MongoDB | 27017 | 27018 | mongodb://localhost:27018 |
| Redis | 6379 | 6380 | redis://localhost:6380 |
| Prometheus | 9090 | 9090 | http://localhost:9090 |
| Grafana | 3000 | 3000 | http://localhost:3000 |
| Loki | 3100 | 3100 | http://localhost:3100 |
| Jenkins | 8080 | 8080 | http://localhost:8080 |
| SonarQube | 9000 | 9000 | http://localhost:9000 |

## Deployment Commands

### Full Deployment
```bash
./deploy.sh
```

### Deployment Options
```bash
./deploy.sh --skip-backup      # Deploy without backup
./deploy.sh --cleanup          # Clean up old images after deploy
./deploy.sh --build-only       # Only build, don't deploy
./deploy.sh --deploy-only      # Only deploy, don't build
```

### Management Commands
```bash
./deploy.sh --status           # Show service status
./deploy.sh --logs             # Show all service logs
./deploy.sh --logs backend     # Show specific service logs
./deploy.sh --stop             # Stop all services
./deploy.sh --restart          # Restart all services
```

## Environment Configuration

### Required Environment Variables

Edit `.env.production` with your values:

```bash
# Security (MUST CHANGE)
JWT_SECRET=your_secure_jwt_secret
JWT_REFRESH_SECRET=your_secure_refresh_secret
SESSION_SECRET=your_secure_session_secret
MONGO_ROOT_PASSWORD=your_secure_mongo_password
REDIS_PASSWORD=your_secure_redis_password
GRAFANA_ADMIN_PASSWORD=your_secure_grafana_password

# Email Configuration
EMAIL_HOST=smtp.your-provider.com
EMAIL_USER=your_email@domain.com
EMAIL_PASS=your_app_password

# Application URLs
CLIENT_URL=https://your-frontend-domain.com
API_BASE_URL=https://your-api-domain.com
```

## SSL Configuration

To enable HTTPS:

1. **Obtain SSL certificates** (Let's Encrypt, CloudFlare, etc.)
2. **Place certificates** in `nginx/ssl/`:
   ```
   nginx/ssl/cert.pem
   nginx/ssl/key.pem
   ```
3. **Uncomment HTTPS server block** in `nginx/conf.d/backend.conf`
4. **Update environment variables**:
   ```bash
   CLIENT_URL=https://your-domain.com
   API_BASE_URL=https://api.your-domain.com
   ```

## Monitoring & Observability

### Quick Setup

1. **Services are auto-started** with main deployment:
   ```bash
   ./deploy.sh  # Starts Prometheus, Grafana, Loki, Promtail
   ```

2. **Access Monitoring Dashboards**:
   - **Grafana**: http://localhost:3000 (admin/admin123)
   - **Prometheus**: http://localhost:9090
   - **Loki**: http://localhost:3100

3. **Complete Setup Guide**: [GRAFANA-LOKI-SETUP-GUIDE.md](./GRAFANA-LOKI-SETUP-GUIDE.md)

### Grafana Dashboards

**Pre-configured Dashboards:**
- ✅ **Application Overview**: API metrics, response times, error rates
- ✅ **Logs Dashboard**: Error logs, authentication events, log volume
- ✅ **System Metrics**: CPU, memory, disk usage
- ✅ **Database Monitoring**: MongoDB and Redis metrics

**Dashboard URLs:**
- **Application Overview**: http://localhost:3000/d/fullstack-auth-app
- **Logs Dashboard**: http://localhost:3000/d/fullstack-auth-logs
- **Node Exporter**: http://localhost:3000/d/rYdddlPWk (System metrics)

### Prometheus Metrics & Alerts

**Monitored Services:**
- ✅ Backend API (response time, error rate, memory usage)
- ✅ MongoDB (connections, replication lag, performance)
- ✅ Redis (memory usage, connections, slow queries)
- ✅ System Resources (CPU, memory, disk space)
- ✅ Monitoring Stack (Prometheus, Grafana, Loki health)

**Alert Categories:**
- 🚨 **Critical**: Service down, database connection pool exhaustion
- ⚠️ **Warning**: High error rate, memory usage, slow response times
- ℹ️ **Info**: User registration spikes, low activity periods

**Alert Rules Include:**
```
- Backend API down or high error rate (>5%)
- Response time > 1 second (95th percentile)
- Memory usage > 512MB (backend) or >80% (system)
- Authentication failures spike (>20 in 5min)
- Database/Redis connection issues
- Disk space < 10%
```

### Log Analysis with Loki

**Log Sources:**
- ✅ Backend application logs (JSON formatted)
- ✅ Nginx access/error logs
- ✅ System logs (via Promtail)

**Log Queries Examples:**
```logql
# Error logs from backend
{container="auth-backend"} |= "ERROR"

# Authentication events
{container="auth-backend"} |~ "login|register|authentication"

# Database-related logs
{container="auth-backend"} |~ "database|mongodb|redis"

# Rate of errors per minute
rate({container="auth-backend"} |= "ERROR" [1m])

# Top error messages
topk(10, count by (message) (rate({container="auth-backend"} |= "ERROR" [5m])))
```

### Alerting & Notifications

**Notification Channels:**
- 📧 Email notifications (via SMTP)
- 💬 Slack integration
- 🔔 Grafana dashboard alerts

**Setup Alerts:**
1. **Grafana Alerts**: Built-in dashboard alerts
2. **Prometheus Alerts**: Comprehensive alerting rules
3. **Email Setup**: Configure SMTP in Grafana settings
4. **Slack Setup**: Add webhook URL for team notifications

**Business Logic Monitoring:**
- User registration trends
- Login success/failure rates
- API endpoint usage patterns
- Security incident detection (brute force attempts)

## Backup and Recovery

### Automatic Backups
The deploy script automatically creates backups before deployment:
```bash
./backups/backup_YYYYMMDD_HHMMSS/
├── mongodb_backup/
└── dump.rdb
```

### Manual Backup
```bash
# MongoDB
docker-compose exec mongodb mongodump --out /tmp/backup
docker cp $(docker-compose ps -q mongodb):/tmp/backup ./manual_backup/

# Redis
docker-compose exec redis redis-cli BGSAVE
docker cp $(docker-compose ps -q redis):/data/dump.rdb ./manual_backup/
```

### Restore
```bash
# MongoDB
docker cp ./backup_data/ $(docker-compose ps -q mongodb):/tmp/
docker-compose exec mongodb mongorestore /tmp/backup_data/

# Redis
docker cp ./dump.rdb $(docker-compose ps -q redis):/data/
docker-compose restart redis
```

## Scaling

### Horizontal Scaling
To scale the backend API:

```bash
docker-compose up -d --scale backend=3
```

Nginx will automatically load balance between instances.

### Resource Limits
Add resource limits to `docker-compose.yml`:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          memory: 256M
```

## Health Checks

### Service Health
```bash
curl http://localhost/health
```

### Individual Services
```bash
# Backend
curl http://localhost:9000/health

# MongoDB
docker-compose exec mongodb mongo --eval "db.adminCommand('ping')"

# Redis
docker-compose exec redis redis-cli ping
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check port usage
   sudo netstat -tulpn | grep :80
   
   # Stop conflicting services
   sudo systemctl stop apache2
   ```

2. **Permission Issues**
   ```bash
   # Fix log directory permissions
   sudo chown -R $USER:$USER logs/
   ```

3. **Service Won't Start**
   ```bash
   # Check logs
   ./deploy.sh --logs [service-name]
   
   # Check service status
   docker-compose ps
   ```

4. **Database Connection Issues**
   ```bash
   # Check MongoDB logs
   docker-compose logs mongodb
   
   # Test connection
   docker-compose exec backend npm run test-db
   ```

### Log Locations

- **Application logs**: `./logs/`
- **Nginx logs**: `./nginx/logs/`
- **Deploy logs**: `./deploy.log`
- **Docker logs**: `docker-compose logs [service]`

## Security Checklist

- [ ] Change all default passwords in `.env.production`
- [ ] Configure SSL certificates for HTTPS
- [ ] Set up firewall rules (only allow necessary ports)
- [ ] Enable MongoDB authentication
- [ ] Configure Redis password protection
- [ ] Set up log rotation
- [ ] Configure backup encryption
- [ ] Review Nginx security headers
- [ ] Set up fail2ban for SSH protection
- [ ] Configure monitoring alerts

## Production Recommendations

1. **Use external databases** for production (managed MongoDB, Redis)
2. **Set up log rotation** to prevent disk space issues
3. **Configure monitoring alerts** in Grafana
4. **Use Docker secrets** for sensitive configuration
5. **Set up automated backups** with retention policies
6. **Use a reverse proxy** (CloudFlare, AWS ALB) in front of Nginx
7. **Configure container resource limits**
8. **Set up health check monitoring** (UptimeRobot, etc.)

## Jenkins CI/CD Pipeline

### Quick Setup

1. **Start Jenkins Infrastructure**:
   ```bash
   docker-compose -f docker-compose.jenkins.yml up -d
   ```

2. **Access Jenkins**:
   - **URL**: http://localhost:8080
   - **Initial Password**: 
     ```bash
     docker exec auth-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
     ```

3. **Complete Setup**:
   Follow the detailed step-by-step configuration guide: [JENKINS-SETUP-GUIDE.md](./JENKINS-SETUP-GUIDE.md)

**📋 Configuration Checklist:**
- [ ] Initial Jenkins setup and admin user creation
- [ ] Install required plugins
- [ ] Add GitHub, Docker, Email, and Slack credentials  
- [ ] Configure email notifications (Gmail SMTP)
- [ ] Set up Slack integration with bot token
- [ ] Create multibranch pipeline job
- [ ] Configure GitHub webhooks
- [ ] Test notifications and pipeline

### Pipeline Features

- **Automated Builds**: Triggered on Git push/PR
- **Multi-stage Testing**: Unit, integration, and health checks
- **Email Notifications**: Build status via SMTP
- **Slack Integration**: Team notifications with interactive buttons
- **Docker Registry**: Automated image push and deployment
- **Production Approval**: Manual approval for production deployments
- **Rollback Support**: Automatic backup before deployment

### Email Configuration

```yaml
# Gmail SMTP (jenkins/jenkins.yaml)
mailer:
  smtpHost: "smtp.gmail.com"
  smtpPort: "587"
  authentication:
    username: "your-email@gmail.com"
    password: "your-app-password"  # Use App Password, not regular password
  useTls: true
```

**Gmail Setup Steps**:
1. Enable 2-Factor Authentication
2. Generate App Password: Google Account → Security → App passwords
3. Use app password in Jenkins configuration

### Slack Configuration

```yaml
# Slack Integration (jenkins/jenkins.yaml)
slackNotifier:
  teamDomain: "your-workspace"
  token: "xoxb-your-bot-token"
  tokenCredentialId: "slack-token"
```

**Slack Setup Steps**:
1. Create Slack App at https://api.slack.com/apps
2. Add Bot Token Scopes: `chat:write`, `chat:write.public`
3. Install app to workspace and copy Bot User OAuth Token
4. Invite bot to your channel: `/invite @your-jenkins-bot`

### Pipeline Commands

```bash
# Start Jenkins infrastructure
docker-compose -f docker-compose.jenkins.yml up -d

# View Jenkins logs
docker-compose -f docker-compose.jenkins.yml logs -f jenkins

# Access Jenkins container
docker exec -it auth-jenkins bash

# Stop Jenkins infrastructure
docker-compose -f docker-compose.jenkins.yml down

# Check Jenkins health
curl -f http://localhost:8080/login
```

### Notification Types

- ✅ **Success**: Build and deployment completed successfully
- ❌ **Failure**: Build failed with detailed error logs
- ⚠️ **Unstable**: Build completed with warnings
- ⏹️ **Aborted**: Build was manually stopped

### Additional Services

- **SonarQube**: Code quality analysis at http://localhost:9000
- **Nexus Repository**: Artifact storage at http://localhost:8081
- **Jenkins Agent**: Distributed build support

For detailed Jenkins setup and troubleshooting, see [JENKINS-CICD.md](./JENKINS-CICD.md)

## Support

For issues and questions:
1. Check the logs: `./deploy.sh --logs`
2. Review this documentation
3. Check Docker Compose status: `docker-compose ps`
4. Verify environment configuration: `.env.production`
5. For Jenkins issues: Check [JENKINS-CICD.md](./JENKINS-CICD.md)
6. For deployment errors: Check [DEPLOYMENT-TROUBLESHOOTING.md](./DEPLOYMENT-TROUBLESHOOTING.md)