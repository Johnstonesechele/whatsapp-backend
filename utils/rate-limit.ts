
// Rate limiting utility to prevent abuse
import { NextRequest, NextResponse } from 'next/server';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs; // 15 minutes default
    this.maxRequests = maxRequests; // 100 requests default
    
    // Clean up old entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  isRateLimited(identifier: string): boolean {
    const now = Date.now();
    const entry = this.store[identifier];

    if (!entry || now > entry.resetTime) {
      // New window or first request
      this.store[identifier] = {
        count: 1,
        resetTime: now + this.windowMs
      };
      return false;
    }

    if (entry.count >= this.maxRequests) {
      return true; // Rate limited
    }

    entry.count++;
    return false;
  }

  getRemainingRequests(identifier: string): number {
    const entry = this.store[identifier];
    if (!entry) return this.maxRequests;
    return Math.max(0, this.maxRequests - entry.count);
  }

  getResetTime(identifier: string): number {
    const entry = this.store[identifier];
    return entry ? entry.resetTime : Date.now() + this.windowMs;
  }

  private cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    });
  }
}

// Create rate limiter instances
export const authRateLimiter = new RateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 min for auth
export const apiRateLimiter = new RateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 min for API
export const uploadRateLimiter = new RateLimiter(60 * 60 * 1000, 10); // 10 uploads per hour

// Rate limiting middleware function
export function withRateLimit(rateLimiter: RateLimiter) {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    return async (req: NextRequest): Promise<NextResponse> => {
      // Use IP address as identifier (in production, consider using user ID)
      const forwardedFor = req.headers.get('x-forwarded-for');
      const identifier = forwardedFor || req.headers.get('x-real-ip') || 'anonymous';
      
      if (rateLimiter.isRateLimited(identifier)) {
        return NextResponse.json(
          {
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil((rateLimiter.getResetTime(identifier) - Date.now()) / 1000)
          },
          { 
            status: 429,
            headers: {
              'Retry-After': Math.ceil((rateLimiter.getResetTime(identifier) - Date.now()) / 1000).toString()
            }
          }
        );
      }

      // Add rate limit headers
      const response = await handler(req);
      response.headers.set('X-RateLimit-Limit', '100');
      response.headers.set('X-RateLimit-Remaining', rateLimiter.getRemainingRequests(identifier).toString());
      response.headers.set('X-RateLimit-Reset', rateLimiter.getResetTime(identifier).toString());

      return response;
    };
  };
}
