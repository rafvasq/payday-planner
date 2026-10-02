import { format } from 'date-fns';

export function generateLlmPrompt(jsonStr: string, context?: string): string {
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  
  let prompt = `Here is my current financial blueprint in JSON format. Today's date is ${dateStr}.

Please act as an expert financial planner. Review my upcoming cashflow for the next 30 days and confirm if my planned transfers and bill payments are safe, or if you foresee any negative balances. You may use a code execution tool to project the daily balances based on the events provided.

Core assumptions of the projection engine:
- Credit card interest and statement timing are not modeled. Cards are plain balances. You must not claim interest savings or invent due dates.
- When quoting balances, debts, or transfer amounts, you MUST use the exact dollar-and-cent figures provided in the ledger or tool outputs (which provide precomputed deltas). Never round, estimate, or abbreviate (e.g., write $4,505.32, never $4,500 or 4.5k). Derived math is strictly forbidden.
`;

  if (context && context.trim().length > 0) {
    prompt += `\nAdditional context for this week:\n${context.trim()}\n`;
  }

  prompt += `\nBlueprint JSON:\n${jsonStr}`;
  return prompt;
}
