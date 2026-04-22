interface ShippingAddress {
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
interface Package {
    weight: number;
    length?: number;
    width?: number;
    height?: number;
    value?: number;
}
interface ShippingRate {
    id: string;
    carrier: string;
    service: string;
    serviceLevel: 'standard' | 'expedited' | 'overnight' | 'international';
    rate: number;
    currency: string;
    deliveryDays: number;
    deliveryDate?: Date;
    retailRate?: number;
}
interface ShippingProvider {
    getRates(from: ShippingAddress, to: ShippingAddress, packages: Package[]): Promise<ShippingRate[]>;
    createShipment(rateId: string, from: ShippingAddress, to: ShippingAddress, packages: Package[]): Promise<ShipmentResult>;
    getTracking(trackingNumber: string, carrier?: string): Promise<TrackingInfo>;
}
interface ShipmentResult {
    id: string;
    trackingNumber: string;
    trackingUrl: string;
    labelUrl?: string;
    rate: number;
    currency: string;
    estimatedDelivery?: Date;
}
interface TrackingInfo {
    trackingNumber: string;
    carrier: string;
    status: 'pre_transit' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
    estimatedDelivery?: Date;
    events: TrackingEvent[];
}
interface TrackingEvent {
    timestamp: Date;
    status: string;
    location?: string;
    description: string;
}
interface EasyPostConfig {
    provider: 'easypost';
    apiKey: string;
    testMode?: boolean;
    defaultCarrierAccounts?: string[];
}
declare function easypostProvider(config: EasyPostConfig): ShippingProvider;
interface FlatRateConfig {
    provider: 'flat_rate';
    domesticRate: number;
    internationalRate: number;
    freeThreshold?: number;
}
declare function flatRateProvider(config: FlatRateConfig): ShippingProvider;
interface ShippingService {
    provider: ShippingProvider;
    calculateShipping(from: ShippingAddress, to: ShippingAddress, items: Array<{
        weight: number;
        quantity: number;
    }>): Promise<ShippingRate[]>;
    selectRate(rates: ShippingRate[], preference: 'cheapest' | 'fastest' | {
        serviceLevel: ShippingRate['serviceLevel'];
    }): ShippingRate;
}
declare function createShippingService(provider: ShippingProvider): ShippingService;
type ShippingConfig = EasyPostConfig | FlatRateConfig;
declare function createShippingProvider(config: ShippingConfig): ShippingProvider;

export { type EasyPostConfig, type FlatRateConfig, type Package, type ShipmentResult, type ShippingAddress, type ShippingConfig, type ShippingProvider, type ShippingRate, type ShippingService, type TrackingEvent, type TrackingInfo, createShippingProvider, createShippingService, easypostProvider, flatRateProvider };
