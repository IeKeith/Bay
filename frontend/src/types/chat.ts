export interface FoodSuggestionAction {
  stallId: number;
  stallName: string;
  dishName: string;
  price: string;
  prepTime?: string;
  imageUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  suggestedFood?: FoodSuggestionAction;
  orderState?: 'idle' | 'added' | 'checked_out';
  queueNumber?: number;
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
