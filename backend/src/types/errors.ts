/**
 * Centralized Error Codes and Types
 */

export enum ErrorCode {
  // Authentication & Authorization
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // User & Customer
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_INACTIVE = 'USER_INACTIVE',
  NO_CUSTOMER_TYPE = 'NO_CUSTOMER_TYPE',
  NO_MIKRO_CARI_CODE = 'NO_MIKRO_CARI_CODE',

  // Product & Stock
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  NO_EXCESS_STOCK = 'NO_EXCESS_STOCK',

  // Cart & Order
  CART_EMPTY = 'CART_EMPTY',
  CART_ITEM_NOT_FOUND = 'CART_ITEM_NOT_FOUND',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_NOT_PENDING = 'ORDER_NOT_PENDING',
  ORDER_ALREADY_PROCESSED = 'ORDER_ALREADY_PROCESSED',

  // Category & Pricing
  CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND',
  INVALID_PRICE = 'INVALID_PRICE',
  INVALID_PROFIT_MARGIN = 'INVALID_PROFIT_MARGIN',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // System & Sync
  SETTINGS_NOT_FOUND = 'SETTINGS_NOT_FOUND',
  SYNC_IN_PROGRESS = 'SYNC_IN_PROGRESS',
  MIKRO_CONNECTION_ERROR = 'MIKRO_CONNECTION_ERROR',

  // Generic
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
}

/**
 * Custom Application Error
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public errorCode: ErrorCode,
    public details?: any,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Factory - Quick error creation
 */
export class ErrorFactory {
  static unauthorized(message: string = 'Yetkisiz erişim'): AppError {
    return new AppError(message, 401, ErrorCode.UNAUTHORIZED);
  }

  static forbidden(message: string = 'Bu işlem için yetkiniz yok'): AppError {
    return new AppError(message, 403, ErrorCode.FORBIDDEN);
  }

  static notFound(resource: string = 'Kayıt'): AppError {
    return new AppError(`${resource} bulunamadı`, 404, ErrorCode.NOT_FOUND);
  }

  static badRequest(message: string, details?: any): AppError {
    return new AppError(message, 400, ErrorCode.BAD_REQUEST, details);
  }

  static validation(message: string, details?: any): AppError {
    return new AppError(message, 400, ErrorCode.VALIDATION_ERROR, details);
  }

  static insufficientStock(productName: string, available: number, requested: number): AppError {
    return new AppError(
      `Yetersiz stok: ${productName}`,
      400,
      ErrorCode.INSUFFICIENT_STOCK,
      {
        productName,
        available,
        requested,
        message: `Stok yetersiz. Mevcut: ${available}, İstenen: ${requested}`,
      }
    );
  }

  static invalidCredentials(): AppError {
    return new AppError(
      'Email veya şifre hatalı',
      401,
      ErrorCode.INVALID_CREDENTIALS
    );
  }

  static userNotFound(): AppError {
    return new AppError(
      'Kullanıcı bulunamadı',
      404,
      ErrorCode.USER_NOT_FOUND
    );
  }

  static productNotFound(productId?: string): AppError {
    return new AppError(
      'Ürün bulunamadı',
      404,
      ErrorCode.PRODUCT_NOT_FOUND,
      productId ? { productId } : undefined
    );
  }

  static orderNotFound(orderId?: string): AppError {
    return new AppError(
      'Sipariş bulunamadı',
      404,
      ErrorCode.ORDER_NOT_FOUND,
      orderId ? { orderId } : undefined
    );
  }

  static cartEmpty(): AppError {
    return new AppError(
      'Sepetiniz boş',
      400,
      ErrorCode.CART_EMPTY
    );
  }

  static noCustomerType(): AppError {
    return new AppError(
      'Kullanıcıya müşteri tipi atanmamış',
      400,
      ErrorCode.NO_CUSTOMER_TYPE
    );
  }

  static internalError(message: string = 'Sunucu hatası'): AppError {
    return new AppError(
      message,
      500,
      ErrorCode.INTERNAL_SERVER_ERROR,
      undefined,
      false // Non-operational error
    );
  }
}
