import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { jsPDF } from "jspdf";
import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type ReportHighlight, useDexterStore } from "@/lib/dexter-store";
import { exampleHypotheses, type Paper } from "@/lib/mock-plan";
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
    const t = window.setTimeout(() => setCurrentScreen("HYPOTHESIS_INPUT"), 2500);
    return () => window.clearTimeout(t);
  }, [setCurrentScreen]);

  const letters = "DEXTER".split("");
  return (
    <main className={cn(screenClass, "flex min-h-screen items-center justify-center px-6")}>
      <div className="text-center">
        <h1
          className="font-display text-7xl font-semibold tracking-tight text-primary md:text-[88px]"
          style={{ letterSpacing: "-0.02em" }}
        >
          {letters.map((ch, i) => (
            <span
              key={i}
              className="dexter-loading-letter inline-block"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              {ch}
            </span>
          ))}
        </h1>
        <div className="dexter-loading-underline mx-auto mt-3 h-[2px] w-0 bg-primary" />
        <p className="dexter-loading-tagline mt-6 text-base text-muted-foreground opacity-0">
          From hypothesis to runnable experiment
        </p>
      </div>
    </main>
  );
}

function HypothesisInputScreen() {
  const hypothesis = useDexterStore((state) => state.hypothesis);
  const setHypothesis = useDexterStore((state) => state.setHypothesis);
  const setCurrentScreen = useDexterStore((state) => state.setCurrentScreen);
  const fetchPlan = useDexterStore((state) => state.fetchPlan);

  return (
    <main className={cn(screenClass, "flex min-h-screen flex-col")}> 
      <WorkflowHeader title="DEXTER / HYPOTHESIS INTAKE" />
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl text-center">
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
          onClick={() => {
            void fetchPlan(hypothesis);
            setCurrentScreen("LITERATURE_GRAPH");
          }}
          className="dexter-cta-shadow mt-10 h-16 rounded-none border-2 border-industrial bg-accent px-10 font-mono text-base font-bold uppercase text-accent-foreground hover:bg-accent hover:shadow-[8px_8px_0px_var(--industrial)]"
        >
          GENERATE PLAN
        </Button>
        </div>
      </section>
    </main>
  );
}

function WorkflowHeader({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <header className="flex min-h-[60px] items-center justify-between gap-4 border-b-2 border-industrial bg-background px-5 py-3">
      <div className="flex min-w-0 items-center gap-4">
        <WorkflowBackButton />
        {title && <p className="line-clamp-1 font-mono text-xs font-bold uppercase text-primary">{title}</p>}
      </div>
      {children}
    </header>
  );
}

function WorkflowBackButton() {
  const goToPreviousScreen = useDexterStore((state) => state.goToPreviousScreen);
  const currentScreen = useDexterStore((state) => state.currentScreen);
  const canGoBack = currentScreen !== "HYPOTHESIS_INPUT" && currentScreen !== "LOADING";

  if (!canGoBack) return null;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={goToPreviousScreen}
      className="h-10 shrink-0 rounded-none border-2 border-industrial bg-secondary px-4 font-mono text-xs font-bold uppercase hover:bg-secondary"
    >
      Back
    </Button>
  );
}

function LiteratureGraphScreen() {
  const hypothesis = useDexterStore((state) => state.hypothesis);
  const plan = useDexterStore((state) => state.plan);
  const selectedPaper = useDexterStore((state) => state.currentlySelectedPaper);
  const selectPaper = useDexterStore((state) => state.selectPaper);
  const beginPlanGeneration = useDexterStore((state) => state.beginPlanGeneration);
  const setCurrentScreen = useDexterStore((state) => state.setCurrentScreen);
  const planFetchStatus = useDexterStore((state) => state.planFetchStatus);
  const apiError = useDexterStore((state) => state.apiError);
  const visitedNodeIds = useDexterStore((state) => state.visitedNodeIds);
  const bookmarkedNodeIds = useDexterStore((state) => state.bookmarkedNodeIds);
  const markNodeVisited = useDexterStore((state) => state.markNodeVisited);
  const toggleNodeBookmark = useDexterStore((state) => state.toggleNodeBookmark);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<ForceNode>> | null>(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<ForceNode | null>(null);
  const pointerDownRef = useRef<{ node: ForceNode; x: number; y: number; didDrag: boolean } | null>(null);
  const nodesRef = useRef<ForceNode[]>([]);
  const linksRef = useRef<ForceLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<ForceNode | null>(null);
  const [hoverCardPosition, setHoverCardPosition] = useState({ x: 0, y: 0 });
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
        markNodeVisited(pointerDown.node.id);
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
  }, [markNodeVisited, selectPaper]);

  return (
    <main className={screenClass}>
      <WorkflowHeader title={hypothesis}>
        <div className="flex items-center gap-3">
          {planFetchStatus === "error" && (
            <p className="font-mono text-[11px] font-bold uppercase text-critical max-w-[280px] truncate" title={apiError ?? ""}>
              Plan fetch failed — go back to retry
            </p>
          )}
          <Button
            type="button"
            onClick={() => {
              if (planFetchStatus === "success") setCurrentScreen("PLAN_VIEW");
              else beginPlanGeneration();
            }}
            disabled={planFetchStatus === "error"}
            className="h-10 shrink-0 rounded-none border-2 border-industrial bg-accent px-5 font-mono text-xs font-bold uppercase text-accent-foreground hover:bg-accent disabled:opacity-50"
          >
            {planFetchStatus === "success" ? "View Plan" : "Continue to Plan"}
          </Button>
        </div>
      </WorkflowHeader>
      <section ref={graphWrapRef} className="dexter-force-graph relative h-[calc(100vh-60px)] overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
        <div className="pointer-events-none absolute bottom-5 left-5 border-2 border-industrial bg-card px-4 py-3 font-mono text-xs font-bold uppercase dexter-shadow">
          Drag nodes / weighted force network / live literature topology
        </div>
        <PaperHoverCard node={selectedPaper ? null : hoveredNode} position={hoverCardPosition} />
        <PaperDetailOverlay
          paper={selectedPaper}
          bookmarked={selectedPaper ? bookmarkedNodeIds.has(selectedPaper.id) : false}
          onToggleBookmark={toggleNodeBookmark}
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
          {paper.url && (
            <a
              href={paper.url}
              className="font-mono text-xs text-teal underline mt-4 inline-block"
              target="_blank"
              rel="noreferrer"
            >
              Open ({paper.source})
            </a>
          )}
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

function HighlightableText({
  text,
  reportId,
  highlights,
  onQueuedHover,
  onQueuedLeave,
}: {
  text: string;
  reportId: string;
  highlights: ReportHighlight[];
  onQueuedHover?: (highlight: ReportHighlight, element: HTMLElement) => void;
  onQueuedLeave?: () => void;
}) {
  const sortedHighlights = [...highlights]
    .filter((highlight) => highlight.reportId === reportId)
    .sort((a, b) => a.start - b.start);
  if (!sortedHighlights.length) return <>{text}</>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  sortedHighlights.forEach((highlight) => {
    const start = Math.max(cursor, Math.min(highlight.start, text.length));
    const end = Math.max(start, Math.min(highlight.end, text.length));
    if (cursor < start) nodes.push(<span key={`${highlight.key}-before`}>{text.slice(cursor, start)}</span>);
    if (start < end) {
      nodes.push(
        <mark
          key={highlight.key}
          className={cn("dexter-report-selected", highlight.correction && "dexter-report-queued")}
          data-highlight-key={highlight.key}
          onMouseEnter={(event) => {
            if (highlight.correction) onQueuedHover?.(highlight, event.currentTarget);
          }}
          onMouseLeave={() => {
            if (highlight.correction) onQueuedLeave?.();
          }}
          title={highlight.correction ? `Queued correction: ${highlight.correction}` : undefined}
        >
          {text.slice(start, end)}
        </mark>,
      );
    }
    cursor = end;
  });
  if (cursor < text.length) nodes.push(<span key={`${reportId}-tail`}>{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

const GENERATING_SECTIONS: { id: string; title: string; label: string; placeholder: string }[] = [
  { id: "summary", title: "Summary", label: "§ SUMMARY", placeholder: "Summary copy will assemble shortly..." },
  { id: "novelty", title: "Novelty", label: "§ NOVELTY", placeholder: "Cross-referencing prior literature..." },
  { id: "assumptions", title: "Assumptions", label: "§ ASSUMPTIONS", placeholder: "Listing operating assumptions..." },
  { id: "protocol", title: "Protocol", label: "§ PROTOCOL", placeholder: "Drafting step-by-step protocol..." },
  { id: "materials", title: "Materials", label: "§ MATERIALS", placeholder: "Resolving catalog numbers and pricing..." },
  { id: "equipment", title: "Equipment", label: "§ EQUIPMENT", placeholder: "Selecting required and optional equipment..." },
  { id: "budget", title: "Budget", label: "§ BUDGET", placeholder: "Computing line items and overhead..." },
  { id: "timeline", title: "Timeline", label: "§ TIMELINE", placeholder: "Sequencing phases and milestones..." },
  { id: "validation", title: "Validation", label: "§ VALIDATION", placeholder: "Defining outcomes, controls, failure modes..." },
  { id: "sources", title: "Sources", label: "§ SOURCES", placeholder: "Compiling citations and excerpts..." },
];

const FALLBACK_ACTIVITY: string[] = [
  "[LAB-LOG] Initializing experiment design pipeline...",
  "[LAB-LOG] Searching protocols.io for relevant protocols...",
  "[LAB-LOG] Reading methodology from seed papers...",
  "[LAB-LOG] Querying supplier catalogs for materials...",
  "[LAB-LOG] Computing budget and contingency...",
  "[LAB-LOG] Validating timeline dependencies...",
  "[LAB-LOG] Cross-referencing materials with protocol steps...",
  "[LAB-LOG] Plan ready",
];

function PlanGeneratingScreen() {
  const plan = useDexterStore((state) => state.plan);
  const setCurrentScreen = useDexterStore((state) => state.setCurrentScreen);
  const planFetchStatus = useDexterStore((state) => state.planFetchStatus);
  const apiError = useDexterStore((state) => state.apiError);
  const activity = plan.activity.length > 0 ? plan.activity : FALLBACK_ACTIVITY;
  const [visibleItems, setVisibleItems] = useState(1);

  useEffect(() => {
    const feedTimer = window.setInterval(() => {
      setVisibleItems((current) => Math.min(current + 1, activity.length));
    }, 1500);
    return () => window.clearInterval(feedTimer);
  }, [activity.length]);

  useEffect(() => {
    if (planFetchStatus === "success") setCurrentScreen("PLAN_VIEW");
  }, [planFetchStatus, setCurrentScreen]);

  return (
    <main className={cn(screenClass, "grid min-h-screen grid-cols-1 lg:grid-cols-[60%_40%]")}>
      <section className="border-r-2 border-ink">
        <WorkflowHeader title="DEXTER / GENERATING PLAN" />
        <div className="p-8 lg:p-12">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-teal">
            DEXTER / GENERATING PLAN
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold text-ink">Experiment skeleton</h1>
          <div className="mt-10 space-y-4">
            {GENERATING_SECTIONS.map((section, index) => {
              const filled = index < visibleItems;
              return (
                <div
                  key={section.id}
                  className={cn(
                    "relative rounded-none p-5 transition-all",
                    filled
                      ? "border-2 border-ink bg-cream-100 shadow-card"
                      : "border-2 border-chrome bg-cream-50 text-concrete",
                  )}
                >
                  <span className="dexter-section-label absolute top-3 right-4">{section.label}</span>
                  <h2 className="font-display text-2xl font-semibold pr-32">{section.title}</h2>
                  <p className="mt-3 text-sm leading-6">
                    {filled ? section.placeholder : "████████████████████ ███████████████ ███████████"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="bg-cream-100 border-l-2 border-ink p-8 lg:p-12">
        <p className="dexter-section-label">§ LAB-LOG</p>
        <h2 className="mt-2 font-display text-4xl font-semibold text-ink">Activity feed</h2>
        <div className="mt-8 space-y-3 font-mono text-xs leading-6 text-ink-grey">
          {planFetchStatus === "error" && (
            <div className="border-l-[3px] border-critical bg-critical/10 p-3 text-critical font-bold">
              <p>! Plan generation failed</p>
              <p className="mt-1 font-normal text-xs">{apiError}</p>
              <button
                type="button"
                onClick={() => setCurrentScreen("HYPOTHESIS_INPUT")}
                className="mt-2 underline"
              >
                Back to hypothesis
              </button>
            </div>
          )}
          {activity.slice(0, visibleItems).map((line) => {
            const lower = line.toLowerCase();
            const success = lower.includes("found") || lower.includes("confirmed") || lower.includes("ready") || lower.includes("assembled");
            return (
              <p key={line} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {success && <span className="text-success font-bold mr-1">✓</span>}
                {line}
              </p>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const PLAN_TOC: { id: string; title: string; label: string }[] = [
  { id: "summary", title: "Summary", label: "§ SUMMARY" },
  { id: "novelty", title: "Novelty", label: "§ NOVELTY" },
  { id: "assumptions", title: "Assumptions", label: "§ ASSUMPTIONS" },
  { id: "protocol", title: "Protocol", label: "§ PROTOCOL" },
  { id: "materials", title: "Materials", label: "§ MATERIALS" },
  { id: "equipment", title: "Equipment", label: "§ EQUIPMENT" },
  { id: "budget", title: "Budget", label: "§ BUDGET" },
  { id: "timeline", title: "Timeline", label: "§ TIMELINE" },
  { id: "validation", title: "Validation", label: "§ VALIDATION" },
  { id: "sources", title: "Sources", label: "§ SOURCES" },
];

const BUDGET_CATEGORY_COLORS: Record<string, string> = {
  reagents: "var(--teal)",
  consumables: "var(--mustard)",
  cell_lines: "var(--teal-light)",
  equipment_time: "var(--ink-grey)",
  personnel: "var(--success)",
  overhead: "var(--concrete)",
  other: "var(--chrome)",
};

function PlanViewScreen() {
  const hypothesis = useDexterStore((state) => state.hypothesis);
  const plan = useDexterStore((state) => state.plan);
  const [activeSection, setActiveSection] = useState<string>(PLAN_TOC[0].id);
  const [highlightedMaterialId, setHighlightedMaterialId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    PLAN_TOC.forEach((section) => {
      const element = sectionRefs.current[section.id];
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  const materialById = (id: string) => plan.materials.find((m) => m.id === id);

  const noveltyBadge =
    plan.novelty_check.status === "novel"
      ? "bg-success text-white"
      : plan.novelty_check.status === "incremental"
        ? "bg-mustard text-ink"
        : "bg-critical text-white";

  const downloadReportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;
      const addPage = () => {
        pdf.addPage();
        pdf.setFillColor(252, 247, 236);
        pdf.rect(0, 0, pageWidth, pageHeight, "F");
        y = margin;
      };
      const ensureSpace = (h: number) => {
        if (y + h > pageHeight - margin) addPage();
      };
      const writeWrapped = (text: string, size: number, lh: number, style: "normal" | "bold" = "normal") => {
        pdf.setFont("times", style);
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text, contentWidth) as string[];
        ensureSpace(lines.length * lh + 3);
        pdf.text(lines, margin, y, { baseline: "top" });
        y += lines.length * lh + 3;
      };
      pdf.setFillColor(252, 247, 236);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      writeWrapped("Dexter experimental plan", 22, 9, "bold");
      writeWrapped(hypothesis, 11, 6);
      writeWrapped(`Duration: ${plan.duration_weeks} weeks  /  Budget: EUR ${plan.budget_total_eur.toLocaleString()}`, 10, 5);

      writeWrapped("Summary", 16, 8, "bold");
      writeWrapped(plan.summary, 11, 6);

      writeWrapped("Novelty", 16, 8, "bold");
      writeWrapped(`[${plan.novelty_check.status}] ${plan.novelty_check.summary}`, 11, 6);

      writeWrapped("Assumptions", 16, 8, "bold");
      plan.assumptions.forEach((a) => writeWrapped(`• ${a}`, 11, 6));

      writeWrapped("Protocol", 16, 8, "bold");
      plan.protocol.steps.forEach((step) => {
        writeWrapped(`${step.step_number}. ${step.title}`, 12, 6, "bold");
        writeWrapped(step.description, 10, 5);
      });

      writeWrapped("Materials", 16, 8, "bold");
      plan.materials.forEach((m) => {
        writeWrapped(`${m.id} ${m.name} — ${m.supplier} ${m.catalog_number} — EUR ${m.total_cost_eur}`, 10, 5);
      });

      writeWrapped("Budget", 16, 8, "bold");
      plan.budget.lines.forEach((l) => writeWrapped(`${l.category}: ${l.description} — EUR ${l.cost_eur}`, 10, 5));
      writeWrapped(`Total: EUR ${plan.budget.total_eur.toLocaleString()}`, 12, 6, "bold");

      writeWrapped("Timeline", 16, 8, "bold");
      plan.timeline.phases.forEach((p) =>
        writeWrapped(`Phase ${p.phase_number}: ${p.name} (week ${p.start_week}-${p.end_week})`, 10, 5),
      );

      writeWrapped("Validation", 16, 8, "bold");
      plan.validation.outcomes.forEach((o) =>
        writeWrapped(`${o.primary ? "[PRIMARY] " : ""}${o.name}: ${o.threshold}`, 10, 5),
      );
      if (plan.validation.statistical_design) writeWrapped(plan.validation.statistical_design, 10, 5);

      writeWrapped("Sources", 16, 8, "bold");
      plan.sources.forEach((s) => writeWrapped(`${s.id} ${s.title} (${s.year ?? "n/a"}) — ${s.url}`, 9, 4));

      if (plan.comments.length) {
        writeWrapped("Notes", 16, 8, "bold");
        plan.comments.forEach((c) => writeWrapped(`• ${c}`, 10, 5));
      }

      pdf.save("dexter-experimental-report.pdf");
    } finally {
      setExportingPdf(false);
    }
  };

  const sectionCard = (id: string, label: string, title: string, body: ReactNode) => (
    <section
      key={id}
      id={id}
      ref={(el) => {
        sectionRefs.current[id] = el;
      }}
      className="scroll-mt-32"
    >
      <div className="relative border-2 border-ink bg-cream-100 p-6 shadow-card mb-6 rounded-none">
        <span className="dexter-section-label absolute top-3 right-4">{label}</span>
        <h2 className="font-display text-2xl font-semibold mb-4 pr-32 text-ink">{title}</h2>
        {body}
      </div>
    </section>
  );

  return (
    <main className={cn(screenClass, "bg-cream-50 min-h-screen")}>
      {/* Top banner */}
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-cream-100 px-8 py-4 min-h-[80px] flex items-center gap-6">
        <WorkflowBackButton />
        <p className="font-mono text-xs text-ink-grey line-clamp-2 flex-1 max-w-[50%] truncate">
          {hypothesis}
        </p>
        <div className="flex gap-8 ml-auto">
          {[
            { label: "DURATION", value: `${plan.duration_weeks} weeks` },
            { label: "BUDGET", value: `EUR ${plan.budget_total_eur.toLocaleString()}` },
            { label: "PRIMARY OUTCOME", value: plan.primary_outcome_label },
          ].map((stat) => (
            <div key={stat.label} className="text-right">
              <p
                className="font-mono uppercase text-concrete"
                style={{ fontSize: "11px", letterSpacing: "0.05em" }}
              >
                {stat.label}
              </p>
              <p className="font-display font-semibold text-teal" style={{ fontSize: "32px", lineHeight: 1.05 }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[22%_55%_23%] gap-6 px-6 py-8">
        {/* Left TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-28 flex flex-col gap-1">
            <p className="dexter-section-label mb-3">§ TABLE OF CONTENTS</p>
            {PLAN_TOC.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition-colors",
                  activeSection === s.id
                    ? "text-teal font-semibold border-l-2 border-teal"
                    : "text-ink-grey border-l-2 border-transparent hover:text-ink",
                )}
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main column */}
        <section className="min-w-0">
          {/* Summary */}
          {sectionCard(
            "summary",
            "§ SUMMARY",
            "Summary",
            <p
              className="font-display text-ink"
              style={{ fontSize: "22px", lineHeight: 1.5, fontWeight: 500 }}
            >
              {plan.summary}
            </p>,
          )}

          {/* Novelty */}
          {sectionCard(
            "novelty",
            "§ NOVELTY",
            "Novelty check",
            <div>
              <span
                className={cn(
                  "inline-block font-mono text-xs uppercase border border-ink px-2.5 py-1 rounded-none mb-3",
                  noveltyBadge,
                )}
              >
                {plan.novelty_check.status.replace(/_/g, " ")}
              </span>
              <p className="text-base leading-7 text-ink">
                {plan.novelty_check.summary}
              </p>
              {plan.novelty_check.related_paper_ids.length > 0 && (
                <p className="mt-3 text-sm text-concrete">
                  Related papers:{" "}
                  <span className="font-mono">{plan.novelty_check.related_paper_ids.join(", ")}</span>
                </p>
              )}
            </div>,
          )}

          {/* Assumptions */}
          {sectionCard(
            "assumptions",
            "§ ASSUMPTIONS",
            "Assumptions",
            <ul className="space-y-2">
              {plan.assumptions.map((a, i) => (
                <li key={i} className="text-base leading-7 text-ink">
                  <span className="text-concrete mr-2">•</span>
                  {a}
                </li>
              ))}
            </ul>,
          )}

          {/* Protocol */}
          {sectionCard(
            "protocol",
            "§ PROTOCOL",
            "Protocol",
            <div className="space-y-4">
              {plan.protocol.steps.map((step) => (
                <div key={step.step_number} className="border border-chrome bg-cream-50 p-4 rounded-none">
                  <div className="flex gap-4">
                    <div className="font-mono text-concrete shrink-0" style={{ fontSize: "24px", lineHeight: 1 }}>
                      {String(step.step_number).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-lg text-ink">{step.title}</h3>
                      <p className="text-base text-ink mt-1" style={{ lineHeight: 1.6 }}>
                        {step.description}
                      </p>
                      {step.duration_minutes > 0 && (
                        <p className="mt-2 font-mono text-[11px] uppercase text-concrete">
                          Duration: {step.duration_minutes} min
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>,
          )}

          {/* Materials */}
          {sectionCard(
            "materials",
            "§ MATERIALS",
            "Materials",
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-ink">
                    {["ID", "Name", "Category", "Supplier", "Catalog #", "Qty", "Unit Cost", "Total"].map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          "font-mono uppercase py-2 px-2",
                          i >= 5 ? "text-right" : "text-left",
                        )}
                        style={{ fontSize: "11px" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.materials.map((m) => (
                    <tr
                      key={m.id}
                      id={`material-row-${m.id}`}
                      className={cn(
                        "border-b border-chrome hover:bg-teal/5 transition-colors",
                        highlightedMaterialId === m.id && "bg-teal/10",
                      )}
                    >
                      <td className="py-3 px-2 font-mono text-xs">{m.id}</td>
                      <td className="py-3 px-2">{m.name}</td>
                      <td className="py-3 px-2 font-mono text-xs text-concrete">{m.category}</td>
                      <td className="py-3 px-2 font-mono text-xs">{m.supplier}</td>
                      <td className="py-3 px-2 font-mono text-xs">{m.catalog_number}</td>
                      <td className="py-3 px-2 text-right font-mono text-xs">{m.quantity}</td>
                      <td className="py-3 px-2 text-right font-mono">€{m.unit_cost_eur}</td>
                      <td className="py-3 px-2 text-right font-mono font-semibold">€{m.total_cost_eur}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-ink font-bold">
                    <td colSpan={7} className="py-3 px-2 text-right font-mono uppercase text-xs">
                      Total
                    </td>
                    <td className="py-3 px-2 text-right font-mono">
                      €{plan.materials.reduce((sum, m) => sum + m.total_cost_eur, 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>,
          )}

          {/* Equipment */}
          {sectionCard(
            "equipment",
            "§ EQUIPMENT",
            "Equipment",
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-mono text-xs uppercase text-concrete mb-3">▪ Required</h3>
                <ul className="space-y-2">
                  {plan.equipment
                    .filter((e) => e.required)
                    .map((e, i) => (
                      <li key={i} className="text-sm text-ink">
                        <span className="font-medium">{e.name}</span>
                        {e.notes && <span className="block text-xs text-concrete mt-0.5">{e.notes}</span>}
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <h3 className="font-mono text-xs uppercase text-concrete mb-3">▫ Nice-to-have</h3>
                <ul className="space-y-2">
                  {plan.equipment
                    .filter((e) => !e.required)
                    .map((e, i) => (
                      <li key={i} className="text-sm text-ink">
                        <span className="font-medium">{e.name}</span>
                        {e.notes && <span className="block text-xs text-concrete mt-0.5">{e.notes}</span>}
                      </li>
                    ))}
                </ul>
              </div>
            </div>,
          )}

          {/* Budget */}
          {sectionCard(
            "budget",
            "§ BUDGET",
            "Budget",
            <div>
              <div className="flex h-8 border-2 border-ink mb-4 overflow-hidden">
                {plan.budget.lines.map((l, i) => {
                  const pct = (l.cost_eur / plan.budget.total_eur) * 100;
                  return (
                    <div
                      key={i}
                      title={`${l.category}: €${l.cost_eur}`}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: BUDGET_CATEGORY_COLORS[l.category] ?? "var(--chrome)",
                      }}
                    />
                  );
                })}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {plan.budget.lines.map((l, i) => (
                    <tr key={i} className="border-b border-chrome">
                      <td className="py-2 font-mono text-xs uppercase text-concrete w-40">{l.category}</td>
                      <td className="py-2 text-ink">{l.description}</td>
                      <td className="py-2 text-right font-mono">€{l.cost_eur.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p
                className="mt-4 font-display text-critical text-right"
                style={{ fontSize: "36px", fontWeight: 600 }}
              >
                €{plan.budget.total_eur.toLocaleString()}
              </p>
              <p className="text-xs text-concrete text-right">
                Includes {plan.budget.contingency_pct}% overhead
              </p>
            </div>,
          )}

          {/* Timeline */}
          {sectionCard(
            "timeline",
            "§ TIMELINE",
            "Timeline",
            <div className="space-y-2">
              {plan.timeline.phases.map((p) => {
                const widthPct = ((p.end_week - p.start_week + 1) / plan.timeline.total_weeks) * 100;
                const leftPct = ((p.start_week - 1) / plan.timeline.total_weeks) * 100;
                return (
                  <div key={p.phase_number} className="flex items-center gap-3">
                    <div
                      className="font-mono text-xs text-concrete shrink-0 text-right"
                      style={{ width: "20px" }}
                    >
                      {p.phase_number}
                    </div>
                    <div className="font-medium text-sm shrink-0" style={{ width: "180px" }}>
                      {p.name}
                    </div>
                    <div className="relative flex-1 h-6 bg-cream-50 border border-chrome">
                      <div
                        className="absolute h-full bg-teal flex items-center px-2 text-white text-xs font-mono"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      >
                        wk {p.start_week}-{p.end_week}
                      </div>
                      {p.milestones.length > 0 && (
                        <span
                          className="absolute -right-4 top-1/2 -translate-y-1/2 text-mustard"
                          title={p.milestones.join(" / ")}
                        >
                          ▶
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-concrete mt-3 font-mono">
                Total {plan.timeline.total_weeks} weeks
              </p>
            </div>,
          )}

          {/* Validation */}
          {sectionCard(
            "validation",
            "§ VALIDATION",
            "Validation",
            <div className="space-y-5">
              {(() => {
                const primary = plan.validation.outcomes.find((o) => o.primary);
                const secondaries = plan.validation.outcomes.filter((o) => !o.primary);
                return (
                  <>
                    {primary && (
                      <div className="border-2 border-ink bg-cream-50 p-4">
                        <p className="dexter-section-label mb-2">PRIMARY OUTCOME</p>
                        <h4 className="font-display text-xl font-semibold text-ink">{primary.name}</h4>
                        <p className="mt-2 text-sm text-ink-grey">
                          <span className="font-mono text-xs uppercase text-concrete">measurement: </span>
                          {primary.measurement}
                        </p>
                        <p className="mt-1 text-sm text-ink-grey">
                          <span className="font-mono text-xs uppercase text-concrete">threshold: </span>
                          {primary.threshold}
                        </p>
                      </div>
                    )}
                    {secondaries.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {secondaries.map((o, i) => (
                          <div key={i} className="border border-chrome bg-cream-50 p-3">
                            <h4 className="font-semibold text-sm text-ink">{o.name}</h4>
                            <p className="mt-1 text-xs text-ink-grey">{o.measurement}</p>
                            <p className="mt-1 text-xs text-concrete font-mono">{o.threshold}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
              <div>
                <h3 className="font-mono text-xs uppercase text-concrete mb-2">Risks</h3>
                <ul className="space-y-1 text-sm">
                  {plan.validation.failure_modes.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium text-ink">{f.description}</span>
                      <span className="text-ink-grey"> — {f.mitigation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>,
          )}

          {/* Sources */}
          {sectionCard(
            "sources",
            "§ SOURCES",
            "Sources",
            <ul className="space-y-4">
              {plan.sources.map((s) => (
                <li key={s.id} className="border-l-2 border-chrome pl-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] uppercase border border-ink px-1.5 py-0.5">
                      {s.kind}
                    </span>
                    <span className="font-mono text-xs text-concrete">{s.id}</span>
                  </div>
                  <p className="font-medium text-ink">{s.title}</p>
                  <p className="text-sm text-concrete">
                    {s.authors} {s.year ? `· ${s.year}` : ""}
                  </p>
                  <a
                    href={s.url}
                    className="font-mono text-xs text-teal underline break-all"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.url}
                  </a>
                  {s.excerpt && <p className="italic text-sm text-ink-grey mt-1">{s.excerpt}</p>}
                </li>
              ))}
            </ul>,
          )}

          {/* CTA */}
          <Button
            type="button"
            onClick={downloadReportPdf}
            disabled={exportingPdf}
            className="mt-8 h-16 w-full rounded-none border-2 border-ink bg-critical text-white font-mono text-base font-bold uppercase shadow-button hover:shadow-card hover:-translate-x-px hover:-translate-y-px transition-all"
          >
            {exportingPdf ? "PREPARING PDF..." : "I'M HAPPY WITH THIS"}
          </Button>
        </section>

        {/* Right panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 lg:h-[calc(100vh-8rem)] overflow-auto pr-2">
            {highlightedMaterialId && (
              <div className="border-2 border-teal bg-cream-50 p-3 mb-6">
                <p className="dexter-section-label mb-1">FOCUSED MATERIAL</p>
                <p className="text-sm font-medium">
                  {materialById(highlightedMaterialId)?.name}
                </p>
                <button
                  type="button"
                  onClick={() => setHighlightedMaterialId(null)}
                  className="mt-2 font-mono text-[10px] text-teal underline"
                >
                  clear focus
                </button>
              </div>
            )}

            <p className="dexter-section-label mb-2">§ NOTES</p>
            {plan.comments.length === 0 ? (
              <p className="text-sm text-concrete">No notes yet</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {plan.comments.map((c, i) => (
                  <li key={i} className="border-l-2 border-chrome pl-3 text-ink-grey">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
