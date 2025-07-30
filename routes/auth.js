const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { UAParser } = require('ua-parser-js');
const User = require('../models/User');
const { generateTokens, authenticateToken } = require('../middleware/auth');
const { sessionService, failedAttemptsService, tokenService, userCacheService } = require('../config/redis');
const { sendResetEmail } = require('../utils/email');
const asyncHandler = require('../utils/asyncHandler');
const { 
  AuthenticationError, 
  ValidationError, 
  TooManyRequestsError,
  NotFoundError,
  ConflictError 
} = require('../utils/errors');
const validators = require('../utils/validators');
const { 
  authLimiter, 
  registerLimiter, 
  resetLimiter 
} = require('../middleware/security');
const checkRedisConnection = require('../middleware/redisCheck');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/register', registerLimiter, validators.register, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed: ' + errors.array().map(e => e.msg).join(', '));
  }

  const { email, password, firstName, lastName } = req.body;

  const existingUser = await User.findByEmail(email).select('_id').lean();
  if (existingUser) {
    throw new ConflictError('User already exists with this email');
  }

  const user = new User({
    email,
    password,
    firstName,
    lastName
  });

  await user.save();
  
  logger.info(`New user registered: ${email}`);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: user.getPublicProfile()
  });
}));

router.post('/login', validators.login, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed: ' + errors.array().map(e => e.msg).join(', '));
  }

  const { email, password, deviceToken } = req.body;
  const identifier = `${email}:${req.ip}`;

  const isLocked = await failedAttemptsService.isAccountLocked(identifier);
  if (isLocked) {
    throw new TooManyRequestsError('Account temporarily locked due to multiple failed attempts. Please try again later.');
  }

  const user = await User.findByEmail(email);
  
  if (!user) {
    await failedAttemptsService.incrementFailedAttempts(identifier);
    throw new AuthenticationError('Invalid credentials');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    const attempts = await failedAttemptsService.incrementFailedAttempts(identifier);
    
    if (attempts >= 5) {
      await failedAttemptsService.lockAccount(identifier);
      throw new TooManyRequestsError('Account locked due to multiple failed attempts. Please try again in 15 minutes.');
    }

    throw new AuthenticationError(`Invalid credentials. ${5 - attempts} attempts remaining.`);
  }

  if (!user.isActive) {
    throw new AuthenticationError('Account is deactivated. Please contact support.');
  }

  await failedAttemptsService.clearFailedAttempts(identifier);

  // Parse user agent for device information
  const parser = new UAParser(req.headers['user-agent']);
  const result = parser.getResult();
  
  const deviceInfo = {
    browser: {
      name: result.browser.name || 'Unknown',
      version: result.browser.version || 'Unknown'
    },
    os: {
      name: result.os.name || 'Unknown',
      version: result.os.version || 'Unknown'
    },
    device: {
      model: result.device.model || 'Unknown',
      type: result.device.type || 'desktop',
      vendor: result.device.vendor || 'Unknown'
    },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    deviceToken: deviceToken || null 
  };

  // Generate device ID for current login attempt
  const currentDeviceId = user.generateDeviceId(deviceInfo);
  const existingDevice = user.devices.find(d => d.deviceId === currentDeviceId);
  const isNewDevice = !existingDevice;

  // Get current device info before logging out other devices
  let previousDeviceInfo = null;
  const activeDevices = user.devices
    .filter(d => d.isActive && d.deviceId !== currentDeviceId)
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  
  if (activeDevices.length > 0) {
    previousDeviceInfo = activeDevices[0]; // Most recent active device
  }

  // Single device policy: Invalidate all existing sessions and tokens
  await sessionService.deleteAllUserSessions(user._id.toString());
  await sessionService.deleteAllUserRefreshTokens(user._id.toString());

  // Deactivate all other devices in user model
  user.devices.forEach(device => {
    if (device.deviceId !== currentDeviceId) {
      device.isActive = false;
    }
  });

  logger.info(`User login: ${email} - Logged out from all other devices/sessions`);

  // Create new session
  const sessionId = crypto.randomUUID();
  await sessionService.createSession(user._id.toString(), sessionId, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName
  }, deviceInfo);

  const { accessToken, refreshToken } = generateTokens({
    userId: user._id.toString(),
    sessionId,
    email: user.email
  });

  // Store refresh token in Redis
  await sessionService.storeRefreshToken(refreshToken, user._id.toString(), sessionId);

  // Update user with last login and device information
  user.lastLogin = new Date();
  const updatedDeviceId = user.updateDeviceInfo(deviceInfo);
  await user.save();

  logger.info(`User login successful: ${email} from ${deviceInfo.device.type}${isNewDevice ? ' (new device)' : ''}`);

  // Prepare response
  const response = {
    success: true,
    message: 'Login successful',
    accessToken,
    refreshToken,
    user: user.getPublicProfile(),
    deviceInfo: {
      deviceId: updatedDeviceId,
      isNewDevice,
      totalDevices: user.devices.length
    }
  };

  // Add device logout information if previous device was logged out
  if (previousDeviceInfo) {
    response.deviceLogout = {
      wasLoggedOut: true,
      previousDevice: {
        browser: previousDeviceInfo.browser?.name || 'Unknown Browser',
        os: previousDeviceInfo.os?.name || 'Unknown OS',
        deviceType: previousDeviceInfo.device?.type || 'desktop',
        deviceId: previousDeviceInfo.deviceId,
        lastSeen: previousDeviceInfo.lastSeen
      },
      message: 'You have been automatically logged out from your previous device/browser.'
    };
  }

  res.json(response);
}));


router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await sessionService.deleteSession(req.user.sessionId);
    await sessionService.deleteAllUserRefreshTokens(req.user.userId);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Try to get user profile from cache first
    let userProfile = await userCacheService.getUserProfile(req.user.userId);
    
    if (!userProfile) {
      // Cache miss - fetch from database
      const user = await User.findById(req.user.userId).select('email firstName lastName isVerified lastLogin lastDeviceInfo createdAt');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      userProfile = user.getPublicProfile();
      // Cache the user profile for future requests
      await userCacheService.cacheUserProfile(req.user.userId, userProfile);
    }

    res.json({
      success: true,
      user: userProfile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
});

router.get('/session-status', authenticateToken, async (req, res) => {
  try {
    const timeLeft = await sessionService.getSessionTimeLeft(req.user.sessionId);
    
    res.json({
      success: true,
      timeLeft,
      sessionId: req.user.sessionId
    });
  } catch (error) {
    console.error('Session status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session status'
    });
  }
});

router.post('/extend-session', authenticateToken, async (req, res) => {
  try {
    const extended = await sessionService.refreshSession(req.user.sessionId);
    
    if (extended) {
      res.json({
        success: true,
        message: 'Session extended successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to extend session'
      });
    }
  } catch (error) {
    console.error('Extend session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extend session'
    });
  }
});

router.post('/change-password', authenticateToken, validators.changePassword, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    await sessionService.deleteAllUserSessions(user._id.toString());

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email',
        errors: errors.array()
      });
    }

    const { email } = req.body;
    const user = await User.findByEmail(email);

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await tokenService.storeResetToken(resetToken, user._id.toString(), user.email);
      await sendResetEmail(user.email, resetToken, user.firstName);
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

router.post('/reset-password', validators.resetPassword, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token, newPassword } = req.body;
    const tokenData = await tokenService.getResetTokenData(token);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const user = await User.findById(tokenData.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.password = newPassword;
    await user.save();

    await tokenService.deleteResetToken(token);
    await sessionService.deleteAllUserSessions(user._id.toString());

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const deviceHistory = user.getDeviceHistory();
    
    res.json({
      success: true,
      devices: deviceHistory,
      totalDevices: deviceHistory.length
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get device history'
    });
  }
});

router.post('/devices/:deviceId/deactivate', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const deactivated = user.deactivateDevice(deviceId);
    if (!deactivated) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Device deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate device error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate device'
    });
  }
});

router.post('/refresh-token', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { refreshToken } = req.body;

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Check if refresh token exists in Redis
    const tokenData = await sessionService.getRefreshToken(refreshToken);
    if (!tokenData) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not found or expired'
      });
    }

    // Verify session still exists
    const sessionData = await sessionService.getSession(decoded.sessionId);
    if (!sessionData) {
      await sessionService.deleteRefreshToken(refreshToken);
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    // Verify user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      await sessionService.deleteRefreshToken(refreshToken);
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Generate new access token
    const { accessToken } = generateTokens({
      userId: user._id.toString(),
      sessionId: decoded.sessionId,
      email: user.email
    });

    // Extend session
    await sessionService.refreshSession(decoded.sessionId);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      accessToken
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

module.exports = router;