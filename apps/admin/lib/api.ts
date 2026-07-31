import { compressImage } from './compressImage';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ts_admin_token');
}

// Upload a file directly to Garage via a presigned PUT URL.
// presignUrl: full API path (e.g. '/uploads/presign-image')
// extraQuery: additional query params (e.g. { groupId: 'abc' })
export async function presignedUpload(
  presignPath: string,
  file: File,
  extraQuery: Record<string, string> = {},
): Promise<{ filePath: string; presignedUrl: string }> {
  file = await compressImage(file);
  const q = new URLSearchParams({
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    ...extraQuery,
  });
  const token = getToken();
  const presignRes = await fetch(`${API_BASE}${presignPath}?${q}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { uploadUrl, key, viewUrl } = await presignRes.json();
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putRes.ok) throw new Error('Upload to storage failed');
  return { filePath: key, presignedUrl: viewUrl };
}

export function setToken(t: string) {
  localStorage.setItem('ts_admin_token', t);
}

export function clearToken() {
  localStorage.removeItem('ts_admin_token');
}

type FetchOptions = RequestInit & { auth?: boolean };

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { auth = true, headers: extra = {}, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra as Record<string, string>),
  };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body?.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Admin / Dashboard + Analytics ─────────────────────────────────────────────
export const adminApi = {
  dashboard: () => apiFetch<DashboardData>('/admin/dashboard'),
  analytics: () => apiFetch<AnalyticsData>('/admin/analytics'),
};

// ── Device Catalog ────────────────────────────────────────────────────────────
export interface AttributeOption {
  label: string;
  options: string[];
}

export const deviceCatalogApi = {
  list: (params?: { categorySlug?: string; brandSlug?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.categorySlug) q.set('categorySlug', params.categorySlug);
    if (params?.brandSlug) q.set('brandSlug', params.brandSlug);
    if (params?.search) q.set('search', params.search);
    return apiFetch<DeviceCatalogItem[]>(`/device-catalog?${q}`, { auth: false });
  },
  listPaged: (params?: { categorySlug?: string; brandSlug?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    q.set('paged', 'true');
    if (params?.categorySlug) q.set('categorySlug', params.categorySlug);
    if (params?.brandSlug) q.set('brandSlug', params.brandSlug);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    q.set('limit', String(params?.limit ?? 50));
    return apiFetch<{ items: DeviceCatalogItem[]; total: number; page: number; pages: number }>(`/device-catalog?${q}`);
  },
  getById: (id: string) =>
    apiFetch<DeviceCatalogItem>(`/device-catalog/${id}`, { auth: false }),
  create: (data: { brandCategoryId: string; model: string; storageOptions: string[]; attributeOptions?: AttributeOption[]; isActive?: boolean }) =>
    apiFetch<DeviceCatalogItem>('/device-catalog', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ brandCategoryId: string; model: string; storageOptions: string[]; attributeOptions: AttributeOption[]; isActive: boolean; tradeInEnabled: boolean; manualMarketPrice: number | null }>) =>
    apiFetch<DeviceCatalogItem>(`/device-catalog/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    apiFetch<void>(`/device-catalog/${id}`, { method: 'DELETE' }),
  removeAll: () =>
    apiFetch<{ message: string }>('/device-catalog/all', { method: 'DELETE' }),
};

// ── Catalog management (categories, brands, brand-categories) ─────────────────
export interface CatalogCategoryItem {
  id: string; name: string; slug: string; displayName?: string; description?: string; // slug is computed: name.toLowerCase()
  image?: string; images: string[]; isActive: boolean;
  isSellable: boolean; isRepairable: boolean;
  createdAt: string; updatedAt: string;
}
export interface CatalogBrandItem {
  id: string; name: string; slug: string; logo?: string;
  isActive: boolean; createdAt: string; updatedAt: string;
}

export const catalogCategoriesApi = {
  list: (includeInactive?: boolean) =>
    apiFetch<CatalogCategoryItem[]>(`/catalog/categories${includeInactive ? '?includeInactive=true' : ''}`),
  create: (data: { name: string; slug: string; displayName?: string; description?: string; isActive?: boolean }) =>
    apiFetch<CatalogCategoryItem>('/catalog/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; slug: string; displayName: string; description: string; isActive: boolean; isSellable: boolean; isRepairable: boolean }>) =>
    apiFetch<CatalogCategoryItem>(`/catalog/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/catalog/categories/${id}`, { method: 'DELETE' }),
  uploadImage: async (id: string, file: File) => {
    const q = new URLSearchParams({ filename: file.name, contentType: file.type || 'application/octet-stream' });
    const token = getToken();
    const r = await fetch(`${API_BASE}/catalog/categories/${id}/image-presign?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, key } = await r.json();
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Upload failed');
    // Adds to images array (and sets primary if first)
    return apiFetch(`/catalog/categories/${id}/images`, { method: 'POST', body: JSON.stringify({ key }) });
  },
  deleteImage: (id: string, imageKey: string) =>
    apiFetch<void>(`/catalog/categories/${id}/images/${encodeURIComponent(imageKey)}`, { method: 'DELETE' }),
};

export const catalogBrandsApi = {
  list: (includeInactive?: boolean) =>
    apiFetch<CatalogBrandItem[]>(`/catalog/brands${includeInactive ? '?includeInactive=true' : ''}`),
  create: (data: { name: string; slug: string; isActive?: boolean }) =>
    apiFetch<CatalogBrandItem>('/catalog/brands', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; slug: string; isActive: boolean }>) =>
    apiFetch<CatalogBrandItem>(`/catalog/brands/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/catalog/brands/${id}`, { method: 'DELETE' }),
  uploadLogo: async (id: string, file: File) => {
    const q = new URLSearchParams({ filename: file.name, contentType: file.type || 'application/octet-stream' });
    const token = getToken();
    const r = await fetch(`${API_BASE}/catalog/brands/${id}/logo-presign?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, key } = await r.json();
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Upload failed');
    return apiFetch(`/catalog/brands/${id}/logo`, { method: 'POST', body: JSON.stringify({ key }) });
  },
};

export const catalogBrandCategoryApi = {
  list: (opts?: { includeInactive?: boolean; brandId?: string }) => {
    const q = new URLSearchParams();
    if (opts?.includeInactive) q.set('includeInactive', 'true');
    if (opts?.brandId) q.set('brandId', opts.brandId);
    return apiFetch<BrandCategoryOption[]>(`/catalog/brand-categories?${q}`);
  },
  create: (data: { brandId: string; categoryId: string }) =>
    apiFetch<BrandCategoryOption>('/catalog/brand-categories', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/catalog/brand-categories/${id}`, { method: 'DELETE' }),
  deleteImage: (id: string, imageKey: string) =>
    apiFetch<BrandCategoryOption>(`/catalog/brand-categories/${id}/images/${encodeURIComponent(imageKey)}`, { method: 'DELETE' }),
  uploadImage: async (id: string, file: File) => {
    const q = new URLSearchParams({ filename: file.name, contentType: file.type || 'application/octet-stream' });
    const token = getToken();
    const r = await fetch(`${API_BASE}/catalog/brand-categories/${id}/image-presign?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, key } = await r.json();
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Upload failed');
    return apiFetch(`/catalog/brand-categories/${id}/images`, { method: 'POST', body: JSON.stringify({ key }) });
  },
};

// ── Other Catalog (OtherBrand + OtherSubcategory) ─────────────────────────────
export interface OtherBrand {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtherSubcategory {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const otherBrandsApi = {
  list: () => apiFetch<OtherBrand[]>('/other-brands'),
  create: (name: string) =>
    apiFetch<OtherBrand>('/other-brands', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, name: string) =>
    apiFetch<OtherBrand>(`/other-brands/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  remove: (id: string) => apiFetch<void>(`/other-brands/${id}`, { method: 'DELETE' }),
};

export const otherSubcategoriesApi = {
  list: () => apiFetch<OtherSubcategory[]>('/other-subcategories'),
  create: (name: string) =>
    apiFetch<OtherSubcategory>('/other-subcategories', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, name: string) =>
    apiFetch<OtherSubcategory>(`/other-subcategories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  remove: (id: string) => apiFetch<void>(`/other-subcategories/${id}`, { method: 'DELETE' }),
};

// ── Stores ────────────────────────────────────────────────────────────────────
export interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  phone?: string;
  openingHours?: string;
  mapsEmbedUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export const storesApi = {
  list: () => apiFetch<Store[]>('/stores/all'),
  create: (data: Omit<Store, 'id' | 'createdAt'>) =>
    apiFetch<Store>('/stores', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<Store, 'id' | 'createdAt'>>) =>
    apiFetch<Store>(`/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<void>(`/stores/${id}`, { method: 'DELETE' }),
};

// ── Scraper ───────────────────────────────────────────────────────────────────
export interface ScrapedPriceRow {
  id: string;
  deviceKey: string;
  brand: string;
  model: string;
  storage: string;
  cexSellPrice: number | null;
  cexCashPrice: number | null;
  cexExchangePrice: number | null;
  backMarketPrice: number | null;
  musicMagpiePrice: number | null;
  envirofonePrice: number | null;
  marketPrice: number | null;
  scrapedAt: string;
  isOther?: boolean;
}

export interface ScraperGroupStats {
  total: number;
  withMarketPrice: number;
  withCex: number;
  withEnvirofone: number;
}

export interface ScraperStats {
  total: number;
  withMarketPrice: number;
  withCex: number;
  withBM: number;
  withMM: number;
  withEnvirofone: number;
  lastScrapedAt: string | null;
  catalog: ScraperGroupStats;
  others: ScraperGroupStats;
}

export interface ScraperRun {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  totalScraped: number | null;
  errorMessage: string | null;
  currentProgress: number | null;
  totalVariants: number | null;
  totalCatalog: number | null;
  totalOthers: number | null;
  catalogProgress: number | null;
  othersProgress: number | null;
}

export interface ScrapedPricesSnapshot {
  cexSellPrice:     number | null;
  cexCashPrice:     number | null;
  cexExchangePrice: number | null;
  envirofonePrice:  number | null;
  marketPrice:      number | null;
  scrapedAt:        string;
}

export interface EstimateResult {
  low:           number;
  high:          number;
  suggested:     number;
  marketPrice:   number | null;
  scrapedPrices: ScrapedPricesSnapshot | null;
}

export interface PricingRunResult {
  applied: number;
  flagged: number;
  skipped: number;
}

export const scraperApi = {
  run: (limit?: number) => {
    const q = limit ? `?limit=${limit}` : '';
    return apiFetch<{ ok: boolean; message: string }>(`/scraper/run${q}`, { method: 'POST' });
  },

  prices: (page = 1, limit = 50, search?: string) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) q.set('search', search);
    return apiFetch<{ items: ScrapedPriceRow[]; total: number; page: number; pages: number }>(`/scraper/prices?${q}`);
  },

  devicePrices: (brand: string, model: string) => {
    const q = new URLSearchParams({ brand, model });
    return apiFetch<ScrapedPriceRow[]>(`/scraper/device?${q}`);
  },

  scrapeDevice: (brand: string, model: string) => {
    const q = new URLSearchParams({ brand, model });
    return apiFetch<{ ok: boolean; message: string }>(`/scraper/device?${q}`, { method: 'POST' });
  },

  scrapeDeviceSync: (brand: string, model: string) => {
    const q = new URLSearchParams({ brand, model, sync: 'true' });
    return apiFetch<{ ok: boolean; prices: ScrapedPriceRow[]; message?: string }>(`/scraper/device?${q}`, { method: 'POST' });
  },

  stats: () => apiFetch<ScraperStats>('/scraper/stats'),

  runs: (limit = 20) => apiFetch<ScraperRun[]>(`/scraper/runs?limit=${limit}`),

  stop: () => apiFetch<{ ok: boolean; message: string }>('/scraper/stop', { method: 'POST' }),

  cleanup: (force = false) => apiFetch<{ cleaned: number }>(`/scraper/cleanup${force ? '?force=true' : ''}`, { method: 'POST' }),

  purgeAll: () => apiFetch<{ deletedPrices: number; deletedRuns: number }>('/scraper/purge', { method: 'DELETE' }),

  getSchedule: () => apiFetch<{ hours: number }>('/scraper/schedule'),

  setSchedule: (hours: number) =>
    apiFetch<{ hours: number }>('/scraper/schedule', { method: 'POST', body: JSON.stringify({ hours }) }),

  getStuckThreshold: () => apiFetch<{ hours: number }>('/scraper/stuck-threshold'),

  setStuckThreshold: (hours: number) =>
    apiFetch<{ hours: number }>('/scraper/stuck-threshold', { method: 'POST', body: JSON.stringify({ hours }) }),
};

// ── Product Pricing ───────────────────────────────────────────────────────────
export interface PricingJobStatus {
  running: boolean;
  done: number;
  total: number;
  result: PricingRunResult | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export const productPricingApi = {
  run: () =>
    apiFetch<{ started: boolean; alreadyRunning: boolean }>('/product-pricing/run', { method: 'POST' }),

  status: () =>
    apiFetch<PricingJobStatus>('/product-pricing/run/status'),

  priceOne: (id: string) =>
    apiFetch<{ status: string; candidatePrice?: number }>(`/product-pricing/product/${id}`, { method: 'POST' }),

  estimate: (brand: string, model: string, storage: string, condition: string) => {
    const q = new URLSearchParams({ brand, model, storage, condition });
    return apiFetch<EstimateResult>(`/product-pricing/estimate?${q}`);
  },

  flagged: () =>
    apiFetch<{ id: string; name: string; condition: string; storage: string; updatedAt: string }[]>(
      '/product-pricing/flagged',
    ),
};

// ── Health ────────────────────────────────────────────────────────────────────
export interface HealthStatus {
  status: string;
  scraper: boolean;
  scraperError?: string;
}
export const healthApi = {
  check: () => apiFetch<HealthStatus>('/health', { auth: false }),
};

// ── Pricing Config ────────────────────────────────────────────────────────────
export const pricingConfigApi = {
  list: () => apiFetch<{ key: string; value: number; label: string }[]>('/pricing-config'),
  upsert: (key: string, value: number, label: string) =>
    apiFetch<{ key: string; value: number; label: string }>(`/pricing-config/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value, label }),
    }),
};

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ user: AdminUser; token: string }>('/auth/login', {
      auth: false,
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => apiFetch<AdminUser>('/users/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// ── Products ──────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (params?: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
    pricingStatus?: string;
    excludeOthers?: boolean;
    onlyOthers?: boolean;
    includeAll?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    q.set('limit', String(params?.limit ?? 50));
    q.set('includeAll', params?.includeAll === false ? 'false' : 'true');
    if (params?.pricingStatus) q.set('pricingStatus', params.pricingStatus);
    if (params?.excludeOthers) q.set('excludeOthers', 'true');
    if (params?.onlyOthers) q.set('onlyOthers', 'true');
    return apiFetch<{ items: Product[]; total: number; page: number; pages: number }>(`/products?${q}`);
  },

  categories: () => apiFetch<string[]>('/products/categories'),
  othersCategories: () => apiFetch<string[]>('/products/others-categories'),

  getById: (id: string) =>
    apiFetch<Product>(`/products/by-id/${id}`),

  uploadImage: (file: File) => presignedUpload('/uploads/presign-image', file),

  create: (data: CreateProductPayload) =>
    apiFetch<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<CreateProductPayload>) =>
    apiFetch<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) =>
    apiFetch<void>(`/products/${id}`, { method: 'DELETE' }),

  removeAll: () =>
    apiFetch<{ message: string }>('/products/all', { method: 'DELETE' }),
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    q.set('limit', String(params?.limit ?? 50));
    return apiFetch<{ items: Order[]; total: number; page: number; pages: number }>(`/orders?${q}`);
  },

  getById: (id: string) => apiFetch<Order>(`/orders/${id}`),

  ship: (id: string, trackingNumber: string) =>
    apiFetch<Order>(`/orders/${id}/ship`, { method: 'POST', body: JSON.stringify({ trackingNumber }) }),

  deliver: (id: string) =>
    apiFetch<Order>(`/orders/${id}/deliver`, { method: 'POST' }),

  cancel: (id: string) =>
    apiFetch<Order>(`/orders/${id}/cancel`, { method: 'POST' }),

  purgeAll: () =>
    apiFetch<{ deleted: number }>('/orders/purge', { method: 'DELETE' }),
};

// ── Payment Settings ──────────────────────────────────────────────────────────
export interface PaymentSettings {
  mode: 'test' | 'live';
  stripeSecretKeyTest: string | null;
  stripeSecretKeyLive: string | null;
  stripeWebhookSecretTest: string | null;
  stripeWebhookSecretLive: string | null;
  stripePublishableKeyTest: string | null;
  stripePublishableKeyLive: string | null;
}

export const paymentSettingsApi = {
  get: () => apiFetch<PaymentSettings>('/payments/settings'),
  update: (data: Partial<{
    mode: string;
    stripeSecretKeyTest: string;
    stripeSecretKeyLive: string;
    stripeWebhookSecretTest: string;
    stripeWebhookSecretLive: string;
    stripePublishableKeyTest: string;
    stripePublishableKeyLive: string;
  }>) =>
    apiFetch<PaymentSettings>('/payments/settings', { method: 'PUT', body: JSON.stringify(data) }),
  test: () => apiFetch<{ ok: boolean; accountId: string }>('/payments/settings/test', { method: 'POST' }),
  refund: (orderId: string, amountPounds?: number) =>
    apiFetch<{ refundId: string; amount: number; status: string }>('/payments/refund', {
      method: 'POST',
      body: JSON.stringify({ orderId, ...(amountPounds !== undefined ? { amountPounds } : {}) }),
    }),
};

// ── Shipping Settings ─────────────────────────────────────────────────────────
export interface ShippingSettings {
  mode: 'test' | 'live';
  shippoApiKeyTest: string | null;
  shippoApiKeyLive: string | null;
  shippoServiceLevel: string;
}

export const shippingSettingsApi = {
  get: () => apiFetch<ShippingSettings>('/shipping/settings'),
  update: (data: Partial<{
    mode: string;
    shippoApiKeyTest: string;
    shippoApiKeyLive: string;
    shippoServiceLevel: string;
  }>) =>
    apiFetch<ShippingSettings>('/shipping/settings', { method: 'PUT', body: JSON.stringify(data) }),
  test: () => apiFetch<{ ok: boolean }>('/shipping/settings/test', { method: 'POST' }),
};

// ── Trade-ins ─────────────────────────────────────────────────────────────────
export const tradeInsApi = {
  list: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    q.set('limit', String(params?.limit ?? 50));
    return apiFetch<{ items: TradeIn[]; total: number; page: number; pages: number }>(`/trade-ins?${q}`);
  },

  getById: (id: string) => apiFetch<TradeIn>(`/trade-ins/${id}`),

  approve: (id: string, adminNotes?: string) =>
    apiFetch<TradeIn>(`/trade-ins/${id}/approve`, { method: 'POST', body: JSON.stringify({ adminNotes }) }),

  reject: (id: string, adminNotes?: string) =>
    apiFetch<TradeIn>(`/trade-ins/${id}/reject`, { method: 'POST', body: JSON.stringify({ adminNotes }) }),

  counterOffer: (id: string, counterOffer: number, adminNotes?: string) =>
    apiFetch<TradeIn>(`/trade-ins/${id}/counter-offer`, { method: 'POST', body: JSON.stringify({ counterOffer, adminNotes }) }),

  complete: (id: string) =>
    apiFetch<TradeIn>(`/trade-ins/${id}/complete`, { method: 'POST' }),

  resendLabel: (id: string) =>
    apiFetch<{ success: boolean; trackingNumber: string }>(`/trade-ins/${id}/resend-label`, { method: 'POST' }),

  purgeAll: () =>
    apiFetch<{ deleted: number }>('/trade-ins/purge', { method: 'DELETE' }),
};

// ── Repairs ───────────────────────────────────────────────────────────────────
export const repairsApi = {
  list: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    q.set('limit', String(params?.limit ?? 50));
    return apiFetch<{ items: Repair[]; total: number; page: number; pages: number }>(`/repairs?${q}`);
  },

  getById: (id: string) => apiFetch<Repair>(`/repairs/${id}`),

  setQuote: (id: string, amount: number) =>
    apiFetch<Repair>(`/repairs/${id}/quote`, { method: 'POST', body: JSON.stringify({ quote: amount }) }),

  start: (id: string) =>
    apiFetch<Repair>(`/repairs/${id}/start`, { method: 'POST' }),

  complete: (id: string, adminNotes?: string) =>
    apiFetch<Repair>(`/repairs/${id}/complete`, { method: 'POST', body: JSON.stringify({ adminNotes }) }),

  cancel: (id: string) =>
    apiFetch<Repair>(`/repairs/${id}/cancel`, { method: 'POST' }),

  purgeAll: () =>
    apiFetch<{ deleted: number }>('/repairs/purge', { method: 'DELETE' }),
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface Product {
  id: string;
  catalogId?: string;           // null for other products
  otherBrandId?: string;
  otherSubcategoryId?: string;
  name: string;
  slug: string;
  brand: string;                // flattened from either track
  model: string;                // empty string for other products
  category: string;             // flattened from either track
  condition: string;
  storage: string;
  attributes?: Record<string, string>;
  price: number | null;
  comparePrice?: number;
  tradeInPrice?: number | null;
  stock: number;
  images: string[];
  rawImages?: string[];
  specs: Record<string, unknown>;
  description?: string;
  isActive: boolean;
  pricingStatus: 'auto_priced' | 'manual' | 'flagged' | 'no_data';
  createdAt: string;
}

export interface CreateProductPayload {
  // Main product track
  catalogId?: string;
  // Other product track
  otherBrandId?: string;
  otherSubcategoryId?: string;
  // Shared
  name: string;
  condition: string;
  storage?: string;
  attributes?: Record<string, string>;
  price?: number | null;
  comparePrice?: number;
  stock?: number;
  images?: string[];
  specs?: Record<string, unknown>;
  description?: string;
  isActive?: boolean;
}

export interface Order {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  shipping: number;
  discount?: number;
  shippingAddress: Record<string, string>;
  paymentMethod?: string;
  paymentIntentId?: string;
  refundId?: string;
  refundAmount?: number;
  trackingNumber?: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
  items: {
    id: string;
    quantity: number;
    price: number;
    product: { id: string; name: string; slug: string; condition: string };
  }[];
}

export interface TradeIn {
  id: string;
  reference: string;
  category: string;
  brand: string;
  model: string;
  specs?: Record<string, string>;
  condition: string;
  offerPrice: number;
  finalPrice?: number;
  counterOffer?: number;
  images: string[];
  status: string;
  fulfillment: string;
  storeId?: string;
  contact: { name: string; email: string; phone: string; address?: string; postcode?: string };
  answers: Record<string, string>;
  customerNotes?: string;
  adminNotes?: string;
  trackingNumber?: string;
  labelUrl?: string;
  labelEmailSentAt?: string;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; email: string };
}

export interface Repair {
  id: string;
  reference: string;
  deviceType: string;
  brand: string;
  model: string;
  issue: string;
  issueNotes?: string;
  images: string[];
  status: string;
  quote?: number;
  fulfillment: string;
  contact: { name: string; email: string; phone: string; address?: string; postcode?: string };
  adminNotes?: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; email: string };
}

export interface AnalyticsData {
  summary: { totalRevenue: number; totalOrders: number; totalTradeIns: number; avgOrderValue: number };
  monthly: { month: string; year: number; orders: number; tradeIns: number; repairs: number; revenue: number }[];
  topProducts: { productId: string; name: string; category: string; units: number; revenue: number }[];
  categorySplit: { category: string; pct: number }[];
  topTradeIns: { device: string; count: number; avgOffer: number }[];
}

export interface DeviceCatalogItem {
  id: string;
  brandCategoryId: string;
  brandCategory: {
    id: string;
    brand: { id: string; name: string; slug: string; logo?: string };
    category: { id: string; name: string };
  };
  model: string;
  storageOptions: string[];
  attributeOptions: AttributeOption[];
  isActive: boolean;
  tradeInEnabled: boolean;
  manualMarketPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandCategoryOption {
  id: string;
  brandId: string;
  brand: { id: string; name: string; slug: string };
  categoryId: string;
  category: { id: string; name: string };
  /** null = fall back to brand.name when displaying */
  alias: string | null;
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  stats: {
    orders: { total: number; pending: number; revenue: number; revenueThisMonth: number };
    tradeIns: { total: number; pending: number };
    repairs: { total: number; pending: number };
    users: { total: number; newThisMonth: number };
  };
  recentOrders: {
    id: string;
    status: string;
    total: number;
    createdAt: string;
    user?: { id: string; name: string; email: string };
    items: { id: string; quantity: number; price: number; product: { id: string; name: string } }[];
  }[];
  breakdown: {
    orders: { status: string; count: number }[];
    tradeIns: { status: string; count: number }[];
    repairs: { status: string; count: number }[];
  };
}

// ── Banners ───────────────────────────────────────────────────────────────────

export interface BannerItem {
  id: string;
  key: string;
  label: string | null;
  isActive: boolean;
  order: number;
  url: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GradeBannerItem {
  id: string;
  grade: string;
  key: string;
  label: string | null;
  isActive: boolean;
  order: number;
  url: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromoSlideItem {
  id: string;
  order: number;
  isActive: boolean;
  imgUrl: string | null;
  tabTitle: string;
  tag: string;
  titleLine1: string;
  titleLine2: string;
  titleItalic: string;
  title: string;
  subtitle: string;
  badgeA: string;
  badgeB: string;
  specs: string[];
  themeColor: string;
  bgGlow: string;
  btnText: string;
  btnLink: string;
}

export const THEME_PRESETS = [
  { label: 'Blue',    swatch: 'from-blue-500 to-indigo-600',    themeColor: 'from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-400',     bgGlow: 'rgba(59,130,246,0.15)' },
  { label: 'Amber',   swatch: 'from-amber-500 to-orange-600',   themeColor: 'from-amber-500 to-orange-600 dark:from-amber-400 dark:to-orange-400',   bgGlow: 'rgba(245,158,11,0.15)' },
  { label: 'Emerald', swatch: 'from-emerald-500 to-teal-600',   themeColor: 'from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-400',   bgGlow: 'rgba(16,185,129,0.15)' },
  { label: 'Green',   swatch: 'from-green-500 to-emerald-600',  themeColor: 'from-green-500 to-emerald-600 dark:from-green-400 dark:to-emerald-400', bgGlow: 'rgba(34,197,94,0.15)' },
  { label: 'Purple',  swatch: 'from-purple-500 to-fuchsia-600', themeColor: 'from-purple-500 to-fuchsia-600 dark:from-purple-400 dark:to-fuchsia-400', bgGlow: 'rgba(168,85,247,0.15)' },
  { label: 'Teal',    swatch: 'from-teal-500 to-cyan-600',      themeColor: 'from-teal-500 to-cyan-600 dark:from-teal-400 dark:to-cyan-400',         bgGlow: 'rgba(20,184,166,0.15)' },
] as const;

export const bannerImagesApi = {
  list: () => apiFetch<BannerItem[]>('/banners'),
  toggle: (id: string) => apiFetch<BannerItem>(`/banners/${id}/toggle`, { method: 'PATCH' }),
  delete: (id: string) => apiFetch<void>(`/banners/${id}`, { method: 'DELETE' }),
  upload: async (file: File, label?: string) => {
    const q = new URLSearchParams({ filename: file.name, contentType: file.type || 'application/octet-stream' });
    const token = getToken();
    const r = await fetch(`${API_BASE}/banners/presign-upload?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, key } = await r.json();
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Upload failed');
    return apiFetch<BannerItem>('/banners', { method: 'POST', body: JSON.stringify({ key, label }) });
  },
};

export const GRADE_OPTIONS = ['NEW', 'A', 'B', 'C', 'F'] as const;

export const gradeBannersApi = {
  list: () => apiFetch<GradeBannerItem[]>('/banners/grade'),
  toggle: (id: string) => apiFetch<GradeBannerItem>(`/banners/grade/${id}/toggle`, { method: 'PATCH' }),
  delete: (id: string) => apiFetch<void>(`/banners/grade/${id}`, { method: 'DELETE' }),
  upload: async (grade: string, file: File, label?: string) => {
    const q = new URLSearchParams({ grade, filename: file.name, contentType: file.type || 'application/octet-stream' });
    const token = getToken();
    const r = await fetch(`${API_BASE}/banners/grade/presign-upload?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, key } = await r.json();
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Upload failed');
    return apiFetch<GradeBannerItem>('/banners/grade', { method: 'POST', body: JSON.stringify({ grade, key, label }) });
  },
};

export interface TradeInDeviceItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const tradeInDevicesApi = {
  list: (all = true) =>
    apiFetch<TradeInDeviceItem[]>(`/trade-in-devices${all ? '?all=true' : ''}`),
  create: (data: { name: string; brand: string; category: string; isActive?: boolean }) =>
    apiFetch<TradeInDeviceItem>('/trade-in-devices', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; brand: string; category: string; isActive: boolean }>) =>
    apiFetch<TradeInDeviceItem>(`/trade-in-devices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    apiFetch<void>(`/trade-in-devices/${id}`, { method: 'DELETE' }),
};

export const promoSlidesApi = {
  list: () => apiFetch<PromoSlideItem[]>('/banners/promo-slides/all'),
  create: (data: Omit<PromoSlideItem, 'id' | 'imgUrl'> & { imageUrl?: string }) =>
    apiFetch<PromoSlideItem>('/banners/promo-slides', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<PromoSlideItem, 'id' | 'imgUrl'> & { imageUrl?: string }>) =>
    apiFetch<PromoSlideItem>(`/banners/promo-slides/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/banners/promo-slides/${id}`, { method: 'DELETE' }),
  toggle: (id: string) => apiFetch<PromoSlideItem>(`/banners/promo-slides/${id}/toggle`, { method: 'PATCH' }),
  reorder: (items: { id: string; order: number }[]) =>
    apiFetch<void>('/banners/promo-slides/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
  uploadImage: async (id: string, file: File) => {
    const q = new URLSearchParams({ filename: file.name, contentType: file.type || 'application/octet-stream' });
    const token = getToken();
    const r = await fetch(`${API_BASE}/banners/promo-slides/presign-image?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, key } = await r.json();
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Upload failed');
    return apiFetch<PromoSlideItem>(`/banners/promo-slides/${id}/image`, { method: 'POST', body: JSON.stringify({ key }) });
  },
  deleteImage: (id: string) =>
    apiFetch<PromoSlideItem>(`/banners/promo-slides/${id}/image`, { method: 'DELETE' }),
};
