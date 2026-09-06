/**
 * Cleans and converts conversational text into natural, spoken English for Perxona TTS.
 */
export function sanitizeForSpeech(text: string): string {
  if (!text) return '';

  return text
    // 1. Remove HTML comments / action tags (e.g. <!--RECOMMEND:...-->)
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    // 2. Remove markdown bold / italic / underscores
    .replace(/\*\*/g, '')
    .replace(/(^|[^\w])\*([^\*]+)\*([^\w]|$)/g, '$1$2$3')
    .replace(/_{1,2}(.*?)_{1,2}/g, '$1')
    // 3. Remove markdown headers or list bullets
    .replace(/^[\s#*>-]+/gm, '')
    // 4. Currency conversion
    // e.g. $9.00 or SGD 9.00 -> '9 dollars'
    .replace(/(?:SGD\s*\$?)?\b(\d+)\.00\b(?:\s*(?:SGD|dollars?))?/gi, '$1 dollars')
    // e.g. $9.50 -> '9 dollars and 50 cents'
    .replace(/(?:SGD\s*)?\$?\b(\d+)\.(\d{1,2})\b(?:\s*(?:SGD|dollars?))?/gi, (_, dollars, cents) => {
      if (cents === '00' || cents === '0') return `${dollars} dollars`;
      const paddedCents = cents.length === 1 ? `${cents}0` : cents;
      return `${dollars} dollars and ${paddedCents} cents`;
    })
    .replace(/(?:SGD\s*)?\$(\d+)\b(?:\s*(?:SGD|dollars?))?/gi, '$1 dollars')
    .replace(/\b(\d+)\s*SGD\b/gi, '$1 dollars')
    .replace(/\bSGD\b/gi, '')
    // 5. Queue / Number conversions
    // e.g. 'Queue #657' -> 'Queue number 657', '#42' -> 'number 42'
    .replace(/\bQueue\s*#\s*(\d+)\b/gi, 'Queue number $1')
    .replace(/#\s*(\d+)\b/g, 'number $1')
    .replace(/#/g, '')
    // 6. Approximate '~' wait time conversions
    // e.g. '~4 mins' -> 'about 4 minutes', '~10' -> 'about 10'
    .replace(/~\s*(\d+)\s*mins?\b/gi, 'about $1 minutes')
    .replace(/~\s*(\d+)\b/g, 'about $1')
    .replace(/~/g, '')
    // 7. Unit abbreviations & symbols
    .replace(/\bmins\b/gi, 'minutes')
    .replace(/\bmin\b/gi, 'minute')
    .replace(/&/g, 'and')
    // 8. Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}