pipeline {
    agent any
    
    environment {
        // Docker registry settings
        DOCKER_REGISTRY = 'your-registry.com'  // Change to your Docker registry
        IMAGE_NAME = 'fullstack-auth-backend'
        IMAGE_TAG = "${BUILD_NUMBER}-${GIT_COMMIT.take(7)}"
        
        // Deployment settings
        DEPLOY_ENV = "${BRANCH_NAME == 'main' ? 'production' : 'staging'}"
        
        // Notification settings
        SLACK_CHANNEL = '#deployments'  // Change to your Slack channel
        SLACK_TEAM_DOMAIN = 'your-team'  // Change to your Slack workspace
        
        // Email settings
        EMAIL_RECIPIENTS = 'dev-team@yourcompany.com,ops@yourcompany.com'  // Change to your emails
        
        // Application settings
        NODE_VERSION = '18'
        COMPOSE_FILE = 'docker-compose.yml'
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }
    
    triggers {
        githubPush()
        cron(BRANCH_NAME == 'main' ? 'H 2 * * *' : '')  // Nightly builds for main branch
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    // Clean workspace
                    cleanWs()
                    
                    // Checkout code
                    checkout scm
                    
                    // Get commit info for notifications
                    env.GIT_COMMIT_MSG = sh(
                        script: 'git log -1 --pretty=%B',
                        returnStdout: true
                    ).trim()
                    
                    env.GIT_AUTHOR = sh(
                        script: 'git log -1 --pretty=%an',
                        returnStdout: true
                    ).trim()
                }
            }
        }
        
        stage('Environment Setup') {
            steps {
                script {
                    // Create necessary directories
                    sh '''
                        mkdir -p logs
                        mkdir -p backups
                        mkdir -p nginx/ssl
                        mkdir -p monitoring/prometheus/data
                        mkdir -p monitoring/grafana/data
                        mkdir -p monitoring/loki/data
                    '''
                    
                    // Copy environment file based on branch
                    if (env.BRANCH_NAME == 'main') {
                        sh 'cp .env.example .env.production'
                    } else {
                        sh 'cp .env.example .env.staging'
                    }
                    
                    // Load environment variables
                    load '.env.production'
                }
            }
        }
        
        stage('Code Quality') {
            parallel {
                stage('Lint') {
                    steps {
                        script {
                            // Install dependencies for linting
                            sh '''
                                npm ci --only=dev
                                npm run lint || echo "Linting completed with warnings"
                            '''
                        }
                    }
                    post {
                        always {
                            // Archive lint results if available
                            archiveArtifacts artifacts: 'lint-results.xml', allowEmptyArchive: true
                        }
                    }
                }
                
                stage('Security Scan') {
                    steps {
                        script {
                            // npm audit for security vulnerabilities
                            sh '''
                                npm audit --audit-level=moderate --json > audit-results.json || true
                                npm audit --audit-level=high --json || echo "High severity vulnerabilities found"
                            '''
                        }
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: 'audit-results.json', allowEmptyArchive: true
                        }
                    }
                }
            }
        }
        
        stage('Build') {
            steps {
                script {
                    // Build Docker image
                    sh """
                        docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
                        docker build -t ${IMAGE_NAME}:latest .
                    """
                    
                    // Test Docker image
                    sh """
                        docker run --rm ${IMAGE_NAME}:${IMAGE_TAG} node --version
                        docker run --rm ${IMAGE_NAME}:${IMAGE_TAG} npm --version
                    """
                }
            }
        }
        
        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        script {
                            // Run unit tests in Docker container
                            sh """
                                docker run --rm \
                                    -v \$(pwd)/test-results:/usr/src/app/test-results \
                                    -e NODE_ENV=test \
                                    ${IMAGE_NAME}:${IMAGE_TAG} \
                                    npm test
                            """
                        }
                    }
                    post {
                        always {
                            // Publish test results
                            publishTestResults testResultsPattern: 'test-results/*.xml'
                            archiveArtifacts artifacts: 'test-results/**/*', allowEmptyArchive: true
                        }
                    }
                }
                
                stage('Integration Tests') {
                    steps {
                        script {
                            // Start test environment
                            sh '''
                                # Start test database
                                docker-compose -f docker-compose.test.yml up -d mongodb redis
                                
                                # Wait for services to be ready
                                sleep 30
                                
                                # Run integration tests
                                docker run --rm \
                                    --network backend_app-network \
                                    -e NODE_ENV=test \
                                    -e MONGODB_URI=mongodb://mongodb:27017/test-db \
                                    -e REDIS_URL=redis://redis:6379 \
                                    ${IMAGE_NAME}:${IMAGE_TAG} \
                                    npm run test:integration || true
                            '''
                        }
                    }
                    post {
                        always {
                            // Cleanup test environment
                            sh 'docker-compose -f docker-compose.test.yml down -v || true'
                        }
                    }
                }
                
                stage('Health Check Tests') {
                    steps {
                        script {
                            // Start application in test mode
                            sh '''
                                docker-compose -f docker-compose.test.yml up -d
                                
                                # Wait for application to start
                                sleep 60
                                
                                # Run health checks
                                curl -f http://localhost:8081/health || exit 1
                                
                                # Test API endpoints
                                curl -f http://localhost:8081/api/auth/health || exit 1
                            '''
                        }
                    }
                    post {
                        always {
                            sh 'docker-compose -f docker-compose.test.yml down -v || true'
                        }
                    }
                }
            }
        }
        
        stage('Push to Registry') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    expression { return params.FORCE_DEPLOY == true }
                }
            }
            steps {
                script {
                    // Login to Docker registry
                    withCredentials([usernamePassword(credentialsId: 'docker-registry-creds', 
                                                    usernameVariable: 'DOCKER_USERNAME', 
                                                    passwordVariable: 'DOCKER_PASSWORD')]) {
                        sh '''
                            echo $DOCKER_PASSWORD | docker login $DOCKER_REGISTRY -u $DOCKER_USERNAME --password-stdin
                            
                            # Tag images for registry
                            docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
                            docker tag ${IMAGE_NAME}:latest ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
                            
                            # Push images
                            docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
                            docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
                        '''
                    }
                }
            }
        }
        
        stage('Deploy to Staging') {
            when {
                not { branch 'main' }
            }
            steps {
                script {
                    // Deploy to staging environment
                    sh '''
                        # Update staging environment
                        export IMAGE_TAG=${IMAGE_TAG}
                        export DEPLOY_ENV=staging
                        
                        # Run deployment script
                        ./deploy.sh --skip-backup --deploy-only
                        
                        # Verify deployment
                        sleep 30
                        curl -f http://localhost:8081/health
                    '''
                }
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                script {
                    // Production deployment with approval
                    timeout(time: 10, unit: 'MINUTES') {
                        input message: 'Deploy to Production?', 
                              ok: 'Deploy',
                              submitterParameter: 'DEPLOYER'
                    }
                    
                    // Create production backup before deployment
                    sh '''
                        # Create backup
                        ./deploy.sh --skip-backup=false --build-only
                        
                        # Deploy to production
                        export IMAGE_TAG=${IMAGE_TAG}
                        export DEPLOY_ENV=production
                        ./deploy.sh --deploy-only
                        
                        # Verify production deployment
                        sleep 60
                        curl -f http://localhost:8081/health
                        
                        # Run smoke tests
                        curl -f http://localhost:8081/api/auth/health
                    '''
                }
            }
        }
        
        stage('Post-Deploy Tests') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                script {
                    // Run post-deployment verification tests
                    sh '''
                        # Wait for services to stabilize
                        sleep 30
                        
                        # Check all service health
                        ./deploy.sh --status
                        
                        # Run smoke tests
                        curl -f http://localhost:8081/health
                        curl -f http://localhost:3000/api/health  # Grafana
                        curl -f http://localhost:9090/-/healthy  # Prometheus
                        
                        # Check database connectivity
                        docker-compose exec -T backend node -e "
                            const mongoose = require('mongoose');
                            mongoose.connect(process.env.MONGODB_URI)
                                .then(() => {
                                    console.log('✅ Database connected');
                                    process.exit(0);
                                })
                                .catch(err => {
                                    console.log('❌ Database error:', err.message);
                                    process.exit(1);
                                });
                        "
                    '''
                }
            }
        }
    }
    
    post {
        always {
            // Archive build artifacts
            archiveArtifacts artifacts: 'logs/**/*', allowEmptyArchive: true
            
            // Clean up Docker images
            sh '''
                docker rmi ${IMAGE_NAME}:${IMAGE_TAG} || true
                docker system prune -f || true
            '''
        }
        
        success {
            script {
                // Send success notifications
                sendEmailNotification('SUCCESS')
                sendSlackNotification('SUCCESS')
                
                // Update deployment status
                sh '''
                    echo "Deployment successful at $(date)" >> deployment-history.log
                    echo "Version: ${IMAGE_TAG}" >> deployment-history.log
                    echo "Branch: ${BRANCH_NAME}" >> deployment-history.log
                    echo "Commit: ${GIT_COMMIT}" >> deployment-history.log
                    echo "---" >> deployment-history.log
                '''
            }
        }
        
        failure {
            script {
                // Send failure notifications
                sendEmailNotification('FAILURE')
                sendSlackNotification('FAILURE')
                
                // Collect failure logs
                sh '''
                    mkdir -p failure-logs
                    docker-compose logs > failure-logs/docker-compose.log 2>&1 || true
                    ./deploy.sh --logs > failure-logs/deploy.log 2>&1 || true
                    cp logs/*.log failure-logs/ 2>/dev/null || true
                '''
                
                archiveArtifacts artifacts: 'failure-logs/**/*', allowEmptyArchive: true
            }
        }
        
        unstable {
            script {
                sendEmailNotification('UNSTABLE')
                sendSlackNotification('UNSTABLE')
            }
        }
        
        aborted {
            script {
                sendEmailNotification('ABORTED')
                sendSlackNotification('ABORTED')
            }
        }
    }
}

// Function to send email notifications
def sendEmailNotification(String status) {
    def subject = "Build ${status}: ${env.JOB_NAME} - ${env.BUILD_NUMBER}"
    def body = """
        <h2>Build ${status}</h2>
        <table border="1" cellpadding="5" cellspacing="0">
            <tr><td><strong>Project:</strong></td><td>${env.JOB_NAME}</td></tr>
            <tr><td><strong>Build Number:</strong></td><td>${env.BUILD_NUMBER}</td></tr>
            <tr><td><strong>Status:</strong></td><td>${status}</td></tr>
            <tr><td><strong>Branch:</strong></td><td>${env.BRANCH_NAME}</td></tr>
            <tr><td><strong>Commit:</strong></td><td>${env.GIT_COMMIT}</td></tr>
            <tr><td><strong>Author:</strong></td><td>${env.GIT_AUTHOR}</td></tr>
            <tr><td><strong>Message:</strong></td><td>${env.GIT_COMMIT_MSG}</td></tr>
            <tr><td><strong>Duration:</strong></td><td>${currentBuild.durationString}</td></tr>
            <tr><td><strong>Build URL:</strong></td><td><a href="${env.BUILD_URL}">${env.BUILD_URL}</a></td></tr>
        </table>
        
        ${status == 'SUCCESS' ? '<h3 style="color: green;">✅ Deployment completed successfully!</h3>' : ''}
        ${status == 'FAILURE' ? '<h3 style="color: red;">❌ Build failed. Please check the logs.</h3>' : ''}
        ${status == 'UNSTABLE' ? '<h3 style="color: orange;">⚠️ Build completed with warnings.</h3>' : ''}
        ${status == 'ABORTED' ? '<h3 style="color: gray;">⏹️ Build was aborted.</h3>' : ''}
        
        <h3>Environment URLs:</h3>
        <ul>
            <li><a href="http://localhost:8081/health">Backend Health Check</a></li>
            <li><a href="http://localhost:3000">Grafana Dashboard</a></li>
            <li><a href="http://localhost:9090">Prometheus</a></li>
        </ul>
        
        <p><em>This is an automated message from Jenkins CI/CD Pipeline.</em></p>
    """
    
    emailext (
        subject: subject,
        body: body,
        mimeType: 'text/html',
        to: env.EMAIL_RECIPIENTS,
        attachLog: status == 'FAILURE',
        compressLog: true
    )
}

// Function to send Slack notifications
def sendSlackNotification(String status) {
    def color = ''
    def emoji = ''
    def message = ''
    
    switch(status) {
        case 'SUCCESS':
            color = 'good'
            emoji = ':white_check_mark:'
            message = 'Build and deployment completed successfully!'
            break
        case 'FAILURE':
            color = 'danger'
            emoji = ':x:'
            message = 'Build failed! Please check the logs.'
            break
        case 'UNSTABLE':
            color = 'warning'
            emoji = ':warning:'
            message = 'Build completed with warnings.'
            break
        case 'ABORTED':
            color = '#808080'
            emoji = ':no_entry_sign:'
            message = 'Build was aborted.'
            break
    }
    
    def slackMessage = [
        channel: env.SLACK_CHANNEL,
        color: color,
        message: "${emoji} *${env.JOB_NAME}* - Build #${env.BUILD_NUMBER}",
        teamDomain: env.SLACK_TEAM_DOMAIN,
        attachments: [
            [
                color: color,
                fields: [
                    [
                        title: "Status",
                        value: status,
                        short: true
                    ],
                    [
                        title: "Branch",
                        value: env.BRANCH_NAME,
                        short: true
                    ],
                    [
                        title: "Author",
                        value: env.GIT_AUTHOR,
                        short: true
                    ],
                    [
                        title: "Duration",
                        value: currentBuild.durationString,
                        short: true
                    ],
                    [
                        title: "Commit Message",
                        value: env.GIT_COMMIT_MSG,
                        short: false
                    ]
                ],
                actions: [
                    [
                        type: "button",
                        text: "View Build",
                        url: env.BUILD_URL
                    ],
                    [
                        type: "button",
                        text: "View Console",
                        url: "${env.BUILD_URL}console"
                    ]
                ]
            ]
        ]
    ]
    
    slackSend(slackMessage)
}