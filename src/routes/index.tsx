import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { forceCollide, forceLink, forceManyBody } from "d3-force";

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
const graphNodeRadius = (influence: number) => 18 + influence * 18;

type ForceNode = {
  id: string;
  paper: Paper;
  influence: number;
  shortLabel: string;
  val: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};

type ForceLink = { id: string; source?: string | ForceNode; target?: string | ForceNode; weight: number };

type ForceGraphData = {
  nodes: ForceNode[];
  links: ForceLink[];
};

type ForceGraphHandle = {
  d3Force: (name: string, force?: unknown) => unknown;
  d3ReheatSimulation: () => unknown;
  zoomToFit: (durationMs?: number, padding?: number) => unknown;
};

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
  const graphRef = useRef<ForceGraphHandle | undefined>(undefined);
  const [hoveredNode, setHoveredNode] = useState<ForceNode | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 1200, height: 720 });
  const [ForceGraph, setForceGraph] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const graphWrapRef = useRef<HTMLDivElement | null>(null);

  const graphData = useMemo<ForceGraphData>(
    () => ({
      nodes: plan.papers.map((paper) => ({
        id: paper.id,
        paper,
        influence: paper.influence,
        shortLabel: paper.id.toUpperCase(),
        val: graphNodeRadius(paper.influence),
      })),
      links: plan.edges.map((edge) => ({ ...edge })),
    }),
    [plan.edges, plan.papers],
  );

  useEffect(() => {
    let mounted = true;
    import("react-force-graph-2d").then((module) => {
      if (mounted) setForceGraph(() => module.default as ComponentType<Record<string, unknown>>);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const bounds = graphWrapRef.current?.getBoundingClientRect();
      if (bounds) setGraphSize({ width: bounds.width, height: bounds.height });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    graph.d3Force(
      "link",
      forceLink<ForceNode, ForceLink & { source: string | ForceNode; target: string | ForceNode }>()
        .id((node) => String(node.id))
        .distance((link) => 340 - link.weight * 185)
        .strength((link) => 0.08 + link.weight * 0.34),
    );
    graph.d3Force("charge", forceManyBody<ForceNode>().strength((node) => -620 - node.influence * 420));
    graph.d3Force(
      "collide",
      forceCollide<ForceNode>().radius((node) => graphNodeRadius(node.influence) + 34).strength(1),
    );
    graph.d3ReheatSimulation();
    window.setTimeout(() => graph.zoomToFit(900, 90), 450);
  }, [ForceGraph, graphData]);

  const selectedId = selectedPaper?.id;

  const drawLink = (link: ForceLink, ctx: CanvasRenderingContext2D) => {
    const source = link.source as ForceNode;
    const target = link.target as ForceNode;
    if (typeof source.x !== "number" || typeof source.y !== "number" || typeof target.x !== "number" || typeof target.y !== "number") return;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const curve = 0.18 + (1 - link.weight) * 0.24;
    const mx = (source.x + target.x) / 2 - dy * curve;
    const my = (source.y + target.y) / 2 + dx * curve;
    const active = hoveredNode?.id === source.id || hoveredNode?.id === target.id || selectedId === source.id || selectedId === target.id;
    const pulse = (Math.sin(Date.now() / 420 + link.weight * 9) + 1) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.quadraticCurveTo(mx, my, target.x, target.y);
    ctx.strokeStyle = link.weight > 0.76 ? "rgba(27, 122, 143, 0.82)" : "rgba(26, 26, 26, 0.45)";
    ctx.lineWidth = (active ? 2.8 : 1.5) + link.weight * 4.2;
    ctx.globalAlpha = active ? 0.95 : 0.42 + link.weight * 0.36;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mx, my, 2.5 + pulse * 3.5 + link.weight * 2, 0, Math.PI * 2);
    ctx.fillStyle = link.weight > 0.76 ? "#1B7A8F" : "#C73E3A";
    ctx.globalAlpha = active ? 0.9 : 0.35;
    ctx.fill();
    ctx.restore();
  };

  const drawNode = (node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const radius = graphNodeRadius(node.influence);
    const selected = node.id === selectedId;
    const hovered = node.id === hoveredNode?.id;
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1A1A1A";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius + (hovered ? 5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#C73E3A" : hovered ? "#1B7A8F" : "#FFFDF6";
    ctx.fill();
    ctx.lineWidth = selected || hovered ? 4 : 3;
    ctx.strokeStyle = "#1A1A1A";
    ctx.stroke();

    ctx.fillStyle = selected || hovered ? "#FFFDF6" : "#1A1A1A";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(9, 12 / globalScale)}px var(--font-mono)`;
    ctx.fillText(node.shortLabel, x, y - 4);
    ctx.font = `${Math.max(7, 8 / globalScale)}px var(--font-mono)`;
    ctx.fillText(`${Math.round(node.influence * 100)} INF`, x, y + 10);

    ctx.font = `${Math.max(8, 9 / globalScale)}px var(--font-mono)`;
    ctx.fillStyle = "#1A1A1A";
    ctx.fillText(node.paper.year.toString(), x, y + radius + 14);
    ctx.restore();
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
      <section ref={graphWrapRef} className="dexter-force-graph relative h-[calc(100vh-60px)] overflow-hidden">
        {ForceGraph ? (
          <ForceGraph<ForceNode, ForceLink>
            ref={graphRef}
            graphData={graphData}
            width={graphSize.width}
            height={graphSize.height}
            backgroundColor="rgba(252,247,236,1)"
            nodeId="id"
            nodeLabel={(node) => `${node.paper.title} (${node.paper.year})`}
            nodeVal={(node) => node.val}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, graphNodeRadius(node.influence) + 12, 0, Math.PI * 2);
              ctx.fill();
            }}
            linkCanvasObject={drawLink}
            linkCanvasObjectMode={() => "replace"}
            linkDirectionalParticles={(link) => Math.round(1 + link.weight * 3)}
            linkDirectionalParticleSpeed={(link) => 0.003 + link.weight * 0.006}
            linkDirectionalParticleWidth={(link) => 1.5 + link.weight * 3}
            linkDirectionalParticleColor={(link) => (link.weight > 0.76 ? "#1B7A8F" : "#C73E3A")}
            d3VelocityDecay={0.18}
            d3AlphaDecay={0.015}
            cooldownTicks={Infinity}
            autoPauseRedraw={false}
            enableNodeDrag
            showPointerCursor={(object) => Boolean(object)}
            onNodeHover={(node) => setHoveredNode(node)}
            onNodeClick={(node) => selectPaper(node.paper)}
            onNodeDragEnd={(node) => {
              node.fx = undefined;
              node.fy = undefined;
              graphRef.current?.d3ReheatSimulation();
            }}
            onBackgroundClick={() => selectPaper(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs font-bold uppercase text-primary">
            Initializing force topology...
          </div>
        )}
        <div className="pointer-events-none absolute bottom-5 left-5 border-2 border-industrial bg-card px-4 py-3 font-mono text-xs font-bold uppercase dexter-shadow">
          Drag nodes / weighted force network / live literature topology
        </div>
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