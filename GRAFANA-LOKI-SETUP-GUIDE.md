# Grafana & Loki Setup Guide - Step by Step Configuration

## Overview

This guide provides detailed steps to configure Grafana dashboards and Loki log aggregation for comprehensive monitoring of your Full Stack Auth Backend application.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Application   │───▶│    Prometheus    │───▶│    Grafana      │
│     Logs        │    │    (Metrics)     │    │  (Dashboards)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                               ▲
         ▼                                               │
┌─────────────────┐    ┌──────────────────┐             │
│    Promtail     │───▶│      Loki        │─────────────┘
│ (Log Shipper)   │    │ (Log Storage)    │
└─────────────────┘    └──────────────────┘
```

## Prerequisites

- Docker and Docker Compose installed
- Full Stack Auth Backend services running
- Basic understanding of monitoring concepts

## Step 1: Verify Services are Running

### 1.1 Check Service Status

```bash
# Check all services are running
docker-compose ps

# Expected services:
# - backend
# - nginx
# - mongodb
# - redis
# - prometheus
# - grafana
# - loki
# - promtail
```

### 1.2 Verify Service Health

```bash
# Check individual services
curl -f http://localhost:8081/health    # Backend (via Nginx)
curl -f http://localhost:9090/-/healthy # Prometheus
curl -f http://localhost:3000/api/health # Grafana
curl -f http://localhost:3100/ready     # Loki
```

## Step 2: Initial Grafana Setup

### 2.1 Access Grafana Web Interface

1. Open browser and navigate to: **http://localhost:3000**
2. You'll see the Grafana login page

### 2.2 Login to Grafana

**Default Credentials:**
- **Username**: `admin`
- **Password**: `admin123` (or check your `.env.production` file for `GRAFANA_ADMIN_PASSWORD`)

### 2.3 Change Default Password (Recommended)

1. After first login, Grafana will prompt to change password
2. Set a strong password for production use
3. Click **"Save"**

### 2.4 Initial Configuration

1. **Welcome Screen**: Click **"Add your first data source"**

## Step 3: Configure Prometheus Data Source

### 3.1 Add Prometheus Data Source

1. Click **"Add data source"**
2. Select **"Prometheus"**

### 3.2 Configure Prometheus Settings

Fill in the following details:

```
Name: Prometheus
URL: http://prometheus:9090
Access: Server (default)
Scrape interval: 15s
Query timeout: 60s
HTTP Method: GET
```

### 3.3 Advanced Settings

Scroll down to **"Advanced settings"**:

```
Custom HTTP Headers: (leave empty)
TLS Client Auth: (disabled)
With Credentials: (unchecked)
Allowed cookies: (leave empty)
```

### 3.4 Test Connection

1. Click **"Save & Test"**
2. You should see: ✅ **"Data source is working"**

## Step 4: Configure Loki Data Source

### 4.1 Add Loki Data Source

1. Go to **Configuration** → **Data Sources**
2. Click **"Add data source"**
3. Select **"Loki"**

### 4.2 Configure Loki Settings

Fill in the following details:

```
Name: Loki
URL: http://loki:3100
Access: Server (default)
```

### 4.3 Additional Settings

```
Maximum lines: 1000
Timeout: 60s
```

### 4.4 Test Loki Connection

1. Click **"Save & Test"**
2. You should see: ✅ **"Data source connected and labels found"**

## Step 5: Import Pre-built Dashboards

### 5.1 Import System Overview Dashboard

1. Click **"+"** → **"Import"**
2. **Dashboard ID**: `1860` (Node Exporter Full)
3. Click **"Load"**
4. Select **Prometheus** as data source
5. Click **"Import"**

### 5.2 Import Docker Monitoring Dashboard

1. Click **"+"** → **"Import"**
2. **Dashboard ID**: `193` (Docker Monitoring)
3. Click **"Load"**
4. Select **Prometheus** as data source
5. Click **"Import"**

### 5.3 Import Application Dashboard (Custom)

We'll create this in the next step.

## Step 6: Create Custom Application Dashboard

### 6.1 Create New Dashboard

1. Click **"+"** → **"Dashboard"**
2. Click **"Add new panel"**

### 6.2 Add API Response Time Panel

**Panel 1: API Response Time**

1. **Query Tab**:
   ```promql
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="backend"}[5m]))
   ```
2. **Panel Title**: `API Response Time (95th percentile)`
3. **Unit**: `seconds`
4. **Visualization**: `Time series`

### 6.3 Add Request Rate Panel

**Panel 2: Request Rate**

1. Click **"Add panel"**
2. **Query Tab**:
   ```promql
   rate(http_requests_total{job="backend"}[5m])
   ```
3. **Panel Title**: `HTTP Request Rate`
4. **Unit**: `requests/sec`
5. **Visualization**: `Time series`

### 6.4 Add Error Rate Panel

**Panel 3: Error Rate**

1. Click **"Add panel"**
2. **Query Tab**:
   ```promql
   rate(http_requests_total{job="backend",status=~"5.."}[5m]) / rate(http_requests_total{job="backend"}[5m]) * 100
   ```
3. **Panel Title**: `Error Rate (%)`
4. **Unit**: `percent`
5. **Visualization**: `Stat`

### 6.5 Add Database Connections Panel

**Panel 4: Database Connections**

1. Click **"Add panel"**
2. **Query Tab**:
   ```promql
   mongodb_connections{job="mongodb-exporter"}
   ```
3. **Panel Title**: `MongoDB Connections`
4. **Unit**: `connections`
5. **Visualization**: `Time series`

### 6.6 Add Memory Usage Panel

**Panel 5: Memory Usage**

1. Click **"Add panel"**
2. **Query Tab**:
   ```promql
   process_resident_memory_bytes{job="backend"} / 1024 / 1024
   ```
3. **Panel Title**: `Memory Usage`
4. **Unit**: `MB`
5. **Visualization**: `Time series`

### 6.7 Save Dashboard

1. Click **"Save dashboard"** (disk icon)
2. **Title**: `Full Stack Auth - Application Metrics`
3. **Description**: `Application performance and health metrics`
4. Click **"Save"**

## Step 7: Configure Log Exploration

### 7.1 Access Explore View

1. Click **"Explore"** in the left sidebar
2. Select **"Loki"** as data source

### 7.2 Basic Log Query

Try these log queries:

```logql
# All logs from backend service
{container="auth-backend"}

# Error logs only
{container="auth-backend"} |= "ERROR"

# Logs from specific time range
{container="auth-backend"} | json | level="error"

# Filter by HTTP status codes
{container="auth-backend"} | json | status>=500
```

### 7.3 Advanced Log Queries

```logql
# Rate of error logs per minute
rate({container="auth-backend"} |= "ERROR" [1m])

# Count of authentication failures
count_over_time({container="auth-backend"} |= "authentication failed" [5m])

# Top 10 API endpoints by request count
topk(10, sum by (path) (rate({container="auth-backend"} | json | __error__ = "" [5m])))
```

## Step 8: Create Log Dashboard

### 8.1 Create New Dashboard for Logs

1. Click **"+"** → **"Dashboard"**
2. **Dashboard Title**: `Full Stack Auth - Logs Dashboard`

### 8.2 Add Log Volume Panel

**Panel 1: Log Volume**

1. **Data Source**: `Loki`
2. **Query**:
   ```logql
   sum(rate({container="auth-backend"}[1m])) by (level)
   ```
3. **Panel Title**: `Log Volume by Level`
4. **Visualization**: `Time series`

### 8.3 Add Error Logs Panel

**Panel 2: Recent Error Logs**

1. **Data Source**: `Loki`
2. **Query**:
   ```logql
   {container="auth-backend"} |= "ERROR" | json
   ```
3. **Panel Title**: `Recent Error Logs`
4. **Visualization**: `Logs`
5. **Options**: Show time, Show labels

### 8.4 Add Authentication Logs Panel

**Panel 3: Authentication Events**

1. **Data Source**: `Loki`
2. **Query**:
   ```logql
   {container="auth-backend"} |~ "login|authentication|register" | json
   ```
3. **Panel Title**: `Authentication Events`
4. **Visualization**: `Logs`

### 8.5 Add Top Error Messages Panel

**Panel 4: Top Error Messages**

1. **Data Source**: `Loki`
2. **Query**:
   ```logql
   topk(10, count by (message) (rate({container="auth-backend"} |= "ERROR" | json [5m])))
   ```
3. **Panel Title**: `Top Error Messages`
4. **Visualization**: `Bar chart`

## Step 9: Set Up Alerts

### 9.1 Create Alert Rule for High Error Rate

1. Go to **Alerting** → **Alert Rules**
2. Click **"New rule"**

**Alert Configuration:**
```
Rule name: High Error Rate
Evaluation group: default
Evaluation interval: 1m
For: 5m

Query:
rate(http_requests_total{job="backend",status=~"5.."}[5m]) / rate(http_requests_total{job="backend"}[5m]) * 100 > 5

Condition: IS ABOVE 5
```

### 9.2 Create Alert Rule for High Memory Usage

1. Click **"New rule"**

**Alert Configuration:**
```
Rule name: High Memory Usage
Evaluation group: default
Evaluation interval: 1m
For: 10m

Query:
process_resident_memory_bytes{job="backend"} / 1024 / 1024 > 512

Condition: IS ABOVE 512
```

### 9.3 Create Alert Rule for Database Connection Issues

1. Click **"New rule"**

**Alert Configuration:**
```
Rule name: MongoDB Connection Issues
Evaluation group: default
Evaluation interval: 30s
For: 2m

Query:
up{job="mongodb-exporter"} == 0

Condition: IS BELOW 1
```

### 9.4 Configure Notification Channels

1. Go to **Alerting** → **Notification channels**
2. Click **"Add channel"**

**Email Notification:**
```
Name: Email Alerts
Type: Email
Email addresses: your-email@company.com,ops@company.com
Subject: [ALERT] {{range .Alerts}}{{.Annotations.summary}}{{end}}
Message: 
Alert: {{range .Alerts}}{{.Annotations.summary}}
Description: {{.Annotations.description}}
Value: {{.ValueString}}
{{end}}
```

**Slack Notification:**
```
Name: Slack Alerts
Type: Slack
Webhook URL: https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
Channel: #alerts
Username: Grafana
Message: 
{{range .Alerts}}
:warning: *{{.Annotations.summary}}*
{{.Annotations.description}}
*Value:* {{.ValueString}}
{{end}}
```

## Step 10: Configure Prometheus Alerting Rules

### 10.1 Create Alert Rules File

```bash
# Create alerts directory if it doesn't exist
mkdir -p monitoring/prometheus/rules

# Create alerting rules
cat > monitoring/prometheus/rules/alerts.yml << 'EOF'
groups:
  - name: backend_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{job="backend",status=~"5.."}[5m]) / rate(http_requests_total{job="backend"}[5m]) * 100 > 5
        for: 5m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}% for the last 5 minutes"

      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes{job="backend"} / 1024 / 1024 > 512
        for: 10m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "High memory usage detected"
          description: "Memory usage is {{ $value }}MB"

      - alert: DatabaseDown
        expr: up{job="mongodb-exporter"} == 0
        for: 2m
        labels:
          severity: critical
          service: mongodb
        annotations:
          summary: "MongoDB is down"
          description: "MongoDB has been down for more than 2 minutes"

      - alert: RedisDown
        expr: up{job="redis-exporter"} == 0
        for: 2m
        labels:
          severity: critical
          service: redis
        annotations:
          summary: "Redis is down"
          description: "Redis has been down for more than 2 minutes"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="backend"}[5m])) > 1
        for: 5m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s"

      - alert: LowDiskSpace
        expr: (node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes{fstype!="tmpfs"}) * 100 < 10
        for: 5m
        labels:
          severity: critical
          service: system
        annotations:
          summary: "Low disk space"
          description: "Disk space is below 10% on {{ $labels.device }}"
EOF
```

### 10.2 Restart Prometheus

```bash
# Restart Prometheus to load new rules
docker-compose restart prometheus

# Verify rules are loaded
curl http://localhost:9090/api/v1/rules
```

## Step 11: Advanced Dashboard Configuration

### 11.1 Create SLA Dashboard

1. Create new dashboard: `Full Stack Auth - SLA Dashboard`

**Panel 1: Uptime**
```promql
avg_over_time(up{job="backend"}[24h]) * 100
```

**Panel 2: Availability (30 days)**
```promql
avg_over_time(up{job="backend"}[30d]) * 100
```

**Panel 3: Mean Time to Recovery**
```promql
avg_over_time(up{job="backend"}[7d])
```

### 11.2 Create Business Metrics Dashboard

1. Create new dashboard: `Full Stack Auth - Business Metrics`

**Panel 1: User Registrations**
```logql
count_over_time({container="auth-backend"} |= "user registered" [1h])
```

**Panel 2: Login Success Rate**
```logql
count_over_time({container="auth-backend"} |= "login successful" [1h]) / 
count_over_time({container="auth-backend"} |= "login attempt" [1h]) * 100
```

**Panel 3: API Usage by Endpoint**
```logql
sum by (path) (rate({container="auth-backend"} | json | __error__ = "" [5m]))
```

## Step 12: Log Retention and Performance

### 12.1 Configure Loki Retention

Create retention configuration:

```bash
cat > monitoring/loki/loki.yml << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://localhost:9093

# Retention configuration
limits_config:
  retention_period: 30d  # Keep logs for 30 days
  max_streams_per_user: 10000
  max_line_size: 256KB
  max_entries_limit_per_query: 5000

# Compactor for log cleanup
compactor:
  working_directory: /loki/boltdb-shipper-compactor
  shared_store: filesystem
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
EOF
```

### 12.2 Restart Loki

```bash
docker-compose restart loki
```

## Step 13: Performance Optimization

### 13.1 Configure Grafana Performance Settings

1. Go to **Configuration** → **Settings**
2. Update **grafana.ini** configuration:

```ini
[dashboards]
default_home_dashboard_path = /var/lib/grafana/dashboards/overview.json

[users]
default_theme = dark
home_page = /dashboards

[analytics]
reporting_enabled = false
check_for_updates = false

[security]
disable_gravatar = true
cookie_secure = true
cookie_samesite = strict

[performance]
alerting_max_annotations_to_keep = 500
alerting_max_attempts = 3
```

### 13.2 Optimize Query Performance

**Best Practices for Queries:**

1. **Use appropriate time ranges** (avoid queries over long periods)
2. **Add proper labels** to reduce cardinality
3. **Use recording rules** for complex calculations
4. **Limit concurrent queries** per user

### 13.3 Set Up Query Caching

Add to Prometheus configuration:

```yaml
# In monitoring/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'fullstack-auth'
    replica: '1'

# Query performance
query:
  timeout: 2m
  max_concurrent: 20
  max_samples: 50000000
```

## Step 14: Backup and Recovery

### 14.1 Backup Grafana Configuration

```bash
#!/bin/bash
# backup-grafana.sh

# Create backup directory
mkdir -p backups/grafana/$(date +%Y%m%d_%H%M%S)

# Backup Grafana database
docker exec auth-grafana cp -r /var/lib/grafana/grafana.db /tmp/
docker cp auth-grafana:/tmp/grafana.db backups/grafana/$(date +%Y%m%d_%H%M%S)/

# Backup dashboards
docker exec auth-grafana cp -r /var/lib/grafana/dashboards /tmp/
docker cp auth-grafana:/tmp/dashboards backups/grafana/$(date +%Y%m%d_%H%M%S)/

echo "Grafana backup completed"
```

### 14.2 Backup Prometheus Data

```bash
#!/bin/bash
# backup-prometheus.sh

# Create backup directory
mkdir -p backups/prometheus/$(date +%Y%m%d_%H%M%S)

# Backup Prometheus data
docker exec auth-prometheus cp -r /prometheus/data /tmp/prometheus-data
docker cp auth-prometheus:/tmp/prometheus-data backups/prometheus/$(date +%Y%m%d_%H%M%S)/

echo "Prometheus backup completed"
```

### 14.3 Backup Loki Data

```bash
#!/bin/bash
# backup-loki.sh

# Create backup directory
mkdir -p backups/loki/$(date +%Y%m%d_%H%M%S)

# Backup Loki data
docker exec auth-loki cp -r /loki /tmp/loki-data
docker cp auth-loki:/tmp/loki-data backups/loki/$(date +%Y%m%d_%H%M%S)/

echo "Loki backup completed"
```

## Step 15: Monitoring Health Checks

### 15.1 Create Health Check Dashboard

Create a new dashboard for monitoring the monitoring stack:

**Panel 1: Prometheus Targets Status**
```promql
up
```

**Panel 2: Grafana Health**
```bash
# Add as a simple JSON API panel
curl -f http://localhost:3000/api/health
```

**Panel 3: Loki Health**
```bash
# Add as a simple JSON API panel  
curl -f http://localhost:3100/ready
```

### 15.2 Set Up Monitoring Alerts

Create alerts for the monitoring stack itself:

```yaml
# Add to monitoring/prometheus/rules/alerts.yml
- name: monitoring_stack
  rules:
    - alert: PrometheusDown
      expr: up{job="prometheus"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Prometheus is down"
        description: "Prometheus has been down for more than 1 minute"

    - alert: GrafanaDown
      expr: up{job="grafana"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Grafana is down"
        description: "Grafana has been down for more than 1 minute"

    - alert: LokiDown
      expr: up{job="loki"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Loki is down"
        description: "Loki has been down for more than 1 minute"
```

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Grafana Data Source Connection Failed

**Error**: `Data source proxy error: dial tcp: lookup prometheus`

**Solution**:
```bash
# Check if services are on the same network
docker network ls
docker inspect backend_app-network

# Verify service names in docker-compose
docker-compose ps

# Use service name as hostname
URL: http://prometheus:9090  # Not localhost:9090
```

#### Issue 2: No Metrics Showing in Grafana

**Check Prometheus Targets**:
```bash
# Access Prometheus UI
http://localhost:9090/targets

# Check if targets are UP
# If DOWN, check:
1. Service health endpoints
2. Network connectivity
3. Firewall rules
```

#### Issue 3: Loki Not Receiving Logs

**Check Promtail Configuration**:
```bash
# View Promtail logs
docker-compose logs promtail

# Verify log files exist
docker exec auth-backend ls -la /usr/src/app/logs/

# Check Loki ingestion
curl http://localhost:3100/metrics | grep loki_ingester
```

#### Issue 4: High Memory Usage

**Optimize Retention**:
```yaml
# In loki.yml
limits_config:
  retention_period: 7d  # Reduce from 30d
  max_streams_per_user: 1000  # Reduce streams
  max_line_size: 64KB  # Reduce line size
```

#### Issue 5: Dashboard Not Loading

**Check Browser Console**:
```bash
# Common fixes:
1. Clear browser cache
2. Check Grafana logs: docker-compose logs grafana
3. Verify data source configuration
4. Check query syntax in panels
```

## Maintenance Commands

```bash
# View all monitoring services
docker-compose ps prometheus grafana loki promtail

# Check service logs
docker-compose logs -f grafana
docker-compose logs -f prometheus
docker-compose logs -f loki

# Restart monitoring stack
docker-compose restart prometheus grafana loki promtail

# Check disk usage
du -sh monitoring/

# Clean up old logs (Loki retention)
docker exec auth-loki ls -la /loki/chunks/

# Backup monitoring configuration
./backup-grafana.sh
./backup-prometheus.sh
./backup-loki.sh

# Update dashboards
# Export from Grafana UI → Copy JSON → Import to new instance
```

## Security Considerations

### 1. Access Control

```yaml
# In grafana.ini
[auth]
disable_login_form = false
disable_signout_menu = false

[auth.anonymous]
enabled = false

[users]
allow_sign_up = false
default_role = Viewer
```

### 2. Network Security

```yaml
# In docker-compose.yml
networks:
  monitoring:
    driver: bridge
    internal: true  # No external access
```

### 3. Data Security

```bash
# Encrypt Grafana database
[database]
type = sqlite3
encrypt = true

# Use HTTPS for Grafana
[server]
protocol = https
cert_file = /etc/ssl/certs/grafana.crt
cert_key = /etc/ssl/private/grafana.key
```

This completes the comprehensive Grafana and Loki setup guide. Follow these steps to have a fully functional monitoring and logging system for your Full Stack Auth Backend application.