/** Bulle de conversation : l'étudiant à droite, le Dr Rodier à gauche. */
import type { ReactNode } from 'react';
import { Docteur } from './Docteur';

export function Bulle({ role, children }: { role: 'user' | 'assistant'; children: ReactNode }) {
  if (role === 'user') {
    return (
      <div className="apparait flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-white">{children}</div>
      </div>
    );
  }
  return (
    <div className="apparait flex items-start gap-2.5">
      <Docteur taille={32} className="mt-0.5 shrink-0" />
      <div className="min-w-0 max-w-[92%] rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5">{children}</div>
    </div>
  );
}
