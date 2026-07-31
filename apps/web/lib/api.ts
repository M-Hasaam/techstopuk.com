import { compressImage } from './compressImage';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ts_token');
}

function getCartId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ts_cart_id');
}

type FetchOptions = RequestInit & { auth?: boolean };

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { auth = false, headers: extraHeaders = {}, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const cartId = getCartId();
  if (cartId) headers['x-cart-id'] = cartId;

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body?.message ?? res.statusText);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    apiFetch<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  me: () => apiFetch<User>('/users/me', { auth: true }),

  updateProfile: (data: { name?: string; phone?: string; address?: string; city?: string; postcode?: string }) =>
    apiFetch<User>('/users/me', { method: 'PATCH', auth: true, body: JSON.stringify(data) }),
};

// ── Products ──────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (params?: {
    category?: string; brand?: string; condition?: string;
    search?: string; page?: number; limit?: number;
    minPrice?: number; maxPrice?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.brand) q.set('brand', params.brand);
    if (params?.condition) q.set('condition', params.condition);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.minPrice !== undefined) q.set('minPrice', String(params.minPrice));
    if (params?.maxPrice !== undefined) q.set('maxPrice', String(params.maxPrice));
    return apiFetch<{ items: Product[]; total: number; page: number; pages: number }>(
      `/products?${q}`,
    );
  },

  bySlug: (slug: string) => apiFetch<Product>(`/products/${slug}`),

  brands: (category: string) =>
    apiFetch<{ brand: string; slug: string; logo: string | null; image: string | null }[]>(`/products/brands?category=${encodeURIComponent(category)}`),
};

// ── Cart ─────────────────────────────────────────────────────────────────────
export const cartApi = {
  get: () => apiFetch<CartItem[]>('/cart'),

  add: (item: Omit<CartItem, 'quantity'> & { quantity: number }) =>
    apiFetch<CartItem[]>('/cart/items', { method: 'POST', body: JSON.stringify(item) }),

  update: (productId: string, quantity: number) =>
    apiFetch<CartItem[]>(`/cart/items/${productId}`, {
      method: 'PATCH', body: JSON.stringify({ quantity }),
    }),

  remove: (productId: string) =>
    apiFetch<CartItem[]>(`/cart/items/${productId}`, { method: 'DELETE' }),

  clear: () => apiFetch<void>('/cart', { method: 'DELETE' }),
};

// ── Payments ─────────────────────────────────────────────────────────────────
export const paymentsApi = {
  createIntent: (items: { productId: string; quantity: number }[], promoCode?: string) =>
    apiFetch<{ clientSecret: string | null; paymentIntentId: string | null; amount: number; discount: number; devMode: boolean }>(
      '/payments/intent',
      { method: 'POST', body: JSON.stringify({ items, promoCode }) },
    ),
  publicConfig: () =>
    apiFetch<{ mode: 'test' | 'live'; publishableKey: string | null }>('/payments/public-config'),
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const ordersApi = {
  create: (data: CreateOrderPayload) =>
    apiFetch<Order>('/orders', { method: 'POST', auth: true, body: JSON.stringify(data) }),

  myOrders: () => apiFetch<Order[]>('/orders/my', { auth: true }),

  markReceived: (id: string) =>
    apiFetch<Order>(`/orders/${id}/received`, { method: 'POST', auth: true }),
};

// ── Uploads ───────────────────────────────────────────────────────────────────
async function presignedUpload(
  presignPath: string,
  file: File,
  extraQuery: Record<string, string> = {},
): Promise<{ filePath: string; presignedUrl: string }> {
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

export const uploadsApi = {
  image: (file: File) => presignedUpload('/uploads/presign-image', file),
  tradeInImage: (file: File, groupId: string) => presignedUpload('/uploads/presign-trade-in-image', file, { groupId }),
  repairImage: (file: File, groupId: string) => presignedUpload('/uploads/presign-repair-image', file, { groupId }),
  reviewImage: async (file: File) => {
    const compressed = await compressImage(file);
    return presignedUpload('/uploads/presign-review-image', compressed);
  },
};

// ── Reviews ───────────────────────────────────────────────────────────────────
export const reviewsApi = {
  list: (productId: string) =>
    apiFetch<Review[]>(`/products/${productId}/reviews`),

  recent: (limit = 8) =>
    apiFetch<(Review & { product: { name: string; slug: string; category: string; condition: string } })[]>(
      `/reviews/recent?limit=${limit}`,
    ),

  create: (productId: string, data: { guestName?: string; rating: number; body: string; images?: string[] }) =>
    apiFetch<Review>(`/products/${productId}/reviews`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    }),
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
}

export const storesApi = {
  list: () => apiFetch<Store[]>('/stores'),
};

// ── Trade-ins ─────────────────────────────────────────────────────────────────
export const tradeInsApi = {
  submit: (data: TradeInPayload) =>
    apiFetch<TradeIn>('/trade-ins', { method: 'POST', auth: true, body: JSON.stringify(data) }),

  my: () => apiFetch<TradeIn[]>('/trade-ins/my', { auth: true }),

  myById: (id: string) => apiFetch<TradeInDetail>(`/trade-ins/my/${id}`, { auth: true }),

  acceptCounter: (id: string) =>
    apiFetch<TradeIn>(`/trade-ins/my/${id}/accept-counter`, { method: 'POST', auth: true }),

  declineCounter: (id: string) =>
    apiFetch<TradeIn>(`/trade-ins/my/${id}/decline-counter`, { method: 'POST', auth: true }),

  aiPrice: (data: {
    model: string; brand: string; category: string;
    condition: string; specs: Record<string, string>;
    answers: Record<string, string>; images?: string[];
  }) => apiFetch<{ price: number; aiUsed: boolean }>('/trade-ins/ai-price', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  suggestSpecs: (data: { brand: string; model: string; category: string }) =>
    apiFetch<{ label: string; options: string[] }[]>('/trade-ins/suggest-specs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  stats: () =>
    apiFetch<{ devicesRepurposed: number; lifespanExtension: number; idleElectronics: number }>('/trade-ins/stats'),
};

// ── Repairs ───────────────────────────────────────────────────────────────────
export const repairsApi = {
  submit: (data: RepairPayload) =>
    apiFetch<Repair>('/repairs', { method: 'POST', auth: true, body: JSON.stringify(data) }),

  my: () => apiFetch<Repair[]>('/repairs/my', { auth: true }),

  myById: (id: string) => apiFetch<RepairDetail>(`/repairs/my/${id}`, { auth: true }),

  acceptQuote: (id: string) =>
    apiFetch<Repair>(`/repairs/${id}/accept-quote`, { method: 'POST', auth: true }),

  declineQuote: (id: string) =>
    apiFetch<Repair>(`/repairs/${id}/decline-quote`, { method: 'POST', auth: true }),
};

// ── Banners ───────────────────────────────────────────────────────────────────
export interface PromoSlide {
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

export const bannersApi = {
  random: (count = 4) =>
    apiFetch<{ id: string; label: string | null; url: string | null }[]>(
      `/banners/random?count=${count}`
    ),
  promoSlides: () =>
    apiFetch<PromoSlide[]>(`/banners/promo-slides`),
  gradePreview: () =>
    apiFetch<{ grade: string; url: string | null }[]>(`/banners/grade/preview`),
};

// ── Catalog (admin + public) ──────────────────────────────────────────────────

async function presignAndSaveKey(presignPath: string, savePath: string, file: File): Promise<any> {
  const q = new URLSearchParams({ filename: file.name, contentType: file.type || 'application/octet-stream' });
  const token = getToken();
  const r = await fetch(`${API_BASE}${presignPath}?${q}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('Failed to get upload URL');
  const { uploadUrl, key } = await r.json();
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error('Upload failed');
  return apiFetch(savePath, { method: 'POST', auth: true, body: JSON.stringify({ key }) });
}

export const catalogApi = {
  // ── Categories ─────────────────────────────────────────────────────────────
  listCategories: (includeInactive?: boolean) =>
    apiFetch<CatalogCategory[]>(`/catalog/categories${includeInactive ? '?includeInactive=true' : ''}`),

  createCategory: (data: { name: string; slug: string; description?: string; isActive?: boolean }) =>
    apiFetch<CatalogCategory>('/catalog/categories', { method: 'POST', auth: true, body: JSON.stringify(data) }),

  updateCategory: (id: string, data: Partial<{ name: string; slug: string; description?: string; isActive: boolean }>) =>
    apiFetch<CatalogCategory>(`/catalog/categories/${id}`, { method: 'PATCH', auth: true, body: JSON.stringify(data) }),

  uploadCategoryImage: (id: string, file: File) =>
    presignAndSaveKey(`/catalog/categories/${id}/image-presign`, `/catalog/categories/${id}/image`, file),

  deleteCategory: (id: string) =>
    apiFetch<void>(`/catalog/categories/${id}`, { method: 'DELETE', auth: true }),

  // ── Brands ─────────────────────────────────────────────────────────────────
  listBrands: (includeInactive?: boolean) =>
    apiFetch<CatalogBrand[]>(`/catalog/brands${includeInactive ? '?includeInactive=true' : ''}`),

  getBrandBySlug: (slug: string) =>
    apiFetch<CatalogBrand & { brandCategories: CatalogBrandCategory[] }>(`/catalog/brands/${slug}`),

  createBrand: (data: { name: string; slug: string; isActive?: boolean }) =>
    apiFetch<CatalogBrand>('/catalog/brands', { method: 'POST', auth: true, body: JSON.stringify(data) }),

  updateBrand: (id: string, data: Partial<{ name: string; slug: string; isActive: boolean }>) =>
    apiFetch<CatalogBrand>(`/catalog/brands/${id}`, { method: 'PATCH', auth: true, body: JSON.stringify(data) }),

  uploadBrandLogo: (id: string, file: File) =>
    presignAndSaveKey(`/catalog/brands/${id}/logo-presign`, `/catalog/brands/${id}/logo`, file),

  deleteBrand: (id: string) =>
    apiFetch<void>(`/catalog/brands/${id}`, { method: 'DELETE', auth: true }),

  // ── Brand-Categories ───────────────────────────────────────────────────────
  listBrandCategories: (opts?: { includeInactive?: boolean; brandId?: string }) => {
    const q = new URLSearchParams();
    if (opts?.includeInactive) q.set('includeInactive', 'true');
    if (opts?.brandId) q.set('brandId', opts.brandId);
    return apiFetch<CatalogBrandCategory[]>(`/catalog/brand-categories?${q}`, { auth: true });
  },

  createBrandCategory: (data: { brandId: string; categoryId: string }) =>
    apiFetch<CatalogBrandCategory>('/catalog/brand-categories', { method: 'POST', auth: true, body: JSON.stringify(data) }),

  uploadBrandCategoryImage: (id: string, file: File) =>
    presignAndSaveKey(`/catalog/brand-categories/${id}/image-presign`, `/catalog/brand-categories/${id}/images`, file),

  deleteBrandCategoryImage: (id: string, imageKey: string) =>
    apiFetch<CatalogBrandCategory>(
      `/catalog/brand-categories/${id}/images/${encodeURIComponent(imageKey)}`,
      { method: 'DELETE', auth: true },
    ),

  deleteBrandCategory: (id: string) =>
    apiFetch<void>(`/catalog/brand-categories/${id}`, { method: 'DELETE', auth: true }),

  // All tradeable models for search — used by DeviceSearchBox (from admin-managed trade_in_devices table)
  listTradeInModels: () =>
    apiFetch<{ name: string; brand: string; category: string; tradeInMode?: 'auto' | 'manual_price' | 'unpriced' }[]>('/trade-in-devices'),
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  postcode?: string;
  role: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  brand: string;
  model: string;
  condition: string;
  price: number | null;
  comparePrice?: number;
  stock: number;
  images: string[];
  specs: Record<string, unknown>;
  attributes?: Record<string, string>;
  description?: string;
  rating: number;
  reviewCount: number;
  otherBrandId?: string;
  otherSubcategoryId?: string;
}

export interface OtherSubcategory {
  id: string;
  name: string;
}

export const otherSubcategoriesApi = {
  list: () => apiFetch<OtherSubcategory[]>('/other-subcategories'),
};

export interface CartItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
  slug: string;
  image?: string;
}

export interface CreateOrderPayload {
  items: { productId: string; quantity: number }[];
  shippingAddress: {
    name: string;
    address: string;
    city: string;
    postcode: string;
    country: string;
  };
  paymentMethod: string;
  paymentIntentId?: string;
  promoCode?: string;
  notes?: string;
}

export interface Order {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  shipping: number;
  shippingAddress: Record<string, string>;
  trackingNumber?: string;
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    price: number;
    product: { id: string; name: string; slug: string; images: string[]; condition: string };
  }[];
}

export interface TradeIn {
  id: string;
  reference: string;
  category: string;
  brand: string;
  model: string;
  condition: string;
  offerPrice: number;
  counterOffer?: number;
  status: string;
  fulfillment: string;
  createdAt: string;
}

export interface TradeInDetail extends TradeIn {
  specs: Record<string, string>;
  answers: Record<string, string>;
  customerNotes?: string;
  adminNotes?: string;
  trackingNumber?: string;
  images: string[];
  contact: Record<string, string>;
  storeId?: string;
  updatedAt: string;
}

export interface Repair {
  id: string;
  reference: string;
  deviceType: string;
  brand: string;
  model: string;
  issue: string;
  status: string;
  quote?: number;
  fulfillment: string;
  createdAt: string;
}

export interface RepairDetail extends Repair {
  issueNotes?: string;
  adminNotes?: string;
  trackingNumber?: string;
  images: string[];
  contact: { name: string; email: string; phone?: string; address?: string; postcode?: string };
  updatedAt: string;
}

export interface TradeInPayload {
  category: string;
  brand: string;
  model: string;
  specs: Record<string, string>;
  condition: string;
  answers: Record<string, string>;
  fulfillment: string;
  offerPrice: number;
  images: string[];
  customerNotes?: string;
  storeId?: string;
  contact: { name: string; email: string; phone: string; address?: string; postcode?: string };
}

export interface Review {
  id: string;
  productId: string;
  userId?: string;
  user?: { name: string };
  guestName?: string;
  rating: number;
  body: string;
  images: string[];
  isApproved: boolean;
  createdAt: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;        // computed from name.toLowerCase() — not stored in DB
  displayName?: string;
  description?: string;
  image?: string;
  images: string[];
  isActive: boolean;
  productCount: number;
  minPrice: number | null;
  modelCount: number;
  isSellable: boolean;
  isRepairable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogBrand {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogBrandCategory {
  id: string;
  brandId: string;
  brand: CatalogBrand;
  categoryId: string;
  category: CatalogCategory;
  /** Product-line display name. null = fall back to brand.name */
  alias: string | null;
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Returns the display name for a brand within a category context.
 *  e.g. Apple/Phones → "iPhone",  Apple/Tablets → "iPad",  Samsung → "Samsung"
 */
export function brandCategoryDisplayName(bc: CatalogBrandCategory): string {
  return bc.alias ?? bc.brand.name;
}

export interface RepairPayload {
  deviceType: string;
  brand: string;
  model: string;
  issue: string;
  issueNotes?: string;
  fulfillment: string;
  images: string[];
  contact: { name: string; email: string; phone: string; address?: string; postcode?: string };
}
