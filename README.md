# Robust and Secure Authentication System

A  authentication system with comprehensive security features including account lockout, session management, and single-device login enforcement.

## 🔐 Security Features

### ✅ Core Security Requirements

1. **Account Lock on Failed Attempts**
   - Automatic account lockout after 5 failed login attempts
   - 15-minute temporary block duration
   - Failed attempt tracking stored in Redis with automatic expiry

2. **Inactivity Timeout**
   - Automatic session expiry after 5 minutes of inactivity
   - Session TTL managed in Redis
   - Automatic token refresh on user activity

3. **Single-Device Login**
   - Only one active session per user allowed
   - Previous sessions automatically invalidated on new login
   - User ID to session ID mapping in Redis

### 🛡️ Additional Security Measures

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds for secure password storage
- **Rate Limiting**: API endpoint protection against brute force attacks
- **Input Validation**: Comprehensive server-side validation with express-validator
- **CORS Protection**: Configured for specific origins
- **Helmet Security**: HTTP security headers
- **Password Requirements**: Strong password policy enforcement

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│   React.js      │    │   Express.js    │    │   MongoDB       │
│   Frontend      │◄──►│   Backend       │◄──►│   Database      │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │                 │
                       │   Redis         │
                       │   Session Store │
                       │                 │
                       └─────────────────┘
```


```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB
- Redis
- npm or yarn

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Environment Variables:**
   ```env
   PORT=5000
   NODE_ENV=development
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRE=5m
   REDIS_URL=redis://localhost:6379
   MONGODB_URI=mongodb://localhost:27017/secure-auth
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   EMAIL_FROM=noreply@yourapp.com
   ```

5. **Start the backend server:**
   ```bash
   npm run dev
   ```
#
**Note**: This is a demonstration project. For production use, ensure all security best practices are followed and conduct thorough security testing.