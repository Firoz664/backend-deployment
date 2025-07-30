const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true, // This creates an index automatically
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long']
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  passwordChangedAt: {
    type: Date,
    default: Date.now
  },
  lastDeviceInfo: {
    browser: {
      name: { type: String, default: 'Unknown' },
      version: { type: String, default: 'Unknown' }
    },
    os: {
      name: { type: String, default: 'Unknown' },
      version: { type: String, default: 'Unknown' }
    },
    device: {
      model: { type: String, default: 'Unknown' },
      type: { type: String, default: 'desktop' },
      vendor: { type: String, default: 'Unknown' }
    },
    ip: { type: String },
    userAgent: { type: String },
    deviceToken: { type: String }, // For push notifications (FCM, APNs, etc.)
    lastUsed: { type: Date, default: Date.now }
  },
  devices: [{
    deviceId: { type: String, required: true }, // Unique identifier for the device
    browser: {
      name: { type: String, default: 'Unknown' },
      version: { type: String, default: 'Unknown' }
    },
    os: {
      name: { type: String, default: 'Unknown' },
      version: { type: String, default: 'Unknown' }
    },
    device: {
      model: { type: String, default: 'Unknown' },
      type: { type: String, default: 'desktop' },
      vendor: { type: String, default: 'Unknown' }
    },
    ip: { type: String },
    userAgent: { type: String },
    deviceToken: { type: String }, // For push notifications
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    loginCount: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for query optimization
// Note: Don't duplicate the email index since unique: true already creates one
userSchema.index({ createdAt: 1 });
userSchema.index({ lastLogin: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ 'devices.deviceId': 1 });
userSchema.index({ 'devices.lastSeen': 1 });
userSchema.index({ 'devices.isActive': 1 });

// Compound indexes for common queries
userSchema.index({ email: 1, isActive: 1 });
userSchema.index({ isActive: 1, createdAt: 1 });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    isVerified: this.isVerified,
    lastLogin: this.lastLogin,
    lastDeviceInfo: this.lastDeviceInfo,
    createdAt: this.createdAt
  };
};

userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Generate a unique device ID based on device characteristics
userSchema.methods.generateDeviceId = function(deviceInfo) {
  const crypto = require('crypto');
  const deviceString = `${deviceInfo.browser.name}-${deviceInfo.os.name}-${deviceInfo.device.type}-${deviceInfo.device.vendor}`;
  return crypto.createHash('md5').update(deviceString).digest('hex');
};

// Add or update device information
userSchema.methods.updateDeviceInfo = function(deviceInfo) {
  const deviceId = this.generateDeviceId(deviceInfo);
  const now = new Date();
  
  // Find existing device
  const existingDeviceIndex = this.devices.findIndex(d => d.deviceId === deviceId);
  
  if (existingDeviceIndex !== -1) {
    // Update existing device
    const existingDevice = this.devices[existingDeviceIndex];
    existingDevice.lastSeen = now;
    existingDevice.loginCount += 1;
    existingDevice.ip = deviceInfo.ip; // Update IP (might change)
    existingDevice.deviceToken = deviceInfo.deviceToken || existingDevice.deviceToken;
    existingDevice.isActive = true;
  } else {
    // Add new device
    const newDevice = {
      deviceId,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      device: deviceInfo.device,
      ip: deviceInfo.ip,
      userAgent: deviceInfo.userAgent,
      deviceToken: deviceInfo.deviceToken,
      firstSeen: now,
      lastSeen: now,
      loginCount: 1,
      isActive: true
    };
    
    this.devices.push(newDevice);
    
    // Keep only last 10 devices to prevent unlimited growth
    if (this.devices.length > 10) {
      // Sort by lastSeen and keep the 10 most recent
      this.devices.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
      this.devices = this.devices.slice(0, 10);
    }
  }
  
  // Update lastDeviceInfo
  this.lastDeviceInfo = {
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    device: deviceInfo.device,
    ip: deviceInfo.ip,
    userAgent: deviceInfo.userAgent,
    deviceToken: deviceInfo.deviceToken,
    lastUsed: now
  };
  
  return deviceId;
};

// Get device history
userSchema.methods.getDeviceHistory = function() {
  return this.devices.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
};

// Deactivate a device
userSchema.methods.deactivateDevice = function(deviceId) {
  const device = this.devices.find(d => d.deviceId === deviceId);
  if (device) {
    device.isActive = false;
    return true;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);