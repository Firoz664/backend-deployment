const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

// MongoDB injection prevention
const mongoSanitization = mongoSanitize({
  replaceWith: '_',
  allowDots: false,
  onSanitize: ({ req, key }) => {
    console.warn(`Potential NoSQL injection attempt: ${key}`);
  },
});

// XSS protection (cleaning user input from malicious HTML)
const xssProtection = xss();

// HTTP Parameter Pollution protection
const hppProtection = hpp({
  whitelist: [
    'sort',
    'category',
    'page',
    'limit',
    'fields',
    'price',
    'tags'
  ]
});

// Custom sanitization functions
const sanitizeInput = {
  // Remove null bytes and control characters
  removeNullBytes: (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/\0/g, '');
  },

  // Normalize unicode characters
  normalizeUnicode: (str) => {
    if (typeof str !== 'string') return str;
    return str.normalize('NFC');
  },

  // Remove invisible characters
  removeInvisibleChars: (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[\u200B-\u200D\uFEFF]/g, '');
  },

  // Limit string length
  limitLength: (str, maxLength = 1000) => {
    if (typeof str !== 'string') return str;
    return str.length > maxLength ? str.substring(0, maxLength) : str;
  },

  // Clean email input
  cleanEmail: (email) => {
    if (typeof email !== 'string') return email;
    return email.toLowerCase().trim().replace(/[^\w@.-]/g, '');
  },

  // Clean name input (allow only letters, spaces, hyphens, apostrophes)
  cleanName: (name) => {
    if (typeof name !== 'string') return name;
    return name.trim().replace(/[^a-zA-Z\s'-]/g, '');
  },

  // Clean alphanumeric input
  cleanAlphanumeric: (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[^a-zA-Z0-9]/g, '');
  },

  // Clean SKU (uppercase letters, numbers, hyphens)
  cleanSKU: (sku) => {
    if (typeof sku !== 'string') return sku;
    return sku.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  }
};

// Recursive sanitization for nested objects
const deepSanitize = (obj, sanitizer) => {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizer(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, sanitizer));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = deepSanitize(value, sanitizer);
  }
  return sanitized;
};

// Custom middleware for additional sanitization
const customSanitization = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    req.body = deepSanitize(req.body, (str) => {
      str = sanitizeInput.removeNullBytes(str);
      str = sanitizeInput.normalizeUnicode(str);
      str = sanitizeInput.removeInvisibleChars(str);
      str = sanitizeInput.limitLength(str);
      return str;
    });

    // Specific field sanitization
    if (req.body.email) {
      req.body.email = sanitizeInput.cleanEmail(req.body.email);
    }

    if (req.body.firstName) {
      req.body.firstName = sanitizeInput.cleanName(req.body.firstName);
    }

    if (req.body.lastName) {
      req.body.lastName = sanitizeInput.cleanName(req.body.lastName);
    }

    if (req.body.sku) {
      req.body.sku = sanitizeInput.cleanSKU(req.body.sku);
    }
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = deepSanitize(req.query, (str) => {
      str = sanitizeInput.removeNullBytes(str);
      str = sanitizeInput.normalizeUnicode(str);
      str = sanitizeInput.removeInvisibleChars(str);
      return str;
    });
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = deepSanitize(req.params, (str) => {
      str = sanitizeInput.removeNullBytes(str);
      str = sanitizeInput.normalizeUnicode(str);
      str = sanitizeInput.removeInvisibleChars(str);
      return str;
    });
  }

  next();
};

module.exports = {
  mongoSanitization,
  xssProtection,
  hppProtection,
  customSanitization,
  sanitizeInput
};