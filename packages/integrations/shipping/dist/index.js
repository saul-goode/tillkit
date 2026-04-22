// src/index.ts
function easypostProvider(config) {
  const baseUrl = config.testMode ? "https://api.easypost.com/v2" : "https://api.easypost.com/v2";
  async function fetchEasyPost(path, options = {}) {
    const auth = Buffer.from(`${config.apiKey}:`).toString("base64");
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        ...options.headers
      }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`EasyPost error: ${error.error?.message || error.message || response.statusText}`);
    }
    return response.json();
  }
  function formatAddress(address) {
    return {
      name: `${address.firstName || ""} ${address.lastName || ""}`.trim() || "Ship To",
      company: address.company || "",
      street1: address.address1,
      street2: address.address2 || "",
      city: address.city,
      state: address.province || "",
      zip: address.postalCode,
      country: address.country,
      phone: address.phone || "555-555-5555",
      email: address.email || ""
    };
  }
  function formatPackage(pkg) {
    return {
      weight: pkg.weight,
      ...pkg.length && { length: pkg.length },
      ...pkg.width && { width: pkg.width },
      ...pkg.height && { height: pkg.height },
      ...pkg.value && { value: pkg.value / 100 }
      // cents to dollars
    };
  }
  function mapServiceLevel(service) {
    const serviceLower = service.toLowerCase();
    if (serviceLower.includes("overnight") || serviceLower.includes("next") || serviceLower.includes("express")) {
      return "overnight";
    }
    if (serviceLower.includes("expedited") || serviceLower.includes("priority") || serviceLower.includes("2 day")) {
      return "expedited";
    }
    if (serviceLower.includes("international") || serviceLower.includes("worldwide")) {
      return "international";
    }
    return "standard";
  }
  return {
    async getRates(from, to, packages) {
      const toAddress = await fetchEasyPost("/addresses", {
        method: "POST",
        body: JSON.stringify({ address: formatAddress(to) })
      });
      const fromAddress = await fetchEasyPost("/addresses", {
        method: "POST",
        body: JSON.stringify({ address: formatAddress(from) })
      });
      const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
      const maxLength = Math.max(...packages.map((p) => p.length || 0));
      const maxWidth = Math.max(...packages.map((p) => p.width || 0));
      const totalHeight = packages.reduce((sum, p) => sum + (p.height || 0), 0);
      const parcel = await fetchEasyPost("/parcels", {
        method: "POST",
        body: JSON.stringify({
          parcel: {
            weight: totalWeight,
            ...maxLength && { length: maxLength },
            ...maxWidth && { width: maxWidth },
            ...totalHeight > 0 && { height: totalHeight }
          }
        })
      });
      const shipment = await fetchEasyPost("/shipments", {
        method: "POST",
        body: JSON.stringify({
          shipment: {
            to_address: { id: toAddress.id },
            from_address: { id: fromAddress.id },
            parcel: { id: parcel.id },
            ...config.defaultCarrierAccounts?.length && {
              carrier_accounts: config.defaultCarrierAccounts
            }
          }
        })
      });
      return shipment.rates.map((rate) => ({
        id: rate.id,
        carrier: rate.carrier,
        service: rate.service,
        serviceLevel: mapServiceLevel(rate.service),
        rate: Math.round(parseFloat(rate.rate) * 100),
        // dollars to cents
        currency: "USD",
        deliveryDays: rate.delivery_days || void 0,
        deliveryDate: rate.delivery_date ? new Date(rate.delivery_date) : void 0,
        retailRate: rate.retail_rate ? Math.round(parseFloat(rate.retail_rate) * 100) : void 0
      }));
    },
    async createShipment(rateId, from, to, packages) {
      const toAddress = await fetchEasyPost("/addresses", {
        method: "POST",
        body: JSON.stringify({ address: formatAddress(to) })
      });
      const fromAddress = await fetchEasyPost("/addresses", {
        method: "POST",
        body: JSON.stringify({ address: formatAddress(from) })
      });
      const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
      const parcel = await fetchEasyPost("/parcels", {
        method: "POST",
        body: JSON.stringify({
          parcel: {
            weight: totalWeight
          }
        })
      });
      const shipment = await fetchEasyPost("/shipments", {
        method: "POST",
        body: JSON.stringify({
          shipment: {
            to_address: { id: toAddress.id },
            from_address: { id: fromAddress.id },
            parcel: { id: parcel.id },
            rates: [{ id: rateId }]
          }
        })
      });
      const purchased = await fetchEasyPost(`/shipments/${shipment.id}/buy`, {
        method: "POST",
        body: JSON.stringify({ rate: { id: rateId } })
      });
      return {
        id: purchased.id,
        trackingNumber: purchased.tracker?.tracking_code || "",
        trackingUrl: purchased.tracker?.public_url || `https://track.easypost.com/${purchased.tracker?.tracking_code || ""}`,
        labelUrl: purchased.postage_label?.label_url,
        rate: Math.round(parseFloat(purchased.selected_rate.rate) * 100),
        currency: "USD",
        estimatedDelivery: purchased.selected_rate.delivery_date ? new Date(purchased.selected_rate.delivery_date) : void 0
      };
    },
    async getTracking(trackingNumber, carrier) {
      const tracker = await fetchEasyPost("/trackers", {
        method: "POST",
        body: JSON.stringify({
          tracker: {
            tracking_code: trackingNumber,
            carrier
          }
        })
      });
      return {
        trackingNumber: tracker.tracking_code,
        carrier: tracker.carrier,
        status: tracker.status || "unknown",
        estimatedDelivery: tracker.est_delivery_date ? new Date(tracker.est_delivery_date) : void 0,
        events: (tracker.tracking_details || []).map((event) => ({
          timestamp: new Date(event.datetime),
          status: event.status,
          location: event.tracking_location?.city ? `${event.tracking_location.city}, ${event.tracking_location.state}` : void 0,
          description: event.message
        }))
      };
    }
  };
}
function flatRateProvider(config) {
  return {
    async getRates(from, to, packages) {
      const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
      const isDomestic = from.country === to.country;
      const baseRate = isDomestic ? config.domesticRate : config.internationalRate;
      let weightMultiplier = 1;
      if (totalWeight > 16) weightMultiplier = 1.5;
      if (totalWeight > 32) weightMultiplier = 2;
      if (totalWeight > 64) weightMultiplier = 2.5;
      const rate = Math.round(baseRate * weightMultiplier);
      const rates = [
        {
          id: "flat_standard",
          carrier: "Flat Rate",
          service: "Standard Shipping",
          serviceLevel: "standard",
          rate,
          currency: "USD",
          deliveryDays: isDomestic ? 5 : 14
        }
      ];
      rates.push({
        id: "flat_expedited",
        carrier: "Flat Rate",
        service: "Expedited Shipping",
        serviceLevel: "expedited",
        rate: Math.round(rate * 1.5),
        currency: "USD",
        deliveryDays: isDomestic ? 2 : 7
      });
      return rates;
    },
    async createShipment() {
      return {
        id: `flat_${Date.now()}`,
        trackingNumber: "",
        trackingUrl: "",
        rate: 0,
        currency: "USD"
      };
    },
    async getTracking() {
      return {
        trackingNumber: "",
        carrier: "Flat Rate",
        status: "unknown",
        events: []
      };
    }
  };
}
function createShippingService(provider) {
  return {
    provider,
    async calculateShipping(from, to, items) {
      const packages = items.map((item) => ({
        weight: Math.max(item.weight, 1),
        // minimum 1 oz
        value: 0
        // will be set elsewhere
      }));
      return provider.getRates(from, to, packages);
    },
    selectRate(rates, preference) {
      if (rates.length === 0) {
        throw new Error("No shipping rates available");
      }
      if (preference === "cheapest") {
        return rates.reduce(
          (cheapest, rate) => rate.rate < cheapest.rate ? rate : cheapest
        );
      }
      if (preference === "fastest") {
        const validRates = rates.filter((r) => r.deliveryDays !== void 0);
        if (validRates.length === 0) return rates[0];
        return validRates.reduce(
          (fastest, rate) => (rate.deliveryDays || 999) < (fastest.deliveryDays || 999) ? rate : fastest
        );
      }
      const matching = rates.filter((r) => r.serviceLevel === preference.serviceLevel);
      if (matching.length > 0) {
        return matching.reduce(
          (cheapest, rate) => rate.rate < cheapest.rate ? rate : cheapest
        );
      }
      return rates.reduce(
        (cheapest, rate) => rate.rate < cheapest.rate ? rate : cheapest
      );
    }
  };
}
function createShippingProvider(config) {
  switch (config.provider) {
    case "easypost":
      return easypostProvider(config);
    case "flat_rate":
      return flatRateProvider(config);
    default:
      throw new Error(`Unknown shipping provider: ${config.provider}`);
  }
}
export {
  createShippingProvider,
  createShippingService,
  easypostProvider,
  flatRateProvider
};
