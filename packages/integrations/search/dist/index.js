// src/index.ts
function databaseSearchProvider(config) {
  return {
    async search(query, options = {}) {
      const page = options.page || 1;
      const perPage = options.perPage || 20;
      const products = await config.database.products.search(query);
      const total = products.length;
      const start = (page - 1) * perPage;
      const items = products.slice(start, start + perPage);
      return { items, total, page, perPage };
    },
    async index() {
      console.log("Database search: products indexed by database adapter");
    },
    async add() {
    },
    async remove() {
    },
    async update() {
    }
  };
}
function meilisearchProvider(config) {
  const indexName = config.indexName || "products";
  async function fetchMeilisearch(path, options = {}) {
    const response = await fetch(`${config.host}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers
      }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meilisearch error: ${error}`);
    }
    return response.json();
  }
  return {
    async search(query, options = {}) {
      const page = options.page || 1;
      const perPage = options.perPage || 20;
      const filters = [];
      if (options.filters) {
        for (const [key, value] of Object.entries(options.filters)) {
          if (Array.isArray(value)) {
            filters.push(`${key} IN [${value.map((v) => `"${v}"`).join(",")}]`);
          } else {
            filters.push(`${key} = "${value}"`);
          }
        }
      }
      const result = await fetchMeilisearch(`/indexes/${indexName}/search`, {
        method: "POST",
        body: JSON.stringify({
          q: query,
          offset: (page - 1) * perPage,
          limit: perPage,
          filter: filters.length > 0 ? filters.join(" AND ") : void 0,
          sort: options.sort ? [options.sort] : void 0
        })
      });
      return {
        items: result.hits,
        total: result.totalHits || result.estimatedTotalHits || 0,
        page,
        perPage
      };
    },
    async index(products) {
      await fetchMeilisearch(`/indexes/${indexName}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          searchableAttributes: ["name", "description", "slug", "tags"],
          filterableAttributes: ["status", "price", "category", "tags"],
          sortableAttributes: ["price", "createdAt", "name"],
          rankingRules: [
            "words",
            "typo",
            "proximity",
            "attribute",
            "sort",
            "exactness"
          ]
        })
      });
      await fetchMeilisearch(`/indexes/${indexName}/documents`, {
        method: "POST",
        body: JSON.stringify(products.map((p) => ({
          ...p,
          // Flatten for search
          _searchable: `${p.name} ${p.description || ""} ${p.slug}`
        })))
      });
    },
    async add(product) {
      await fetchMeilisearch(`/indexes/${indexName}/documents`, {
        method: "POST",
        body: JSON.stringify([{
          ...product
        }])
      });
    },
    async remove(productId) {
      await fetchMeilisearch(`/indexes/${indexName}/documents/${productId}`, {
        method: "DELETE"
      });
    },
    async update(product) {
      await fetchMeilisearch(`/indexes/${indexName}/documents`, {
        method: "POST",
        body: JSON.stringify([product])
      });
    }
  };
}
function mockSearchProvider(products = []) {
  let indexedProducts = [...products];
  return {
    async search(query, options = {}) {
      const page = options.page || 1;
      const perPage = options.perPage || 20;
      const q = query.toLowerCase();
      const results = indexedProducts.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
      );
      const start = (page - 1) * perPage;
      const items = results.slice(start, start + perPage);
      return { items, total: results.length, page, perPage };
    },
    async index(products2) {
      indexedProducts = [...products2];
    },
    async add(product) {
      const idx = indexedProducts.findIndex((p) => p.id === product.id);
      if (idx >= 0) {
        indexedProducts[idx] = product;
      } else {
        indexedProducts.push(product);
      }
    },
    async remove(productId) {
      indexedProducts = indexedProducts.filter((p) => p.id !== productId);
    },
    async update(product) {
      await this.add(product);
    }
  };
}
function createSearchService(provider) {
  return {
    provider,
    async search(query, options) {
      if (!query || query.trim() === "") {
        return { items: [], total: 0, page: 1, perPage: options?.perPage || 20 };
      }
      return provider.search(query, options);
    },
    async index(products) {
      await provider.index(products);
    },
    async sync(product, action) {
      switch (action) {
        case "create":
          await provider.add(product);
          break;
        case "update":
          await provider.update(product);
          break;
        case "delete":
          await provider.remove(product.id);
          break;
      }
    }
  };
}
function createSearchProvider(config) {
  switch (config.provider) {
    case "database":
      return databaseSearchProvider(config);
    case "meilisearch":
      return meilisearchProvider(config);
    default:
      throw new Error(`Unknown search provider: ${config.provider}`);
  }
}
export {
  createSearchProvider,
  createSearchService,
  databaseSearchProvider,
  meilisearchProvider,
  mockSearchProvider
};
