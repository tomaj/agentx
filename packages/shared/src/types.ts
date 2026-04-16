import type { ExecutionEventType } from "./enums";

export interface Actor {
  userId: string;
  orgId: string;
  roles: string[];
}

export interface ExecutionEvent {
  id: string;
  executionId: string;
  seq: number;
  timestamp: Date;
  type: ExecutionEventType;
  payload: Record<string, unknown>;
}
