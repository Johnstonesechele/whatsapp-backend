/**
 * Strips markdown formatting from a string, returning clean plain text.
 * Handles: **bold**, *italic*, __bold__, _italic_, `code`, ### headings,
 * [text](url) links, and leading bullet markers.
 */
export function stripMarkdown(text: string): string {
  if (!text) return text

  return text
    // Remove markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bold+italic ***text*** or ___text___
    .replace(/\*{3}([^*]+)\*{3}/g, '$1')
    .replace(/_{3}([^_]+)_{3}/g, '$1')
    // Remove bold **text** or __text__
    .replace(/\*{2}([^*]+)\*{2}/g, '$1')
    .replace(/_{2}([^_]+)_{2}/g, '$1')
    // Remove italic *text* or _text_ (but not mid-word underscores)
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    // Remove inline code `text`
    .replace(/`([^`]+)`/g, '$1')
    // Remove heading markers ### text → text
    .replace(/^#{1,6}\s+/gm, '')
    // Remove leading bullet/dash markers at start of line
    .replace(/^[•\-\*]\s+/gm, '')
    // Remove numbered list markers at start of line
    .replace(/^\d+\.\s+/gm, '')
    // Clean up excessive whitespace / blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Splits an AI response into an array of insight bullet points,
 * stripping markdown from each one.
 */
export function parseInsights(text: string): string[] {
  if (!text) return []
  return text
    .split('\n')
    .map(line => stripMarkdown(line))
    .filter(line => line.length > 10)
}
