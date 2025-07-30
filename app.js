const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

// Load environment variables
require('dotenv').config();

// Configuration and utilities
const logger = require('./utils/logger');

// Middleware
const errorHandler = require('./middleware/errorHandler');
const { 
  generalLimiter, 
  speedLimiter, 
  securityHeaders 
} = require('./middleware/security');
const {
  mongoSanitization,
  xssProtection,
  hppProtection,
  customSanitization
} = require('./middleware/sanitization');

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');

// Create Express app
const app = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(securityHeaders);

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

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Rate limiting - temporarily disabled for testing
// app.use(speedLimiter);
// app.use(generalLimiter);

// Input sanitization (before body parsing)
app.use(mongoSanitization);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON'
      });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100
}));

// Additional sanitization (after body parsing)
app.use(xssProtection);
app.use(hppProtection);
app.use(customSanitization);

// Health check endpoint
const healthCheckEnabled = process.env.HEALTH_CHECK_ENABLED !== 'false';
const healthCheckEndpoint = process.env.HEALTH_CHECK_ENDPOINT || '/health';

if (healthCheckEnabled) {
  app.get(healthCheckEndpoint, async (req, res) => {
    try {
      const healthStatus = {
        status: 'healthy',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
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
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Authentication API Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: healthCheckEndpoint,
      auth: '/api/auth',
      products: '/api/products'
    }
  });
});

// 404 handler
// Instead of app.all('*', ...)
app.use((req, res, next) => {
  if (!res.headersSent) {
    res.status(404).json({
      success: false,
      message: `Route ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    });
  }
});

// Global error handler (must be last middleware)
app.use(errorHandler);

module.exports = app;