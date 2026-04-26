import { create } from "zustand";

import { fetchPlanFromBackend } from "./backend-adapter";
import { samplePlan, type ExperimentPlan, type DexterScreen, type Paper } from "./mock-plan";

export type ReportHighlight = { key: string; reportId: string; start: number; end: number; text: string; correction?: string };

export type PlanFetchStatus = "idle" | "loading" | "success" | "error";

type DexterState = {
  currentScreen: DexterScreen;
  hypothesis: string;
  plan: ExperimentPlan;
  currentlySelectedPaper: Paper | null;
  visitedNodeIds: Set<string>;
  bookmarkedNodeIds: Set<string>;
  reportHighlights: ReportHighlight[];
  activeReference: string | null;
  planFetchStatus: PlanFetchStatus;
  apiError: string | null;
  apiBaseUrl: string;
  setCurrentScreen: (screen: DexterScreen) => void;
  goToPreviousScreen: () => void;
  setHypothesis: (hypothesis: string) => void;
  selectPaper: (paper: Paper | null) => void;
  markNodeVisited: (paperId: string) => void;
  toggleNodeBookmark: (paperId: string) => void;
  setReportHighlights: (updater: ReportHighlight[] | ((current: ReportHighlight[]) => ReportHighlight[])) => void;
  setActiveReference: (paperId: string | null) => void;
  beginPlanGeneration: () => void;
  fetchPlan: (hypothesis: string) => Promise<void>;
  resetPlanFetch: () => void;
};

const previousScreen: Partial<Record<DexterScreen, DexterScreen>> = {
  LITERATURE_GRAPH: "HYPOTHESIS_INPUT",
  PLAN_GENERATING: "LITERATURE_GRAPH",
  PLAN_VIEW: "LITERATURE_GRAPH",
};

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "https://ai-scientist-ruddy.vercel.app";

export const useDexterStore = create<DexterState>((set, get) => ({
  currentScreen: "LOADING",
  hypothesis: samplePlan.hypothesis,
  plan: samplePlan,
  currentlySelectedPaper: null,
  visitedNodeIds: new Set(),
  bookmarkedNodeIds: new Set(),
  reportHighlights: [],
  activeReference: null,
  planFetchStatus: "idle",
  apiError: null,
  apiBaseUrl: DEFAULT_API_BASE_URL,
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
  fetchPlan: async (hypothesis) => {
    set({ planFetchStatus: "loading", apiError: null });
    try {
      const plan = await fetchPlanFromBackend(hypothesis, get().apiBaseUrl);
      set({ plan, planFetchStatus: "success" });
    } catch (error) {
      set({
        planFetchStatus: "error",
        apiError: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
  resetPlanFetch: () => set({ planFetchStatus: "idle", apiError: null }),
}));