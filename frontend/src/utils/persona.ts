import type { AvatarOption } from '../types/chat';

export function resolvePersonaName(avatars: AvatarOption[], selectedAvatarId: string): string {
  const selectedObj = avatars.find((a) => a.id === selectedAvatarId);
  if (!selectedObj) return 'Mei';

  // Extract name from role prefix if present (e.g. "Meeks - Friendly Guide" -> "Meeks")
  if (selectedObj.role && selectedObj.role.includes(' - ')) {
    const roleName = selectedObj.role.split(' - ')[0].trim();
    if (roleName) return roleName;
  }

  const name = selectedObj.name || '';
  if (name.includes('Raj') || name.includes('cc069a02')) return 'Raj';
  if (name.includes('Host') || name.includes('cc069a03')) return 'Host';
  if (name.includes('Meeks') || name.includes('cc051')) return 'Meeks';
  if (name.includes('Emojiboy') || name.includes('cc075')) return 'Emojiboy';
  if (name.includes('Aya') || name.includes('cc046')) return 'Aya';
  return 'Mei';
}

export function buildWelcomeMessage(personaName: string): string {
  return `Welcome to Satay by the Bay! It's 7:00 PM now. I'm ${personaName}, your culinary route guide. Tell me your party size, dietary needs, or budget, and I'll route your orders so you arrive at the 7:45 PM Supertree Light Show with time to spare!`;
}
