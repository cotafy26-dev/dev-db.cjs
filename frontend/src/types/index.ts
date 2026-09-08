export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
  companyId: string;
  companyName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  notes?: string | null;
  balance?: number;
}

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  price: string | number;
  cost?: string | number | null;
  stock: string | number;
  minStock: string | number;
  unit: string;
  active: boolean;
}

export interface SaleItem {
  id: string;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  total: string | number;
}

export interface Sale {
  id: string;
  number: number;
  status: string;
  paymentMethod?: string | null;
  total: string | number;
  paidAmount: string | number;
  soldAt: string;
  customer?: { id: string; name: string } | null;
  items: SaleItem[];
}

export interface FinanceTransaction {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amount: string | number;
  description: string;
  occurredAt: string;
  category?: { name: string } | null;
}

export interface Overview {
  today: { sales: number; revenue: number; received: number };
  month: { sales: number; revenue: number; income: number; expense: number; net: number };
  receivableTotal: number;
  payableTotal: number;
  lowStockCount: number;
  lowStock: { id: string; name: string; stock: number; minStock: number; unit: string }[];
  dueTomorrowCount: number;
  upcomingEventsCount: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pages: number };
}

export interface ChatMessageView {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM';
  content: string;
  toolName?: string | null;
  createdAt: string;
}
