import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation } from "d3-force";
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
const graphLayoutScale = 0.58;
const graphNodeRadius = (influence: number) => 17 + influence * 19;
const indexFromPaperId = (id: string) => Number(id.replace(/\D/g, "")) || 1;
const graphRingRadius = (index: number) => (index % 3 === 0 ? 138 : index % 3 === 1 ? 248 : 356) * graphLayoutScale;
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<ForceNode>> | null>(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const transformInitializedRef = useRef(false);
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
      nodes: plan.papers.map((paper, index) => {
        const angle = (index / Math.max(plan.papers.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const ring = graphRingRadius(index);
        return {
        id: paper.id,
        paper,
        influence: paper.influence,
        shortLabel: paper.id.toUpperCase(),
        val: graphNodeRadius(paper.influence),
        phase: indexFromPaperId(paper.id) * 1.37,
        x: Math.cos(angle) * ring,
        y: Math.sin(angle) * ring,
      };
      }),
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
          .distance((link) => 238 - link.weight * 72)
          .strength((link) => 0.06 + link.weight * 0.16),
      )
      .force("charge", forceManyBody<ForceNode>().strength((node) => -260 - node.influence * 170))
      .force("collide", forceCollide<ForceNode>().radius((node) => graphNodeRadius(node.influence) * (node.hoverScale ?? 1) + 30).strength(1))
      .force("radial", forceRadial<ForceNode>((node, index) => graphRingRadius(index), 0, 0).strength(0.13))
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
          const ringRadius = graphRingRadius(index);
          const orbitalForce = 0.01 + node.influence * 0.006;
          const waveForce = 0.014;
          const centerPull = Math.min(distance, 360) * 0.00016;
          const radialError = distance - ringRadius;
          node.vx =
            (node.vx ?? 0) +
            Math.cos(orbit) * orbitalForce +
            Math.sin(time / 820 + node.phase + index * 1.7) * waveForce -
            (x / distance) * centerPull -
            (x / distance) * radialError * 0.0038;
          node.vy =
            (node.vy ?? 0) +
            Math.sin(orbit) * orbitalForce +
            Math.cos(time / 900 + node.phase + index * 1.2) * waveForce -
            (y / distance) * centerPull -
            (y / distance) * radialError * 0.0038;
        }
        if (hovered && hovered !== node && (hovered.hoverCharge ?? 0) > 0.02) {
          const dx = (node.x ?? 0) - (hovered.x ?? 0);
          const dy = (node.y ?? 0) - (hovered.y ?? 0);
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const pressure = hovered.hoverCharge ?? 0;
          const safeDistance = graphNodeRadius(node.influence) * (node.hoverScale ?? 1) + graphNodeRadius(hovered.influence) * (hovered.hoverScale ?? 1) + 28;
          const radius = safeDistance + 170 + pressure * 230;
          const overlapPressure = Math.max(0, safeDistance - distance) / safeDistance;
          const falloff = Math.max(0, 1 - distance / radius);
          const influence = overlapPressure * 5.6 + falloff * falloff * (0.45 + pressure * 2.6);
          node.vx = (node.vx ?? 0) + (dx / distance) * influence * 3.2;
          node.vy = (node.vy ?? 0) + (dy / distance) * influence * 3.2;
        }
      });
      simulationRef.current?.alpha(Math.max(simulationRef.current.alpha(), hovered ? 0.2 : 0.1)).tick(1);
      const padding = Math.max(34, Math.min(graphSize.width, graphSize.height) * 0.055);
      const nodeExtents = nodes.map((node) => {
        const visualRadius = graphNodeRadius(node.influence) * (node.hoverScale ?? 1) + (bookmarkedNodeIds.has(node.id) ? 24 : 14);
        return {
          minX: (node.x ?? 0) - visualRadius,
          maxX: (node.x ?? 0) + visualRadius,
          minY: (node.y ?? 0) - visualRadius,
          maxY: (node.y ?? 0) + visualRadius + 18,
        };
      });
      const minX = Math.min(...nodeExtents.map((extent) => extent.minX)) - padding;
      const maxX = Math.max(...nodeExtents.map((extent) => extent.maxX)) + padding;
      const minY = Math.min(...nodeExtents.map((extent) => extent.minY)) - padding;
      const maxY = Math.max(...nodeExtents.map((extent) => extent.maxY)) + padding;
      const scale = Math.min(graphSize.width / Math.max(maxX - minX, 1), graphSize.height / Math.max(maxY - minY, 1), 2.45);
      const nextTransform = {
        scale,
        x: graphSize.width / 2 - ((minX + maxX) / 2) * scale,
        y: graphSize.height / 2 - ((minY + maxY) / 2) * scale,
      };
      transformRef.current = transformInitializedRef.current
        ? {
            scale: transformRef.current.scale + (nextTransform.scale - transformRef.current.scale) * 0.08,
            x: transformRef.current.x + (nextTransform.x - transformRef.current.x) * 0.08,
            y: transformRef.current.y + (nextTransform.y - transformRef.current.y) * 0.08,
          }
        : nextTransform;
      transformInitializedRef.current = true;
      if (hovered) {
        setHoverCardPosition({
          x: (hovered.x ?? 0) * transformRef.current.scale + transformRef.current.x,
          y: (hovered.y ?? 0) * transformRef.current.scale + transformRef.current.y,
        });
      }

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

    const releaseHoverPin = (node: ForceNode | null) => {
      if (node && node !== dragRef.current) {
        node.fx = undefined;
        node.fy = undefined;
      }
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
      const currentHovered = hoveredNode;
      if (currentHovered?.id !== nextHovered?.id) releaseHoverPin(currentHovered);
      if (nextHovered) {
        moveNodeTo(nextHovered, event);
        nextHovered.vx = 0;
        nextHovered.vy = 0;
        simulationRef.current?.alpha(0.2).restart();
      }
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
      releaseHoverPin(hoveredNode);
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
      releaseHoverPin(hoveredNode);
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
              "absolute right-24 top-5 flex h-9 w-9 items-center justify-center border-2 border-industrial bg-background transition-transform hover:-translate-y-0.5",
              bookmarked && "bg-primary text-primary-foreground",
            )}
          >
            <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 border-2 border-industrial bg-background px-3 py-1 font-mono text-xs font-bold uppercase transition-transform hover:-translate-y-0.5"
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