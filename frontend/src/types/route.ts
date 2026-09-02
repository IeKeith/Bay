export interface RouteStep {
  id: string;
  stepNumber: number | string;
  stallName: string;
  statusLabel: string;
  statusType: 'cooking' | 'ready' | 'swapped';
  itemDescription: string;
  meta: string;
  isEmergency?: boolean;
}

export interface HawkerRoutePlan {
  targetDestination: string;
  targetNote: string;
  countdown: string;
  countdownUrgent: boolean;
  steps: RouteStep[];
  totalCost: string;
  walkBuffer: string;
}
