// Input validation and sanitization utilities

export class InputValidator {
  // Email validation
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  // Password validation
  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Phone number validation
  static validatePhone(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/; // E.164 format
    return phoneRegex.test(phone);
  }

  // Sanitize HTML content to prevent XSS
  static sanitizeHtml(html: string): string {
    // Basic HTML sanitization
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
      .replace(/javascript:/gi, ''); // Remove javascript: URLs
  }

  // Validate and sanitize file paths
  static validateFilePath(filePath: string): string {
    // Remove any path traversal attempts
    const sanitized = filePath.replace(/\.\./g, '').replace(/\/\.\//g, '');
    
    // Only allow alphanumeric characters, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(sanitized)) {
      throw new Error('Invalid file path characters');
    }
    
    return sanitized;
  }

  // Validate numeric input
  static validateNumber(value: any, min?: number, max?: number): number {
    const num = Number(value);
    
    if (isNaN(num)) {
      throw new Error('Value must be a number');
    }
    
    if (min !== undefined && num < min) {
      throw new Error(`Value must be at least ${min}`);
    }
    
    if (max !== undefined && num > max) {
      throw new Error(`Value must be at most ${max}`);
    }
    
    return num;
  }

  // Validate and sanitize text input
  static sanitizeText(text: string, maxLength: number = 1000): string {
    if (typeof text !== 'string') {
      throw new Error('Input must be a string');
    }
    
    // Remove dangerous characters
    const sanitized = text
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/['"]/g, '') // Remove quotes
      .trim();
    
    if (sanitized.length > maxLength) {
      throw new Error(`Text must be at most ${maxLength} characters`);
    }
    
    return sanitized;
  }

  // SQL injection prevention - validate table/column names
  static validateIdentifier(identifier: string): boolean {
    // Only allow alphanumeric characters and underscores
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
  }
}

// Comprehensive input validation function
export function validateInput(data: any, schema: Record<string, any>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    
    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }
    
    // Skip validation if field is not provided and not required
    if (value === undefined || value === null) {
      continue;
    }
    
    // Type validation
    if (rules.type) {
      switch (rules.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${field} must be a string`);
            continue;
          }
          break;
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${field} must be a number`);
            continue;
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${field} must be a boolean`);
            continue;
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`${field} must be an array`);
            continue;
          }
          break;
        case 'object':
          if (typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`${field} must be an object`);
            continue;
          }
          break;
      }
    }
    
    // String length validation
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters long`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters long`);
      }
    }
    
    // Number range validation
    if (typeof value === 'number') {
      if (rules.min && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }
    }
    
    // Email validation
    if (rules.email && !InputValidator.validateEmail(value)) {
      errors.push(`${field} must be a valid email address`);
    }
    
    // Custom validation patterns
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(`${field} format is invalid`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Request validation middleware helper
export class ValidationMiddleware {
  static validate(schema: Record<string, any>) {
    return async (request: Request, handler: Function) => {
      try {
        const body = await request.json();
        const validation = validateInput(body, schema);
        
        if (!validation.isValid) {
          return Response.json({ 
            error: 'Validation failed', 
            details: validation.errors 
          }, { status: 400 });
        }
        
        return handler(request, body);
      } catch (error) {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
      }
    };
  }
}
