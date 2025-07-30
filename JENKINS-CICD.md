# Jenkins CI/CD Pipeline Documentation

## Overview

This document describes the Jenkins CI/CD pipeline setup for the Full Stack Auth Backend project, including automated builds, testing, deployment, and notifications via email and Slack.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   GitHub Repo   │───▶│  Jenkins Server  │───▶│   Deployment    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Notifications   │
                       │  • Email SMTP    │
                       │  • Slack         │
                       └──────────────────┘
```

### Pipeline Components

1. **Jenkins Server** - Main CI/CD orchestrator
2. **Docker-in-Docker** - For building Docker images
3. **SonarQube** - Code quality analysis (optional)
4. **Nexus Repository** - Artifact storage (optional)
5. **Email Notifications** - SMTP-based alerts
6. **Slack Notifications** - Team messaging integration

## Quick Setup

### 1. Start Jenkins Infrastructure

```bash
# Start Jenkins and related services
docker-compose -f docker-compose.jenkins.yml up -d

# Check service status
docker-compose -f docker-compose.jenkins.yml ps
```

### 2. Access Jenkins

- **URL**: http://localhost:8080
- **Initial Admin Password**: 
  ```bash
  docker exec auth-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
  ```

### 3. Complete Setup

1. Install suggested plugins + additional plugins from `jenkins/plugins.txt`
2. Create admin user or use default (admin/admin123)
3. Configure system settings via Configuration as Code

## Pipeline Stages

### 1. Checkout
- Cleans workspace
- Checks out source code
- Extracts Git metadata for notifications

### 2. Environment Setup
- Creates necessary directories
- Copies environment files based on branch
- Loads environment variables

### 3. Code Quality (Parallel)
- **Lint**: Runs code linting
- **Security Scan**: npm audit for vulnerabilities

### 4. Build
- Builds Docker image with build number and Git commit tags
- Tests Docker image functionality

### 5. Test (Parallel)
- **Unit Tests**: Runs in isolated Docker container
- **Integration Tests**: Tests with MongoDB and Redis
- **Health Check Tests**: Verifies API endpoints

### 6. Push to Registry
- Only for main/develop branches
- Tags and pushes Docker images to registry

### 7. Deploy to Staging
- Automated deployment for non-main branches
- Runs health checks post-deployment

### 8. Deploy to Production
- Requires manual approval for main branch
- Creates backup before deployment
- Runs comprehensive smoke tests

### 9. Post-Deploy Tests
- Verifies all services are healthy
- Tests database connectivity
- Runs integration smoke tests

## Email Notifications

### Configuration

Email notifications are configured in `jenkins/jenkins.yaml`:

```yaml
unclassified:
  mailer:
    adminAddress: "admin@yourcompany.com"
    authentication:
      username: "your-email@gmail.com"
      password: "your-app-password"
    smtpHost: "smtp.gmail.com"
    smtpPort: "587"
    useTls: true
```

### Setup Gmail SMTP

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate App Password**:
   - Go to Google Account settings
   - Security → App passwords
   - Generate password for "Jenkins"
3. **Update credentials** in Jenkins or `jenkins.yaml`

### Email Templates

The pipeline sends HTML emails with:
- Build status and details
- Commit information and author
- Build duration and logs
- Direct links to services
- Failure logs (attached for failed builds)

### Supported Email Providers

```bash
# Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_TLS=true

# Outlook/Hotmail
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_TLS=true

# Yahoo
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_TLS=true

# Custom SMTP
SMTP_HOST=mail.yourcompany.com
SMTP_PORT=587
SMTP_TLS=true
```

## Slack Notifications

### Setup Slack Integration

1. **Create Slack App**:
   - Go to https://api.slack.com/apps
   - Create new app for your workspace
   - Enable "Bot Token Scopes": `chat:write`, `chat:write.public`

2. **Install App to Workspace**:
   - Install app to your workspace
   - Copy Bot User OAuth Token

3. **Configure Jenkins**:
   ```yaml
   credentials:
     system:
       domainCredentials:
         - credentials:
             - string:
                 scope: GLOBAL
                 id: "slack-token"
                 secret: "xoxb-your-bot-token"
                 description: "Slack Bot Token"
   
   unclassified:
     slackNotifier:
       teamDomain: "your-workspace"
       token: "xoxb-your-bot-token"
       tokenCredentialId: "slack-token"
   ```

4. **Invite Bot to Channel**:
   ```
   /invite @your-jenkins-bot
   ```

### Slack Message Format

Messages include:
- Build status with color coding
- Project and build information
- Commit details and author
- Interactive buttons for build console
- Threaded updates for build progress

### Notification Triggers

- ✅ **Success**: Build and deployment completed
- ❌ **Failure**: Build failed at any stage
- ⚠️ **Unstable**: Build completed with warnings
- ⏹️ **Aborted**: Build was manually stopped

## Environment Variables

### Required Variables

Update in `jenkins/jenkins.yaml` or Jenkins UI:

```bash
# Docker Registry
DOCKER_REGISTRY=your-registry.com
DOCKER_USERNAME=your-username
DOCKER_PASSWORD=your-password

# GitHub Integration
GITHUB_USERNAME=your-github-username
GITHUB_TOKEN=your-personal-access-token

# Email Configuration
EMAIL_RECIPIENTS=dev-team@company.com,ops@company.com
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Slack Configuration
SLACK_CHANNEL=#deployments
SLACK_TEAM_DOMAIN=your-workspace
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Application Settings
NODE_VERSION=18
COMPOSE_FILE=docker-compose.yml
```

## Pipeline Triggers

### Automatic Triggers

```groovy
triggers {
    githubPush()                          // On Git push
    cron(BRANCH_NAME == 'main' ? 'H 2 * * *' : '')  // Nightly for main
}
```

### Manual Triggers

- **Build Now**: Manual build trigger
- **Build with Parameters**: Custom parameters
- **Deploy to Staging**: Force staging deployment
- **Deploy to Production**: Production deployment with approval

## Testing Strategy

### Unit Tests
```bash
# Runs in isolated container
docker run --rm -e NODE_ENV=test ${IMAGE_NAME}:${IMAGE_TAG} npm test
```

### Integration Tests
```bash
# Starts test database and Redis
docker-compose -f docker-compose.test.yml up -d mongodb redis

# Runs integration tests
docker run --rm \
  --network backend_app-network \
  -e MONGODB_URI=mongodb://mongodb:27017/test-db \
  ${IMAGE_NAME}:${IMAGE_TAG} npm run test:integration
```

### Health Check Tests
```bash
# API health endpoints
curl -f http://localhost:8081/health
curl -f http://localhost:8081/api/auth/health

# Service health checks
curl -f http://localhost:3000/api/health    # Grafana
curl -f http://localhost:9090/-/healthy    # Prometheus
```

## Deployment Strategies

### Blue-Green Deployment
```bash
# Deploy to blue environment
./deploy.sh --env=blue

# Test blue environment
./test-deployment.sh --env=blue

# Switch traffic to blue
./switch-traffic.sh --to=blue

# Cleanup green environment
./cleanup-environment.sh --env=green
```

### Rolling Deployment
```bash
# Scale backend service
docker-compose up -d --scale backend=3

# Update one instance at a time
./rolling-update.sh --replicas=3
```

### Canary Deployment
```bash
# Deploy canary version (10% traffic)
./deploy-canary.sh --traffic=10

# Monitor metrics and gradually increase
./increase-canary-traffic.sh --traffic=50

# Full rollout or rollback
./complete-canary.sh --action=rollout
```

## Monitoring and Observability

### Build Metrics
- Build success/failure rates
- Build duration trends
- Test coverage reports
- Security vulnerability trends

### Deployment Metrics
- Deployment frequency
- Lead time for changes
- Mean time to recovery
- Change failure rate

### Grafana Dashboards
```bash
# Access monitoring
http://localhost:3000

# Default login: admin/admin123
# Dashboards: CI/CD Pipeline Metrics
```

## Security Best Practices

### Secrets Management
```yaml
# Use Jenkins credentials store
credentials:
  system:
    domainCredentials:
      - credentials:
          - usernamePassword:
              scope: GLOBAL
              id: "docker-registry-creds"
              description: "Docker Registry"
```

### Container Security
```bash
# Scan Docker images
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image ${IMAGE_NAME}:${IMAGE_TAG}

# Sign images
docker trust sign ${IMAGE_NAME}:${IMAGE_TAG}
```

### Access Control
- Role-based access control (RBAC)
- Multi-factor authentication (MFA)
- Audit logging
- Network segmentation

## Troubleshooting

### Common Issues

#### 1. Jenkins Won't Start
```bash
# Check logs
docker-compose -f docker-compose.jenkins.yml logs jenkins

# Check disk space
df -h

# Check port conflicts
sudo netstat -tulpn | grep :8080
```

#### 2. Docker Permission Issues
```bash
# Add user to docker group
sudo usermod -aG docker jenkins

# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock

# Restart Jenkins
docker-compose -f docker-compose.jenkins.yml restart jenkins
```

#### 3. Email Notifications Not Working
```bash
# Test SMTP connection
docker exec -it auth-jenkins bash
telnet smtp.gmail.com 587

# Check email configuration
# Jenkins → Manage Jenkins → Configure System → Email Notification
```

#### 4. Slack Notifications Failing
```bash
# Verify bot token
curl -X POST -H 'Authorization: Bearer xoxb-your-token' \
  -H 'Content-type: application/json' \
  --data '{"channel":"#test","text":"Hello from Jenkins!"}' \
  https://slack.com/api/chat.postMessage

# Check Jenkins logs
docker exec auth-jenkins tail -f /var/jenkins_home/logs/SlackNotifier.log
```

#### 5. Build Failures
```bash
# Check build logs
docker-compose -f docker-compose.jenkins.yml logs jenkins

# Access Jenkins console
http://localhost:8080/job/your-job/lastBuild/console

# Check workspace
docker exec -it auth-jenkins ls -la /var/jenkins_home/workspace/
```

### Log Locations

```bash
# Jenkins logs
docker-compose -f docker-compose.jenkins.yml logs jenkins

# Build logs
/var/jenkins_home/jobs/[job-name]/builds/[build-number]/log

# Plugin logs
/var/jenkins_home/logs/

# System logs
journalctl -u docker -f
```

## Performance Optimization

### Jenkins Configuration
```yaml
# Increase Java heap size
environment:
  - JAVA_OPTS=-Xmx2g -XX:MaxPermSize=1g

# Enable parallel builds
jenkins:
  numExecutors: 4
  mode: NORMAL
```

### Pipeline Optimization
```groovy
// Parallel stages
parallel {
    stage('Unit Tests') { /* ... */ }
    stage('Integration Tests') { /* ... */ }
    stage('Security Scan') { /* ... */ }
}

// Conditional stages
when {
    anyOf {
        branch 'main'
        expression { return params.FORCE_DEPLOY == true }
    }
}
```

### Resource Management
```yaml
# Docker resource limits
services:
  jenkins:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          memory: 2G
```

## Backup and Recovery

### Jenkins Configuration Backup
```bash
# Backup Jenkins home
docker exec auth-jenkins tar -czf /tmp/jenkins-backup.tar.gz /var/jenkins_home

# Copy backup
docker cp auth-jenkins:/tmp/jenkins-backup.tar.gz ./backups/

# Automated backup script
./scripts/backup-jenkins.sh
```

### Disaster Recovery
```bash
# Restore Jenkins from backup
docker-compose -f docker-compose.jenkins.yml down
docker volume rm jenkins_data
docker-compose -f docker-compose.jenkins.yml up -d
docker cp ./backups/jenkins-backup.tar.gz auth-jenkins:/tmp/
docker exec auth-jenkins tar -xzf /tmp/jenkins-backup.tar.gz -C /
docker-compose -f docker-compose.jenkins.yml restart jenkins
```

## Integration with Existing Infrastructure

### With Main Application
```bash
# Start Jenkins with main application
docker-compose -f docker-compose.yml -f docker-compose.jenkins.yml up -d

# Use shared network
networks:
  - app-network  # Shared with main application
```

### External Integrations
- GitHub webhooks for automatic builds
- Docker registry integration
- Monitoring system integration
- Issue tracking system (Jira, GitHub Issues)

## Commands Reference

```bash
# Start Jenkins infrastructure
docker-compose -f docker-compose.jenkins.yml up -d

# View Jenkins logs
docker-compose -f docker-compose.jenkins.yml logs -f jenkins

# Access Jenkins container
docker exec -it auth-jenkins bash

# Restart Jenkins
docker-compose -f docker-compose.jenkins.yml restart jenkins

# Stop Jenkins infrastructure
docker-compose -f docker-compose.jenkins.yml down

# Clean up Jenkins data (CAUTION: destroys all data)
docker-compose -f docker-compose.jenkins.yml down -v

# Backup Jenkins
./scripts/backup-jenkins.sh

# Restore Jenkins
./scripts/restore-jenkins.sh backup-file.tar.gz

# Check Jenkins health
curl -f http://localhost:8080/login

# Test email configuration
curl -X POST http://localhost:8080/job/test-email/build

# Test Slack integration
curl -X POST http://localhost:8080/job/test-slack/build
```

## Support and Maintenance

### Regular Maintenance Tasks
- Update Jenkins and plugins monthly
- Review and rotate credentials quarterly
- Monitor disk space and logs
- Update base Docker images
- Review security settings

### Support Resources
- Jenkins Documentation: https://www.jenkins.io/doc/
- Plugin Documentation: https://plugins.jenkins.io/
- Docker-in-Docker: https://github.com/jenkinsci/docker
- Configuration as Code: https://github.com/jenkinsci/configuration-as-code-plugin