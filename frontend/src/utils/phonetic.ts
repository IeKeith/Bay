const PHONETIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(sate|sata|satey)\b/gi, 'Satay'],
  [/\b(sting\s*ray|sambal\s*ray)\b/gi, 'Sambal Stingray'],
  [/\b(hokkien\s*mee|hoki\s*mee)\b/gi, 'Hokkien Mee'],
  [/\b(prata|paratha)\b/gi, 'Roti Prata'],
  [/\b(sugarcane|sugar can)\b/gi, 'Sugar Cane Juice'],
  [/\b(chendol|cendol)\b/gi, 'Chendol'],
];

export function checkPhoneticPreview(raw: string): string | null {
  const matched: string[] = [];
  for (const [re, rep] of PHONETIC_REPLACEMENTS) {
    if (re.test(raw)) matched.push(rep);
  }
  return matched.length ? matched.join(', ') : null;
}
