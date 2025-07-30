const Redis = require('ioredis');

// Load environment variables
require('dotenv').config();

// Simple logger  
const logger = require('../utils/logger');

// Redis configuration from environment variables
const redisOptions = {
  retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 100,
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
  lazyConnect: true,
  maxMemoryPolicy: 'allkeys-lru',
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 10000,
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
};

// Create Redis client with environment config (lazy initialization)
let redisClient;

function createRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', redisOptions);
    
    // Event handlers
    redisClient.on('error', (err) => {
      logger.error('Redis connection error:', err.message);
    });

    redisClient.on('connect', () => {
      logger.info('Redis connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis connection ready');
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }
  return redisClient;
}

// Initialize Redis connection
async function initializeRedis() {
  try {
    const client = createRedisClient();
    // Test the connection with a simple ping
    await client.ping();
    logger.info('✅ Redis connected successfully');
    global.redisClient = client;
    return client;
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error.message);
    throw error;
  }
}


// Helper function to safely execute Redis operations
const safeRedisOp = async (operation, fallback = null) => {
  try {
    const client = redisClient || createRedisClient();
    if (client.status !== 'ready') {
      logger.warn('Redis not ready, using fallback');
      return fallback;
    }
    return await operation();
  } catch (error) {
    logger.error('Redis operation failed:', error.message);
    return fallback;
  }
};

// Session service with safe operations
const sessionService = {
  async createSession(userId, sessionId, userData = {}, deviceInfo = {}) {
    return await safeRedisOp(async () => {
      const sessionData = {
        userId,
        sessionId,
        createdAt: new Date().toISOString(),
        ...userData
      };
      
      await redisClient.setex(`session:${sessionId}`, parseInt(process.env.SESSION_TIMEOUT) || 300, JSON.stringify(sessionData));
      await redisClient.set(`active_session:${userId}`, sessionId);
      
      return { sessionId, previousDeviceInfo: null, wasLoggedOutFromOtherDevice: false };
    }, { sessionId, previousDeviceInfo: null, wasLoggedOutFromOtherDevice: false });
  },

  async getSession(sessionId) {
    return await safeRedisOp(async () => {
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    }, null);
  },

  async deleteSession(sessionId) {
    return await safeRedisOp(async () => {
      const sessionData = await this.getSession(sessionId);
      if (sessionData) {
        await redisClient.del(`session:${sessionId}`);
        await redisClient.del(`active_session:${sessionData.userId}`);
      }
    }, null);
  },

  async storeRefreshToken(refreshToken, userId, sessionId) {
    return await safeRedisOp(async () => {
      const tokenData = { userId, sessionId, createdAt: new Date().toISOString() };
      const expire = parseInt(process.env.REFRESH_TOKEN_EXPIRE) || 604800;
      
      // Store token data
      await redisClient.setex(`refresh_token:${refreshToken}`, expire, JSON.stringify(tokenData));
      // Track user's refresh tokens in a set for efficient cleanup
      await redisClient.sadd(`user_refresh_tokens:${userId}`, refreshToken);
      await redisClient.expire(`user_refresh_tokens:${userId}`, expire);
    }, null);
  },

  async getRefreshToken(refreshToken) {
    return await safeRedisOp(async () => {
      const data = await redisClient.get(`refresh_token:${refreshToken}`);
      return data ? JSON.parse(data) : null;
    }, null);
  },

  async deleteRefreshToken(refreshToken) {
    return await safeRedisOp(async () => {
      // Get token data to find the userId for set cleanup
      const tokenData = await this.getRefreshToken(refreshToken);
      await redisClient.del(`refresh_token:${refreshToken}`);
      
      // Remove from user's refresh token set
      if (tokenData && tokenData.userId) {
        await redisClient.srem(`user_refresh_tokens:${tokenData.userId}`, refreshToken);
      }
    }, null);
  },

  async deleteAllUserSessions(userId) {
    return await safeRedisOp(async () => {
      const sessionId = await redisClient.get(`active_session:${userId}`);
      if (sessionId) {
        await redisClient.del(`session:${sessionId}`);
      }
      await redisClient.del(`active_session:${userId}`);
    }, null);
  },

  async refreshSession(sessionId, force = false) {
    return await safeRedisOp(async () => {
      const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) || 300;
      const throttleWindow = parseInt(process.env.SESSION_REFRESH_THROTTLE) || 30; // seconds
      
      if (!force) {
        // Check if session was recently extended to avoid unnecessary Redis calls
        const lastRefreshKey = `session_refresh:${sessionId}`;
        const lastRefresh = await redisClient.get(lastRefreshKey);
        
        if (lastRefresh) {
          const timeSinceRefresh = Date.now() - parseInt(lastRefresh);
          if (timeSinceRefresh < throttleWindow * 1000) {
            // Session was recently refreshed, skip this refresh
            return true;
          }
        }
        
        // Mark this refresh time to throttle future refreshes
        await redisClient.setex(lastRefreshKey, throttleWindow, Date.now().toString());
      }
      
      await redisClient.expire(`session:${sessionId}`, sessionTimeout);
      return true;
    }, false);
  },

  async deleteAllUserRefreshTokens(userId) {
    return await safeRedisOp(async () => {
      // Use Redis set to efficiently get all user refresh tokens
      const refreshTokens = await redisClient.smembers(`user_refresh_tokens:${userId}`);
      
      if (refreshTokens.length > 0) {
        // Delete all refresh tokens in a pipeline for efficiency
        const pipeline = redisClient.pipeline();
        
        refreshTokens.forEach(token => {
          pipeline.del(`refresh_token:${token}`);
        });
        
        // Delete the user's refresh token set
        pipeline.del(`user_refresh_tokens:${userId}`);
        
        await pipeline.exec();
      }
    }, null);
  }
};

// Failed attempts service
const failedAttemptsService = {
  async incrementFailedAttempts(identifier) {
    return await safeRedisOp(async () => {
      const attempts = await redisClient.incr(`failed_attempts:${identifier}`);
      await redisClient.expire(`failed_attempts:${identifier}`, parseInt(process.env.LOCKOUT_TIME) || 900);
      return attempts;
    }, 1);
  },

  async getFailedAttempts(identifier) {
    return await safeRedisOp(async () => {
      const attempts = await redisClient.get(`failed_attempts:${identifier}`);
      return parseInt(attempts) || 0;
    }, 0);
  },

  async clearFailedAttempts(identifier) {
    return await safeRedisOp(async () => {
      await redisClient.del(`failed_attempts:${identifier}`);
    }, null);
  },

  async lockAccount(identifier) {
    return await safeRedisOp(async () => {
      await redisClient.setex(`account_lock:${identifier}`, parseInt(process.env.LOCKOUT_TIME) || 900, 'locked');
    }, null);
  },

  async isAccountLocked(identifier) {
    return await safeRedisOp(async () => {
      const locked = await redisClient.get(`account_lock:${identifier}`);
      return !!locked;
    }, false);
  }
};

// User profile caching service
const userCacheService = {
  async cacheUserProfile(userId, userProfile) {
    return await safeRedisOp(async () => {
      const cacheKey = `user_profile:${userId}`;
      const cacheTime = parseInt(process.env.USER_CACHE_TTL) || 900; // 15 minutes default
      await redisClient.setex(cacheKey, cacheTime, JSON.stringify(userProfile));
    }, null);
  },

  async getUserProfile(userId) {
    return await safeRedisOp(async () => {
      const cacheKey = `user_profile:${userId}`;
      const cached = await redisClient.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    }, null);
  },

  async invalidateUserProfile(userId) {
    return await safeRedisOp(async () => {
      const cacheKey = `user_profile:${userId}`;
      await redisClient.del(cacheKey);
    }, null);
  }
};

// Token service
const tokenService = {
  async storeResetToken(token, userId, email) {
    return await safeRedisOp(async () => {
      await redisClient.setex(`reset_token:${token}`, 3600, JSON.stringify({ userId, email }));
    }, null);
  },

  async getResetTokenData(token) {
    return await safeRedisOp(async () => {
      const data = await redisClient.get(`reset_token:${token}`);
      return data ? JSON.parse(data) : null;
    }, null);
  },

  async deleteResetToken(token) {
    return await safeRedisOp(async () => {
      await redisClient.del(`reset_token:${token}`);
    }, null);
  }
};

// Additional utility functions
function isRedisReady() {
  const client = redisClient || createRedisClient();
  return client.status === 'ready';
}

async function ensureRedisConnection() {
  try {
    const client = redisClient || createRedisClient();
    if (client.status !== 'ready') {
      await client.ping();
    }
    return true;
  } catch (error) {
    logger.error('Failed to ensure Redis connection:', error);
    return false;
  }
}

module.exports = {
  initializeRedis,
  get redisClient() { return redisClient; },
  sessionService,
  failedAttemptsService,
  userCacheService,
  tokenService,
  isRedisReady,
  ensureRedisConnection
};