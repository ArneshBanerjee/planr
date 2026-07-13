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
  llmProvider: "gemini" | "claude-code" | null;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  applied?: string[];
  summary?: { created: number; removed: number; kept: number } | null;
}
