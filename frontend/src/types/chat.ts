export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface AvatarOption {
  id: string;
  name: string;
  thumbnail?: string;
}

export interface VoiceOption {
  id: string;
  name: string;
}

export interface SceneOption {
  id: string;
  name: string;
}
