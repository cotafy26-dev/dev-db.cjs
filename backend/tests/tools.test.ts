import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context';
import { allTools } from '../src/ai/tools';
import { toolSchemasForCurrentRole, executeTool } from '../src/ai/tools/registry';

const ctx = (role: 'ADMIN' | 'SELLER' | 'FINANCE') => ({
  companyId: 'co_1',
  userId: 'u_1',
  role,
  source: 'test',
  requestId: 'r',
});

describe('Catalogo de ferramentas da IA (secao 17)', () => {
  it('todas as tools tem nome, descricao e JSON Schema de objeto', () => {
    for (const t of allTools()) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(3);
    }
  });

  it('inclui as ferramentas exigidas pela spec', () => {
    const names = new Set(allTools().map((t) => t.name));
    for (const required of [
      'create_customer', 'find_customer', 'update_customer', 'list_customers', 'customer_history',
      'create_product', 'find_product', 'search_product',
      'add_stock', 'remove_stock', 'adjust_stock', 'get_stock', 'low_stock_products', 'stock_history',
      'create_sale', 'get_sale', 'list_sales', 'cancel_sale', 'sales_summary',
      'create_income', 'create_expense', 'create_receivable', 'create_payable', 'register_payment',
      'get_cash_flow', 'get_balance', 'get_receivables', 'get_payables', 'get_overdue_accounts',
      'create_appointment', 'update_appointment', 'cancel_appointment', 'list_appointments',
      'get_today_appointments', 'get_upcoming_appointments',
      'get_sales_report', 'get_financial_report', 'get_profit_report', 'get_inventory_report',
      'get_customer_report', 'get_seller_report',
      'send_message',
    ]) {
      expect(names.has(required), `falta a tool ${required}`).toBe(true);
    }
  });

  it('schemas expostos ao modelo respeitam o perfil (SELLER nao ve tools financeiras)', () => {
    runWithContext(ctx('SELLER'), () => {
      const names = toolSchemasForCurrentRole().map((s) => s.name);
      expect(names).toContain('create_sale');
      expect(names).not.toContain('create_expense');
      expect(names).not.toContain('cancel_sale');
    });
    runWithContext(ctx('ADMIN'), () => {
      const names = toolSchemasForCurrentRole().map((s) => s.name);
      expect(names).toContain('create_expense');
      expect(names).toContain('cancel_sale');
    });
  });

  it('executeTool nega ferramenta sem permissao do perfil (secao 30)', async () => {
    await runWithContext(ctx('SELLER'), async () => {
      const res = await executeTool('create_expense', { amount: 10, description: 'x' });
      expect(res.status).toBe('REJECTED');
      expect((res.result as { denied?: boolean }).denied).toBe(true);
    });
  });

  it('executeTool exige confirmacao em operacao destrutiva (secao 18)', async () => {
    await runWithContext(ctx('ADMIN'), async () => {
      const res = await executeTool('cancel_sale', { number: 1 });
      expect(res.status).toBe('REJECTED');
      expect((res.result as { needsConfirmation?: boolean }).needsConfirmation).toBe(true);
    });
  });
});
