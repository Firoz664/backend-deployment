const jwt = require('jsonwebtoken');
const { sessionService } = require('../config/redis');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const sessionData = await sessionService.getSession(decoded.sessionId);

    if (!sessionData) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired session' 
      });
    }

    if (sessionData.userId !== decoded.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session mismatch' 
      });
    }

    await sessionService.refreshSession(decoded.sessionId);

    req.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      email: sessionData.email || decoded.email
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error' 
    });
  }
};

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '5m'
  });

  const refreshToken = jwt.sign(
    { 
      userId: payload.userId, 
      sessionId: payload.sessionId,
      type: 'refresh' 
    }, 
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
    }
  );

  return { accessToken, refreshToken };
};

module.exports = {
  authenticateToken,
  generateTokens
};