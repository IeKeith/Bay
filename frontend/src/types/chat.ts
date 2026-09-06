export interface FoodSuggestionAction {
  dishId?: string;
  simulationTimestamp?: string;
  estimatedPickupTime?: string;
  stallId: number;
  stallName: string;
  dishName: string;
  price: string;
  prepTime?: string;
  prepMinutes?: number;
  queueMinutes?: number;
  estimatedTotalWait?: number;
  dietaryTags?: string[];
  imageUrl?: string;
  reason?: string;
  portionNote?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  suggestedFood?: FoodSuggestionAction;
  orderState?: 'idle' | 'added' | 'submitting' | 'checked_out';
  queueNumber?: number;
  orderId?: string;
  estimatedPickupTime?: string;
  checkoutError?: string;
}

export interface AvatarOption {
  id: string;
  name: string;
  role?: string;
  thumbnail?: string;
  voice_id?: string;
  voice_name?: string;
  lod_urls?: Record<string, string>;
}

export interface VoiceOption {
  id: string;
  name: string;
}

export interface SceneOption {
  id: string;
  name: string;
}
