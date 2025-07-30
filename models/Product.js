const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Toys', 'Food', 'Beauty', 'Automotive', 'Other'],
    default: 'Other'
  },
  brand: {
    type: String,
    trim: true,
    maxlength: [50, 'Brand name cannot exceed 50 characters']
  },
  sku: {
    type: String,
  
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      default: ''
    }
  }],
  specifications: {
    type: Map,
    of: String,
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  },
  weight: {
    type: Number,
    min: [0, 'Weight cannot be negative']
  },
  dimensions: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
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

// Indexes for better query performance
productSchema.index({ name: 'text', description: 'text', brand: 'text' });
// REMOVED: productSchema.index({ sku: 1 }, { unique: true }); // This was duplicate
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ createdBy: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ tags: 1 });

// Compound indexes for common queries
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1, category: 1 });
productSchema.index({ isActive: 1, stock: 1 });
productSchema.index({ createdBy: 1, isActive: 1 });
productSchema.index({ category: 1, price: 1, isActive: 1 });

// Virtual for calculating total value (price * stock)
productSchema.virtual('totalValue').get(function() {
  return this.price * this.stock;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (this.stock === 0) return 'Out of Stock';
  if (this.stock <= 10) return 'Low Stock';
  return 'In Stock';
});

// Pre-save middleware to update timestamps
productSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Static method to find products by category
productSchema.statics.findByCategory = function(category) {
  return this.find({ category, isActive: true });
};

// Static method to search products
productSchema.statics.searchProducts = function(query, options = {}) {
  const {
    category,
    minPrice,
    maxPrice,
    inStock,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;

  let searchQuery = { isActive: true };

  // Text search
  if (query) {
    searchQuery.$text = { $search: query };
  }

  // Category filter
  if (category) {
    searchQuery.category = category;
  }

  // Price range filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    searchQuery.price = {};
    if (minPrice !== undefined) searchQuery.price.$gte = minPrice;
    if (maxPrice !== undefined) searchQuery.price.$lte = maxPrice;
  }

  // Stock filter
  if (inStock) {
    searchQuery.stock = { $gt: 0 };
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  return this.find(searchQuery)
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email')
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Instance method to check if product is low stock
productSchema.methods.isLowStock = function() {
  return this.stock <= 10 && this.stock > 0;
};

// Instance method to check if product is out of stock
productSchema.methods.isOutOfStock = function() {
  return this.stock === 0;
};

// Transform output
productSchema.methods.toJSON = function() {
  const productObject = this.toObject({ virtuals: true });
  delete productObject.__v;
  return productObject;
};

module.exports = mongoose.model('Product', productSchema);