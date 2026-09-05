import type { FoodSuggestionAction } from '../types/chat';

export interface OrderReceipt {
  orderId: string;
  queueNumber: number;
  estimatedPickupTime: string;
  simulationTimestamp: string;
  prepMinutes: number;
  queueMinutes: number;
  estimatedTotalWait: number;
}

// Synchronous guards cover clicks before React has rendered the pending state.
export function createCheckout(submit: (dishId: string) => Promise<OrderReceipt>) {
  const pending = new Set<string>();
  const completed = new Set<string>();
  return async (id: string, food: FoodSuggestionAction,
    update: (state: 'submitting' | 'added' | 'checked_out', receipt?: OrderReceipt, error?: string) => void) => {
    if (pending.has(id) || completed.has(id)) return;
    pending.add(id);
    update('submitting');
    try {
      if (!food.dishId) throw new Error('Please request a fresh recommendation before checkout.');
      const receipt = await submit(food.dishId);
      completed.add(id);
      update('checked_out', receipt);
      return receipt;
    } catch (error) {
      update('added', undefined, error instanceof Error ? error.message : 'Checkout failed. Please retry.');
    } finally {
      pending.delete(id);
    }
  };
}

export async function submitOrder(baseUrl: string, dishId: string): Promise<OrderReceipt> {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dishId }),
  });
  if (!response.ok) throw new Error('Checkout failed. Please try again.');
  return response.json();
}

export function pickupLabel(timestamp: string) {
  return new Date(timestamp).toLocaleString('en-SG', { timeZone: 'Asia/Singapore',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
