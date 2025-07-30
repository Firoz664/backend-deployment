const { isRedisReady, ensureRedisConnection } = require('../config/redis');
const logger = require('../utils/logger');

const checkRedisConnection = async (req, res, next) => {
  try {
    if (!isRedisReady()) {
      logger.warn(`Redis not ready for request: ${req.path}, attempting to reconnect...`);
      
      // Try to ensure connection
      const connected = await ensureRedisConnection();
      if (!connected) {
        logger.error('Failed to establish Redis connection for request:', req.path);
        return res.status(503).json({
          success: false,
          message: 'Service temporarily unavailable. Please try again.',
          code: 'REDIS_NOT_AVAILABLE'
        });
      }
    }
    next();
  } catch (error) {
    logger.error('Redis connection check failed:', error);
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable. Please try again.',
      code: 'REDIS_CHECK_FAILED'
    });
  }
};

module.exports = checkRedisConnection;