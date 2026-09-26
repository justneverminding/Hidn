export type MockCategory =
  | "REGRET"
  | "CAREER"
  | "RELATIONSHIPS"
  | "FEAR"
  | "LONELINESS"
  | "AMBITION"
  | "FAMILY"
  | "MONEY"
  | "IDENTITY"
  | "UNCERTAINTY"
  | "JOY";

export interface MockConfession {
  id: string;
  reference: string;
  text: string;
  category: MockCategory;
  relativeTime: string;
  reactions: number;
  time: string;
}

export const MOCK_CONFESSIONS: MockConfession[] = [
  {
    id: "00417",
    reference: "// 00417",
    text: "I am proud of how far I have come, and still miss the version of me that did not know better.",
    category: "REGRET",
    relativeTime: "12 MIN AGO",
    reactions: 36,
    time: "2026-09-26T09:48:00Z",
  },
  {
    id: "00416",
    reference: "// 00416",
    text: "I keep calling it a season of learning because saying I am afraid to choose feels too honest.",
    category: "CAREER",
    relativeTime: "28 MIN AGO",
    reactions: 51,
    time: "2026-09-26T09:32:00Z",
  },
  {
    id: "00415",
    reference: "// 00415",
    text: "The person I want to impress most is the one I keep avoiding when the room gets quiet.",
    category: "RELATIONSHIPS",
    relativeTime: "41 MIN AGO",
    reactions: 29,
    time: "2026-09-26T09:19:00Z",
  },
  {
    id: "00414",
    reference: "// 00414",
    text: "Sometimes I rehearse bad news because being surprised by hope feels more dangerous.",
    category: "FEAR",
    relativeTime: "1 HR AGO",
    reactions: 43,
    time: "2026-09-26T09:00:00Z",
  },
  {
    id: "00413",
    reference: "// 00413",
    text: "I can be surrounded by people who love me and still feel like I am watching the evening through glass.",
    category: "LONELINESS",
    relativeTime: "2 HRS AGO",
    reactions: 64,
    time: "2026-09-26T08:03:00Z",
  },
  {
    id: "00412",
    reference: "// 00412",
    text: "I want a bigger life, but I do not want to become unavailable to the people who made this one possible.",
    category: "AMBITION",
    relativeTime: "3 HRS AGO",
    reactions: 72,
    time: "2026-09-26T07:12:00Z",
  },
  {
    id: "00411",
    reference: "// 00411",
    text: "I understand my family better now, which somehow makes the old arguments hurt in a new way.",
    category: "FAMILY",
    relativeTime: "5 HRS AGO",
    reactions: 24,
    time: "2026-09-26T05:44:00Z",
  },
  {
    id: "00410",
    reference: "// 00410",
    text: "I have learned how to look successful while quietly calculating what I can afford to lose.",
    category: "MONEY",
    relativeTime: "7 HRS AGO",
    reactions: 48,
    time: "2026-09-26T03:17:00Z",
  },
  {
    id: "00409",
    reference: "// 00409",
    text: "I keep editing myself for rooms I have not even entered yet.",
    category: "IDENTITY",
    relativeTime: "9 HRS AGO",
    reactions: 57,
    time: "2026-09-26T01:08:00Z",
  },
  {
    id: "00408",
    reference: "// 00408",
    text: "I said yes before I knew what it would cost, and the strange part is that I am glad I did.",
    category: "JOY",
    relativeTime: "11 HRS AGO",
    reactions: 81,
    time: "2026-09-25T23:02:00Z",
  },
];

export type FlowStep = "prove" | "confess" | "preview" | "success";
export type ProofState = "idle" | "preparing" | "generating" | "verifying" | "verified";

export interface MockFlowState {
  step: FlowStep;
  proofState: ProofState;
  thought: string;
  category: MockCategory;
  visibility: "public";
  error: string;
  createdId: string | undefined;
}

export const mockFlow: MockFlowState = {
  step: "prove",
  proofState: "idle",
  thought: "",
  category: "REGRET",
  visibility: "public",
  error: "",
  createdId: undefined,
};

export function isMockCategory(value: string): value is MockCategory {
  return [
    "REGRET",
    "CAREER",
    "RELATIONSHIPS",
    "FEAR",
    "LONELINESS",
    "AMBITION",
    "FAMILY",
    "MONEY",
    "IDENTITY",
    "UNCERTAINTY",
    "JOY",
  ].includes(value);
}

export function getMockConfession(id: string): MockConfession | undefined {
  return MOCK_CONFESSIONS.find((confession) => confession.id === id);
}

export function resetMockFlow(): void {
  mockFlow.step = "prove";
  mockFlow.proofState = "idle";
  mockFlow.thought = "";
  mockFlow.category = "REGRET";
  mockFlow.visibility = "public";
  mockFlow.error = "";
  mockFlow.createdId = undefined;
}

export function createMockConfession(): MockConfession {
  const id = `local-${Date.now().toString(36)}`;
  const confession: MockConfession = {
    id,
    reference: "// NEW",
    text: mockFlow.thought.trim(),
    category: mockFlow.category,
    relativeTime: "JUST NOW",
    reactions: 0,
    time: new Date().toISOString(),
  };

  MOCK_CONFESSIONS.unshift(confession);
  mockFlow.createdId = id;
  return confession;
}
