export const AI_AGENT_ROLE_CODE = "AI_AGENT";
export const AI_AGENT_EMPLOYEE_CODE = "AI-NA";
export const AI_AGENT_EMAIL = "na-ai@internal.invalid";
export const AI_AGENT_NAME = "NA AI";

export const AI_LIMITS = {
  maxQuestionChars: 4_000,
  maxTitleChars: 80,
  maxContextMessages: 16,
  maxContextChars: 24_000,
  maxToolRounds: 6,
  maxToolOutputChars: 24_000,
  maxResultRows: 20,
  maxMessagesPerMinute: 20,
} as const;
