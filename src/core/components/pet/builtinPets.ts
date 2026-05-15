/** Built-in pets — defined locally, no API or network required. */

export interface BuiltinPet {
  id: string;
  displayName: string;
  description: string;
  glyph: string;
  accent: string;
}

export const BUILTIN_PETS: BuiltinPet[] = [
  { id: 'builtin:angel',   displayName: 'Angel',   description: 'A tiny chibi angel in white clothes with small wings.',  glyph: '👼', accent: '#A855F7' },
  { id: 'builtin:fox',     displayName: 'Fox',     description: '狡黠的小狐狸，总有妙计。',                                glyph: '🦊', accent: '#F97316' },
  { id: 'builtin:robot',   displayName: 'Robot',   description: '勤劳的小机器人，效率第一。',                              glyph: '🤖', accent: '#3B82F6' },
  { id: 'builtin:nyako',   displayName: 'Nyako',   description: '沉稳的小猫，默默陪伴。',                                  glyph: '🐱', accent: '#10B981' },
  { id: 'builtin:tux',     displayName: 'Tux',     description: 'A tiny pixel penguin, free and easy.',                   glyph: '🐧', accent: '#06B6D4' },
  { id: 'builtin:stella',  displayName: 'Stella',  description: '来自星空的小精灵，闪闪发光。',                            glyph: '⭐', accent: '#EAB308' },
  { id: 'builtin:boo',     displayName: 'Boo',     description: '友善的小幽灵，出没于深夜。',                              glyph: '👻', accent: '#8B5CF6' },
];

export function getBuiltinPet(id: string): BuiltinPet | undefined {
  return BUILTIN_PETS.find((p) => p.id === id);
}

export function isBuiltinPet(id: string): boolean {
  return id.startsWith('builtin:');
}
