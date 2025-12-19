/**
 * Customer Controller
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import stockService from '../services/stock.service';
import pricingService from '../services/pricing.service';
import priceListService from '../services/price-list.service';
import mikroService from '../services/mikroFactory.service';
import orderService from '../services/order.service';
import { CustomerPriceListConfig, PriceListPair, ProductPrices } from '../types';

const DEFAULT_PRICE_LISTS: CustomerPriceListConfig = {
  BAYI: { invoiced: 6, white: 1 },
  PERAKENDE: { invoiced: 6, white: 1 },
  VIP: { invoiced: 6, white: 1 },
  OZEL: { invoiced: 6, white: 1 },
};

const resolvePair = (value: any, fallback: PriceListPair): PriceListPair => {
  const invoiced = Number(value?.invoiced);
  const white = Number(value?.white);
  return {
    invoiced: Number.isFinite(invoiced) ? invoiced : fallback.invoiced,
    white: Number.isFinite(white) ? white : fallback.white,
  };
};

const normalizePriceListConfig = (raw: any): CustomerPriceListConfig => {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_PRICE_LISTS;
  }

  return {
    BAYI: resolvePair(raw.BAYI, DEFAULT_PRICE_LISTS.BAYI),
    PERAKENDE: resolvePair(raw.PERAKENDE, DEFAULT_PRICE_LISTS.PERAKENDE),
    VIP: resolvePair(raw.VIP, DEFAULT_PRICE_LISTS.VIP),
    OZEL: resolvePair(raw.OZEL, DEFAULT_PRICE_LISTS.OZEL),
  };
};

const resolveListNo = (value: any, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
};

const resolveCustomerPriceLists = (
  user: {
    customerType?: string | null;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
  },
  settings: { customerPriceLists?: any } | null
): PriceListPair => {
  const config = normalizePriceListConfig(settings?.customerPriceLists);
  const customerType = (user.customerType || 'BAYI') as keyof CustomerPriceListConfig;
  const base = config[customerType] || DEFAULT_PRICE_LISTS.BAYI;

  return {
    invoiced: resolveListNo(user.invoicedPriceListNo, base.invoiced, 6, 10),
    white: resolveListNo(user.whitePriceListNo, base.white, 1, 5),
  };
};

const sumStocks = (warehouseStocks: Record<string, number>, includedWarehouses: string[]): number => {
  if (!warehouseStocks) return 0;
  if (!includedWarehouses || includedWarehouses.length === 0) {
    return Object.values(warehouseStocks).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  return includedWarehouses.reduce((sum, warehouse) => sum + (Number(warehouseStocks[warehouse]) || 0), 0);
};

export class CustomerController {
  /**
   * GET /api/products
   */
  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, search, warehouse, mode } = req.query;
      const isDiscounted = mode === 'discounted' || mode === 'excess';
      const isPurchased = mode === 'purchased';

      // Kullanıcı bilgisini al
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          customerType: true,
          mikroCariCode: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
        },
      });

      if (!user || !user.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      if (isPurchased && !user.mikroCariCode) {
        return res.status(400).json({ error: 'User has no Mikro cari code' });
      }

      let purchasedCodes: string[] = [];
      if (isPurchased) {
        purchasedCodes = await mikroService.getPurchasedProductCodes(user.mikroCariCode as string);
        if (purchasedCodes.length === 0) {
          return res.json({ products: [] });
        }
      }

      const settings = await prisma.settings.findFirst({
        select: {
          includedWarehouses: true,
          customerPriceLists: true,
        },
      });

      const priceListPair = resolveCustomerPriceLists(user, settings);
      const includedWarehouses = settings?.includedWarehouses || [];

      const products = isDiscounted
        ? await stockService.getExcessStockProducts({
            categoryId: categoryId as string,
            search: search as string,
          })
        : isPurchased
          ? await prisma.product.findMany({
              where: {
                active: true,
                mikroCode: { in: purchasedCodes },
                ...(categoryId ? { categoryId: categoryId as string } : {}),
                ...(search
                  ? {
                      OR: [
                        { name: { contains: search as string, mode: 'insensitive' } },
                        { mikroCode: { contains: search as string, mode: 'insensitive' } },
                      ],
                    }
                  : {}),
              },
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: {
                name: 'asc',
              },
            })
          : await prisma.product.findMany({
              where: {
                active: true,
                ...(categoryId ? { categoryId: categoryId as string } : {}),
                ...(search
                  ? {
                      OR: [
                        { name: { contains: search as string, mode: 'insensitive' } },
                        { mikroCode: { contains: search as string, mode: 'insensitive' } },
                      ],
                    }
                  : {}),
              },
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: {
                name: 'asc',
              },
            });

      const priceStatsMap = await priceListService.getPriceStatsMap(
        products.map((product) => product.mikroCode)
      );

      let productsWithPrices = products.map((product) => {
        const prices = product.prices as unknown as ProductPrices;
        const customerPrices = pricingService.getPriceForCustomer(
          prices,
          user.customerType as any
        );

        const priceStats = priceStatsMap.get(product.mikroCode) || null;
        const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
        const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);
        const listPrices = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };
        const listPricesRaw =
          listInvoiced > 0 || listWhite > 0 ? { invoiced: listInvoiced, white: listWhite } : undefined;

        const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
        const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
        let availableStock = sumStocks(warehouseStocks, includedWarehouses);
        let excessStock = product.excessStock;
        let maxOrderQuantity = isDiscounted ? excessStock : availableStock;

        if (warehouse) {
          const stockSource = isDiscounted ? warehouseExcessStocks : warehouseStocks;
          const warehouseQty = stockSource?.[warehouse as string] || 0;
          if (isDiscounted) {
            excessStock = warehouseQty;
          } else {
            availableStock = warehouseQty;
          }
          maxOrderQuantity = warehouseQty;
        }

        return {
          id: product.id,
          name: product.name,
          mikroCode: product.mikroCode,
          unit: product.unit,
          excessStock,
          availableStock,
          maxOrderQuantity,
          imageUrl: product.imageUrl,
          warehouseStocks,
          warehouseExcessStocks,
          category: {
            id: product.category.id,
            name: product.category.name,
          },
          prices: isDiscounted ? customerPrices : listPrices,
          listPrices: isDiscounted ? listPricesRaw : undefined,
          pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
        };
      });

      if (warehouse) {
        productsWithPrices = productsWithPrices.filter((p) => p.maxOrderQuantity > 0);
      }

      res.json({ products: productsWithPrices });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/:id
   */
  async getProductById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { mode } = req.query;
      const isDiscounted = mode === 'discounted' || mode === 'excess';

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          customerType: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
        },
      });

      if (!user || !user.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      const settings = await prisma.settings.findFirst({
        select: {
          includedWarehouses: true,
          customerPriceLists: true,
        },
      });

      const priceListPair = resolveCustomerPriceLists(user, settings);
      const includedWarehouses = settings?.includedWarehouses || [];

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (isDiscounted && product.excessStock <= 0) {
        return res.status(400).json({ error: 'Product is not available' });
      }

      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        user.customerType as any
      );

      const priceStats = await priceListService.getPriceStats(product.mikroCode);
      const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
      const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);
      const listPrices = {
        invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
        white: listWhite > 0 ? listWhite : customerPrices.white,
      };
      const listPricesRaw =
        listInvoiced > 0 || listWhite > 0 ? { invoiced: listInvoiced, white: listWhite } : undefined;

      const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
      const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
      const availableStock = sumStocks(warehouseStocks, includedWarehouses);

      res.json({
        id: product.id,
        name: product.name,
        mikroCode: product.mikroCode,
        unit: product.unit,
        excessStock: product.excessStock,
        availableStock,
        maxOrderQuantity: isDiscounted ? product.excessStock : availableStock,
        warehouseStocks,
        warehouseExcessStocks,
        imageUrl: product.imageUrl,
        category: product.category,
        prices: isDiscounted ? customerPrices : listPrices,
        listPrices: isDiscounted ? listPricesRaw : undefined,
        pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/categories
   */
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await prisma.category.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          mikroCode: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      res.json({ categories });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/warehouses
   */
  async getWarehouses(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await prisma.settings.findFirst();

      if (!settings) {
        return res.json({ warehouses: [] });
      }

      res.json({ warehouses: settings.includedWarehouses });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/customer/settings
   */
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const { vatDisplayPreference } = req.body;

      if (!['WITH_VAT', 'WITHOUT_VAT'].includes(vatDisplayPreference)) {
        return res.status(400).json({ error: 'Invalid VAT display preference' });
      }

      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { vatDisplayPreference },
      });

      res.json({ message: 'Settings updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/cart
   */
  async getCart(req: Request, res: Response, next: NextFunction) {
    try {
      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.userId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  mikroCode: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      });

      if (!cart) {
        return res.json({ items: [], total: 0 });
      }

      const total = cart.items.reduce((sum, item) => {
        return sum + item.quantity * item.unitPrice;
      }, 0);

      // Her item için KDV bilgisini al
      const itemsWithVat = await Promise.all(
        cart.items.map(async (item) => {
          const product = await prisma.product.findUnique({
            where: { id: item.product.id },
            select: { vatRate: true },
          });

          return {
            id: item.id,
            product: item.product,
            quantity: item.quantity,
            priceType: item.priceType,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            vatRate: product?.vatRate || 0,
          };
        })
      );

      // KDV hariç ve KDV dahil toplamları hesapla
      const subtotal = total; // KDV hariç
      const totalVat = itemsWithVat.reduce((sum, item) => {
        // Sadece faturalı ürünlerin KDV'sini hesapla (beyaz zaten KDV'nin yarısını içeriyor)
        if (item.priceType === 'INVOICED') {
          return sum + item.totalPrice * item.vatRate;
        }
        return sum;
      }, 0);
      const totalWithVat = subtotal + totalVat;

      res.json({
        id: cart.id,
        items: itemsWithVat,
        subtotal, // KDV hariç
        totalVat,
        total: totalWithVat, // KDV dahil
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/cart
   */
  async addToCart(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, quantity, priceType, priceMode } = req.body;
      const effectivePriceMode = priceMode === 'EXCESS' ? 'EXCESS' : 'LIST';

      // Kullanıcı bilgisi
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          customerType: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
        },
      });

      if (!user || !user.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      // Ürün kontrolü
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (effectivePriceMode === 'EXCESS' && product.excessStock <= 0) {
        return res.status(400).json({ error: 'Product is not discounted' });
      }

      // Real-time stock check from Mikro ERP
      const stockCheck = await stockService.checkRealtimeStock(productId, quantity);

      if (!stockCheck.available) {
        return res.status(400).json({
          error: 'Yetersiz stok',
          message: `Stok yetersiz. Mevcut: ${stockCheck.currentStock} ${product.unit}`,
          available: stockCheck.currentStock,
        });
      }

      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        user.customerType as any
      );

      let unitPrice = 0;

      if (effectivePriceMode === 'EXCESS') {
        unitPrice = priceType === 'INVOICED' ? customerPrices.invoiced : customerPrices.white;
      } else {
        const settings = await prisma.settings.findFirst({
          select: {
            customerPriceLists: true,
          },
        });
        const priceListPair = resolveCustomerPriceLists(user, settings);
        const priceStats = await priceListService.getPriceStats(product.mikroCode);
        const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
        const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);

        const listPrices = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };

        unitPrice = priceType === 'INVOICED' ? listPrices.invoiced : listPrices.white;
      }

      // Cart'ı bul veya oluştur
      let cart = await prisma.cart.findUnique({
        where: { userId: user.id },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId: user.id },
        });
      }

      // Aynı ürün ve fiyat tipi varsa güncelle, yoksa ekle
      const existingItem = await prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId,
          priceType,
        },
      });

      if (existingItem) {
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: existingItem.quantity + quantity,
          },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            quantity,
            priceType,
            unitPrice,
          },
        });
      }

      res.json({ message: 'Product added to cart' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/cart/:itemId
   */
  async updateCartItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;
      const { quantity } = req.body;

      if (quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be greater than 0' });
      }

      await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity },
      });

      res.json({ message: 'Cart item updated' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/cart/:itemId
   */
  async removeFromCart(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;

      await prisma.cartItem.delete({
        where: { id: itemId },
      });

      res.json({ message: 'Item removed from cart' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/orders
   */
  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await orderService.createOrderFromCart(req.user!.userId);

      res.status(201).json({
        message: 'Order created successfully',
        orderId: result.orderId,
        orderNumber: result.orderNumber,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders
   */
  async getOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await orderService.getUserOrders(req.user!.userId);

      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders/:id
   */
  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const order = await orderService.getOrderById(id);

      // Kullanıcının kendi siparişi olduğunu kontrol et
      if (order.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(order);
    } catch (error) {
      next(error);
    }
  }
}

export default new CustomerController();
