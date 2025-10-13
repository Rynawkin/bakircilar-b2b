import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cache.service';

interface CacheOptions {
  namespace: string;
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

/**
 * Cache middleware factory
 * Creates a middleware that caches the response
 */
export function cacheMiddleware(options: CacheOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching if skip function returns true
    if (options.skip && options.skip(req)) {
      return next();
    }

    // Generate cache key
    const identifier = options.keyGenerator
      ? options.keyGenerator(req)
      : generateDefaultKey(req);

    try {
      // Try to get from cache
      const cached = await cacheService.get(options.namespace, identifier);

      if (cached) {
        console.log(`Cache HIT: ${options.namespace}:${identifier}`);
        return res.json(cached);
      }

      console.log(`Cache MISS: ${options.namespace}:${identifier}`);

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache the response
      res.json = function (data: any) {
        // Cache the response (don't await to avoid blocking)
        cacheService
          .set(options.namespace, identifier, data, options.ttl || 600)
          .catch((err) => {
            console.error('Error caching response:', err);
          });

        // Send the response
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      // Continue without cache on error
      next();
    }
  };
}

/**
 * Generate default cache key from request
 */
function generateDefaultKey(req: Request): string {
  const { method, path, query } = req;

  // Sort query parameters for consistent cache keys
  const sortedQuery = Object.keys(query)
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join('&');

  return `${method}:${path}${sortedQuery ? ':' + sortedQuery : ''}`;
}

/**
 * Invalidate cache middleware
 * Use this after mutations (POST, PUT, DELETE) to clear relevant cache
 */
export function invalidateCacheMiddleware(patterns: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json/send methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Override to invalidate cache after successful response
    const invalidateAndRespond = (data: any, originalMethod: Function) => {
      // Only invalidate on success (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        patterns.forEach(async (pattern) => {
          try {
            await cacheService.deletePattern(pattern);
            console.log(`Cache invalidated: ${pattern}`);
          } catch (error) {
            console.error(`Error invalidating cache ${pattern}:`, error);
          }
        });
      }

      return originalMethod(data);
    };

    res.json = function (data: any) {
      return invalidateAndRespond(data, originalJson);
    };

    res.send = function (data: any) {
      return invalidateAndRespond(data, originalSend);
    };

    next();
  };
}

/**
 * Helper to skip cache for authenticated admin requests
 */
export function skipCacheForAdmin(req: Request): boolean {
  return req.user?.role === 'ADMIN';
}

/**
 * Helper to skip cache for mutations
 */
export function skipCacheForMutations(req: Request): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
}
