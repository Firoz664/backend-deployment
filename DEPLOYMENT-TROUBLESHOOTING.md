# Deployment Troubleshooting & Error Reference Guide

## Quick Deployment Checklist

### Pre-Deployment Requirements
- [ ] Docker and Docker Compose installed
- [ ] `.env.production` configured with secure passwords
- [ ] Email SMTP credentials configured
- [ ] SSL certificates placed (if using HTTPS)
- [ ] Required ports available (80, 443, 3000, 9000, 6379, 27017)

### Deployment Commands Reference
```bash
# Standard deployment
./deploy.sh

# Deployment with options
./deploy.sh --skip-backup       # Skip database backup
./deploy.sh --cleanup          # Clean old images after
./deploy.sh --build-only       # Build without deploying
./deploy.sh --deploy-only      # Deploy without building

# Management commands
./deploy.sh --status           # Check service status
./deploy.sh --logs backend     # View specific service logs
./deploy.sh --stop             # Stop all services
./deploy.sh --restart          # Restart services
```

## Common Deployment Errors & Solutions

### 1. Port Conflicts

**Error**: `Port already in use` or `bind: address already in use`

**Symptoms**:
```bash
Error response from daemon: driver failed programming external connectivity
Cannot start service nginx: Ports are not available
```

**Solutions**:
```bash
# Check what's using the ports
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
sudo netstat -tulpn | grep :3000

# Stop conflicting services
sudo systemctl stop apache2
sudo systemctl stop nginx
sudo pkill -f "node.*3000"

# Or change ports in docker-compose.yml
ports:
  - "8082:80"  # Change from 8081 to 8082
```

### 2. Environment Configuration Issues

**Error**: `Invalid JWT secret` or `Missing required environment variables`

**Check these variables in `.env.production`**:
```bash
# Critical variables that MUST be changed
JWT_SECRET=your_long_random_string_here
JWT_REFRESH_SECRET=another_long_random_string
MONGO_ROOT_PASSWORD=secure_password_123
REDIS_PASSWORD=secure_redis_password
EMAIL_PASS=your_app_specific_password
```

**Generate secure secrets**:
```bash
# Generate random JWT secrets
openssl rand -hex 64
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Database Connection Failures

**Error**: `MongoServerError: Authentication failed`

**Solutions**:
```bash
# Check MongoDB container logs
docker-compose logs mongodb

# Verify MongoDB is running
docker-compose ps mongodb

# Test MongoDB connection
docker-compose exec backend node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err.message));
"

# Reset MongoDB data (CAUTION: destroys data)
docker-compose down
docker volume rm backend_mongodb_data
docker-compose up -d mongodb
```

### 4. Redis Connection Issues

**Error**: `Redis connection failed` or `NOAUTH Authentication required`

**Solutions**:
```bash
# Check Redis logs
docker-compose logs redis

# Test Redis connection
docker-compose exec redis redis-cli -a ${REDIS_PASSWORD} ping

# Verify Redis configuration
docker-compose exec redis cat /usr/local/etc/redis/redis.conf

# Reset Redis data
docker-compose down
docker volume rm backend_redis_data
docker-compose up -d redis
```

### 5. Email Service Failures

**Error**: `Invalid login: 535-5.7.8 Username and Password not accepted`

**Gmail Setup**:
1. Enable 2-Factor Authentication
2. Generate App Password: Google Account → Security → App passwords
3. Use app password in `EMAIL_PASS`, not your regular password

**Other providers**:
```bash
# Common SMTP settings
# Gmail: smtp.gmail.com:587
# Outlook: smtp-mail.outlook.com:587
# Yahoo: smtp.mail.yahoo.com:587
```

### 6. SSL/HTTPS Configuration

**Error**: `certificate verify failed` or `SSL handshake failed`

**Solutions**:
```bash
# Check certificate files exist
ls -la nginx/ssl/
# Should show: cert.pem, key.pem

# Test certificate validity
openssl x509 -in nginx/ssl/cert.pem -text -noout

# For Let's Encrypt certificates
certbot certonly --webroot -w /var/www/html -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem
```

### 7. Memory and Resource Issues

**Error**: `Container killed (OOMKilled)` or `Process exited with code 137`

**Solutions**:
```bash
# Check system resources
free -h
df -h

# Add memory limits to docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

# Increase Docker memory allocation
# Docker Desktop → Settings → Resources → Memory
```

### 8. Permission Errors

**Error**: `EACCES: permission denied` or `cannot create directory`

**Solutions**:
```bash
# Fix log directory permissions
sudo chown -R $USER:$USER logs/
sudo chmod -R 755 logs/

# Fix Docker socket permissions (Linux)
sudo usermod -aG docker $USER
newgrp docker

# Fix SSL directory permissions
sudo chown -R $USER:$USER nginx/ssl/
sudo chmod 600 nginx/ssl/key.pem
sudo chmod 644 nginx/ssl/cert.pem
```

### 9. Build Failures

**Error**: `npm ERR! network` or `Docker build failed`

**Solutions**:
```bash
# Clear Docker cache
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache

# Check Dockerfile and package.json
docker-compose logs backend

# Fix npm network issues
docker-compose exec backend npm config set registry https://registry.npmjs.org/
```

### 10. Service Health Check Failures

**Error**: `Service unhealthy` or `Health check timeout`

**Debug steps**:
```bash
# Check individual service health
curl -f http://localhost:8081/health
curl -f http://localhost:3000/api/health
curl -f http://localhost:9090/-/healthy

# Check service logs
./deploy.sh --logs backend
./deploy.sh --logs nginx
./deploy.sh --logs mongodb

# Verify service dependencies
docker-compose ps
```

## Monitoring and Maintenance

### Log Analysis

**Key log locations**:
```bash
# Application logs
tail -f logs/combined-$(date +%Y-%m-%d).log
tail -f logs/error-$(date +%Y-%m-%d).log

# Container logs
docker-compose logs -f --tail=100 backend
docker-compose logs -f --tail=100 nginx

# System logs
journalctl -u docker -f
```

**Important log patterns to watch**:
- `Authentication failed` - Check JWT/password config
- `Connection timeout` - Database/Redis connectivity
- `Rate limit exceeded` - May need to adjust limits
- `Memory usage` - Monitor for memory leaks
- `SSL certificate` - Certificate expiration warnings

### Performance Monitoring

**Key metrics to monitor**:
```bash
# System resources
htop
iostat -x 1
free -h

# Container resources
docker stats

# Database performance
docker-compose exec mongodb mongostat
docker-compose exec redis redis-cli info stats
```

### Backup Verification

**Test backup integrity**:
```bash
# List recent backups
ls -la backups/ | head -10

# Test MongoDB backup
mongorestore --dry-run backups/latest/mongodb_backup/

# Test Redis backup
redis-cli --rdb backups/latest/dump.rdb
```

## Emergency Procedures

### Service Recovery

**If services are down**:
```bash
# 1. Check system resources
df -h && free -h

# 2. Check Docker daemon
sudo systemctl status docker

# 3. Emergency restart
docker-compose down --timeout 10
docker-compose up -d

# 4. If database corrupted, restore from backup
./deploy.sh --stop
# Restore latest backup (see README-DEPLOYMENT.md)
./deploy.sh
```

### Data Recovery

**If data is lost**:
```bash
# 1. Stop services immediately
docker-compose down

# 2. Check available backups
ls -la backups/

# 3. Restore from most recent backup
# MongoDB restore
docker cp backups/backup_YYYYMMDD_HHMMSS/mongodb_backup/ $(docker-compose ps -q mongodb):/tmp/
docker-compose exec mongodb mongorestore /tmp/mongodb_backup/

# Redis restore
docker cp backups/backup_YYYYMMDD_HHMMSS/dump.rdb $(docker-compose ps -q redis):/data/
docker-compose restart redis

# 4. Verify data integrity
# Check user count, critical data, etc.
```

## Production Deployment Considerations

### Security Hardening

**Before production deployment**:
```bash
# 1. Change ALL default passwords
grep -r "change_this" .env.production

# 2. Set up firewall
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# 3. Configure fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban

# 4. Set up log rotation
sudo nano /etc/logrotate.d/fullstack-auth
```

### Performance Optimization

**For production loads**:
```yaml
# docker-compose.yml optimizations
services:
  backend:
    deploy:
      replicas: 3  # Scale horizontally
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    environment:
      - NODE_ENV=production
      - NODE_OPTIONS="--max-old-space-size=768"
```

### Monitoring Alerts

**Set up critical alerts in Grafana**:
- Memory usage > 80%
- CPU usage > 90% for 5 minutes
- Database connections > threshold
- HTTP error rate > 5%
- Service downtime > 30 seconds

## Quick Reference Commands

```bash
# Health checks
curl http://localhost:8081/health
./deploy.sh --status

# View logs
./deploy.sh --logs backend | grep ERROR
tail -f logs/error-$(date +%Y-%m-%d).log

# Resource monitoring
docker stats --no-stream
free -h && df -h

# Database operations
docker-compose exec mongodb mongo --eval "db.users.count()"
docker-compose exec redis redis-cli info memory

# Backup operations
./deploy.sh  # Automatically creates backup
ls -la backups/ | head -5

# Emergency restart
docker-compose restart backend
docker-compose down && docker-compose up -d
```

## Support Checklist

When seeking help, include:
- [ ] Output of `./deploy.sh --status`
- [ ] Relevant log files from `logs/` directory
- [ ] Docker Compose service status
- [ ] System resource usage (`free -h`, `df -h`)
- [ ] Environment file (without sensitive values)
- [ ] Recent changes made to configuration