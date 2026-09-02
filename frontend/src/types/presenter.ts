import type { IPresentationWidget, PresentationTarget, PresentationResult } from '@perxona/presenter-types';

export type PresenterElement = HTMLElement & IPresentationWidget;

export interface PresenterConfig {
  mock: boolean;
  chat: boolean;
  presenterUrl: string;
  defaults?: {
    avatarId: string;
    sceneId: string;
    voiceId: string;
  };
}

export type { PresentationTarget, PresentationResult };
