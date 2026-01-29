import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { cacheMiddleware, invalidateCacheMiddleware } from '../middleware/cache.middleware';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/campaigns
 * List all campaigns (with optional filters)
 */
router.get(
  '/',
  authenticate,
  cacheMiddleware({
    namespace: 'campaigns',
    ttl: 600, // 10 minutes
  }),
  async (req, res) => {
  try {
    const { active, customerType } = req.query;

    const where: any = {};

    if (active !== undefined) {
      where.active = active === 'true';
    }

    if (customerType) {
      where.customerTypes = {
        has: customerType as string,
      };
    }

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

/**
 * GET /api/campaigns/active
 * Get currently active campaigns for a customer
 */
router.get(
  '/active',
  authenticate,
  cacheMiddleware({
    namespace: 'campaigns-active',
    ttl: 300, // 5 minutes (more frequent updates for active campaigns)
  }),
  async (req, res) => {
  try {
    const { customerType, categoryId, productId } = req.query;
    const now = new Date();

    const where: any = {
      active: true,
      startDate: { lte: now },
      endDate: { gte: now },
    };

    // Filter by customer type
    if (customerType) {
      where.OR = [
        { customerTypes: { isEmpty: true } },
        { customerTypes: { has: customerType as string } },
      ];
    }

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { discountValue: 'desc' },
    });

    // Filter by category or product on application side
    let filteredCampaigns = campaigns;

    if (categoryId) {
      filteredCampaigns = campaigns.filter(
        c => c.categoryIds.length === 0 || c.categoryIds.includes(categoryId as string)
      );
    }

    if (productId) {
      filteredCampaigns = filteredCampaigns.filter(
        c => c.productIds.length === 0 || c.productIds.includes(productId as string)
      );
    }

    res.json(filteredCampaigns);
  } catch (error) {
    console.error('Error fetching active campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch active campaigns' });
  }
});

/**
 * GET /api/campaigns/:id
 * Get a single campaign by ID
 */
router.get('/:id', authenticate, requirePermission('admin:campaigns'), async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

/**
 * POST /api/campaigns
 * Create a new campaign (Admin only)
 */
router.post(
  '/',
  authenticate,
  requirePermission('admin:campaigns'),
  invalidateCacheMiddleware(['campaigns:*', 'campaigns-active:*']),
  async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      active,
      customerTypes,
      categoryIds,
      productIds,
    } = req.body;

    // Validation
    if (!name || !type || discountValue === undefined || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description,
        type,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        active: active ?? true,
        customerTypes: customerTypes || [],
        categoryIds: categoryIds || [],
        productIds: productIds || [],
      },
    });

    res.status(201).json(campaign);
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/**
 * PUT /api/campaigns/:id
 * Update a campaign (Admin only)
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('admin:campaigns'),
  invalidateCacheMiddleware(['campaigns:*', 'campaigns-active:*']),
  async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      type,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      active,
      customerTypes,
      categoryIds,
      productIds,
    } = req.body;

    // Check if campaign exists
    const existingCampaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!existingCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Validation
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(discountValue !== undefined && { discountValue }),
        ...(minOrderAmount !== undefined && { minOrderAmount }),
        ...(maxDiscountAmount !== undefined && { maxDiscountAmount }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(active !== undefined && { active }),
        ...(customerTypes !== undefined && { customerTypes }),
        ...(categoryIds !== undefined && { categoryIds }),
        ...(productIds !== undefined && { productIds }),
      },
    });

    res.json(campaign);
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

/**
 * DELETE /api/campaigns/:id
 * Delete a campaign (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('admin:campaigns'),
  invalidateCacheMiddleware(['campaigns:*', 'campaigns-active:*']),
  async (req, res) => {
  try {
    const { id } = req.params;

    const existingCampaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!existingCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await prisma.campaign.delete({
      where: { id },
    });

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

/**
 * POST /api/campaigns/calculate-discount
 * Calculate discount for a given order (used in checkout)
 */
router.post('/calculate-discount', authenticate, async (req, res) => {
  try {
    const { orderAmount, customerType, items } = req.body;

    if (!orderAmount || !customerType || !items) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const now = new Date();

    // Get active campaigns
    const campaigns = await prisma.campaign.findMany({
      where: {
        active: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { customerTypes: { isEmpty: true } },
          { customerTypes: { has: customerType } },
        ],
      },
      orderBy: { discountValue: 'desc' },
    });

    let bestDiscount = 0;
    let appliedCampaign = null;

    for (const campaign of campaigns) {
      // Check minimum order amount
      if (campaign.minOrderAmount && orderAmount < campaign.minOrderAmount) {
        continue;
      }

      // Check if campaign applies to any items
      const applies = items.some((item: any) => {
        // If no restrictions, applies to all
        if (campaign.categoryIds.length === 0 && campaign.productIds.length === 0) {
          return true;
        }
        // Check category
        if (campaign.categoryIds.length > 0 && campaign.categoryIds.includes(item.categoryId)) {
          return true;
        }
        // Check product
        if (campaign.productIds.length > 0 && campaign.productIds.includes(item.productId)) {
          return true;
        }
        return false;
      });

      if (!applies) {
        continue;
      }

      // Calculate discount
      let discount = 0;

      if (campaign.type === 'PERCENTAGE') {
        discount = orderAmount * campaign.discountValue;
      } else if (campaign.type === 'FIXED_AMOUNT') {
        discount = campaign.discountValue;
      }
      // BUY_X_GET_Y would need more complex logic with item analysis

      // Apply max discount cap
      if (campaign.maxDiscountAmount && discount > campaign.maxDiscountAmount) {
        discount = campaign.maxDiscountAmount;
      }

      // Keep best discount
      if (discount > bestDiscount) {
        bestDiscount = discount;
        appliedCampaign = campaign;
      }
    }

    res.json({
      discountAmount: bestDiscount,
      finalAmount: orderAmount - bestDiscount,
      appliedCampaign: appliedCampaign ? {
        id: appliedCampaign.id,
        name: appliedCampaign.name,
        type: appliedCampaign.type,
      } : null,
    });
  } catch (error) {
    console.error('Error calculating discount:', error);
    res.status(500).json({ error: 'Failed to calculate discount' });
  }
});

export default router;
