#!/usr/bin/env node

require('dotenv').config(); // Load environment variables

const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { initializeRedis } = require('./config/redis');
const app = require('./app');

// Environment variables with defaults
const PORT = process.env.PORT || 9000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/secure-auth-full-stack';
const HEALTH_CHECK_ENDPOINT = process.env.HEALTH_CHECK_ENDPOINT || '/health';

// Ensure logs directory exists
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// MongoDB connection with optimized settings
async function connectToDatabase() {
  try {
    const mongoOptions = {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT) || 5000,
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT) || 45000,
    };

    await mongoose.connect(MONGODB_URI, mongoOptions);
    logger.info(`Connected to MongoDB: ${MONGODB_URI}`);
    
    // Connection event handlers
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

// Graceful shutdown function
function setupGracefulShutdown(server) {
  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');
      
      try {
        // Close database connections
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
        
        // Close Redis connection if it exists
        if (global.redisClient) {
          await global.redisClient.quit();
          logger.info('Redis connection closed');
        }
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });

    // Force close after timeout
    const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT) || 10000;
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, shutdownTimeout);
  };

  // Setup signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Start server
async function startServer() {
  try {
    // Validate required environment variables
    if (!PORT) {
      throw new Error('PORT environment variable is required');
    }

    logger.info('Starting server initialization...');

    // Connect to database first
    await connectToDatabase();

    // Initialize Redis connection
    try {
      await initializeRedis();
      logger.info('Redis initialized successfully');
    } catch (redisError) {
      logger.warn('Redis initialization failed, continuing without Redis:', redisError.message);
      // Don't exit - Redis might be optional
    }

    // Start HTTP server
    const server = app.listen(PORT, (err) => {
      if (err) {
        logger.error('Failed to start server:', err);
        return;
      }

      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📊 Environment: ${NODE_ENV}`);
      logger.info(`💾 Database is connected to MongoDB`);
      logger.info(`🔴 Redis is ${global.redisClient ? 'connected and ready' : 'not available'}`);
      logger.info(`📍 Health check available at: http://localhost:${PORT}${HEALTH_CHECK_ENDPOINT}`);
      logger.info(`🔗 API base URL: http://localhost:${PORT}/api`);
    });

    // Setup graceful shutdown signal handlers
    setupGracefulShutdown(server);

    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' 
        ? `Pipe ${PORT}` 
        : `Port ${PORT}`;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          logger.error('Server error:', error);
          throw error;
      }
    });

    server.on('listening', () => {
      const addr = server.address();
      const bind = typeof addr === 'string' 
        ? `pipe ${addr}` 
        : `port ${addr.port}`;
      logger.info(`Server listening on ${bind}`);
    });

    return server;

  } catch (error) {
    logger.error('Failed to start server:', error);
    
    // Clean up connections before exiting
    try {
      await mongoose.connection.close();
    } catch (cleanupError) {
      logger.error('Error cleaning up MongoDB connection:', cleanupError);
    }
    
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection:', err);
  logger.error('At promise:', promise);
  // Don't exit immediately in development
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Server startup failed:', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };