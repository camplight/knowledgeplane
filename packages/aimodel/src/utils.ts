/**
 * Strip markdown code fences from an AI response before JSON parsing.
 * Handles ```json ... ```, ``` ... ```, and plain JSON strings.
 */
export function parseJsonResponse<T = any>(content: string): T {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(stripped) as T;
}
