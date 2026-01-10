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
import { splitSearchTokens } from '../utils/search';
import { ProductPrices } from '../types';
import { resolveCustomerPriceLists } from '../utils/customerPricing';
import { isAgreementActive, isAgreementApplicable } from '../utils/agreements';

const sumStocks = (warehouseStocks: Record<string, number>, includedWarehouses: string[]): number => {
  if (!warehouseStocks) return 0;
  if (!includedWarehouses || includedWarehouses.length === 0) {
    return Object.values(warehouseStocks).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  return includedWarehouses.reduce((sum, warehouse) => sum + (Number(warehouseStocks[warehouse]) || 0), 0);
};

const isPriceTypeAllowed = (visibility: string | null | undefined, priceType: string): boolean => {
  if (visibility === 'WHITE_ONLY') return priceType === 'WHITE';
  if (visibility === 'BOTH') return true;
  return priceType === 'INVOICED';
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
      const isAgreementMode = mode === 'agreements';
      const searchTokens = splitSearchTokens(search as string | undefined);

      // Kullanıcı bilgisini al
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          customerType: true,
          mikroCariCode: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          priceVisibility: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
              customerType: true,
              mikroCariCode: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceVisibility: true,
            },
          },
        },
      });

      const customer = user?.parentCustomer || user;

      if (!customer || !customer.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      if (isPurchased && !customer.mikroCariCode) {
        return res.status(400).json({ error: 'User has no Mikro cari code' });
      }

      let purchasedCodes: string[] = [];
      if (isPurchased) {
        purchasedCodes = await mikroService.getPurchasedProductCodes(customer.mikroCariCode as string);
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

      const priceListPair = resolveCustomerPriceLists(customer, settings);
      const includedWarehouses = settings?.includedWarehouses || [];

      const now = new Date();
      let agreementRows: Array<{
        id: string;
        productId: string;
        priceInvoiced: number;
        priceWhite: number;
        minQuantity: number;
        validFrom: Date;
        validTo: Date | null;
      }> = [];

      if (isAgreementMode) {
        agreementRows = await prisma.customerPriceAgreement.findMany({
          where: {
            customerId: customer.id,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gte: now } }],
          },
          select: {
            id: true,
            productId: true,
            priceInvoiced: true,
            priceWhite: true,
            minQuantity: true,
            validFrom: true,
            validTo: true,
          },
        });

        const agreementProductIds = agreementRows.map((row) => row.productId);
        if (agreementProductIds.length === 0) {
          return res.json({ products: [] });
        }

        const agreementWhere: any = {
          active: true,
          id: { in: agreementProductIds },
          ...(categoryId ? { categoryId: categoryId as string } : {}),
        };

        if (searchTokens.length > 0) {
          agreementWhere.AND = searchTokens.map((token) => ({
            OR: [
              { name: { contains: token, mode: 'insensitive' } },
              { mikroCode: { contains: token, mode: 'insensitive' } },
            ],
          }));
        }

        const products = await prisma.product.findMany({
          where: agreementWhere,
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

        const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));

        let productsWithPrices = products.map((product) => {
          const prices = product.prices as unknown as ProductPrices;
          const customerPrices = pricingService.getPriceForCustomer(
            prices,
            customer.customerType as any
          );

          const priceStats = priceStatsMap.get(product.mikroCode) || null;
          const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
          const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);
          const listPrices = {
            invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
            white: listWhite > 0 ? listWhite : customerPrices.white,
          };

          const agreement = agreementMap.get(product.id);
          const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
          const agreementPrices = agreementActive
            ? { invoiced: agreement!.priceInvoiced, white: agreement!.priceWhite }
            : null;

          const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
          const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
          const availableStock = sumStocks(warehouseStocks, includedWarehouses);

          return {
            id: product.id,
            name: product.name,
            mikroCode: product.mikroCode,
            unit: product.unit,
            unit2: product.unit2 || null,
            unit2Factor: product.unit2Factor ?? null,
            excessStock: product.excessStock,
            availableStock,
            maxOrderQuantity: availableStock,
            imageUrl: product.imageUrl,
            warehouseStocks,
            warehouseExcessStocks,
            category: {
              id: product.category.id,
              name: product.category.name,
            },
            prices: agreementPrices || listPrices,
            excessPrices: agreementPrices || customerPrices,
            listPrices: agreementPrices ? listPrices : undefined,
            pricingMode: 'LIST',
            agreement: agreementActive
              ? {
                  priceInvoiced: agreement!.priceInvoiced,
                  priceWhite: agreement!.priceWhite,
                  minQuantity: agreement!.minQuantity,
                  validFrom: agreement!.validFrom,
                  validTo: agreement!.validTo,
                }
              : undefined,
          };
        });

        if (warehouse) {
          productsWithPrices = productsWithPrices.filter((p) => p.maxOrderQuantity > 0);
        }

        return res.json({ products: productsWithPrices });
      }

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
                ...(searchTokens.length > 0
                  ? {
                      AND: searchTokens.map((token) => ({
                        OR: [
                          { name: { contains: token, mode: 'insensitive' } },
                          { mikroCode: { contains: token, mode: 'insensitive' } },
                        ],
                      })),
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
                ...(searchTokens.length > 0
                  ? {
                      AND: searchTokens.map((token) => ({
                        OR: [
                          { name: { contains: token, mode: 'insensitive' } },
                          { mikroCode: { contains: token, mode: 'insensitive' } },
                        ],
                      })),
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

        agreementRows = await prisma.customerPriceAgreement.findMany({
        where: {
          customerId: customer.id,
          productId: { in: products.map((product) => product.id) },
        },
        select: {
          id: true,
          productId: true,
          priceInvoiced: true,
          priceWhite: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));

      let productsWithPrices = products.map((product) => {
        const prices = product.prices as unknown as ProductPrices;
        const customerPrices = pricingService.getPriceForCustomer(
          prices,
          customer.customerType as any
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

        const agreement = agreementMap.get(product.id);
        const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
        const agreementPrices = agreementActive
          ? { invoiced: agreement!.priceInvoiced, white: agreement!.priceWhite }
          : null;

        const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
        const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
        let availableStock = sumStocks(warehouseStocks, includedWarehouses);
        let excessStock = product.excessStock;
        let maxOrderQuantity = isDiscounted ? excessStock : availableStock;

        if (warehouse) {
          const warehouseKey = warehouse as string;
          const warehouseQty = warehouseStocks?.[warehouseKey] || 0;
          const warehouseExcessQty = warehouseExcessStocks?.[warehouseKey] || 0;
          if (isDiscounted) {
            excessStock = warehouseExcessQty;
          } else {
            availableStock = warehouseQty;
            excessStock = warehouseExcessQty;
          }
          maxOrderQuantity = isDiscounted ? warehouseExcessQty : warehouseQty;
        }

        return {
          id: product.id,
          name: product.name,
          mikroCode: product.mikroCode,
          unit: product.unit,
          unit2: product.unit2 || null,
          unit2Factor: product.unit2Factor ?? null,
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
          prices: agreementPrices || (isDiscounted ? customerPrices : listPrices),
          excessPrices: agreementPrices || customerPrices,
          listPrices: agreementPrices ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
          pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
          agreement: agreementActive
            ? {
                priceInvoiced: agreement!.priceInvoiced,
                priceWhite: agreement!.priceWhite,
                minQuantity: agreement!.minQuantity,
                validFrom: agreement!.validFrom,
                validTo: agreement!.validTo,
              }
            : undefined,
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
          priceVisibility: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
              customerType: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceVisibility: true,
            },
          },
        },
      });

      const customer = user?.parentCustomer || user;

      if (!customer || !customer.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      const settings = await prisma.settings.findFirst({
        select: {
          includedWarehouses: true,
          customerPriceLists: true,
        },
      });

      const priceListPair = resolveCustomerPriceLists(customer, settings);
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

      if (!product || !product.active) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (isDiscounted && product.excessStock <= 0) {
        return res.status(400).json({ error: 'Product is not available' });
      }

      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        customer.customerType as any
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

      const agreement = await prisma.customerPriceAgreement.findFirst({
        where: {
          customerId: customer.id,
          productId: product.id,
        },
        select: {
          priceInvoiced: true,
          priceWhite: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      const now = new Date();
      const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
      const agreementPrices = agreementActive
        ? { invoiced: agreement!.priceInvoiced, white: agreement!.priceWhite }
        : null;

      res.json({
        id: product.id,
        name: product.name,
        mikroCode: product.mikroCode,
        unit: product.unit,
        unit2: product.unit2 || null,
        unit2Factor: product.unit2Factor ?? null,
        excessStock: product.excessStock,
        availableStock,
        maxOrderQuantity: isDiscounted ? product.excessStock : availableStock,
        warehouseStocks,
        warehouseExcessStocks,
        imageUrl: product.imageUrl,
        category: product.category,
        prices: agreementPrices || (isDiscounted ? customerPrices : listPrices),
        excessPrices: agreementPrices || customerPrices,
        listPrices: agreementPrices ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
        pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
        agreement: agreementActive
          ? {
              priceInvoiced: agreement!.priceInvoiced,
              priceWhite: agreement!.priceWhite,
              minQuantity: agreement!.minQuantity,
              validFrom: agreement!.validFrom,
              validTo: agreement!.validTo,
            }
          : undefined,
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
          priceVisibility: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
              customerType: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceVisibility: true,
            },
          },
        },
      });

        const customer = user?.parentCustomer || user;

        if (!customer || !customer.customerType) {
          return res.status(400).json({ error: 'User has no customer type' });
        }
        const effectiveVisibility = user?.parentCustomerId
          ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
          : customer.priceVisibility;

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

      if (!isPriceTypeAllowed(effectiveVisibility, priceType)) {
        return res.status(400).json({ error: 'Price type not allowed for customer' });
      }

      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        customer.customerType as any
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
        const priceListPair = resolveCustomerPriceLists(customer, settings);
        const priceStats = await priceListService.getPriceStats(product.mikroCode);
        const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
        const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);

        const listPrices = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };

        unitPrice = priceType === 'INVOICED' ? listPrices.invoiced : listPrices.white;
      }

      const agreement = await prisma.customerPriceAgreement.findFirst({
        where: {
          customerId: customer.id,
          productId,
        },
        select: {
          priceInvoiced: true,
          priceWhite: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });

      if (agreement && isAgreementApplicable(agreement, new Date(), quantity)) {
        unitPrice = priceType === 'INVOICED' ? agreement.priceInvoiced : agreement.priceWhite;
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
          priceMode: effectivePriceMode,
        },
      });

      if (existingItem) {
        const combinedQuantity = existingItem.quantity + quantity;
        if (agreement && isAgreementApplicable(agreement, new Date(), combinedQuantity)) {
          unitPrice = priceType === 'INVOICED' ? agreement.priceInvoiced : agreement.priceWhite;
        }
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: combinedQuantity,
            unitPrice,
          },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            quantity,
            priceType,
            priceMode: effectivePriceMode,
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

      const cartItem = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: {
          product: true,
          cart: {
            include: {
              user: {
                select: {
                  id: true,
                  customerType: true,
                  invoicedPriceListNo: true,
                  whitePriceListNo: true,
                  priceVisibility: true,
                  parentCustomerId: true,
                  parentCustomer: {
                    select: {
                      id: true,
                      customerType: true,
                      invoicedPriceListNo: true,
                      whitePriceListNo: true,
                      priceVisibility: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!cartItem) {
        return res.status(404).json({ error: 'Cart item not found' });
      }

      const user = cartItem.cart.user;
      const customer = user?.parentCustomer || user;

      if (!customer || !customer.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      const priceType = cartItem.priceType;
      const prices = cartItem.product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        customer.customerType as any
      );

      let unitPrice = 0;
      const effectivePriceMode = cartItem.priceMode === 'EXCESS' ? 'EXCESS' : 'LIST';

      if (effectivePriceMode === 'EXCESS') {
        unitPrice = priceType === 'INVOICED' ? customerPrices.invoiced : customerPrices.white;
      } else {
        const settings = await prisma.settings.findFirst({
          select: {
            customerPriceLists: true,
          },
        });
        const priceListPair = resolveCustomerPriceLists(customer, settings);
        const priceStats = await priceListService.getPriceStats(cartItem.product.mikroCode);
        const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
        const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);

        const listPrices = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };

        unitPrice = priceType === 'INVOICED' ? listPrices.invoiced : listPrices.white;
      }

      const agreement = await prisma.customerPriceAgreement.findFirst({
        where: {
          customerId: customer.id,
          productId: cartItem.productId,
        },
        select: {
          priceInvoiced: true,
          priceWhite: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });

      if (agreement && isAgreementApplicable(agreement, new Date(), quantity)) {
        unitPrice = priceType === 'INVOICED' ? agreement.priceInvoiced : agreement.priceWhite;
      }

      await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity, unitPrice },
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
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { parentCustomerId: true },
      });

      if (user?.parentCustomerId) {
        return res.status(403).json({ error: 'Sub users cannot create orders' });
      }

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
