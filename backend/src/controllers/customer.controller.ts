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
import { MikroCustomerSaleMovement, ProductPrices } from '../types';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { applyAgreementPrices, isAgreementActive, isAgreementApplicable, resolveAgreementPrice } from '../utils/agreements';
import { resolveLastPriceOverride } from '../utils/lastPrice';

const getLastPriceGuardPrices = (
  priceStats: any,
  guardInvoicedListNo?: number | null,
  guardWhiteListNo?: number | null
): { invoiced: number; white: number } | undefined => {
  if (!guardInvoicedListNo && !guardWhiteListNo) return undefined;
  return {
    invoiced: guardInvoicedListNo
      ? priceListService.getListPrice(priceStats, guardInvoicedListNo)
      : 0,
    white: guardWhiteListNo
      ? priceListService.getListPrice(priceStats, guardWhiteListNo)
      : 0,
  };
};


const sumStocks = (warehouseStocks: Record<string, number>, includedWarehouses: string[]): number => {
  if (!warehouseStocks) return 0;
  if (!includedWarehouses || includedWarehouses.length === 0) {
    return Object.values(warehouseStocks).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  return includedWarehouses.reduce((sum, warehouse) => sum + (Number(warehouseStocks[warehouse]) || 0), 0);
};

const applyPendingOrders = (
  warehouseStocks: Record<string, number>,
  pendingByWarehouse: Record<string, number>
): Record<string, number> => {
  const result: Record<string, number> = {};
  Object.entries(warehouseStocks || {}).forEach(([warehouse, qty]) => {
    const pending = Number(pendingByWarehouse?.[warehouse]) || 0;
    const available = Math.max(0, (Number(qty) || 0) - pending);
    result[warehouse] = available;
  });
  return result;
};

const isPriceTypeAllowed = (visibility: string | null | undefined, priceType: string): boolean => {
  if (visibility === 'WHITE_ONLY') return priceType === 'WHITE';
  if (visibility === 'BOTH') return true;
  return priceType === 'INVOICED';
};

const buildLastSalesMap = (sales: MikroCustomerSaleMovement[]) => {
  const map = new Map<string, number>();
  sales.forEach((sale) => {
    const code = String(sale.productCode || '').trim();
    if (!code || map.has(code)) return;
    const price = Number(sale.unitPrice);
    if (Number.isFinite(price) && price > 0) {
      map.set(code, price);
    }
  });
  return map;
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
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : undefined;
      const rawOffset = Number(req.query.offset);
      const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
      const modeLabel = typeof mode === 'string' ? mode : 'all';
      const shouldLogTiming = isAgreementMode || isPurchased;
      const debugTiming =
        (process.env.PRODUCTS_TIMING_LOG === '1' && shouldLogTiming) || req.query.debug === 'timing';
      const start = debugTiming ? process.hrtime.bigint() : 0n;
      let last = start;
      const timings: Record<string, number> = {};
      const lap = (label: string) => {
        if (!debugTiming) return;
        const now = process.hrtime.bigint();
        timings[label] = Number(now - last) / 1e6;
        last = now;
      };
      const logTiming = (extra: Record<string, unknown> = {}) => {
        if (!debugTiming) return;
        const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(
          '[products-timing]',
          JSON.stringify({
            mode: modeLabel,
            totalMs,
            steps: timings,
            params: {
              limit,
              offset,
              categoryId: Boolean(categoryId),
              warehouse: Boolean(warehouse),
              searchTokens: searchTokens.length,
            },
            ...extra,
          })
        );
      };

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
          useLastPrices: true,
          lastPriceGuardType: true,
          lastPriceGuardInvoicedListNo: true,
          lastPriceGuardWhiteListNo: true,
          lastPriceCostBasis: true,
          lastPriceMinCostPercent: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
              customerType: true,
              mikroCariCode: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceVisibility: true,
              useLastPrices: true,
              lastPriceGuardType: true,
              lastPriceGuardInvoicedListNo: true,
              lastPriceGuardWhiteListNo: true,
              lastPriceCostBasis: true,
              lastPriceMinCostPercent: true,
            },
          },
        },
      });
      lap('user');

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
        lap('purchasedCodes');
        if (purchasedCodes.length === 0) {
          logTiming({ counts: { purchasedCodes: 0 }, reason: 'no-purchases' });
          return res.json({ products: [] });
        }
      }

      const [settings, priceListRules] = await Promise.all([
        prisma.settings.findFirst({
          select: {
            includedWarehouses: true,
            customerPriceLists: true,
          },
        }),
        prisma.customerPriceListRule.findMany({
          where: { customerId: customer.id },
        }),
      ]);
      lap('settings');

      const basePriceListPair = resolveCustomerPriceLists(customer, settings);
      const includedWarehouses = settings?.includedWarehouses || [];
      const effectiveVisibility = user?.parentCustomerId
        ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
        : customer.priceVisibility;

      const now = new Date();
      let agreementRows: Array<{
        id: string;
        productId: string;
        priceInvoiced: number;
        priceWhite: number | null;
        customerProductCode?: string | null;
        minQuantity: number;
        validFrom: Date;
        validTo: Date | null;
      }> = [];

      if (isAgreementMode) {
        const agreementWhere: any = {
          customerId: customer.id,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
          product: {
            active: true,
            ...(categoryId ? { categoryId: categoryId as string } : {}),
          },
        };

        if (searchTokens.length > 0) {
          agreementWhere.AND = searchTokens.map((token) => ({
            OR: [
              { customerProductCode: { contains: token, mode: 'insensitive' } },
              { product: { name: { contains: token, mode: 'insensitive' } } },
              { product: { mikroCode: { contains: token, mode: 'insensitive' } } },
            ],
          }));
        }

        const agreementRows = await prisma.customerPriceAgreement.findMany({
          where: agreementWhere,
          select: {
            id: true,
            productId: true,
            priceInvoiced: true,
            priceWhite: true,
            customerProductCode: true,
            minQuantity: true,
            validFrom: true,
            validTo: true,
            product: {
              select: {
                id: true,
                name: true,
                mikroCode: true,
                brandCode: true,
                unit: true,
                unit2: true,
                unit2Factor: true,
                vatRate: true,
                currentCost: true,
                lastEntryPrice: true,
                excessStock: true,
                imageUrl: true,
                warehouseStocks: true,
                warehouseExcessStocks: true,
                pendingCustomerOrdersByWarehouse: true,
                prices: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            product: { name: 'asc' },
          },
          ...(limit ? { skip: offset, take: limit } : {}),
        });
        lap('agreementsQuery');

        if (agreementRows.length == 0) {
          logTiming({ counts: { agreementRows: 0 } });
          return res.json({ products: [] });
        }

        const agreementProducts = agreementRows.map((row) => row.product);
        const priceStatsMap = await priceListService.getPriceStatsMap(
          agreementProducts.map((product) => product.mikroCode)
        );
        lap('priceStats');

        const shouldUseLastPrices =
          Boolean(customer.useLastPrices && customer.mikroCariCode) && !isDiscounted;
        let lastSalesMap = new Map<string, number>();
        if (shouldUseLastPrices) {
          try {
            const sales = await mikroService.getCustomerSalesMovements(
              customer.mikroCariCode as string,
              agreementProducts.map((product) => product.mikroCode),
              1
            );
            lastSalesMap = buildLastSalesMap(sales);
          } catch (error) {
            console.error('Customer last prices failed', { customerId: customer.id, error });
          }
        }

        let productsWithPrices = agreementRows.map((row) => {
          const product = row.product;
          const prices = product.prices as unknown as ProductPrices;
          const customerPrices = pricingService.getPriceForCustomer(
            prices,
            customer.customerType as any
          );

          const priceStats = priceStatsMap.get(product.mikroCode) || null;
          const productPriceListPair = resolveCustomerPriceListsForProduct(
            basePriceListPair,
            priceListRules,
            {
              brandCode: product.brandCode,
              categoryId: product.category.id,
            }
          );
          const listInvoiced = priceListService.getListPriceWithFallback(
            priceStats,
            productPriceListPair.invoiced
          );
          const listWhite = priceListService.getListPriceWithFallback(
            priceStats,
            productPriceListPair.white
          );
          const listPricesRaw = {
            invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
            white: listWhite > 0 ? listWhite : customerPrices.white,
          };
          const guardPrices = getLastPriceGuardPrices(
            priceStats,
            customer.lastPriceGuardInvoicedListNo,
            customer.lastPriceGuardWhiteListNo
          );
          const lastSalePrice = lastSalesMap.get(product.mikroCode);
          const lastPriceResult = resolveLastPriceOverride({
            config: customer,
            lastSalePrice,
            listPrices: listPricesRaw,
              guardPrices,
            product: {
              currentCost: product.currentCost,
              lastEntryPrice: product.lastEntryPrice,
            },
            priceVisibility: effectiveVisibility,
          });
          const listPrices = lastPriceResult.prices;

          const agreementActive = isAgreementActive(row, now);
          const agreementPrices = agreementActive ? applyAgreementPrices(listPrices, row) : null;
          const agreementExcessPrices = agreementActive ? applyAgreementPrices(customerPrices, row) : null;

          const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
          const warehouseExcessStocks = product.warehouseExcessStocks as Record<string, number>;
          const pendingByWarehouse = product.pendingCustomerOrdersByWarehouse as Record<string, number> || {};
          const availableWarehouseStocks = applyPendingOrders(warehouseStocks, pendingByWarehouse);
          const availableStock = sumStocks(availableWarehouseStocks, includedWarehouses);

          return {
            id: product.id,
            name: product.name,
            mikroCode: product.mikroCode,
            unit: product.unit,
            unit2: product.unit2 || null,
            unit2Factor: product.unit2Factor ?? null,
            vatRate: product.vatRate ?? 0,
            excessStock: product.excessStock,
            availableStock,
            maxOrderQuantity: availableStock,
            imageUrl: product.imageUrl,
            warehouseStocks: availableWarehouseStocks,
            warehouseExcessStocks,
            category: {
              id: product.category.id,
              name: product.category.name,
            },
            prices: agreementPrices || listPrices,
            excessPrices: agreementExcessPrices || customerPrices,
            listPrices: agreementActive ? listPrices : undefined,
            pricingMode: 'LIST',
            agreement: agreementActive
              ? {
                  priceInvoiced: row.priceInvoiced,
                  priceWhite: row.priceWhite,
                  customerProductCode: row.customerProductCode || null,
                  minQuantity: row.minQuantity,
                  validFrom: row.validFrom,
                  validTo: row.validTo,
                }
              : undefined,
          };
        });

        if (warehouse) {
          productsWithPrices = productsWithPrices.filter((p) => p.maxOrderQuantity > 0);
        }

        lap('enrich');
        logTiming({ counts: { agreementRows: agreementRows.length, products: productsWithPrices.length } });
        return res.json({ products: productsWithPrices });
      }

      const products = isDiscounted
        ? await stockService.getExcessStockProducts({
            categoryId: categoryId as string,
            search: search as string,
            limit,
            offset,
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
              select: {

                id: true,

                name: true,

                mikroCode: true,

                brandCode: true,

                unit: true,

                unit2: true,

                unit2Factor: true,

                vatRate: true,

                currentCost: true,

                lastEntryPrice: true,

                excessStock: true,

                imageUrl: true,

                warehouseStocks: true,

                warehouseExcessStocks: true,

                pendingCustomerOrdersByWarehouse: true,

                prices: true,

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
              ...(limit ? { skip: offset, take: limit } : {}),
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
              select: {

                id: true,

                name: true,

                mikroCode: true,

                brandCode: true,

                unit: true,

                unit2: true,

                unit2Factor: true,

                vatRate: true,

                currentCost: true,

                lastEntryPrice: true,

                excessStock: true,

                imageUrl: true,

                warehouseStocks: true,

                warehouseExcessStocks: true,

                pendingCustomerOrdersByWarehouse: true,

                prices: true,

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
              ...(limit ? { skip: offset, take: limit } : {}),
            });

      lap('productsQuery');

      const priceStatsMap = await priceListService.getPriceStatsMap(
        products.map((product) => product.mikroCode)
      );
      lap('priceStats');

      const shouldUseLastPrices =
        Boolean(customer.useLastPrices && customer.mikroCariCode) && !isDiscounted;
      let lastSalesMap = new Map<string, number>();
      if (shouldUseLastPrices) {
        try {
          const sales = await mikroService.getCustomerSalesMovements(
            customer.mikroCariCode as string,
            products.map((product) => product.mikroCode),
            1
          );
          lastSalesMap = buildLastSalesMap(sales);
        } catch (error) {
          console.error('Customer last prices failed', { customerId: customer.id, error });
        }
      }

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
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      lap('agreementsQuery');
      const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));

      let productsWithPrices = products.map((product) => {
        const prices = product.prices as unknown as ProductPrices;
        const customerPrices = pricingService.getPriceForCustomer(
          prices,
          customer.customerType as any
        );

        const priceStats = priceStatsMap.get(product.mikroCode) || null;
        const productPriceListPair = resolveCustomerPriceListsForProduct(
          basePriceListPair,
          priceListRules,
          {
            brandCode: product.brandCode,
            categoryId: product.category.id,
          }
        );
        const listInvoiced = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.invoiced
        );
        const listWhite = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.white
        );
        const listPricesRaw =
          listInvoiced > 0 || listWhite > 0 ? { invoiced: listInvoiced, white: listWhite } : undefined;
        const listPricesBase = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };
        const guardPrices = getLastPriceGuardPrices(
          priceStats,
          customer.lastPriceGuardInvoicedListNo,
          customer.lastPriceGuardWhiteListNo
        );
        const lastSalePrice = lastSalesMap.get(product.mikroCode);
        const lastPriceResult = resolveLastPriceOverride({
          config: customer,
          lastSalePrice,
          listPrices: listPricesBase,
              guardPrices,
          product: {
            currentCost: product.currentCost,
            lastEntryPrice: product.lastEntryPrice,
          },
          priceVisibility: effectiveVisibility,
        });
        const listPrices = lastPriceResult.prices;

        const agreement = agreementMap.get(product.id);
        const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
        const agreementBasePrices = isDiscounted ? customerPrices : listPrices;
        const agreementPrices = agreementActive ? applyAgreementPrices(agreementBasePrices, agreement) : null;
        const agreementExcessPrices = agreementActive ? applyAgreementPrices(customerPrices, agreement) : null;

        const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
        const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
        const pendingByWarehouse = (product as any).pendingCustomerOrdersByWarehouse as Record<string, number> || {};
        const availableWarehouseStocks = applyPendingOrders(warehouseStocks, pendingByWarehouse);
        let availableStock = sumStocks(availableWarehouseStocks, includedWarehouses);
        let excessStock = product.excessStock;
        let maxOrderQuantity = isDiscounted ? excessStock : availableStock;

        if (warehouse) {
          const warehouseKey = warehouse as string;
          const warehouseQty = availableWarehouseStocks?.[warehouseKey] || 0;
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
          vatRate: product.vatRate ?? 0,
          excessStock,
          availableStock,
          maxOrderQuantity,
          imageUrl: product.imageUrl,
          warehouseStocks: availableWarehouseStocks,
          warehouseExcessStocks,
          category: {
            id: product.category.id,
            name: product.category.name,
          },
          prices: agreementPrices || (isDiscounted ? customerPrices : listPrices),
          excessPrices: agreementExcessPrices || customerPrices,
          listPrices: agreementActive ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
          pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
          agreement: agreementActive
            ? {
                priceInvoiced: agreement!.priceInvoiced,
                priceWhite: agreement!.priceWhite,
                customerProductCode: agreement!.customerProductCode || null,
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

      lap('enrich');
      logTiming({ counts: { products: products.length, agreements: agreementRows.length, purchasedCodes: purchasedCodes.length } });
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
          mikroCariCode: true,
          customerType: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          priceVisibility: true,
          useLastPrices: true,
          lastPriceGuardType: true,
          lastPriceGuardInvoicedListNo: true,
          lastPriceGuardWhiteListNo: true,
          lastPriceCostBasis: true,
          lastPriceMinCostPercent: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
              mikroCariCode: true,
              customerType: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceVisibility: true,
              useLastPrices: true,
              lastPriceGuardType: true,
              lastPriceGuardInvoicedListNo: true,
              lastPriceGuardWhiteListNo: true,
              lastPriceCostBasis: true,
              lastPriceMinCostPercent: true,
            },
          },
        },
      });

      const customer = user?.parentCustomer || user;

      if (!customer || !customer.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      const [settings, priceListRules] = await Promise.all([
        prisma.settings.findFirst({
          select: {
            includedWarehouses: true,
            customerPriceLists: true,
          },
        }),
        prisma.customerPriceListRule.findMany({
          where: { customerId: customer.id },
        }),
      ]);

      const basePriceListPair = resolveCustomerPriceLists(customer, settings);
      const includedWarehouses = settings?.includedWarehouses || [];
      const effectiveVisibility = user?.parentCustomerId
        ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
        : customer.priceVisibility;

      const product = await prisma.product.findUnique({
        where: { id },
        select: {

          id: true,

          name: true,

          mikroCode: true,

          brandCode: true,

          unit: true,

          unit2: true,

          unit2Factor: true,

          vatRate: true,

          currentCost: true,

          lastEntryPrice: true,

          excessStock: true,

          imageUrl: true,

          warehouseStocks: true,

          warehouseExcessStocks: true,

          pendingCustomerOrdersByWarehouse: true,

          prices: true,
          active: true,

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
      const productPriceListPair = resolveCustomerPriceListsForProduct(
        basePriceListPair,
        priceListRules,
        {
          brandCode: product.brandCode,
          categoryId: product.category.id,
        }
      );
      const listInvoiced = priceListService.getListPriceWithFallback(
        priceStats,
        productPriceListPair.invoiced
      );
      const listWhite = priceListService.getListPriceWithFallback(
        priceStats,
        productPriceListPair.white
      );
      const listPricesRaw =
        listInvoiced > 0 || listWhite > 0 ? { invoiced: listInvoiced, white: listWhite } : undefined;
      const listPricesBase = {
        invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
        white: listWhite > 0 ? listWhite : customerPrices.white,
      };
      const guardPrices = getLastPriceGuardPrices(
        priceStats,
        customer.lastPriceGuardInvoicedListNo,
        customer.lastPriceGuardWhiteListNo
      );
      let listPrices = listPricesBase;
      if (customer.useLastPrices && customer.mikroCariCode && !isDiscounted) {
        try {
          const sales = await mikroService.getCustomerSalesMovements(
            customer.mikroCariCode as string,
            [product.mikroCode],
            1
          );
          const lastSalesMap = buildLastSalesMap(sales);
          const lastSalePrice = lastSalesMap.get(product.mikroCode);
          const lastPriceResult = resolveLastPriceOverride({
            config: customer,
            lastSalePrice,
            listPrices: listPricesBase,
              guardPrices,
            product: {
              currentCost: product.currentCost,
              lastEntryPrice: product.lastEntryPrice,
            },
            priceVisibility: effectiveVisibility,
          });
          listPrices = lastPriceResult.prices;
        } catch (error) {
          console.error('Customer last price failed', { customerId: customer.id, error });
        }
      }

      const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
      const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
      const pendingByWarehouse = (product as any).pendingCustomerOrdersByWarehouse as Record<string, number> || {};
      const availableWarehouseStocks = applyPendingOrders(warehouseStocks, pendingByWarehouse);
      const availableStock = sumStocks(availableWarehouseStocks, includedWarehouses);

      const agreement = await prisma.customerPriceAgreement.findFirst({
        where: {
          customerId: customer.id,
          productId: product.id,
        },
        select: {
          priceInvoiced: true,
          priceWhite: true,
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      const now = new Date();
      const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
      const agreementBasePrices = isDiscounted ? customerPrices : listPrices;
      const agreementPrices = agreementActive ? applyAgreementPrices(agreementBasePrices, agreement) : null;
      const agreementExcessPrices = agreementActive ? applyAgreementPrices(customerPrices, agreement) : null;

      res.json({
        id: product.id,
        name: product.name,
        mikroCode: product.mikroCode,
        unit: product.unit,
        unit2: product.unit2 || null,
        unit2Factor: product.unit2Factor ?? null,
        vatRate: product.vatRate ?? 0,
        excessStock: product.excessStock,
        availableStock,
        maxOrderQuantity: isDiscounted ? product.excessStock : availableStock,
        warehouseStocks: availableWarehouseStocks,
        warehouseExcessStocks,
        imageUrl: product.imageUrl,
        category: product.category,
        prices: agreementPrices || (isDiscounted ? customerPrices : listPrices),
        excessPrices: agreementExcessPrices || customerPrices,
        listPrices: agreementActive ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
        pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
        agreement: agreementActive
          ? {
              priceInvoiced: agreement!.priceInvoiced,
              priceWhite: agreement!.priceWhite,
              customerProductCode: agreement!.customerProductCode || null,
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

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, parentCustomerId: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const targetId = user.parentCustomerId || user.id;
      const updates = [
        prisma.user.update({
          where: { id: targetId },
          data: { vatDisplayPreference },
        }),
      ];

      if (targetId !== user.id) {
        updates.push(
          prisma.user.update({
            where: { id: user.id },
            data: { vatDisplayPreference },
          })
        );
      }

      await prisma.$transaction(updates);

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
            lineNote: item.lineNote || null,
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
          mikroCariCode: true,
          customerType: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          priceVisibility: true,
          useLastPrices: true,
          lastPriceGuardType: true,
          lastPriceGuardInvoicedListNo: true,
          lastPriceGuardWhiteListNo: true,
          lastPriceCostBasis: true,
          lastPriceMinCostPercent: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
              mikroCariCode: true,
              customerType: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceVisibility: true,
              useLastPrices: true,
              lastPriceGuardType: true,
              lastPriceGuardInvoicedListNo: true,
              lastPriceGuardWhiteListNo: true,
              lastPriceCostBasis: true,
              lastPriceMinCostPercent: true,
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
        const [settings, priceListRules] = await Promise.all([
          prisma.settings.findFirst({
            select: {
              customerPriceLists: true,
            },
          }),
          prisma.customerPriceListRule.findMany({
            where: { customerId: customer.id },
          }),
        ]);
        const basePriceListPair = resolveCustomerPriceLists(customer, settings);
        const productPriceListPair = resolveCustomerPriceListsForProduct(
          basePriceListPair,
          priceListRules,
          {
            brandCode: product.brandCode,
            categoryId: product.categoryId,
          }
        );
        const priceStats = await priceListService.getPriceStats(product.mikroCode);
        const listInvoiced = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.invoiced
        );
        const listWhite = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.white
        );

        const listPricesBase = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };
        const guardPrices = getLastPriceGuardPrices(
          priceStats,
          customer.lastPriceGuardInvoicedListNo,
          customer.lastPriceGuardWhiteListNo
        );
        let listPrices = listPricesBase;
        if (customer.useLastPrices && customer.mikroCariCode) {
          try {
            const sales = await mikroService.getCustomerSalesMovements(
              customer.mikroCariCode as string,
              [product.mikroCode],
              1
            );
            const lastSalesMap = buildLastSalesMap(sales);
            const lastSalePrice = lastSalesMap.get(product.mikroCode);
            const lastPriceResult = resolveLastPriceOverride({
              config: customer,
              lastSalePrice,
              listPrices: listPricesBase,
              guardPrices,
              product: {
                currentCost: product.currentCost,
                lastEntryPrice: product.lastEntryPrice,
              },
              priceVisibility: effectiveVisibility,
            });
            listPrices = lastPriceResult.prices;
          } catch (error) {
            console.error('Customer last price failed', { customerId: customer.id, error });
          }
        }

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
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });

      if (agreement && isAgreementApplicable(agreement, new Date(), quantity)) {
        unitPrice = resolveAgreementPrice(agreement, priceType, unitPrice);
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
          unitPrice = resolveAgreementPrice(agreement, priceType, unitPrice);
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
      const { quantity, lineNote } = req.body || {};

      const hasQuantity = quantity !== undefined && quantity !== null;
      const parsedQuantity = Number(quantity);

      if (hasQuantity && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
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
                  mikroCariCode: true,
                  customerType: true,
                  invoicedPriceListNo: true,
                  whitePriceListNo: true,
                  priceVisibility: true,
                  useLastPrices: true,
                  lastPriceGuardType: true,
                  lastPriceGuardInvoicedListNo: true,
                  lastPriceGuardWhiteListNo: true,
                  lastPriceCostBasis: true,
                  lastPriceMinCostPercent: true,
                  parentCustomerId: true,
                  parentCustomer: {
                    select: {
                      id: true,
                      mikroCariCode: true,
                      customerType: true,
                      invoicedPriceListNo: true,
                      whitePriceListNo: true,
                      priceVisibility: true,
                      useLastPrices: true,
                      lastPriceGuardType: true,
                      lastPriceGuardInvoicedListNo: true,
                      lastPriceGuardWhiteListNo: true,
                      lastPriceCostBasis: true,
                      lastPriceMinCostPercent: true,
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

      const nextQuantity = hasQuantity ? parsedQuantity : cartItem.quantity;

      const user = cartItem.cart.user;
      const customer = user?.parentCustomer || user;

      if (!customer || !customer.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }
      const effectiveVisibility = user?.parentCustomerId
        ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
        : customer.priceVisibility;

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
        const [settings, priceListRules] = await Promise.all([
          prisma.settings.findFirst({
            select: {
              customerPriceLists: true,
            },
          }),
          prisma.customerPriceListRule.findMany({
            where: { customerId: customer.id },
          }),
        ]);
        const basePriceListPair = resolveCustomerPriceLists(customer, settings);
        const productPriceListPair = resolveCustomerPriceListsForProduct(
          basePriceListPair,
          priceListRules,
          {
            brandCode: cartItem.product.brandCode,
            categoryId: cartItem.product.categoryId,
          }
        );
        const priceStats = await priceListService.getPriceStats(cartItem.product.mikroCode);
        const listInvoiced = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.invoiced
        );
        const listWhite = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.white
        );

        const listPricesBase = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };
        const guardPrices = getLastPriceGuardPrices(
          priceStats,
          customer.lastPriceGuardInvoicedListNo,
          customer.lastPriceGuardWhiteListNo
        );
        let listPrices = listPricesBase;
        if (customer.useLastPrices && customer.mikroCariCode) {
          try {
            const sales = await mikroService.getCustomerSalesMovements(
              customer.mikroCariCode as string,
              [cartItem.product.mikroCode],
              1
            );
            const lastSalesMap = buildLastSalesMap(sales);
            const lastSalePrice = lastSalesMap.get(cartItem.product.mikroCode);
            const lastPriceResult = resolveLastPriceOverride({
              config: customer,
              lastSalePrice,
              listPrices: listPricesBase,
              guardPrices,
              product: {
                currentCost: cartItem.product.currentCost,
                lastEntryPrice: cartItem.product.lastEntryPrice,
              },
              priceVisibility: effectiveVisibility,
            });
            listPrices = lastPriceResult.prices;
          } catch (error) {
            console.error('Customer last price failed', { customerId: customer.id, error });
          }
        }

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
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });

      if (agreement && isAgreementApplicable(agreement, new Date(), nextQuantity)) {
        unitPrice = resolveAgreementPrice(agreement, priceType, unitPrice);
      }

      const updateData: { quantity?: number; unitPrice?: number; lineNote?: string | null } = {
        unitPrice,
      };

      if (hasQuantity) {
        updateData.quantity = nextQuantity;
      }

      if (lineNote !== undefined) {
        const normalizedNote = String(lineNote).trim();
        updateData.lineNote = normalizedNote ? normalizedNote : null;
      }

      await prisma.cartItem.update({
        where: { id: itemId },
        data: updateData,
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

      const { customerOrderNumber, deliveryLocation } = req.body || {};
      const result = await orderService.createOrderFromCart(req.user!.userId, {
        customerOrderNumber,
        deliveryLocation,
      });

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
