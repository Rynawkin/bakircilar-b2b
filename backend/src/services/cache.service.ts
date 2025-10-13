import { getRedisClient } from '../lib/redis';

export class CacheService {
  private redis = getRedisClient();

  /**
   * Generic cache key builder
   */
  private buildKey(namespace: string, identifier: string): string {
    return `b2b:${namespace}:${identifier}`;
  }

  /**
   * Get cached value
   */
  async get<T>(namespace: string, identifier: string): Promise<T | null> {
    try {
      const key = this.buildKey(namespace, identifier);
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      console.error(`Cache get error for ${namespace}:${identifier}:`, error);
      return null;
    }
  }

  /**
   * Set cache value with TTL (in seconds)
   */
  async set(
    namespace: string,
    identifier: string,
    value: any,
    ttl: number = 3600
  ): Promise<void> {
    try {
      const key = this.buildKey(namespace, identifier);
      const serialized = JSON.stringify(value);

      await this.redis.setex(key, ttl, serialized);
    } catch (error) {
      console.error(`Cache set error for ${namespace}:${identifier}:`, error);
    }
  }

  /**
   * Delete cached value
   */
  async delete(namespace: string, identifier: string): Promise<void> {
    try {
      const key = this.buildKey(namespace, identifier);
      await this.redis.del(key);
    } catch (error) {
      console.error(`Cache delete error for ${namespace}:${identifier}:`, error);
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`b2b:${pattern}`);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Deleted ${keys.length} cache keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(namespace: string, identifier: string): Promise<boolean> {
    try {
      const key = this.buildKey(namespace, identifier);
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for ${namespace}:${identifier}:`, error);
      return false;
    }
  }

  /**
   * Increment a counter
   */
  async increment(namespace: string, identifier: string, amount: number = 1): Promise<number> {
    try {
      const key = this.buildKey(namespace, identifier);
      return await this.redis.incrby(key, amount);
    } catch (error) {
      console.error(`Cache increment error for ${namespace}:${identifier}:`, error);
      return 0;
    }
  }

  /**
   * Get multiple keys at once
   */
  async getMany<T>(namespace: string, identifiers: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    try {
      const keys = identifiers.map((id) => this.buildKey(namespace, id));
      const values = await this.redis.mget(...keys);

      identifiers.forEach((id, index) => {
        const value = values[index];
        if (value) {
          try {
            results.set(id, JSON.parse(value) as T);
          } catch (parseError) {
            console.error(`Error parsing cached value for ${id}:`, parseError);
          }
        }
      });
    } catch (error) {
      console.error(`Cache getMany error for ${namespace}:`, error);
    }

    return results;
  }

  /**
   * Set multiple key-value pairs at once
   */
  async setMany(
    namespace: string,
    entries: Map<string, any>,
    ttl: number = 3600
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      entries.forEach((value, identifier) => {
        const key = this.buildKey(namespace, identifier);
        const serialized = JSON.stringify(value);
        pipeline.setex(key, ttl, serialized);
      });

      await pipeline.exec();
    } catch (error) {
      console.error(`Cache setMany error for ${namespace}:`, error);
    }
  }

  // ==================== PRODUCT-SPECIFIC CACHE METHODS ====================

  /**
   * Cache all products (for listing page)
   */
  async cacheProducts(products: any[], ttl: number = 600): Promise<void> {
    await this.set('products', 'all', products, ttl);
  }

  /**
   * Get cached products
   */
  async getCachedProducts(): Promise<any[] | null> {
    return this.get('products', 'all');
  }

  /**
   * Cache single product
   */
  async cacheProduct(productId: string, product: any, ttl: number = 1800): Promise<void> {
    await this.set('product', productId, product, ttl);
  }

  /**
   * Get cached product
   */
  async getCachedProduct(productId: string): Promise<any | null> {
    return this.get('product', productId);
  }

  /**
   * Invalidate product cache
   */
  async invalidateProductCache(productId?: string): Promise<void> {
    if (productId) {
      await this.delete('product', productId);
    }
    // Always invalidate the products list
    await this.delete('products', 'all');
  }

  /**
   * Invalidate all product-related cache
   */
  async invalidateAllProductCache(): Promise<void> {
    await this.deletePattern('product:*');
    await this.deletePattern('products:*');
  }

  // ==================== CATEGORY CACHE ====================

  /**
   * Cache categories
   */
  async cacheCategories(categories: any[], ttl: number = 3600): Promise<void> {
    await this.set('categories', 'all', categories, ttl);
  }

  /**
   * Get cached categories
   */
  async getCachedCategories(): Promise<any[] | null> {
    return this.get('categories', 'all');
  }

  /**
   * Invalidate category cache
   */
  async invalidateCategoryCache(): Promise<void> {
    await this.deletePattern('categories:*');
  }

  // ==================== USER/CUSTOMER CACHE ====================

  /**
   * Cache user data
   */
  async cacheUser(userId: string, user: any, ttl: number = 1800): Promise<void> {
    await this.set('user', userId, user, ttl);
  }

  /**
   * Get cached user
   */
  async getCachedUser(userId: string): Promise<any | null> {
    return this.get('user', userId);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.delete('user', userId);
  }

  // ==================== CAMPAIGN CACHE ====================

  /**
   * Cache active campaigns
   */
  async cacheActiveCampaigns(campaigns: any[], ttl: number = 300): Promise<void> {
    await this.set('campaigns', 'active', campaigns, ttl);
  }

  /**
   * Get cached active campaigns
   */
  async getCachedActiveCampaigns(): Promise<any[] | null> {
    return this.get('campaigns', 'active');
  }

  /**
   * Invalidate campaign cache
   */
  async invalidateCampaignCache(): Promise<void> {
    await this.deletePattern('campaigns:*');
  }

  // ==================== STATS/METRICS CACHE ====================

  /**
   * Cache dashboard stats
   */
  async cacheDashboardStats(stats: any, ttl: number = 300): Promise<void> {
    await this.set('stats', 'dashboard', stats, ttl);
  }

  /**
   * Get cached dashboard stats
   */
  async getCachedDashboardStats(): Promise<any | null> {
    return this.get('stats', 'dashboard');
  }

  /**
   * Invalidate stats cache
   */
  async invalidateStatsCache(): Promise<void> {
    await this.deletePattern('stats:*');
  }
}

// Export singleton instance
export const cacheService = new CacheService();
