#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();

// Environment variables with defaults
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/secure-auth-full-stack';
const HEALTH_CHECK_ENDPOINT = process.env.HEALTH_CHECK_ENDPOINT || '/health';

// Basic logger fallback
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  stream: process.stdout
};

// Basic error handler
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
};

// Trust proxy
app.set('trust proxy', 1);

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb'
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100
}));

// Health check endpoint
app.get(HEALTH_CHECK_ENDPOINT, async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    };
    
    res.status(200).json(healthStatus);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Basic auth routes
app.get('/api/auth', (req, res) => {
  res.json({ message: 'Auth endpoint working' });
});

// Basic product routes  
app.get('/api/products', (req, res) => {
  res.json({ message: 'Products endpoint working' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Authentication API Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: HEALTH_CHECK_ENDPOINT,
      auth: '/api/auth',
      products: '/api/products'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// MongoDB connection (optional in development)
async function connectToDatabase() {
  try {
    const mongoOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(MONGODB_URI, mongoOptions);
    logger.info(`Connected to MongoDB: ${MONGODB_URI}`);
    return true;
  } catch (error) {
    logger.warn('MongoDB connection failed, continuing without database:', error.message);
    return false;
  }
}

// Start server function
async function startServer() {
  try {
    console.log('🚀 Starting server...');

    // Try to connect to database (don't fail if it's not available)
    await connectToDatabase();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log('✅ SERVER IS RUNNING!');
      console.log(`🔗 Port: ${PORT}`);
      console.log(`📊 Environment: ${NODE_ENV}`);
      console.log(`🏠 URL: http://localhost:${PORT}`);
      console.log(`❤️  Health: http://localhost:${PORT}${HEALTH_CHECK_ENDPOINT}`);
      console.log('🎉 Ready to accept requests!');
      
      logger.info(`Server running on port ${PORT}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
        throw error;
      }
    });

    return server;

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Promise Rejection:', err);
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    console.error('💥 Startup failed:', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };