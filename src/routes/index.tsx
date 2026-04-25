import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useDexterStore } from "@/lib/dexter-store";
import { exampleHypotheses, type Paper, type PlanSection } from "@/lib/mock-plan";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dexter | AI Experiment Plan Generator" },
      {
        name: "description",
        content: "Dexter turns research hypotheses into runnable experiment plans.",
      },
      { property: "og:title", content: "Dexter | AI Experiment Plan Generator" },
      {
        property: "og:description",
        content: "From hypothesis to runnable experiment with AI-assisted planning.",
      },
    ],
  }),
  component: DexterApp,
});

const screenClass = "min-h-screen bg-background text-foreground";
const nodeSize = (influence: number) => 78 + influence * 70;

function DexterApp() {
  const currentScreen = useDexterStore((state) => state.currentScreen);

  if (currentScreen === "LOADING") return <LoadingScreen />;
  if (currentScreen === "HYPOTHESIS_INPUT") return <HypothesisInputScreen />;
  if (currentScreen === "LITERATURE_GRAPH") return <LiteratureGraphScreen />;
  if (currentScreen === "PLAN_GENERATING") return <PlanGeneratingScreen />;
  return <PlanViewScreen />;
}

function LoadingScreen() {
  const setCurrentScreen = useDexterStore((state) => state.setCurrentScreen);
  const [visibleLetters, setVisibleLetters] = useState(0);

  useEffect(() => {
    const letterTimer = window.setInterval(() => {
      setVisibleLetters((current) => Math.min(current + 1, 6));
    }, 180);
    const screenTimer = window.setTimeout(() => setCurrentScreen("HYPOTHESIS_INPUT"), 2000);
    return () => {
      window.clearInterval(letterTimer);
      window.clearTimeout(screenTimer);
    };
  }, [setCurrentScreen]);

  return (
    <main className={cn(screenClass, "flex items-center justify-center px-6")}> 
      <div className="text-center">
        <h1 className="font-display text-[72px] font-semibold leading-none text-primary">
          {"DEXTER".split("").map((letter, index) => (
            <span
              key={letter + index}
              className={cn(
                "inline-block transition-all duration-300",
                index < visibleLetters ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
              )}
            >
              {letter}
            </span>
          ))}
        </h1>
        <p className="mt-5 text-base font-normal">From hypothesis to runnable experiment</p>
      </div>
    </main>
  );
}

function HypothesisInputScreen() {
  const hypothesis = useDexterStore((state) => state.hypothesis);
  const setHypothesis = useDexterStore((state) => state.setHypothesis);
  const setCurrentScreen = useDexterStore((state) => state.setCurrentScreen);

  return (
    <main className={cn(screenClass, "flex items-center justify-center px-6 py-12")}> 
      <section className="w-full max-w-5xl text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-primary">
          DEXTER / HYPOTHESIS INTAKE
        </p>
        <h1 className="mx-auto mt-5 max-w-4xl font-display text-5xl font-semibold leading-tight text-foreground">
          What do you want to test?
        </h1>
        <div className="mx-auto mt-10 max-w-[720px] text-left">
          <Textarea
            value={hypothesis}
            onChange={(event) => setHypothesis(event.target.value)}
            rows={6}
            placeholder="Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by 15 percentage points..."
            className="dexter-shadow min-h-[180px] rounded-none border-2 border-industrial bg-card p-5 text-base leading-7 outline-none focus-visible:ring-0"
          />
          <p className="mt-5 text-sm text-muted-foreground">
            Be specific. State your intervention, measurable outcome, and threshold.
          </p>
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {Object.entries(exampleHypotheses).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => setHypothesis(value)}
              className="border-2 border-industrial bg-secondary px-4 py-2 font-mono text-xs font-bold uppercase transition-transform hover:-translate-y-0.5"
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          onClick={() => setCurrentScreen("LITERATURE_GRAPH")}
          className="dexter-cta-shadow mt-10 h-16 rounded-none border-2 border-industrial bg-accent px-10 font-mono text-base font-bold uppercase text-accent-foreground hover:bg-accent hover:shadow-[8px_8px_0px_var(--industrial)]"
        >
          GENERATE PLAN
        </Button>
      </section>
    </main>
  );
}

function LiteratureGraphScreen() {
  const hypothesis = useDexterStore((state) => state.hypothesis);
  const plan = useDexterStore((state) => state.plan);
  const selectedPaper = useDexterStore((state) => state.currentlySelectedPaper);
  const selectPaper = useDexterStore((state) => state.selectPaper);
  const beginPlanGeneration = useDexterStore((state) => state.beginPlanGeneration);

  const nodes = useMemo<Node[]>(
    () =>
      plan.papers.map((paper) => ({
        id: paper.id,
        position: { x: paper.x, y: paper.y },
        data: { label: paper.title },
        style: {
          width: 112,
          height: 112,
          borderRadius: 999,
          border: "3px solid var(--industrial)",
          background: paper.id === selectedPaper?.id ? "var(--accent)" : "var(--card)",
          color: paper.id === selectedPaper?.id ? "var(--accent-foreground)" : "var(--foreground)",
          boxShadow: "4px 4px 0px var(--industrial)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          textAlign: "center",
          padding: 12,
        },
      })),
    [plan.papers, selectedPaper?.id],
  );

  const edges = useMemo<Edge[]>(
    () =>
      plan.edges.map((edge) => ({
        ...edge,
        type: "straight",
        style: { stroke: "var(--industrial)", strokeWidth: 3 },
      })),
    [plan.edges],
  );

  const onNodeClick: NodeMouseHandler = (_, node) => {
    selectPaper(plan.papers.find((paper) => paper.id === node.id) ?? null);
  };

  return (
    <main className={screenClass}>
      <header className="flex h-[60px] items-center justify-between border-b-2 border-industrial bg-background px-5">
        <p className="line-clamp-1 pr-6 font-mono text-xs font-bold uppercase text-primary">
          {hypothesis}
        </p>
        <Button
          type="button"
          onClick={beginPlanGeneration}
          className="h-10 shrink-0 rounded-none border-2 border-industrial bg-accent px-5 font-mono text-xs font-bold uppercase text-accent-foreground hover:bg-accent"
        >
          Continue to Plan
        </Button>
      </header>
      <section className="relative h-[calc(100vh-60px)] overflow-hidden">
        <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView nodesDraggable={false}>
          <Background color="var(--industrial)" gap={28} size={1} />
          <Controls className="border-2 border-industrial bg-card" />
        </ReactFlow>
        <PaperPanel paper={selectedPaper} onClose={() => selectPaper(null)} />
      </section>
    </main>
  );
}

function PaperPanel({ paper, onClose }: { paper: Paper | null; onClose: () => void }) {
  return (
    <aside
      className={cn(
        "absolute right-0 top-0 h-full w-full max-w-[30%] min-w-[360px] border-l-2 border-industrial bg-card p-7 transition-transform duration-300",
        paper ? "translate-x-0" : "translate-x-full",
      )}
    >
      {paper && (
        <div>
          <button
            type="button"
            onClick={onClose}
            className="mb-8 border-2 border-industrial px-3 py-1 font-mono text-xs font-bold uppercase"
          >
            Close
          </button>
          <p className="font-mono text-xs font-bold uppercase text-primary">Paper Node / {paper.id}</p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight">{paper.title}</h2>
          <p className="mt-5 font-mono text-xs font-bold uppercase">
            {paper.authors} / {paper.year}
          </p>
          <p className="mt-6 text-base leading-7 text-muted-foreground">{paper.abstract}</p>
        </div>
      )}
    </aside>
  );
}

function PlanGeneratingScreen() {
  const plan = useDexterStore((state) => state.plan);
  const setCurrentScreen = useDexterStore((state) => state.setCurrentScreen);
  const [visibleItems, setVisibleItems] = useState(1);

  useEffect(() => {
    const feedTimer = window.setInterval(() => {
      setVisibleItems((current) => Math.min(current + 1, plan.activity.length));
    }, 1500);
    const screenTimer = window.setTimeout(() => setCurrentScreen("PLAN_VIEW"), 12000);
    return () => {
      window.clearInterval(feedTimer);
      window.clearTimeout(screenTimer);
    };
  }, [plan.activity.length, setCurrentScreen]);

  return (
    <main className={cn(screenClass, "grid min-h-screen grid-cols-1 lg:grid-cols-[60%_40%]")}> 
      <section className="border-r-2 border-industrial p-8 lg:p-12">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">
          DEXTER / GENERATING PLAN
        </p>
        <h1 className="mt-4 font-display text-5xl font-semibold">Experiment skeleton</h1>
        <div className="mt-10 space-y-4">
          {plan.sections.map((section, index) => {
            const filled = index < visibleItems;
            return (
              <Card
                key={section.id}
                className={cn(
                  "dexter-shadow rounded-none border-2 border-industrial p-5",
                  filled ? "bg-card" : "bg-muted text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-semibold">{section.title}</h2>
                  <span className="font-mono text-xs font-bold uppercase">{section.label}</span>
                </div>
                <p className="mt-4 text-sm leading-6">
                  {filled ? section.content[0] : "████████████████████ ███████████████ ███████████"}
                </p>
              </Card>
            );
          })}
        </div>
      </section>
      <section className="bg-primary p-8 text-primary-foreground lg:p-12">
        <h2 className="font-display text-4xl font-semibold">Activity feed</h2>
        <div className="mt-10 space-y-4 font-mono text-sm font-bold uppercase leading-7">
          {plan.activity.slice(0, visibleItems).map((line) => (
            <p key={line} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {line}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}

function PlanViewScreen() {
  const hypothesis = useDexterStore((state) => state.hypothesis);
  const plan = useDexterStore((state) => state.plan);
  const [activeSection, setActiveSection] = useState(plan.sections[0].id);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    plan.sections.forEach((section) => {
      const element = sectionRefs.current[section.id];
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [plan.sections]);

  return (
    <main className={screenClass}>
      <header className="sticky top-0 z-20 grid min-h-20 grid-cols-1 items-center gap-4 border-b-2 border-industrial bg-background px-5 py-4 lg:grid-cols-[1fr_auto] lg:px-8">
        <p className="line-clamp-2 max-w-4xl text-xs leading-5 text-muted-foreground">{hypothesis}</p>
        <div className="grid grid-cols-3 gap-5 text-right">
          {plan.metrics.map((metric) => (
            <strong key={metric} className="font-display text-3xl font-semibold lg:text-4xl">
              {metric}
            </strong>
          ))}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-8 px-5 py-8 lg:grid-cols-[25%_55%_20%] lg:px-8">
        <aside className="lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
          <p className="font-mono text-xs font-bold uppercase text-primary">Table of contents</p>
          <nav className="mt-5 space-y-3">
            {plan.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={cn(
                  "block border-2 border-industrial px-4 py-3 font-mono text-xs font-bold uppercase transition-colors",
                  activeSection === section.id ? "bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {section.title}
              </a>
            ))}
          </nav>
        </aside>
        <section className="space-y-7">
          {plan.sections.map((section) => (
            <PlanCard
              key={section.id}
              section={section}
              refCallback={(element) => {
                sectionRefs.current[section.id] = element;
              }}
            />
          ))}
          <Button className="dexter-cta-shadow h-16 w-full rounded-none border-2 border-industrial bg-accent font-mono text-base font-bold uppercase text-accent-foreground hover:bg-accent hover:shadow-[8px_8px_0px_var(--industrial)]">
            I'M HAPPY WITH THIS
          </Button>
        </section>
        <aside className="space-y-6 lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
          <SideList title="Citations" items={plan.citations} />
          <SideList title="Comments" items={plan.comments} />
        </aside>
      </div>
    </main>
  );
}

function PlanCard({
  section,
  refCallback,
}: {
  section: PlanSection;
  refCallback: (element: HTMLElement | null) => void;
}) {
  return (
    <article
      id={section.id}
      ref={refCallback}
      className="dexter-shadow relative scroll-mt-28 border-2 border-industrial bg-card p-7"
    >
      <span className="absolute right-4 top-4 font-mono text-xs font-bold uppercase text-primary">
        {section.label}
      </span>
      <h2 className="pr-32 font-display text-4xl font-semibold">{section.title}</h2>
      <div className="mt-6 space-y-4 text-base leading-8 text-muted-foreground">
        {section.content.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}

function SideList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="border-2 border-industrial bg-secondary p-4">
      <h2 className="font-mono text-xs font-bold uppercase text-primary">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}