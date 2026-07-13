export interface GoalDto {
  id: number;
  name: string;
  color: string;
  priority: number;
  deadline: string | null;
  hoursPerWeek: number;
}

export interface BlockDto {
  id: number;
  goalId: number;
  title: string;
  subject: string | null;
  start: string;
  end: string;
  status: "planned" | "done" | "skipped";
  locked: boolean;
}

export interface FixedEventDto {
  id: number;
  title: string;
  start: string;
  end: string;
  source: "user" | "google";
}

export interface AppState {
  goals: GoalDto[];
  blocks: BlockDto[];
  fixedEvents: FixedEventDto[];
  googleConnected: boolean;
  llmProvider: LlmProvider | null;
  llmReady: boolean;
}

export type LlmProvider = "openai" | "gemini" | "anthropic" | "claude-code";

export interface ProviderStatus {
  provider: LlmProvider | null;
  ready: boolean;
  claudeCodeAvailable: boolean;
  keysSet: { openai: boolean; gemini: boolean; anthropic: boolean };
  models: Record<LlmProvider, string>;
  defaults: Record<LlmProvider, string>;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  applied?: string[];
  summary?: { created: number; removed: number; kept: number } | null;
}
