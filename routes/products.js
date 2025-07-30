const express = require('express');
const { body, validationResult, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for product operations
const productLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  }
});

// Validation rules
const validationRules = {
  createProduct: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Product name is required and must be less than 100 characters'),
    body('description')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Description is required and must be less than 1000 characters'),
    body('price')
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
    body('category')
      .isIn(['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Toys', 'Food', 'Beauty', 'Automotive', 'Other'])
      .withMessage('Invalid category'),
    body('sku')
      .trim()
      .isLength({ min: 1, max: 20 })
      .withMessage('SKU is required and must be less than 20 characters'),
    body('stock')
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer'),
    body('brand')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Brand name must be less than 50 characters'),
    body('weight')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Weight must be a positive number'),
    body('images')
      .optional()
      .isArray()
      .withMessage('Images must be an array'),
    body('images.*.url')
      .optional()
      .isURL()
      .withMessage('Invalid image URL'),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array')
  ],
  updateProduct: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Product name must be less than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
    body('category')
      .optional()
      .isIn(['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Toys', 'Food', 'Beauty', 'Automotive', 'Other'])
      .withMessage('Invalid category'),
    body('sku')
      .optional()
      .trim()
      .isLength({ min: 1, max: 20 })
      .withMessage('SKU must be less than 20 characters'),
    body('stock')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer'),
    body('brand')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Brand name must be less than 50 characters'),
    body('weight')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Weight must be a positive number'),
    body('images')
      .optional()
      .isArray()
      .withMessage('Images must be an array'),
    body('images.*.url')
      .optional()
      .isURL()
      .withMessage('Invalid image URL'),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array')
  ]
};

// GET /api/products - Get all products with search, filter, and pagination
router.get('/', productLimiter, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Min price must be positive'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be positive'),
  query('category').optional().isIn(['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Toys', 'Food', 'Beauty', 'Automotive', 'Other']).withMessage('Invalid category')
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

    const {
      q: query = '',
      category,
      minPrice,
      maxPrice,
      inStock,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const options = {
      category,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      inStock: inStock === 'true',
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    };

    const products = await Product.searchProducts(query, options);
    
    // Get total count for pagination
    let countQuery = { isActive: true };
    if (query) countQuery.$text = { $search: query };
    if (category) countQuery.category = category;
    if (minPrice !== undefined || maxPrice !== undefined) {
      countQuery.price = {};
      if (minPrice !== undefined) countQuery.price.$gte = parseFloat(minPrice);
      if (maxPrice !== undefined) countQuery.price.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') countQuery.stock = { $gt: 0 };

    const totalProducts = await Product.countDocuments(countQuery);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalProducts,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
});

// GET /api/products/categories/list - Get all categories
router.get('/categories/list', productLimiter, async (req, res) => {
  try {
    const categories = ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Toys', 'Food', 'Beauty', 'Automotive', 'Other'];
    
    // Get product count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const count = await Product.countDocuments({ category, isActive: true });
        return { name: category, count };
      })
    );

    res.json({
      success: true,
      data: categoriesWithCount
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

// GET /api/products/stats/dashboard - Get dashboard statistics
router.get('/stats/dashboard', authenticateToken, productLimiter, async (req, res) => {
  try {
    const stats = await Promise.all([
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, stock: { $gt: 0 } }),
      Product.countDocuments({ isActive: true, stock: { $lte: 10, $gt: 0 } }),
      Product.countDocuments({ isActive: true, stock: 0 }),
      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, totalValue: { $sum: { $multiply: ['$price', '$stock'] } } } }
      ])
    ]);

    const [totalProducts, inStockProducts, lowStockProducts, outOfStockProducts, totalValueResult] = stats;

    res.json({
      success: true,
      data: {
        totalProducts,
        inStockProducts,
        lowStockProducts,
        outOfStockProducts,
        totalInventoryValue: totalValueResult[0]?.totalValue || 0
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// GET /api/products/:id - Get single product
router.get('/:id', productLimiter, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isActive: true })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
});

// POST /api/products - Create new product
router.post('/', authenticateToken, productLimiter, validationRules.createProduct, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if SKU already exists
    const existingProduct = await Product.findOne({ 
      sku: req.body.sku.toUpperCase(),
      isActive: true 
    });

    if (existingProduct) {
      return res.status(409).json({
        success: false,
        message: 'A product with this SKU already exists'
      });
    }

    const productData = {
      ...req.body,
      sku: req.body.sku.toUpperCase(),
      createdBy: req.user.userId,
      updatedBy: req.user.userId
    };

    const product = new Product(productData);
    await product.save();

    // Populate creator info
    await product.populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A product with this SKU already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', authenticateToken, productLimiter, validationRules.updateProduct, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if SKU already exists (if updating SKU)
    if (req.body.sku) {
      const existingProduct = await Product.findOne({ 
        sku: req.body.sku.toUpperCase(),
        _id: { $ne: req.params.id },
        isActive: true 
      });

      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: 'A product with this SKU already exists'
        });
      }
    }

    const updateData = {
      ...req.body,
      updatedBy: req.user.userId,
      updatedAt: new Date()
    };

    if (req.body.sku) {
      updateData.sku = req.body.sku.toUpperCase();
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isActive: true },
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName email')
     .populate('updatedBy', 'firstName lastName email');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });

  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A product with this SKU already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
});

// DELETE /api/products/:id - Soft delete product
router.delete('/:id', authenticateToken, productLimiter, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isActive: true },
      { 
        isActive: false,
        updatedBy: req.user.userId,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
});

module.exports = router;