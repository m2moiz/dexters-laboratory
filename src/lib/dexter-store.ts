import { create } from "zustand";

import { samplePlan, type DexterPlan, type DexterScreen, type Paper } from "./mock-plan";

type DexterState = {
  currentScreen: DexterScreen;
  hypothesis: string;
  plan: DexterPlan;
  currentlySelectedPaper: Paper | null;
  setCurrentScreen: (screen: DexterScreen) => void;
  setHypothesis: (hypothesis: string) => void;
  selectPaper: (paper: Paper | null) => void;
  beginPlanGeneration: () => void;
};

export const useDexterStore = create<DexterState>((set) => ({
  currentScreen: "LOADING",
  hypothesis: samplePlan.hypothesis,
  plan: samplePlan,
  currentlySelectedPaper: null,
  setCurrentScreen: (currentScreen) => set({ currentScreen }),
  setHypothesis: (hypothesis) => set({ hypothesis }),
  selectPaper: (currentlySelectedPaper) => set({ currentlySelectedPaper }),
  beginPlanGeneration: () =>
    set({
      currentScreen: "PLAN_GENERATING",
      currentlySelectedPaper: null,
    }),
}));