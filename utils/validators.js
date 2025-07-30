const { body, param } = require('express-validator');

const validators = {
  // User registration validation
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email')
      .isLength({ max: 255 })
      .withMessage('Email must be less than 255 characters'),
    
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('firstName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name is required and must be less than 50 characters')
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('First name can only contain letters and spaces'),
    
    body('lastName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name is required and must be less than 50 characters')
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Last name can only contain letters and spaces'),
  ],

  // User login validation
  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email')
      .isLength({ max: 255 })
      .withMessage('Email must be less than 255 characters'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ max: 128 })
      .withMessage('Password must be less than 128 characters'),
    
    body('deviceToken')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Device token must be less than 500 characters'),
  ],

  // Change password validation
  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required')
      .isLength({ max: 128 })
      .withMessage('Current password must be less than 128 characters'),
    
    body('newPassword')
      .isLength({ min: 8, max: 128 })
      .withMessage('New password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  ],

  // Reset password validation
  resetPassword: [
    body('token')
      .notEmpty()
      .withMessage('Reset token is required')
      .isLength({ min: 32, max: 128 })
      .withMessage('Invalid reset token format'),
    
    body('newPassword')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  ],

  // Forgot password validation
  forgotPassword: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email')
      .isLength({ max: 255 })
      .withMessage('Email must be less than 255 characters'),
  ],

  // Refresh token validation
  refreshToken: [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
      .isJWT()
      .withMessage('Invalid refresh token format'),
  ],

  // Device ID validation
  deviceId: [
    param('deviceId')
      .isLength({ min: 32, max: 32 })
      .withMessage('Invalid device ID format')
      .matches(/^[a-f0-9]{32}$/)
      .withMessage('Device ID must be a valid MD5 hash'),
  ],

  // Product validation
  product: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Product name is required and must be less than 200 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Description must be less than 2000 characters'),
    
    body('price')
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
    
    body('category')
      .isIn(['Electronics', 'Clothing', 'Books', 'Home', 'Sports', 'Other'])
      .withMessage('Invalid category'),
    
    body('sku')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('SKU is required and must be less than 50 characters')
      .matches(/^[A-Z0-9-]+$/)
      .withMessage('SKU can only contain uppercase letters, numbers, and hyphens'),
    
    body('stock')
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer'),
    
    body('images')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Images must be an array with maximum 10 items'),
    
    body('images.*')
      .optional()
      .isURL()
      .withMessage('Each image must be a valid URL'),
    
    body('specifications')
      .optional()
      .isObject()
      .withMessage('Specifications must be an object'),
  ],
};

module.exports = validators;