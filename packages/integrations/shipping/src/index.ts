// Shipping Integration for TillKit
// Supports: EasyPost (FedEx, UPS, USPS, DHL, etc.)

export interface ShippingAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface Package {
  weight: number; // in ounces
  length?: number; // in inches
  width?: number; // in inches
  height?: number; // in inches
  value?: number; // declared value in cents
}

export interface ShippingRate {
  id: string;
  carrier: string;
  service: string;
  serviceLevel: 'standard' | 'expedited' | 'overnight' | 'international';
  rate: number; // in cents
  currency: string;
  deliveryDays: number; // estimated
  deliveryDate?: Date;
  retailRate?: number; // if different from negotiated
}

export interface ShippingProvider {
  getRates(from: ShippingAddress, to: ShippingAddress, packages: Package[]): Promise<ShippingRate[]>;
  createShipment(rateId: string, from: ShippingAddress, to: ShippingAddress, packages: Package[]): Promise<ShipmentResult>;
  getTracking(trackingNumber: string, carrier?: string): Promise<TrackingInfo>;
}

export interface ShipmentResult {
  id: string;
  trackingNumber: string;
  trackingUrl: string;
  labelUrl?: string;
  rate: number;
  currency: string;
  estimatedDelivery?: Date;
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  status: 'pre_transit' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
  estimatedDelivery?: Date;
  events: TrackingEvent[];
}

export interface TrackingEvent {
  timestamp: Date;
  status: string;
  location?: string;
  description: string;
}

// EasyPost provider
export interface EasyPostConfig {
  provider: 'easypost';
  apiKey: string;
  testMode?: boolean;
  defaultCarrierAccounts?: string[]; // Filter to specific carriers
}

export function easypostProvider(config: EasyPostConfig): ShippingProvider {
  const baseUrl = config.testMode 
    ? 'https://api.easypost.com/v2' 
    : 'https://api.easypost.com/v2';
  
  async function fetchEasyPost(path: string, options: RequestInit = {}) {
    const auth = Buffer.from(`${config.apiKey}:`).toString('base64');
    
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error: any = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`EasyPost error: ${error.error?.message || error.message || response.statusText}`);
    }
    
    return response.json();
  }
  
  function formatAddress(address: ShippingAddress) {
    return {
      name: `${address.firstName || ''} ${address.lastName || ''}`.trim() || 'Ship To',
      company: address.company || '',
      street1: address.address1,
      street2: address.address2 || '',
      city: address.city,
      state: address.province || '',
      zip: address.postalCode,
      country: address.country,
      phone: address.phone || '555-555-5555',
      email: address.email || '',
    };
  }
  
  function mapServiceLevel(service: string): ShippingRate['serviceLevel'] {
    const serviceLower = service.toLowerCase();
    if (serviceLower.includes('overnight') || serviceLower.includes('next') || serviceLower.includes('express')) {
      return 'overnight';
    }
    if (serviceLower.includes('expedited') || serviceLower.includes('priority') || serviceLower.includes('2 day')) {
      return 'expedited';
    }
    if (serviceLower.includes('international') || serviceLower.includes('worldwide')) {
      return 'international';
    }
    return 'standard';
  }
  
  return {
    async getRates(from, to, packages) {
      // Create to_address
      const toAddress: any = await fetchEasyPost('/addresses', {
        method: 'POST',
        body: JSON.stringify({ address: formatAddress(to) }),
      });
      
      // Create from_address
      const fromAddress: any = await fetchEasyPost('/addresses', {
        method: 'POST',
        body: JSON.stringify({ address: formatAddress(from) }),
      });
      
      // Create parcel
      const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
      const maxLength = Math.max(...packages.map(p => p.length || 0));
      const maxWidth = Math.max(...packages.map(p => p.width || 0));
      const totalHeight = packages.reduce((sum, p) => sum + (p.height || 0), 0);
      
      const parcel: any = await fetchEasyPost('/parcels', {
        method: 'POST',
        body: JSON.stringify({
          parcel: {
            weight: totalWeight,
            ...(maxLength && { length: maxLength }),
            ...(maxWidth && { width: maxWidth }),
            ...(totalHeight > 0 && { height: totalHeight }),
          },
        }),
      });
      
      // Create shipment and get rates
      const shipment: any = await fetchEasyPost('/shipments', {
        method: 'POST',
        body: JSON.stringify({
          shipment: {
            to_address: { id: toAddress.id },
            from_address: { id: fromAddress.id },
            parcel: { id: parcel.id },
            ...(config.defaultCarrierAccounts?.length && {
              carrier_accounts: config.defaultCarrierAccounts,
            }),
          },
        }),
      });
      
      return shipment.rates.map((rate: any) => ({
        id: rate.id,
        carrier: rate.carrier,
        service: rate.service,
        serviceLevel: mapServiceLevel(rate.service),
        rate: Math.round(parseFloat(rate.rate) * 100), // dollars to cents
        currency: 'USD',
        deliveryDays: rate.delivery_days || undefined,
        deliveryDate: rate.delivery_date ? new Date(rate.delivery_date) : undefined,
        retailRate: rate.retail_rate ? Math.round(parseFloat(rate.retail_rate) * 100) : undefined,
      }));
    },
    
    async createShipment(rateId, from, to, packages) {
      // Create addresses
      const toAddress: any = await fetchEasyPost('/addresses', {
        method: 'POST',
        body: JSON.stringify({ address: formatAddress(to) }),
      });
      
      const fromAddress: any = await fetchEasyPost('/addresses', {
        method: 'POST',
        body: JSON.stringify({ address: formatAddress(from) }),
      });
      
      // Create parcel
      const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
      const parcel: any = await fetchEasyPost('/parcels', {
        method: 'POST',
        body: JSON.stringify({
          parcel: {
            weight: totalWeight,
          },
        }),
      });
      
      // Create and buy shipment
      const shipment: any = await fetchEasyPost('/shipments', {
        method: 'POST',
        body: JSON.stringify({
          shipment: {
            to_address: { id: toAddress.id },
            from_address: { id: fromAddress.id },
            parcel: { id: parcel.id },
            rates: [{ id: rateId }],
          },
        }),
      });
      
      // Purchase the shipment
      const purchased: any = await fetchEasyPost(`/shipments/${shipment.id}/buy`, {
        method: 'POST',
        body: JSON.stringify({ rate: { id: rateId } }),
      });
      
      return {
        id: purchased.id,
        trackingNumber: purchased.tracker?.tracking_code || '',
        trackingUrl: purchased.tracker?.public_url || `https://track.easypost.com/${purchased.tracker?.tracking_code || ''}`,
        labelUrl: purchased.postage_label?.label_url,
        rate: Math.round(parseFloat(purchased.selected_rate.rate) * 100),
        currency: 'USD',
        estimatedDelivery: purchased.selected_rate.delivery_date 
          ? new Date(purchased.selected_rate.delivery_date) 
          : undefined,
      };
    },
    
    async getTracking(trackingNumber, carrier) {
      // Create tracker or get existing
      const tracker: any = await fetchEasyPost('/trackers', {
        method: 'POST',
        body: JSON.stringify({
          tracker: {
            tracking_code: trackingNumber,
            carrier,
          },
        }),
      });
      
      return {
        trackingNumber: tracker.tracking_code,
        carrier: tracker.carrier,
        status: tracker.status || 'unknown',
        estimatedDelivery: tracker.est_delivery_date 
          ? new Date(tracker.est_delivery_date) 
          : undefined,
        events: (tracker.tracking_details || []).map((event: any) => ({
          timestamp: new Date(event.datetime),
          status: event.status,
          location: event.tracking_location?.city 
            ? `${event.tracking_location.city}, ${event.tracking_location.state}` 
            : undefined,
          description: event.message,
        })),
      };
    },
  };
}

// Flat rate provider (simple, no API calls)
export interface FlatRateConfig {
  provider: 'flat_rate';
  domesticRate: number; // cents
  internationalRate: number; // cents
  freeThreshold?: number; // cents - free shipping over this amount
}

export function flatRateProvider(config: FlatRateConfig): ShippingProvider {
  return {
    async getRates(from, to, packages) {
      const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
      const isDomestic = from.country === to.country;
      
      const baseRate = isDomestic ? config.domesticRate : config.internationalRate;
      
      // Simple weight tiers
      let weightMultiplier = 1;
      if (totalWeight > 16) weightMultiplier = 1.5; // over 1 lb
      if (totalWeight > 32) weightMultiplier = 2; // over 2 lbs
      if (totalWeight > 64) weightMultiplier = 2.5; // over 4 lbs
      
      const rate = Math.round(baseRate * weightMultiplier);
      
      const rates: ShippingRate[] = [
        {
          id: 'flat_standard',
          carrier: 'Flat Rate',
          service: 'Standard Shipping',
          serviceLevel: 'standard',
          rate,
          currency: 'USD',
          deliveryDays: isDomestic ? 5 : 14,
        },
      ];
      
      // Add expedited option
      rates.push({
        id: 'flat_expedited',
        carrier: 'Flat Rate',
        service: 'Expedited Shipping',
        serviceLevel: 'expedited',
        rate: Math.round(rate * 1.5),
        currency: 'USD',
        deliveryDays: isDomestic ? 2 : 7,
      });
      
      return rates;
    },
    
    async createShipment() {
      // No actual shipment created - just return mock
      return {
        id: `flat_${Date.now()}`,
        trackingNumber: '',
        trackingUrl: '',
        rate: 0,
        currency: 'USD',
      };
    },
    
    async getTracking() {
      return {
        trackingNumber: '',
        carrier: 'Flat Rate',
        status: 'unknown',
        events: [],
      };
    },
  };
}

// Shipping service helper
export interface ShippingService {
  provider: ShippingProvider;
  calculateShipping(from: ShippingAddress, to: ShippingAddress, items: Array<{ weight: number; quantity: number }>): Promise<ShippingRate[]>;
  selectRate(rates: ShippingRate[], preference: 'cheapest' | 'fastest' | { serviceLevel: ShippingRate['serviceLevel'] }): ShippingRate;
}

export function createShippingService(provider: ShippingProvider): ShippingService {
  return {
    provider,
    
    async calculateShipping(from, to, items) {
      const packages: Package[] = items.map(item => ({
        weight: Math.max(item.weight, 1), // minimum 1 oz
        value: 0, // will be set elsewhere
      }));
      
      return provider.getRates(from, to, packages);
    },
    
    selectRate(rates, preference) {
      if (rates.length === 0) {
        throw new Error('No shipping rates available');
      }
      
      if (preference === 'cheapest') {
        return rates.reduce((cheapest, rate) => 
          rate.rate < cheapest.rate ? rate : cheapest
        );
      }
      
      if (preference === 'fastest') {
        const validRates = rates.filter(r => r.deliveryDays !== undefined);
        if (validRates.length === 0) return rates[0];
        return validRates.reduce((fastest, rate) => 
          (rate.deliveryDays || 999) < (fastest.deliveryDays || 999) ? rate : fastest
        );
      }
      
      // Filter by service level
      const matching = rates.filter(r => r.serviceLevel === preference.serviceLevel);
      if (matching.length > 0) {
        return matching.reduce((cheapest, rate) => 
          rate.rate < cheapest.rate ? rate : cheapest
        );
      }
      
      // Fall back to cheapest if no match
      return rates.reduce((cheapest, rate) => 
        rate.rate < cheapest.rate ? rate : cheapest
      );
    },
  };
}

// Factory
export type ShippingConfig = EasyPostConfig | FlatRateConfig;

export function createShippingProvider(config: ShippingConfig): ShippingProvider {
  switch (config.provider) {
    case 'easypost':
      return easypostProvider(config);
    case 'flat_rate':
      return flatRateProvider(config);
    default:
      throw new Error(`Unknown shipping provider: ${(config as any).provider}`);
  }
}
