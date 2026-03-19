/**
 * Platform AI label detection
 *
 * Scans the HTML/API response body for platform-injected AI content labels.
 * Returns true if any known AI label pattern is found.
 *
 * Supported signals:
 * - TikTok: "Contains AI-generated content"
 * - Meta (IG/FB): "Made with AI" / "AI-generated"
 * - YouTube: "Synthetic media" / "Altered or synthetic content"
 * - Twitter/X: "AI labels"
 */

export const AI_LABEL_PATTERNS = [
  /contains\s+ai[\-\s]?generated/i,
  /made\s+with\s+ai/i,
  /ai[\-\s]?generated\s+(content|image|video|audio|media)/i,
  /synthetic\s+media/i,
  /altered\s+or\s+synthetic/i,
  /created\s+with\s+ai/i,
  /generated\s+by\s+(ai|artificial\s+intelligence)/i,
  /computer[\-\s]generated\s+(image|media)/i,
  // TikTok JSON API fields
  /"aigc_label"\s*:\s*true/i,
  /"is_ai_generated"\s*:\s*true/i,
  /"ai_generate_type"\s*:\s*\d/i,
  // Meta graph API
  /"is_shared_to_feed"\s*:\s*true.*"ai_generated"/i,
]

/**
 * Scan a raw HTML / JSON response string for AI content labels.
 * Returns true if any pattern matches.
 */
export function detectAiLabel(responseText: string): boolean {
  return AI_LABEL_PATTERNS.some((pattern) => pattern.test(responseText))
}
