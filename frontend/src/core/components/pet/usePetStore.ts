/**
 * usePetStore — Lightweight Zustand store backed by localStorage.
 *
 * Keys:
 *   sf.selectedPet   — string: active pet id (or empty)
 *   sf.petVisible    — "true" | "false": whether the PetRail is shown
 */

import { create } from 'zustand';

const LS_PET_ID  = 'sf.selectedPet';
const LS_PET_VIS = 'sf.petVisible';

interface PetStore {
  selectedPetId: string;
  petVisible: boolean;
  setSelectedPet: (id: string) => void;
  setPetVisible: (visible: boolean) => void;
}

function readPetId(): string {
  try { return localStorage.getItem(LS_PET_ID) ?? ''; } catch { return ''; }
}

function readPetVisible(): boolean {
  try {
    const v = localStorage.getItem(LS_PET_VIS);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export const usePetStore = create<PetStore>((set) => ({
  selectedPetId: readPetId(),
  petVisible: readPetVisible(),

  setSelectedPet: (id: string) => {
    try { localStorage.setItem(LS_PET_ID, id); } catch { /* ignore */ }
    set({ selectedPetId: id });
  },

  setPetVisible: (visible: boolean) => {
    try { localStorage.setItem(LS_PET_VIS, String(visible)); } catch { /* ignore */ }
    set({ petVisible: visible });
  },
}));
