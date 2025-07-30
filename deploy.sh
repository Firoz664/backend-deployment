#!/bin/bash

# Deploy script for Full Stack Auth Backend
# This script handles deployment using Docker Compose

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups"
LOG_FILE="./deploy.log"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Function to check if Docker and Docker Compose are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Dependencies check passed"
}

# Function to create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    directories=(
        "logs"
        "backups"
        "nginx/ssl"
        "monitoring/prometheus/data"
        "monitoring/grafana/data"
        "monitoring/loki/data"
    )
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_status "Created directory: $dir"
        fi
    done
    
    print_success "Directories created successfully"
}

# Function to check environment file
check_env_file() {
    print_status "Checking environment configuration..."
    
    if [ ! -f "$ENV_FILE" ]; then
        print_warning "Environment file $ENV_FILE not found. Creating from template..."
        cp .env.example "$ENV_FILE" 2>/dev/null || {
            print_error "Could not create $ENV_FILE. Please create it manually."
            exit 1
        }
    fi
    
    print_success "Environment file check completed"
}

# Function to backup data
backup_data() {
    if [ "$1" = "--skip-backup" ]; then
        print_warning "Skipping backup as requested"
        return
    fi
    
    print_status "Creating backup..."
    
    # Load environment variables for MongoDB credentials
    if [ -f "$ENV_FILE" ]; then
        source "$ENV_FILE"
    fi
    
    # Create backup directory with timestamp
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    CURRENT_BACKUP_DIR="$BACKUP_DIR/backup_$BACKUP_TIMESTAMP"
    mkdir -p "$CURRENT_BACKUP_DIR"
    
    # Backup MongoDB data
    if docker-compose ps mongodb | grep -q "Up"; then
        print_status "Backing up MongoDB data..."
        docker-compose exec -T mongodb sh -c "mkdir -p /tmp/mongodb_backup"
        docker-compose exec -T mongodb mongodump --host localhost:27017 --username admin --password password123 --authenticationDatabase admin --db secure-auth-full-stack --out /tmp/mongodb_backup
        docker cp $(docker-compose ps -q mongodb):/tmp/mongodb_backup "$CURRENT_BACKUP_DIR/"
    fi
    
    # Backup Redis data
    if docker-compose ps redis | grep -q "Up"; then
        print_status "Backing up Redis data..."
        docker-compose exec -T redis redis-cli BGSAVE
        sleep 2
        docker cp $(docker-compose ps -q redis):/data/dump.rdb "$CURRENT_BACKUP_DIR/"
    fi
    
    print_success "Backup completed: $CURRENT_BACKUP_DIR"
    log_message "Backup created at $CURRENT_BACKUP_DIR"
}

# Function to pull latest images
pull_images() {
    print_status "Pulling latest Docker images..."
    docker-compose pull
    print_success "Images pulled successfully"
}

# Function to build application
build_application() {
    print_status "Building application..."
    docker-compose build --no-cache
    print_success "Application built successfully"
}

# Function to deploy services
deploy_services() {
    print_status "Deploying services..."
    
    # Stop services gracefully
    if docker-compose ps --services | grep -q .; then
        print_status "Stopping existing services..."
        docker-compose down --timeout 30
    fi
    
    # Start services
    print_status "Starting services..."
    docker-compose up -d
    
    print_success "Services deployed successfully"
}

# Function to wait for services to be healthy
wait_for_services() {
    print_status "Waiting for services to be healthy..."
    
    services=("mongodb" "redis" "backend" "nginx")
    max_attempts=30
    
    for service in "${services[@]}"; do
        print_status "Checking $service..."
        attempt=0
        
        while [ $attempt -lt $max_attempts ]; do
            if docker-compose ps "$service" | grep -q "healthy\|Up"; then
                print_success "$service is healthy"
                break
            fi
            
            attempt=$((attempt + 1))
            print_status "Waiting for $service... ($attempt/$max_attempts)"
            sleep 10
        done
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "$service failed to become healthy"
            return 1
        fi
    done
    
    print_success "All services are healthy"
}

# Function to run health checks
run_health_checks() {
    print_status "Running health checks..."
    
    # Check backend API
    if curl -f http://localhost:8081/health > /dev/null 2>&1; then
        print_success "Backend API health check passed"
    else
        print_error "Backend API health check failed"
        return 1
    fi
    
    # Check Grafana
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        print_success "Grafana health check passed"
    else
        print_warning "Grafana health check failed"
    fi
    
    # Check Prometheus
    if curl -f http://localhost:9090/-/healthy > /dev/null 2>&1; then
        print_success "Prometheus health check passed"
    else
        print_warning "Prometheus health check failed"
    fi
    
    print_success "Health checks completed"
}

# Function to show service status
show_status() {
    print_status "Service Status:"
    docker-compose ps
    
    echo ""
    print_status "Service URLs:"
    echo "  Backend API: http://localhost:8081"
    echo "  Grafana Dashboard: http://localhost:3000 (admin/admin123)"
    echo "  Prometheus: http://localhost:9090"
    echo "  Health Check: http://localhost:8081/health"
}

# Function to clean up old images and containers
cleanup() {
    if [ "$1" = "--cleanup" ]; then
        print_status "Cleaning up old Docker images and containers..."
        docker system prune -f
        docker volume prune -f
        print_success "Cleanup completed"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --skip-backup    Skip database backup"
    echo "  --cleanup        Clean up old Docker images and containers"
    echo "  --build-only     Only build, don't deploy"
    echo "  --deploy-only    Only deploy, don't build"
    echo "  --status         Show service status"
    echo "  --logs [service] Show logs for all services or specific service"
    echo "  --stop           Stop all services"
    echo "  --restart        Restart all services"
    echo "  --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Full deployment"
    echo "  $0 --skip-backup      # Deploy without backup"
    echo "  $0 --status           # Show service status"
    echo "  $0 --logs backend     # Show backend logs"
}

# Main deployment function
main() {
    log_message "Deployment started with args: $*"
    
    # Parse command line arguments
    SKIP_BACKUP=false
    BUILD_ONLY=false
    DEPLOY_ONLY=false
    CLEANUP_AFTER=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --cleanup)
                CLEANUP_AFTER=true
                shift
                ;;
            --build-only)
                BUILD_ONLY=true
                shift
                ;;
            --deploy-only)
                DEPLOY_ONLY=true
                shift
                ;;
            --status)
                show_status
                exit 0
                ;;
            --logs)
                if [ -n "$2" ]; then
                    docker-compose logs -f "$2"
                else
                    docker-compose logs -f
                fi
                exit 0
                ;;
            --stop)
                print_status "Stopping all services..."
                docker-compose down
                print_success "All services stopped"
                exit 0
                ;;
            --restart)
                print_status "Restarting all services..."
                docker-compose restart
                print_success "All services restarted"
                exit 0
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Start deployment process
    print_status "Starting deployment process..."
    
    check_dependencies
    create_directories
    check_env_file
    
    if [ "$BUILD_ONLY" = true ]; then
        build_application
        print_success "Build completed successfully"
        exit 0
    fi
    
    if [ "$DEPLOY_ONLY" = false ]; then
        pull_images
        build_application
    fi
    
    if [ "$SKIP_BACKUP" = false ]; then
        backup_data
    fi
    
    deploy_services
    wait_for_services
    run_health_checks
    show_status
    
    if [ "$CLEANUP_AFTER" = true ]; then
        cleanup --cleanup
    fi
    
    print_success "Deployment completed successfully!"
    log_message "Deployment completed successfully"
}

# Trap to handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi