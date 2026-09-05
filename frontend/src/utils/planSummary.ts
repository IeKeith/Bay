import type { ChatMessage, FoodSuggestionAction } from '../types/chat';

export function selectedPlanItems(messages: ChatMessage[]) {
  return messages.filter((message) => message.suggestedFood &&
    (message.orderState === 'added' || message.orderState === 'submitting' || message.orderState === 'checked_out'));
}

export function validMinutes(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function foodTiming(food: FoodSuggestionAction) {
  const prep = validMinutes(food.prepMinutes);
  const queue = validMinutes(food.queueMinutes);
  const total = prep !== undefined && queue !== undefined ? prep + queue : undefined;
  return { prep, queue, total };
}

export function addSelection(messages: ChatMessage[], messageId: string): ChatMessage[] {
  return messages.map((message) => message.id === messageId && message.suggestedFood &&
    message.orderState !== 'checked_out' && message.orderState !== 'submitting' ? { ...message, orderState: 'added' } : message);
}
