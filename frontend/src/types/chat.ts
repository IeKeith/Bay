export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
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
