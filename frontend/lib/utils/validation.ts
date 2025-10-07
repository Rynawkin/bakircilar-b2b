export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  custom?: (value: any) => boolean;
  message?: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateField(value: any, rules: ValidationRule): ValidationResult {
  // Required check
  if (rules.required && (!value || value.toString().trim() === '')) {
    return { isValid: false, error: rules.message || 'Bu alan zorunludur' };
  }

  // If not required and empty, skip other validations
  if (!value || value.toString().trim() === '') {
    return { isValid: true };
  }

  // Min length
  if (rules.minLength && value.toString().length < rules.minLength) {
    return {
      isValid: false,
      error: rules.message || `En az ${rules.minLength} karakter olmalıdır`,
    };
  }

  // Max length
  if (rules.maxLength && value.toString().length > rules.maxLength) {
    return {
      isValid: false,
      error: rules.message || `En fazla ${rules.maxLength} karakter olmalıdır`,
    };
  }

  // Pattern (regex)
  if (rules.pattern && !rules.pattern.test(value.toString())) {
    return {
      isValid: false,
      error: rules.message || 'Geçersiz format',
    };
  }

  // Min value (for numbers)
  if (rules.min !== undefined && Number(value) < rules.min) {
    return {
      isValid: false,
      error: rules.message || `En az ${rules.min} olmalıdır`,
    };
  }

  // Max value (for numbers)
  if (rules.max !== undefined && Number(value) > rules.max) {
    return {
      isValid: false,
      error: rules.message || `En fazla ${rules.max} olmalıdır`,
    };
  }

  // Custom validation
  if (rules.custom && !rules.custom(value)) {
    return {
      isValid: false,
      error: rules.message || 'Geçersiz değer',
    };
  }

  return { isValid: true };
}

// Predefined validators
export const validators = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Geçerli bir email adresi giriniz',
  },
  phone: {
    pattern: /^[0-9]{10,11}$/,
    message: 'Geçerli bir telefon numarası giriniz',
  },
  password: {
    minLength: 6,
    message: 'Şifre en az 6 karakter olmalıdır',
  },
  positiveNumber: {
    min: 0,
    message: 'Pozitif bir sayı giriniz',
  },
  percentage: {
    min: 0,
    max: 100,
    message: '0-100 arası bir değer giriniz',
  },
};
