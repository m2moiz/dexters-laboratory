import { create } from "zustand";

import { samplePlan, type ExperimentPlan, type DexterScreen, type Paper } from "./mock-plan";

export type ReportHighlight = { key: string; reportId: string; start: number; end: number; text: string; correction?: string };

type DexterState = {
  currentScreen: DexterScreen;
  hypothesis: string;
  plan: ExperimentPlan;
  currentlySelectedPaper: Paper | null;
  visitedNodeIds: Set<string>;
  bookmarkedNodeIds: Set<string>;
  reportHighlights: ReportHighlight[];
  activeReference: string | null;
  setCurrentScreen: (screen: DexterScreen) => void;
  goToPreviousScreen: () => void;
  setHypothesis: (hypothesis: string) => void;
  selectPaper: (paper: Paper | null) => void;
  markNodeVisited: (paperId: string) => void;
  toggleNodeBookmark: (paperId: string) => void;
  setReportHighlights: (updater: ReportHighlight[] | ((current: ReportHighlight[]) => ReportHighlight[])) => void;
  setActiveReference: (paperId: string | null) => void;
  beginPlanGeneration: () => void;
};

const previousScreen: Partial<Record<DexterScreen, DexterScreen>> = {
  LITERATURE_GRAPH: "HYPOTHESIS_INPUT",
  PLAN_GENERATING: "LITERATURE_GRAPH",
  PLAN_VIEW: "LITERATURE_GRAPH",
};

export const useDexterStore = create<DexterState>((set) => ({
  currentScreen: "LOADING",
  hypothesis: samplePlan.hypothesis,
  plan: samplePlan,
  currentlySelectedPaper: null,
  visitedNodeIds: new Set(),
  bookmarkedNodeIds: new Set(),
  reportHighlights: [],
  activeReference: null,
  setCurrentScreen: (currentScreen) => set({ currentScreen }),
  goToPreviousScreen: () =>
    set((state) => ({
      currentScreen: previousScreen[state.currentScreen] ?? state.currentScreen,
    })),
  setHypothesis: (hypothesis) => set({ hypothesis }),
  selectPaper: (currentlySelectedPaper) => set({ currentlySelectedPaper }),
  markNodeVisited: (paperId) =>
    set((state) => {
      const visitedNodeIds = new Set(state.visitedNodeIds);
      visitedNodeIds.add(paperId);
      return { visitedNodeIds };
    }),
  toggleNodeBookmark: (paperId) =>
    set((state) => {
      const bookmarkedNodeIds = new Set(state.bookmarkedNodeIds);
      if (bookmarkedNodeIds.has(paperId)) bookmarkedNodeIds.delete(paperId);
      else bookmarkedNodeIds.add(paperId);
      return { bookmarkedNodeIds };
    }),
  setReportHighlights: (updater) =>
    set((state) => ({
      reportHighlights: typeof updater === "function" ? updater(state.reportHighlights) : updater,
    })),
  setActiveReference: (activeReference) => set({ activeReference }),
  beginPlanGeneration: () =>
    set({
      currentScreen: "PLAN_GENERATING",
    }),
}));