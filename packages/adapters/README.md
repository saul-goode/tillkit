# Database Adapter Interface

## Overview

All database adapters must implement the `DatabaseAdapter` interface from `@tillkit/core`.

## Implementation Guidelines

1. The DatabaseAdapter interface has `products`, `cart`, `orders`, and `customers` properties
2. Each property contains CRUD methods appropriate for that domain
3. Use local type definitions to avoid circular imports

## Example Skeleton

```typescript
import type { DatabaseAdapter } from '@tillkit/core';

export function myDatabaseAdapter(config: Config): DatabaseAdapter {
  const db = createConnection(config);
  
  return {
    products: {
      async list(options) { /* ... */ },
      async get(id) { /* ... */ },
      async getBySlug(slug) { /* ... */ },
      async create(data) { /* ... */ },
      async update(id, data) { /* ... */ },
      async delete(id) { /* ... */ },
      async search(query) { /* ... */ },
    },
    cart: {
      async get(sessionId) { /* ... */ },
      async create(sessionId) { /* ... */ },
      async update(sessionId, updates) { /* ... */ },
      async addItem(sessionId, item) { /* ... */ },
      async updateItem(sessionId, itemId, quantity) { /* ... */ },
      async removeItem(sessionId, itemId) { /* ... */ },
      async clear(sessionId) { /* ... */ },
    },
    orders: {
      async list(options) { /* ... */ },
      async get(id) { /* ... */ },
      async getByNumber(number) { /* ... */ },
      async create(data) { /* ... */ },
      async update(id, data) { /* ... */ },
      async addTransaction(orderId, transaction) { /* ... */ },
      async updateStatus(id, status) { /* ... */ },
    },
    customers: {
      async get(id) { /* ... */ },
      async getByEmail(email) { /* ... */ },
      async create(data) { /* ... */ },
      async update(id, data) { /* ... */ },
      async addAddress(customerId, address) { /* ... */ },
    },
  };
}
```
