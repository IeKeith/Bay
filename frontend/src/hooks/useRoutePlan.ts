import { useState, useCallback } from 'react';
import type { HawkerRoutePlan } from '../types/route';

const DEFAULT_HALAL_PLAN: HawkerRoutePlan = {
  targetDestination: 'Supertree Light Show (7:45 PM)',
  targetNote: '8–10 min walk from Satay by the Bay',
  countdown: '38 mins remaining',
  countdownUrgent: false,
  steps: [
    {
      id: 'step-1',
      stepNumber: 1,
      stallName: 'Stall 1: City Satay',
      statusLabel: 'Grilling 🔥',
      statusType: 'cooking',
      itemDescription: '10x Chicken Satay ($9.00) + Ketupat ($2.00) • Halal',
      meta: 'Prep: ~15 mins • Wait: ~20 mins',
    },
    {
      id: 'step-2',
      stepNumber: 2,
      stallName: 'Stall 5: Marina Refreshments',
      statusLabel: 'Ready for Pickup ⚡',
      statusType: 'ready',
      itemDescription: 'Fresh Sugar Cane Juice with Lemon ($3.50)',
      meta: 'Collect immediately while Satay grills',
    },
  ],
  totalCost: 'SGD $14.50',
  walkBuffer: '🚶 8m walk + 15m dining safe',
};

const VEGETARIAN_PLAN: HawkerRoutePlan = {
  targetDestination: 'Supertree Light Show (7:45 PM)',
  targetNote: '8–10 min walk from Satay by the Bay',
  countdown: '45 mins remaining',
  countdownUrgent: false,
  steps: [
    {
      id: 'step-1',
      stepNumber: 1,
      stallName: 'Stall 4: Garden Greens & Prata',
      statusLabel: 'On Griddle 🍳',
      statusType: 'cooking',
      itemDescription: 'Crispy Plain Prata (2 pcs with Dhal) ($3.50) • Halal & Nut-Free',
      meta: 'Prep: ~5 mins • 100% Plant-friendly',
    },
    {
      id: 'step-2',
      stepNumber: 2,
      stallName: 'Stall 5: Marina Refreshments',
      statusLabel: 'Instant Pickup ⚡',
      statusType: 'ready',
      itemDescription: 'Fresh Thai Coconut ($5.50)',
      meta: 'Zero wait • Hydrating & Nut-Free',
    },
  ],
  totalCost: 'SGD $9.00',
  walkBuffer: '🚶 8m walk + 20m relaxed dining',
};

const REPLANNED_EMERGENCY_PLAN: HawkerRoutePlan = {
  targetDestination: 'Supertree Light Show (7:45 PM)',
  targetNote: '⚡ Emergency Fast Route — Preserves 7:45 PM Light Show!',
  countdown: '22 mins remaining ⚠️',
  countdownUrgent: true,
  steps: [
    {
      id: 'step-1',
      stepNumber: '⚡',
      stallName: 'Stall 4: Garden Greens & Prata',
      statusLabel: 'Swapped & Cooking 🔥',
      statusType: 'swapped',
      itemDescription: '2x Cheese & Mushroom Prata with Dhal ($10.00)',
      meta: 'Prep: ~6 mins (Saved 14 mins!)',
      isEmergency: true,
    },
    {
      id: 'step-2',
      stepNumber: 2,
      stallName: 'Stall 5: Marina Refreshments',
      statusLabel: 'Ready for Pickup ⚡',
      statusType: 'ready',
      itemDescription: 'Fresh Sugar Cane Juice ($3.50)',
      meta: 'Instant pickup • Vegan & Refreshing',
    },
  ],
  totalCost: 'SGD $13.50',
  walkBuffer: '🚶 8m walk preserved! Arrive safely at 7:35 PM',
};

export function useRoutePlan() {
  const [routePlan, setRoutePlan] = useState<HawkerRoutePlan>(DEFAULT_HALAL_PLAN);

  const updateFromText = useCallback((text: string) => {
    const lower = text.toLowerCase();

    if (
      lower.includes('replan') ||
      lower.includes('delay') ||
      lower.includes('swap') ||
      lower.includes('surge') ||
      lower.includes('pratas with dhal') ||
      lower.includes('cheese & mushroom prata')
    ) {
      setRoutePlan(REPLANNED_EMERGENCY_PLAN);
      return;
    }

    if (
      lower.includes('vegetarian') ||
      lower.includes('peanut') ||
      lower.includes('plant-based') ||
      lower.includes('flower dome')
    ) {
      setRoutePlan(VEGETARIAN_PLAN);
      return;
    }

    if (
      lower.includes('satay') ||
      lower.includes('chicken') ||
      lower.includes('halal') ||
      lower.includes('family')
    ) {
      setRoutePlan(DEFAULT_HALAL_PLAN);
    }
  }, []);

  return { routePlan, updateFromText, setRoutePlan };
}
