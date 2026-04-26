import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { Bookmark } from "lucide-react";

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
const graphNodeRadius = (influence: number) => 16 + influence * 15;
const indexFromPaperId = (id: string) => Number(id.replace(/\D/g, "")) || 1;
const easedPressure = (value: number) => value * value * (3 - 2 * value);
const pressureColor = (pressure: number) => {
  const stops = [
    [64, 151, 166],
    [27, 122, 143],
    [18, 98, 120],
  ];
  const scaled = Math.min(stops.length - 1.001, pressure * (stops.length - 1));
  const index = Math.floor(scaled);
  const local = scaled - index;
  const start = stops[index];
  const end = stops[index + 1];
  return start.map((channel, channelIndex) => Math.round(channel + (end[channelIndex] - channel) * local));
};

type LassoPoint = { x: number; y: number };
type ReportHighlight = { key: string; reportId: string; start: number; end: number; text: string };

const buildFreehandPath = (points: LassoPoint[], close = false) => {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const [first, ...rest] = points;
  const path = rest.reduce((commands, point, index) => {
    const previous = points[index];
    const midX = (previous.x + point.x) / 2;
    const midY = (previous.y + point.y) / 2;
    return `${commands} Q ${previous.x} ${previous.y} ${midX} ${midY}`;
  }, `M ${first.x} ${first.y}`);
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}${close ? " Z" : ""}`;
};

const pointInPolygon = (point: LassoPoint, polygon: LassoPoint[]) => {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    const crosses = current.y > point.y !== previous.y > point.y;
    if (crosses) {
      const xAtY = ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
      if (point.x < xAtY) inside = !inside;
    }
  }
  return inside;
};

const lassoTouchesRect = (points: LassoPoint[], rect: DOMRect) => {
  const rectPoints = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
  ];
  return (
    rectPoints.some((point) => pointInPolygon(point, points)) ||
    points.some((point) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom)
  );
};

const textOffsetInElement = (element: HTMLElement, node: Node, offset: number) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return total;
};

type ForceNode = {
  id: string;
  paper: Paper;
  influence: number;
  shortLabel: string;
  val: number;
  phase: number;
  hoverScale?: number;
  hoverCharge?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
};

type ForceLink = { id: string; source: string | ForceNode; target: string | ForceNode; weight: number };

type ForceGraphData = {
  nodes: ForceNode[];
  links: ForceLink[];
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

  useEffect(() => {
    const screenTimer = window.setTimeout(() => setCurrentScreen("HYPOTHESIS_INPUT"), 3400);
    return () => {
      window.clearTimeout(screenTimer);
    };
  }, [setCurrentScreen]);

  return (
    <main className={cn(screenClass, "dexter-lab-intro relative flex items-center justify-center overflow-hidden px-6")}> 
      <div className="absolute inset-0 dexter-lab-grid" />
      <div className="absolute left-8 top-8 hidden w-44 border-2 border-industrial bg-card p-3 dexter-shadow md:block dexter-panel-slide-left">
        <div className="mb-3 flex gap-2">
          <span className="h-3 w-3 border-2 border-industrial bg-accent dexter-lab-blink" />
          <span className="h-3 w-3 border-2 border-industrial bg-primary dexter-lab-blink delay-150" />
          <span className="h-3 w-3 border-2 border-industrial bg-secondary dexter-lab-blink delay-300" />
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full bg-primary" />
          <div className="h-2 w-2/3 bg-industrial" />
          <div className="h-2 w-5/6 bg-primary" />
        </div>
      </div>
      <div className="absolute bottom-10 right-8 hidden w-52 border-2 border-industrial bg-card p-4 dexter-shadow md:block dexter-panel-slide-right">
        <div className="h-20 border-2 border-industrial bg-background p-3">
          <div className="h-full w-full border-2 border-primary dexter-scan-field" />
        </div>
      </div>
      <div className="absolute inset-y-0 left-0 w-1/2 border-r-2 border-industrial bg-primary dexter-door-left" />
      <div className="absolute inset-y-0 right-0 w-1/2 border-l-2 border-industrial bg-primary dexter-door-right" />
      <section className="relative z-10 w-full max-w-3xl text-center dexter-title-reveal">
        <div className="dexter-beaker-mark mx-auto mb-7 flex h-40 w-32 items-center justify-center dexter-instrument-pulse" aria-label="Dexter beaker logo">
          <svg viewBox="0 0 160 220" role="img" className="h-full w-full overflow-visible">
            <path className="dexter-beaker-glass" d="M64 20h32v72l47 87c7 14-3 31-19 31H36c-16 0-26-17-19-31l47-87V20Z" />
            <path className="dexter-beaker-liquid" d="M28 160c16-7 31-8 47-2 19 8 36 1 57-9l17 32c6 12-2 26-16 26H28c-13 0-22-14-16-26l16-21Z" />
            <path className="dexter-beaker-neck" d="M61 18h38" />
            <path className="dexter-beaker-highlight" d="M99 43v66" />
            <ellipse className="dexter-beaker-hair" cx="91" cy="129" rx="34" ry="11" transform="rotate(13 91 129)" />
            <path className="dexter-beaker-hair-line" d="M72 124c11 7 21 9 34 8" />
            <path className="dexter-beaker-hair-line" d="M97 133c2 8 7 13 15 15" />
            <path className="dexter-beaker-glasses" d="M48 151c3 16 19 21 31 10m7-9c15 9 31 7 38-8" />
            <path className="dexter-beaker-glasses" d="M79 158c3-7 7-9 12-7" />
            <circle className="dexter-beaker-bubble" cx="44" cy="172" r="3" />
            <circle className="dexter-beaker-bubble" cx="55" cy="181" r="2" />
            <circle className="dexter-beaker-bubble" cx="119" cy="163" r="4" />
            <circle className="dexter-beaker-bubble" cx="127" cy="174" r="2" />
            <circle className="dexter-beaker-bubble" cx="80" cy="10" r="7" />
            <circle className="dexter-beaker-bubble" cx="74" cy="-8" r="4" />
            <circle className="dexter-beaker-bubble" cx="84" cy="-22" r="3" />
          </svg>
        </div>
        <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-primary">Experiment bay 07</p>
        <div className="dexter-neon-sign relative mx-auto mt-4 w-fit border-2 border-industrial bg-card px-5 py-4 dexter-shadow md:px-8 md:py-5">
          <span className="dexter-spark dexter-spark-a" />
          <span className="dexter-spark dexter-spark-b" />
          <span className="dexter-spark dexter-spark-c" />
          <h1 className="dexter-sign-title font-lab-title text-6xl font-normal leading-[0.82] text-primary md:text-[92px]">
            DEXTER’S<br />LABORATORY
          </h1>
        </div>
        <p className="mx-auto mt-5 max-w-md text-base text-muted-foreground">
          From hypothesis to runnable experiment
        </p>
      </section>
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<ForceNode>> | null>(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<ForceNode | null>(null);
  const pointerDownRef = useRef<{ node: ForceNode; x: number; y: number; didDrag: boolean } | null>(null);
  const nodesRef = useRef<ForceNode[]>([]);
  const linksRef = useRef<ForceLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<ForceNode | null>(null);
  const [hoverCardPosition, setHoverCardPosition] = useState({ x: 0, y: 0 });
  const [visitedNodeIds, setVisitedNodeIds] = useState<Set<string>>(() => new Set());
  const [bookmarkedNodeIds, setBookmarkedNodeIds] = useState<Set<string>>(() => new Set());
  const [graphSize, setGraphSize] = useState({ width: 1200, height: 720 });
  const graphWrapRef = useRef<HTMLDivElement | null>(null);
  const selectedPaperId = selectedPaper?.id;

  const graphData = useMemo<ForceGraphData>(
    () => ({
      nodes: plan.papers.map((paper) => ({
        id: paper.id,
        paper,
        influence: paper.influence,
        shortLabel: paper.id.toUpperCase(),
        val: graphNodeRadius(paper.influence),
        phase: indexFromPaperId(paper.id) * 1.37,
        x: paper.x,
        y: paper.y,
      })),
      links: plan.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, weight: edge.weight })),
    }),
    [plan.edges, plan.papers],
  );

  useEffect(() => {
    const updateSize = () => {
      const bounds = graphWrapRef.current?.getBoundingClientRect();
      if (bounds) setGraphSize({ width: bounds.width, height: bounds.height });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const drawLink = (link: ForceLink, ctx: CanvasRenderingContext2D, time: number) => {
    const source = link.source as ForceNode;
    const target = link.target as ForceNode;
    if (typeof source.x !== "number" || typeof source.y !== "number" || typeof target.x !== "number" || typeof target.y !== "number") return;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const curve = 0.18 + (1 - link.weight) * 0.24;
    const mx = (source.x + target.x) / 2 - dy * curve;
    const my = (source.y + target.y) / 2 + dx * curve;
    const active = hoveredNode?.id === source.id || hoveredNode?.id === target.id || selectedPaperId === source.id || selectedPaperId === target.id;
    const pulse = (Math.sin(time / 240 + link.weight * 9) + 1) / 2;
    const particleProgress = (time / (1200 - link.weight * 520) + link.weight) % 1;
    const particleX = (1 - particleProgress) * (1 - particleProgress) * source.x + 2 * (1 - particleProgress) * particleProgress * mx + particleProgress * particleProgress * target.x;
    const particleY = (1 - particleProgress) * (1 - particleProgress) * source.y + 2 * (1 - particleProgress) * particleProgress * my + particleProgress * particleProgress * target.y;

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

    ctx.beginPath();
    ctx.arc(particleX, particleY, 2.5 + link.weight * 3.5, 0, Math.PI * 2);
    ctx.globalAlpha = active ? 0.95 : 0.62;
    ctx.fill();
    ctx.restore();
  };

  const drawNode = (node: ForceNode, ctx: CanvasRenderingContext2D) => {
    const baseRadius = graphNodeRadius(node.influence);
    const selected = node.id === selectedPaperId;
    const hovered = node.id === hoveredNode?.id;
    const visited = visitedNodeIds.has(node.id);
    const bookmarked = bookmarkedNodeIds.has(node.id);
    const breath = (Math.sin(performance.now() / 360 + node.phase) + 1) / 2;
    const hoverCharge = node.hoverCharge ?? 0;
    const pressure = easedPressure(hoverCharge);
    const radius = baseRadius * (node.hoverScale ?? 1);
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const [hoverR, hoverG, hoverB] = pressureColor(pressure);

    ctx.save();
    if (bookmarked) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 16 + breath * 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#1B7A8F";
      ctx.globalAlpha = 0.7 + breath * 0.25;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius + 8 + breath * 8 + pressure * 18, 0, Math.PI * 2);
    ctx.fillStyle = hovered || selected ? `rgba(${hoverR}, ${hoverG}, ${hoverB}, ${0.12 + pressure * 0.24})` : "rgba(27, 122, 143, 0.1)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + 5, y + 5, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1A1A1A";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius + (hovered ? 3 : 0), 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#C73E3A" : hovered ? `rgb(${hoverR}, ${hoverG}, ${hoverB})` : visited ? "#B9B4AA" : "#FFFDF6";
    ctx.fill();
    ctx.globalAlpha = visited && !selected && !hovered ? 0.74 : 1;
    ctx.lineWidth = selected || hovered ? 4 : 3;
    ctx.strokeStyle = "#1A1A1A";
    ctx.stroke();

    ctx.fillStyle = selected || hovered ? "#FFFDF6" : "#1A1A1A";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px var(--font-mono)";
    ctx.fillText(node.shortLabel, x, y - 4);
    ctx.font = "8px var(--font-mono)";
    ctx.fillText(`${Math.round(node.influence * 100)} INF`, x, y + 10);

    ctx.font = "9px var(--font-mono)";
    ctx.fillStyle = "#1A1A1A";
    ctx.fillText(node.paper.year.toString(), x, y + radius + 14);
    ctx.restore();
  };

  useEffect(() => {
    nodesRef.current = graphData.nodes.map((node) => ({ ...node }));
    linksRef.current = graphData.links.map((link) => ({ ...link }));

    const simulation = forceSimulation<ForceNode>(nodesRef.current)
      .force(
        "link",
        forceLink<ForceNode, ForceLink>(linksRef.current)
          .id((node) => node.id)
          .distance((link) => 210 - link.weight * 95)
          .strength((link) => 0.06 + link.weight * 0.22),
      )
      .force("charge", forceManyBody<ForceNode>().strength((node) => -380 - node.influence * 240))
      .force("collide", forceCollide<ForceNode>().radius((node) => graphNodeRadius(node.influence) + 26).strength(0.82))
      .force("center", forceCenter(0, 0))
      .alpha(1)
      .alphaDecay(0.0016)
      .alphaMin(0.08)
      .velocityDecay(0.18);

    simulationRef.current = simulation;
    return () => {
      simulation.stop();
    };
  }, [graphData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animation = 0;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = graphSize.width * dpr;
    canvas.height = graphSize.height * dpr;
    canvas.style.width = `${graphSize.width}px`;
    canvas.style.height = `${graphSize.height}px`;

    const render = (time: number) => {
      const nodes = nodesRef.current;
      const hovered = hoveredNode ? nodes.find((node) => node.id === hoveredNode.id) : null;
      nodes.forEach((node, index) => {
        const isHovered = node.id === hoveredNode?.id;
        const targetCharge = isHovered ? 1 : 0;
        node.hoverCharge = Math.max(0, Math.min(1, (node.hoverCharge ?? 0) + (targetCharge - (node.hoverCharge ?? 0)) * (isHovered ? 0.012 : 0.1)));
        const pressure = easedPressure(node.hoverCharge ?? 0);
        node.hoverScale = 1 + pressure * 0.72;
        if (node !== dragRef.current) {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const distance = Math.max(Math.hypot(x, y), 1);
          const orbit = Math.atan2(y, x) + Math.PI / 2;
          const orbitalForce = 0.024 + node.influence * 0.014;
          const waveForce = 0.026;
          const centerPull = Math.min(distance, 420) * 0.00012;
          node.vx =
            (node.vx ?? 0) +
            Math.cos(orbit) * orbitalForce +
            Math.sin(time / 820 + node.phase + index * 1.7) * waveForce -
            (x / distance) * centerPull;
          node.vy =
            (node.vy ?? 0) +
            Math.sin(orbit) * orbitalForce +
            Math.cos(time / 900 + node.phase + index * 1.2) * waveForce -
            (y / distance) * centerPull;
        }
        if (hovered && hovered !== node && (hovered.hoverCharge ?? 0) > 0.02) {
          const dx = (node.x ?? 0) - (hovered.x ?? 0);
          const dy = (node.y ?? 0) - (hovered.y ?? 0);
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const pressure = hovered.hoverCharge ?? 0;
          const radius = 300 + pressure * 260;
          const falloff = Math.max(0, 1 - distance / radius);
          const influence = falloff * falloff * (0.18 + pressure * 1.45);
          node.vx = (node.vx ?? 0) + (dx / distance) * influence * 2.35;
          node.vy = (node.vy ?? 0) + (dy / distance) * influence * 2.35;
        }
      });
      simulationRef.current?.alpha(Math.max(simulationRef.current.alpha(), hovered ? 0.2 : 0.12)).tick(1);
      const xs = nodes.map((node) => node.x ?? 0);
      const ys = nodes.map((node) => node.y ?? 0);
      const minX = Math.min(...xs) - 115;
      const maxX = Math.max(...xs) + 115;
      const minY = Math.min(...ys) - 115;
      const maxY = Math.max(...ys) + 115;
      const scale = Math.min(graphSize.width / Math.max(maxX - minX, 1), graphSize.height / Math.max(maxY - minY, 1), 1.7);
      const nextTransform = {
        scale,
        x: graphSize.width / 2 - ((minX + maxX) / 2) * scale,
        y: graphSize.height / 2 - ((minY + maxY) / 2) * scale,
      };
      transformRef.current = {
        scale: transformRef.current.scale + (nextTransform.scale - transformRef.current.scale) * 0.08,
        x: transformRef.current.x + (nextTransform.x - transformRef.current.x) * 0.08,
        y: transformRef.current.y + (nextTransform.y - transformRef.current.y) * 0.08,
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, graphSize.width, graphSize.height);
      ctx.fillStyle = "#FCF7EC";
      ctx.fillRect(0, 0, graphSize.width, graphSize.height);
      ctx.save();
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.scale, transformRef.current.scale);
      linksRef.current.forEach((link) => drawLink(link, ctx, time));
      nodes.forEach((node) => drawNode(node, ctx));
      ctx.restore();
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animation);
  }, [drawLink, drawNode, graphSize.height, graphSize.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getNodeAt = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const transform = transformRef.current;
      const x = (event.clientX - bounds.left - transform.x) / transform.scale;
      const y = (event.clientY - bounds.top - transform.y) / transform.scale;
      return [...nodesRef.current]
        .reverse()
        .find((node) => Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y) <= graphNodeRadius(node.influence) + 18);
    };

    const moveNodeTo = (node: ForceNode, event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const transform = transformRef.current;
      node.fx = (event.clientX - bounds.left - transform.x) / transform.scale;
      node.fy = (event.clientY - bounds.top - transform.y) / transform.scale;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (dragRef.current) {
        if (pointerDownRef.current && Math.hypot(event.clientX - pointerDownRef.current.x, event.clientY - pointerDownRef.current.y) > 4) {
          pointerDownRef.current.didDrag = true;
        }
        moveNodeTo(dragRef.current, event);
        simulationRef.current?.alpha(0.18).restart();
        return;
      }
      const nextHovered = getNodeAt(event) ?? null;
      setHoverCardPosition({ x: event.clientX, y: event.clientY });
      setHoveredNode((current) => (current?.id === nextHovered?.id ? current : nextHovered));
      canvas.style.cursor = nextHovered ? "grab" : "default";
    };

    const onPointerDown = (event: PointerEvent) => {
      const node = getNodeAt(event);
      if (!node) {
        selectPaper(null);
        return;
      }
      dragRef.current = node;
      pointerDownRef.current = { node, x: event.clientX, y: event.clientY, didDrag: false };
      canvas.setPointerCapture(event.pointerId);
      moveNodeTo(node, event);
      setHoveredNode(null);
      simulationRef.current?.alpha(0.18).restart();
      canvas.style.cursor = "grabbing";
    };

    const onPointerUp = (event: PointerEvent) => {
      const pointerDown = pointerDownRef.current;
      if (dragRef.current) {
        dragRef.current.fx = undefined;
        dragRef.current.fy = undefined;
        dragRef.current = null;
        simulationRef.current?.alpha(0.14).restart();
      }
      if (pointerDown && !pointerDown.didDrag) {
        setVisitedNodeIds((current) => new Set(current).add(pointerDown.node.id));
        setHoveredNode(null);
        selectPaper(pointerDown.node.paper);
      }
      pointerDownRef.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
    };
  }, [selectPaper]);

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
        <canvas ref={canvasRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
        <div className="pointer-events-none absolute bottom-5 left-5 border-2 border-industrial bg-card px-4 py-3 font-mono text-xs font-bold uppercase dexter-shadow">
          Drag nodes / weighted force network / live literature topology
        </div>
        <PaperHoverCard node={selectedPaper ? null : hoveredNode} position={hoverCardPosition} />
        <PaperDetailOverlay
          paper={selectedPaper}
          bookmarked={selectedPaper ? bookmarkedNodeIds.has(selectedPaper.id) : false}
          onToggleBookmark={(paperId) =>
            setBookmarkedNodeIds((current) => {
              const next = new Set(current);
              if (next.has(paperId)) next.delete(paperId);
              else next.add(paperId);
              return next;
            })
          }
          onClose={() => selectPaper(null)}
        />
      </section>
    </main>
  );
}

function PaperHoverCard({ node, position }: { node: ForceNode | null; position: { x: number; y: number } }) {
  if (!node) return null;
  return (
    <div
      className="pointer-events-none fixed z-30 w-[320px] border-2 border-industrial bg-card p-4 dexter-shadow transition-opacity duration-150"
      style={{ left: Math.min(position.x + 18, window.innerWidth - 340), top: Math.min(position.y + 18, window.innerHeight - 220) }}
    >
      <p className="font-mono text-[10px] font-bold uppercase text-primary">Paper Node / {node.paper.id}</p>
      <h2 className="mt-2 line-clamp-2 font-display text-xl font-semibold leading-tight">{node.paper.title}</h2>
      <p className="mt-3 font-mono text-[10px] font-bold uppercase text-muted-foreground">
        {node.paper.authors} / {node.paper.year}
      </p>
      <p className="mt-3 line-clamp-3 text-sm leading-5 text-muted-foreground">{node.paper.abstract}</p>
    </div>
  );
}

function PaperDetailOverlay({
  paper,
  bookmarked,
  onToggleBookmark,
  onClose,
}: {
  paper: Paper | null;
  bookmarked: boolean;
  onToggleBookmark: (paperId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/35 p-5 opacity-0 backdrop-blur-[2px] transition-opacity duration-200",
        paper && "pointer-events-auto opacity-100",
      )}
    >
      {paper && (
        <article className="relative w-full max-w-2xl border-2 border-industrial bg-card p-7 dexter-shadow animate-in fade-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={() => onToggleBookmark(paper.id)}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark paper"}
            className={cn(
              "absolute right-24 top-5 flex h-8 w-8 items-center justify-center border-2 border-industrial bg-background transition-transform hover:-translate-y-0.5",
              bookmarked && "bg-primary text-primary-foreground",
            )}
          >
            <Bookmark size={15} fill={bookmarked ? "currentColor" : "none"} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-8 items-center border-2 border-industrial bg-background px-3 font-mono text-xs font-bold uppercase transition-transform hover:-translate-y-0.5"
          >
            Close
          </button>
          <p className="font-mono text-xs font-bold uppercase text-primary">Paper Node / {paper.id}</p>
          <h2 className="mt-4 pr-20 font-display text-4xl font-semibold leading-tight">{paper.title}</h2>
          <p className="mt-5 font-mono text-xs font-bold uppercase">
            {paper.authors} / {paper.year}
          </p>
          <p className="mt-6 text-base leading-7 text-muted-foreground">{paper.abstract}</p>
          <div className="mt-7 grid grid-cols-3 gap-3 font-mono text-xs font-bold uppercase">
            <div className="border-2 border-industrial bg-secondary p-3">Influence<br />{Math.round(paper.influence * 100)}%</div>
            <div className="border-2 border-industrial bg-secondary p-3">Status<br />Reviewed</div>
            <div className="border-2 border-industrial bg-secondary p-3">Action<br />{bookmarked ? "Bookmarked" : "Open"}</div>
          </div>
        </article>
      )}
    </div>
  );
}

function HighlightableText({ text, reportId, highlights }: { text: string; reportId: string; highlights: ReportHighlight[] }) {
  const sortedHighlights = [...highlights]
    .filter((highlight) => highlight.reportId === reportId)
    .sort((a, b) => a.start - b.start);
  if (!sortedHighlights.length) return <>{text}</>;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  sortedHighlights.forEach((highlight) => {
    const start = Math.max(cursor, Math.min(highlight.start, text.length));
    const end = Math.max(start, Math.min(highlight.end, text.length));
    if (cursor < start) nodes.push(<span key={`${highlight.key}-before`}>{text.slice(cursor, start)}</span>);
    if (start < end) {
      nodes.push(
        <mark key={highlight.key} className="dexter-report-selected" data-highlight-key={highlight.key}>
          {text.slice(start, end)}
        </mark>,
      );
    }
    cursor = end;
  });
  if (cursor < text.length) nodes.push(<span key={`${reportId}-tail`}>{text.slice(cursor)}</span>);
  return <>{nodes}</>;
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
  const [highlights, setHighlights] = useState<ReportHighlight[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const [selectedText, setSelectedText] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string | null; highlightKey: string | null } | null>(null);
  const [promptBox, setPromptBox] = useState<{ x: number; y: number; action: string } | null>(null);
  const [activeReference, setActiveReference] = useState<string | null>(null);
  const [lasso, setLasso] = useState<{ active: boolean; drawing: boolean; points: LassoPoint[] }>({
    active: false,
    drawing: false,
    points: [],
  });
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const reportRef = useRef<HTMLDivElement | null>(null);

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

  const referenceFor = (itemId: string) => {
    const digits = itemId.match(/\d+/g)?.map(Number) ?? [0, 0];
    const index = (digits[0] + digits[1]) % plan.papers.length;
    return plan.papers[index];
  };

  const captureSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!text) return;
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const startElement = range?.startContainer.parentElement?.closest("[data-report-id]") as HTMLElement | null;
    const endElement = range?.endContainer.parentElement?.closest("[data-report-id]") as HTMLElement | null;
    const element = startElement && startElement === endElement ? startElement : null;
    const id = element?.dataset.reportId;
    if (!id || !range) return;
    const start = textOffsetInElement(element, range.startContainer, range.startOffset);
    const end = textOffsetInElement(element, range.endContainer, range.endOffset);
    if (start === end) return;
    setActiveIds(new Set([id]));
    setHighlights((current) => [
      ...current,
      { key: `${id}-${Date.now()}-${current.length}`, reportId: id, start: Math.min(start, end), end: Math.max(start, end), text },
    ]);
    setSelectedText(text);
    selection?.removeAllRanges();
  };

  const openContextMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const reportElement = target.closest("[data-report-id]") as HTMLElement | null;
    const highlightElement = target.closest("[data-highlight-key]") as HTMLElement | null;
    if (!reportElement && !selectedText) return;
    event.preventDefault();
    const id = reportElement?.dataset.reportId;
    const highlightKey = highlightElement?.dataset.highlightKey ?? null;
    if (id && !activeIds.has(id)) {
      setActiveIds(new Set([id]));
      setSelectedText(highlightKey ? (highlightElement?.innerText.trim() ?? "") : reportElement.innerText.trim());
    }
    setContextMenu({ x: event.clientX, y: event.clientY, targetId: id ?? null, highlightKey });
    setPromptBox(null);
  };

  const goToReference = () => {
    const id = [...activeIds][0];
    if (!id) return;
    const paper = referenceFor(id);
    setActiveReference(paper.id);
    setContextMenu(null);
    document.getElementById(`reference-${paper.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const undoHighlight = () => {
    if (!contextMenu?.highlightKey) return;
    setHighlights((current) => current.filter((highlight) => highlight.key !== contextMenu.highlightKey));
    setActiveIds((current) => {
      const next = new Set(current);
      if (contextMenu.targetId) next.delete(contextMenu.targetId);
      return next;
    });
    setContextMenu(null);
  };

  const startPrompt = (action: string) => {
    if (!contextMenu) return;
    setPromptBox({ x: contextMenu.x, y: contextMenu.y, action });
    setContextMenu(null);
  };

  const lassoPath = buildFreehandPath(lasso.points, lasso.points.length > 2);

  return (
    <main
      className={cn(screenClass, "dexter-report-stage")}
      onClick={() => setContextMenu(null)}
      onPointerMove={(event) => {
        if (lasso.drawing) {
          setLasso((current) => ({
            ...current,
            points: [...current.points, { x: event.clientX, y: event.clientY }],
          }));
        }
      }}
      onPointerUp={() => {
        if (!lasso.drawing) return;
        const picked = [...(reportRef.current?.querySelectorAll<HTMLElement>("[data-report-id]") ?? [])].filter((element) => {
          const rect = element.getBoundingClientRect();
          return lassoTouchesRect(lasso.points, rect);
        });
        const pickedIds = picked.map((element) => element.dataset.reportId).filter(Boolean) as string[];
        setActiveIds(new Set(pickedIds));
        setHighlightedIds((current) => new Set([...current, ...pickedIds]));
        setSelectedText(picked.map((element) => element.innerText.trim()).join(" "));
        setLasso({ active: false, drawing: false, points: [] });
      }}
    >
      <header className="sticky top-0 z-20 grid min-h-20 grid-cols-1 items-center gap-4 border-b-2 border-industrial bg-background/95 px-5 py-4 backdrop-blur lg:grid-cols-[1fr_auto] lg:px-8">
        <p className="line-clamp-2 max-w-4xl text-xs leading-5 text-muted-foreground">{hypothesis}</p>
        <div className="grid grid-cols-3 gap-5 text-right">
          {plan.metrics.map((metric) => (
            <strong key={metric} className="font-display text-3xl font-semibold lg:text-4xl">
              {metric}
            </strong>
          ))}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-8 px-5 py-8 lg:grid-cols-[18%_minmax(0,1fr)_24%] lg:px-8">
        <aside className="lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
          <p className="font-mono text-xs font-bold uppercase text-primary">Contents</p>
          <nav className="mt-5 space-y-2">
            {plan.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className={cn("block border-l-4 px-3 py-2 font-mono text-xs font-bold uppercase transition-colors", activeSection === section.id ? "border-primary bg-secondary text-foreground" : "border-transparent text-muted-foreground hover:border-primary")}>{section.title}</a>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          <article
            ref={reportRef}
            className={cn("dexter-report-paper", lasso.active && "dexter-lasso-active")}
            onMouseUp={captureSelection}
            onContextMenu={openContextMenu}
            onPointerDown={(event) => {
              if (!lasso.active) return;
              event.preventDefault();
              setLasso({ active: true, drawing: true, points: [{ x: event.clientX, y: event.clientY }] });
            }}
          >
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-primary">Generated experimental report</p>
            <h1 className="mt-4 font-display text-5xl font-semibold leading-tight">Trehalose cryopreservation feasibility plan</h1>
            <p className={cn("mt-7 border-l-4 border-primary pl-5 text-lg leading-9 text-foreground", highlightedIds.has("hypothesis") && "dexter-report-selected", activeIds.has("hypothesis") && "dexter-report-active")} data-report-id="hypothesis">
              {hypothesis}
            </p>
            {plan.sections.map((section, sectionIndex) => (
              <section
                key={section.id}
                id={section.id}
                ref={(element) => {
                  sectionRefs.current[section.id] = element;
                }}
                className="scroll-mt-28"
              >
                <h2 className="mt-12 font-display text-3xl font-semibold">{section.title}</h2>
                {section.content.map((paragraph, paragraphIndex) => {
                  const itemId = `${sectionIndex}-${paragraphIndex}`;
                  return (
                    <p
                      key={paragraph}
                      data-report-id={itemId}
                      className={cn("dexter-report-paragraph", highlightedIds.has(itemId) && "dexter-report-selected", activeIds.has(itemId) && "dexter-report-active", activeReference === referenceFor(itemId).id && "dexter-reference-linked")}
                    >
                      {paragraph}
                    </p>
                  );
                })}
              </section>
            ))}
            <Button className="dexter-cta-shadow mt-12 h-16 w-full rounded-none border-2 border-industrial bg-accent font-mono text-base font-bold uppercase text-accent-foreground hover:bg-accent hover:shadow-[8px_8px_0px_var(--industrial)]">
              I'M HAPPY WITH THIS
            </Button>
          </article>
        </section>
        <aside className="space-y-6 lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)] lg:overflow-auto">
          <section className="dexter-reference-panel">
            <h2 className="font-mono text-xs font-bold uppercase text-primary">References</h2>
            <div className="mt-4 space-y-3">
              {plan.papers.map((paper) => (
                <button key={paper.id} id={`reference-${paper.id}`} type="button" onClick={() => setActiveReference(paper.id)} className={cn("w-full border-l-4 bg-secondary p-3 text-left text-sm leading-5 transition-colors", activeReference === paper.id ? "border-primary" : "border-transparent")}>
                  <span className="font-mono text-[10px] font-bold uppercase text-primary">{paper.id} / {paper.year}</span>
                  <span className="mt-1 block font-medium">{paper.title}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="dexter-reference-panel">
            <h2 className="font-mono text-xs font-bold uppercase text-primary">Notes</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6">
              {plan.comments.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </aside>
      </div>
      {contextMenu && (
        <div className="dexter-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.targetId && highlightedIds.has(contextMenu.targetId) && <button type="button" onClick={undoHighlight}>Undo highlight</button>}
          <button type="button" onClick={goToReference}>Go to reference</button>
          <button type="button" onClick={() => startPrompt("Suggest rewrite")}>Suggest rewrite</button>
          <button type="button" onClick={() => startPrompt("Clarify this")}>Clarify this</button>
          <button type="button" onClick={() => startPrompt("Make more rigorous")}>Make more rigorous</button>
          <button type="button" onClick={() => startPrompt("Add caveat")}>Add caveat</button>
          <button type="button" onClick={() => { setLasso((current) => ({ ...current, active: true })); setContextMenu(null); }}>Lasso select region</button>
        </div>
      )}
      {promptBox && (
        <div className="dexter-edit-prompt" style={{ left: Math.min(promptBox.x, window.innerWidth - 360), top: Math.min(promptBox.y, window.innerHeight - 260) }}>
          <p className="font-mono text-[10px] font-bold uppercase text-primary">{promptBox.action}</p>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">“{selectedText}”</p>
          <Textarea rows={4} placeholder="Tell Dexter exactly how to revise this passage..." className="mt-3 rounded-none border-2 border-industrial bg-background text-sm" />
          <Button className="mt-3 h-10 w-full rounded-none border-2 border-industrial bg-primary font-mono text-xs font-bold uppercase text-primary-foreground hover:bg-primary">Queue guided edit</Button>
        </div>
      )}
      {lasso.drawing && (
        <svg className="dexter-lasso-svg" aria-hidden="true">
          <path className="dexter-lasso-fill" d={lassoPath} />
          <path className="dexter-lasso-stroke" d={lassoPath} />
        </svg>
      )}
    </main>
  );
}