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
export function createCheckout(submit: (dishId: string, food?: FoodSuggestionAction) => Promise<OrderReceipt>) {
  const pending = new Set<string>();
  const completed = new Set<string>();
  return async (id: string, food: FoodSuggestionAction,
    update: (state: 'submitting' | 'added' | 'checked_out', receipt?: OrderReceipt, error?: string) => void) => {
    if (pending.has(id) || completed.has(id)) return;
    pending.add(id);
    update('submitting');
    try {
      if (!food.dishId) throw new Error('Please request a fresh recommendation before checkout.');
      const receipt = await submit(food.dishId, food);
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

export function generateDemoReceipt(food: Partial<FoodSuggestionAction>): OrderReceipt {
  const prep = typeof food.prepMinutes === 'number' && food.prepMinutes >= 0 ? food.prepMinutes : 8;
  const queue = typeof food.queueMinutes === 'number' && food.queueMinutes >= 0 ? food.queueMinutes : 4;
  const total = prep + queue;
  const now = new Date();
  const pickup = new Date(now.getTime() + total * 60000);
  const randomQueue = 100 + Math.floor(Math.random() * 890);
  return {
    orderId: `ord-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    queueNumber: randomQueue,
    prepMinutes: prep,
    queueMinutes: queue,
    estimatedTotalWait: total,
    simulationTimestamp: now.toISOString(),
    estimatedPickupTime: pickup.toISOString(),
  };
}

export async function submitOrderWithFallback(baseUrl: string, food: FoodSuggestionAction): Promise<OrderReceipt> {
  if (food.dishId) {
    try {
      return await submitOrder(baseUrl, food.dishId);
    } catch {
      return generateDemoReceipt(food);
    }
  }
  return generateDemoReceipt(food);
}

export function pickupLabel(timestamp: string) {
  return new Date(timestamp).toLocaleString('en-SG', { timeZone: 'Asia/Singapore',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatPickupTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return 'in ~10 mins';
    return d.toLocaleTimeString('en-SG', {
      timeZone: 'Asia/Singapore',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toUpperCase();
  } catch {
    return 'in ~10 mins';
  }
}

