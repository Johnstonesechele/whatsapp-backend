/**
 * Location Detection Service
 * Detects user location using multiple fallback APIs
 */

export interface LocationData {
  countryCode: string
  countryName: string
  city?: string
  region?: string
  latitude?: number
  longitude?: number
  timezone?: string
  currency?: string
}

/**
 * Detect user location with multiple fallback APIs
 */
export async function detectUserLocation(): Promise<LocationData> {
  const apis = [
    // Primary: ipapi.co (free, 1000 requests/day)
    async () => {
      const response = await fetch('https://ipapi.co/json/', {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('ipapi.co failed')
      const data = await response.json()
      return {
        countryCode: data.country_code,
        countryName: data.country_name,
        city: data.city,
        region: data.region,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        currency: data.currency
      }
    },

    // Fallback 1: ipgeolocation.io (free, 1000 requests/day)
    async () => {
      const response = await fetch('https://api.ipgeolocation.io/ipgeo?apiKey=free', {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('ipgeolocation.io failed')
      const data = await response.json()
      return {
        countryCode: data.country_code2,
        countryName: data.country_name,
        city: data.city,
        region: data.state_prov,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        timezone: data.time_zone?.name,
        currency: data.currency?.code
      }
    },

    // Fallback 2: ip-api.com (free, unlimited for non-commercial)
    async () => {
      const response = await fetch('http://ip-api.com/json/?fields=status,country,countryCode,region,city,lat,lon,timezone,currency', {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('ip-api.com failed')
      const data = await response.json()
      if (data.status !== 'success') throw new Error('ip-api.com failed')
      return {
        countryCode: data.countryCode,
        countryName: data.country,
        city: data.city,
        region: data.region,
        latitude: data.lat,
        longitude: data.lon,
        timezone: data.timezone,
        currency: data.currency
      }
    },

    // Fallback 3: Cloudflare trace (always available, basic info)
    async () => {
      const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('Cloudflare trace failed')
      const text = await response.text()
      const lines = text.split('\n')
      const data: Record<string, string> = {}
      lines.forEach(line => {
        const [key, value] = line.split('=')
        if (key && value) data[key] = value
      })
      return {
        countryCode: data.loc || 'US',
        countryName: data.loc || 'United States'
      }
    }
  ]

  // Try each API in sequence until one succeeds
  for (const api of apis) {
    try {
      console.log(' Attempting location detection...')
      const location = await api()
      console.log(' Location detected:', location)
      
      // Cache the result in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('user_location', JSON.stringify({
          ...location,
          timestamp: Date.now()
        }))
      }
      
      return location
    } catch (error) {
      console.warn('Location API failed, trying next...', error)
      continue
    }
  }

  // If all APIs fail, try to get from cache
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('user_location')
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        // Use cache if less than 24 hours old
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          console.log(' Using cached location:', parsed)
          return parsed
        }
      } catch (e) {
        // Invalid cache, ignore
      }
    }
  }

  // Ultimate fallback: US
  console.warn(' All location APIs failed, using default (US)')
  return {
    countryCode: 'US',
    countryName: 'United States'
  }
}

/**
 * Get cached location without making API calls
 */
export function getCachedLocation(): LocationData | null {
  if (typeof window === 'undefined') return null
  
  const cached = localStorage.getItem('user_location')
  if (!cached) return null
  
  try {
    const parsed = JSON.parse(cached)
    // Return cache if less than 24 hours old
    if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
      return parsed
    }
  } catch (e) {
    return null
  }
  
  return null
}
