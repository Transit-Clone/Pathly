/** Hat concepts for approval. Uses the shipped Pathling body and faces, not a new mascot. */
import { beanAvatarSvg, normalizeBeanAvatar } from './beanAvatar';

export const BEAN_HAT_CONCEPTS = [
  { id: 'none', label: 'No hat', svg: '' },
  { id: 'cap', label: 'Cap', svg: '<g transform="translate(146 0) scale(-1 1)"><path d="M43 36C43 20 55 12 73 12C91 12 103 22 103 36Z" fill="#47678B"/><path d="M44 34Q73 29 101 33C119 32 122 39 112 42Q96 44 85 38Q64 39 44 40Q40 40 44 34Z" fill="#344F72"/></g>' },
] as const;

export function beanHatPreviewSvg(value: unknown, hatId: unknown = 'none'): string {
  const hat = BEAN_HAT_CONCEPTS.find((option) => option.id === hatId) ?? BEAN_HAT_CONCEPTS[0];
  const config = normalizeBeanAvatar(value);
  // Keep the saved hair choice intact, but tuck it away beneath a hat in the preview.
  return beanAvatarSvg(hat.id === 'none' ? config : { ...config, hair: 'none' }).replace('</svg>', `${hat.svg}</svg>`);
}
