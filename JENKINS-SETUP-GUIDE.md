# Jenkins Setup Guide - Step by Step Configuration

## Prerequisites

Before starting, ensure you have:
- Docker and Docker Compose installed
- GitHub repository with your code
- Gmail account (for email notifications)
- Slack workspace (for Slack notifications)
- Docker registry account (Docker Hub, AWS ECR, etc.)

## Step 1: Start Jenkins Infrastructure

### 1.1 Launch Jenkins Services

```bash
# Navigate to your project directory
cd /path/to/your/backend

# Start Jenkins and related services
docker-compose -f docker-compose.jenkins.yml up -d

# Verify services are running
docker-compose -f docker-compose.jenkins.yml ps
```

Expected output:
```
NAME                COMMAND                  SERVICE             STATUS              PORTS
auth-jenkins        "/sbin/tini -- /usr/…"   jenkins             running             0.0.0.0:8080->8080/tcp, 0.0.0.0:50000->50000/tcp
jenkins-docker      "dockerd-entrypoint.…"   docker-dind         running             2375/tcp, 0.0.0.0:2376->2376/tcp
auth-sonarqube      "bin/sonar.sh console"   sonarqube           running             0.0.0.0:9000->9000/tcp
sonar-postgres      "docker-entrypoint.s…"   sonar-db            running             5432/tcp
```

### 1.2 Wait for Services to Start

```bash
# Check Jenkins logs (wait for "Jenkins is fully up and running")
docker-compose -f docker-compose.jenkins.yml logs -f jenkins

# Look for this message:
# *************************************************************
# Jenkins initial setup is required. An admin user has been created and a password generated.
# Please use the following password to proceed to installation:
# [PASSWORD_HERE]
# *************************************************************
```

## Step 2: Initial Jenkins Setup

### 2.1 Access Jenkins Web Interface

1. Open browser and navigate to: **http://localhost:8080**
2. You'll see "Unlock Jenkins" page

### 2.2 Get Initial Admin Password

```bash
# Get the initial admin password
docker exec auth-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Copy this password and paste it into the Jenkins web interface.

### 2.3 Install Plugins

1. Select **"Install suggested plugins"**
2. Wait for plugins to install (this may take 5-10 minutes)
3. Additional plugins will be installed from our `jenkins/plugins.txt` file

### 2.4 Create First Admin User

Fill in the form:
- **Username**: `admin` (or your preferred username)
- **Password**: `admin123` (use a strong password in production)
- **Confirm password**: `admin123`
- **Full name**: `Jenkins Admin`
- **E-mail address**: `your-email@company.com`

Click **"Save and Continue"**

### 2.5 Instance Configuration

- **Jenkins URL**: `http://localhost:8080/` (or your domain)
- Click **"Save and Finish"**
- Click **"Start using Jenkins"**

## Step 3: Configure System Settings

### 3.1 Navigate to Jenkins Configuration

1. Go to **"Manage Jenkins"** → **"Configure System"**

### 3.2 Configure Git

1. Scroll to **"Git"** section
2. **Name**: `admin` (or your name)
3. **E-mail Address**: `your-email@company.com`

### 3.3 Configure GitHub Integration

1. Scroll to **"GitHub"** section
2. Click **"Add GitHub Server"**
3. **Name**: `GitHub`
4. **API URL**: `https://api.github.com`
5. **Credentials**: (We'll add this in next step)

## Step 4: Add Credentials

### 4.1 Navigate to Credentials

1. Go to **"Manage Jenkins"** → **"Manage Credentials"**
2. Click **"System"** → **"Global credentials (unrestricted)"**
3. Click **"Add Credentials"**

### 4.2 Add GitHub Personal Access Token

1. **Kind**: `Secret text`
2. **Secret**: Your GitHub Personal Access Token
3. **ID**: `github-token`
4. **Description**: `GitHub Personal Access Token`
5. Click **"OK"**

**To create GitHub token:**
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token with scopes: `repo`, `admin:repo_hook`, `admin:org_hook`

### 4.3 Add Docker Registry Credentials

1. Click **"Add Credentials"** again
2. **Kind**: `Username with password`
3. **Username**: Your Docker Hub username
4. **Password**: Your Docker Hub password/token
5. **ID**: `docker-registry-creds`
6. **Description**: `Docker Registry Credentials`
7. Click **"OK"**

### 4.4 Add Email App Password

1. Click **"Add Credentials"** again
2. **Kind**: `Secret text`
3. **Secret**: Your Gmail App Password
4. **ID**: `email-password`
5. **Description**: `Gmail App Password`
6. Click **"OK"**

**To create Gmail App Password:**
1. Enable 2-Factor Authentication on Google Account
2. Go to Google Account → Security → App passwords
3. Generate password for "Jenkins"

### 4.5 Add Slack Bot Token

1. Click **"Add Credentials"** again
2. **Kind**: `Secret text`
3. **Secret**: Your Slack Bot Token (starts with `xoxb-`)
4. **ID**: `slack-token`
5. **Description**: `Slack Bot Token`
6. Click **"OK"**

**To create Slack Bot Token:**
1. Go to https://api.slack.com/apps
2. Create new app for your workspace
3. Go to OAuth & Permissions
4. Add Bot Token Scopes: `chat:write`, `chat:write.public`
5. Install app to workspace
6. Copy Bot User OAuth Token

## Step 5: Configure Email Notifications

### 5.1 Configure Email Extension Plugin

1. Go to **"Manage Jenkins"** → **"Configure System"**
2. Scroll to **"Extended E-mail Notification"**

Configure these settings:
```
SMTP server: smtp.gmail.com
SMTP Port: 587
Use SMTP Authentication: ✓
Username: your-email@gmail.com
Password: [Use email-password credential]
Use SSL: ✗
Use TLS: ✓
Reply-To Address: your-email@gmail.com
Charset: UTF-8
```

### 5.2 Test Email Configuration

1. Click **"Test configuration by sending test e-mail"**
2. **Test e-mail recipient**: `your-email@gmail.com`
3. Click **"Test configuration"**
4. Check your email for test message

### 5.3 Configure Default Email Settings

In the same section:
```
Default Subject: $PROJECT_NAME - Build #$BUILD_NUMBER - $BUILD_STATUS
Default Content: 
$PROJECT_NAME - Build #$BUILD_NUMBER - $BUILD_STATUS

Check console output at $BUILD_URL to view the results.

Build Details:
- Branch: $GIT_BRANCH
- Commit: $GIT_COMMIT
- Author: $GIT_AUTHOR_NAME
```

## Step 6: Configure Slack Notifications

### 6.1 Install Slack Plugin

1. Go to **"Manage Jenkins"** → **"Manage Plugins"**
2. Go to **"Available"** tab
3. Search for **"Slack Notification Plugin"**
4. Install and restart Jenkins

### 6.2 Configure Slack Settings

1. Go to **"Manage Jenkins"** → **"Configure System"**
2. Scroll to **"Slack"** section

Configure these settings:
```
Workspace: your-workspace-name
Credential: [Select slack-token credential]
Default channel / member id: #deployments
Custom message: 
$PROJECT_NAME - Build #$BUILD_NUMBER - $BUILD_STATUS
Branch: $GIT_BRANCH
```

### 6.3 Test Slack Configuration

1. Click **"Test Connection"**
2. Check your Slack channel for test message

### 6.4 Invite Bot to Channel

In your Slack workspace:
```
/invite @your-jenkins-bot
```

## Step 7: Create Pipeline Job

### 7.1 Create New Pipeline Job

1. From Jenkins dashboard, click **"New Item"**
2. **Item name**: `fullstack-auth-backend`
3. Select **"Multibranch Pipeline"**
4. Click **"OK"**

### 7.2 Configure Branch Sources

1. In **"Branch Sources"** section, click **"Add source"** → **"GitHub"**
2. **Credentials**: Select your GitHub token
3. **Repository HTTPS URL**: `https://github.com/your-username/your-repo.git`
4. **Behaviors**: 
   - ✓ Discover branches
   - ✓ Discover pull requests from origin
   - ✓ Discover pull requests from forks

### 7.3 Configure Build Configuration

1. **Mode**: `by Jenkinsfile`
2. **Script Path**: `Jenkinsfile`

### 7.4 Configure Scan Repository Triggers

1. ✓ **Periodically if not otherwise run**
2. **Interval**: `1 day`

### 7.5 Save Configuration

Click **"Save"**

## Step 8: Configure Environment Variables

### 8.1 Update Jenkinsfile Variables

Edit your `Jenkinsfile` and update these variables:

```groovy
environment {
    // Docker registry settings
    DOCKER_REGISTRY = 'your-registry.com'  // Change to your Docker registry
    IMAGE_NAME = 'fullstack-auth-backend'
    
    // Notification settings
    SLACK_CHANNEL = '#deployments'  // Change to your Slack channel
    SLACK_TEAM_DOMAIN = 'your-team'  // Change to your Slack workspace
    
    // Email settings
    EMAIL_RECIPIENTS = 'dev-team@yourcompany.com,ops@yourcompany.com'  // Change to your emails
}
```

### 8.2 Configure Global Environment Variables

1. Go to **"Manage Jenkins"** → **"Configure System"**
2. Scroll to **"Global properties"**
3. ✓ **Environment variables**
4. Add these variables:

```
Name: DOCKER_REGISTRY
Value: docker.io (or your registry)

Name: SLACK_WORKSPACE
Value: your-workspace-name

Name: EMAIL_RECIPIENTS
Value: your-email@company.com,team@company.com
```

## Step 9: Set Up GitHub Webhooks

### 9.1 Configure GitHub Webhook

1. Go to your GitHub repository
2. Settings → Webhooks → Add webhook
3. **Payload URL**: `http://your-jenkins-url:8080/github-webhook/`
4. **Content type**: `application/json`
5. **Which events**: `Just the push event`
6. ✓ **Active**
7. Click **"Add webhook"**

### 9.2 Test Webhook

1. Make a commit to your repository
2. Check Jenkins for automatic build trigger

## Step 10: Configure Build Triggers

### 10.1 Configure Pipeline Triggers

In your pipeline job configuration:

1. **Build Triggers**:
   - ✓ **GitHub hook trigger for GITScm polling**
   - ✓ **Poll SCM** (as backup): `H/5 * * * *`

### 10.2 Configure Branch Strategy

1. **Property strategy**: `All branches get the same properties`
2. **Build strategies**:
   - ✓ **Regular branches**
   - ✓ **Also build pull requests**

## Step 11: Test Your Pipeline

### 11.1 Trigger Manual Build

1. Go to your pipeline job
2. Select a branch (e.g., `main`)
3. Click **"Build Now"**

### 11.2 Monitor Build Progress

1. Click on build number (e.g., `#1`)
2. Click **"Console Output"** to view logs
3. Watch for stage progression

### 11.3 Verify Notifications

Check that you receive:
- ✅ Email notification with build status
- ✅ Slack message in your channel

## Step 12: Production Configuration

### 12.1 Update Security Settings

1. **Enable CSRF Protection**:
   - Manage Jenkins → Configure Global Security
   - ✓ Prevent Cross Site Request Forgery exploits

2. **Configure Authorization**:
   - Authorization: `Matrix-based security`
   - Add users and set permissions

### 12.2 Configure Backup

1. Install **"ThinBackup"** plugin
2. Configure backup schedule
3. Set backup location: `/var/jenkins_home/backups`

### 12.3 Update Passwords

Change all default passwords:
- Jenkins admin password
- Database passwords in docker-compose files
- Update credentials in Jenkins

## Step 13: Monitoring and Maintenance

### 13.1 Set Up Monitoring

1. **Grafana Dashboard**: http://localhost:3000
   - Login: admin/admin123
   - Add Jenkins data source
   - Import Jenkins dashboard

2. **SonarQube**: http://localhost:9000
   - Login: admin/admin
   - Configure quality gates

### 13.2 Regular Maintenance Tasks

```bash
# Weekly tasks
docker system prune -f  # Clean up unused Docker images
docker-compose -f docker-compose.jenkins.yml restart jenkins  # Restart Jenkins

# Monthly tasks
# Update Jenkins and plugins
# Rotate credentials
# Review build history and clean up old builds
```

## Common Issues and Solutions

### Issue 1: Jenkins Won't Start

```bash
# Check logs
docker-compose -f docker-compose.jenkins.yml logs jenkins

# Common fixes
sudo chown -R 1000:1000 jenkins_data/
docker-compose -f docker-compose.jenkins.yml down
docker-compose -f docker-compose.jenkins.yml up -d
```

### Issue 2: Email Notifications Not Working

1. Verify Gmail App Password is correct
2. Check firewall settings (port 587)
3. Test SMTP connection:

```bash
docker exec -it auth-jenkins bash
telnet smtp.gmail.com 587
```

### Issue 3: Slack Notifications Failing

1. Verify bot token starts with `xoxb-`
2. Check bot permissions: `chat:write`, `chat:write.public`
3. Ensure bot is invited to channel
4. Test API connection:

```bash
curl -X POST -H 'Authorization: Bearer xoxb-your-token' \
  -H 'Content-type: application/json' \
  --data '{"channel":"#test","text":"Hello from Jenkins!"}' \
  https://slack.com/api/chat.postMessage
```

### Issue 4: Docker Permission Issues

```bash
# Add Jenkins user to Docker group
docker exec -it auth-jenkins usermod -aG docker jenkins

# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock

# Restart Jenkins
docker-compose -f docker-compose.jenkins.yml restart jenkins
```

### Issue 5: GitHub Webhook Not Triggering

1. Check webhook delivery in GitHub repository settings
2. Verify Jenkins URL is accessible from internet
3. Check Jenkins logs for webhook errors
4. Use ngrok for local testing:

```bash
ngrok http 8080
# Use ngrok URL in GitHub webhook
```

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable CSRF protection
- [ ] Configure proper user authorization
- [ ] Use HTTPS for Jenkins (production)
- [ ] Regularly update Jenkins and plugins
- [ ] Use secret management for sensitive data
- [ ] Enable audit logging
- [ ] Set up firewall rules
- [ ] Configure backup and disaster recovery
- [ ] Review and rotate credentials quarterly

## Support Commands

```bash
# View Jenkins logs
docker-compose -f docker-compose.jenkins.yml logs -f jenkins

# Access Jenkins container
docker exec -it auth-jenkins bash

# Restart Jenkins
docker-compose -f docker-compose.jenkins.yml restart jenkins

# Backup Jenkins configuration
docker exec auth-jenkins tar -czf /tmp/jenkins-backup.tar.gz /var/jenkins_home
docker cp auth-jenkins:/tmp/jenkins-backup.tar.gz ./backups/

# Check Jenkins system info
curl -u admin:admin123 http://localhost:8080/systemInfo

# View plugin list
curl -u admin:admin123 http://localhost:8080/pluginManager/api/json?depth=1

# Test email configuration
curl -X POST -u admin:admin123 http://localhost:8080/job/test-email/build

# Check webhook deliveries
# Go to GitHub repo → Settings → Webhooks → Recent Deliveries
```

This completes the comprehensive Jenkins setup guide. Follow these steps in order, and you'll have a fully functional CI/CD pipeline with email and Slack notifications.