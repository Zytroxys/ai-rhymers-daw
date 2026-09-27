/**
 * Pure radial-spoke geometry for the Word Graph panel -- no React, no DOM, so
 * it's cheap to unit test independent of rendering. Modeled on the reference
 * Datamuse visualization (a center node with pill nodes radiating out on
 * straight spokes), computed by hand rather than via a force-layout library:
 * every node's angle/radius is fixed by its position in its list, not by
 * physics simulation, which is all a two-level radial tree needs.
 */

import { RhymeQuality } from '../rhyme/rhyme';

export type GraphNodeKind = 'center' | 'category' | 'leaf' | 'branch' | 'connector';

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: GraphNodeKind;
  color?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  dashed?: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const VIEW_SIZE = 640;
export const CENTER = { x: VIEW_SIZE / 2, y: VIEW_SIZE / 2 };
export const CATEGORY_RADIUS = 140;
export const LEAF_RADIUS = 260;
export const BRANCH_RADIUS = 200;
export const CONNECTOR_RADIUS = 260;
const LEAF_FAN_SPREAD = (50 * Math.PI) / 180;

function evenAngles(count: number, startAngle = -Math.PI / 2): number[] {
  if (count <= 0) return [];
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, i) => startAngle + i * step);
}

function fanAngles(centerAngle: number, count: number, spread: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [centerAngle];
  const step = spread / (count - 1);
  const start = centerAngle - spread / 2;
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CENTER.x + radius * Math.cos(angle), y: CENTER.y + radius * Math.sin(angle) };
}

const QUALITY_COLOR: Record<RhymeQuality, string> = {
  identity: 'var(--muted)',
  perfect: 'var(--accent-2)',
  near: 'var(--accent)',
  slant: 'var(--muted)',
  assonance: 'var(--muted)',
  weak: 'var(--muted)',
};

export const STYLE_COLOR = 'var(--style-accent)';

/** Same 12-hue rotation the `.rhyme-group-N` CSS palette uses (30deg apart),
 * computed here for SVG `fill` since these pills are plain inline-colored
 * shapes rather than elements the CSS classes can target directly. Kept as
 * one shared formula so branch colors stay visually consistent with the rest
 * of the app's rhyme-family palette. */
export function branchColor(index: number): string {
  return `hsla(${(index * 30) % 360}, 70%, 55%, 0.55)`;
}

export interface WordGraphCategory {
  label: string;
  words: string[];
  color?: string;
}

/** Single-word mode: center -> category ring (Synonyms/Antonyms/Related/Your
 * style) -> each category's own words fanned around its own angle. The "Your
 * style" branch is just one more entry in `categories` -- no special-casing
 * needed here, it gets the same even spacing as every other category. */
export function layoutSingleWord(center: string, categories: WordGraphCategory[]): GraphLayout {
  const nodes: GraphNode[] = [{ id: 'center', label: center, x: CENTER.x, y: CENTER.y, kind: 'center' }];
  const edges: GraphEdge[] = [];

  const angles = evenAngles(categories.length);
  categories.forEach((category, i) => {
    const angle = angles[i];
    const pos = polar(CATEGORY_RADIUS, angle);
    const categoryId = `category:${i}`;
    nodes.push({ id: categoryId, label: category.label, x: pos.x, y: pos.y, kind: 'category', color: category.color });
    edges.push({ from: 'center', to: categoryId });

    const leafAngles = fanAngles(angle, category.words.length, LEAF_FAN_SPREAD);
    category.words.forEach((word, j) => {
      const leafPos = polar(LEAF_RADIUS, leafAngles[j]);
      const leafId = `leaf:${i}:${j}`;
      nodes.push({ id: leafId, label: word, x: leafPos.x, y: leafPos.y, kind: 'leaf', color: category.color });
      edges.push({ from: categoryId, to: leafId });
    });
  });

  return { nodes, edges };
}

export interface PhraseRhymeMatch {
  word: string;
  quality: RhymeQuality;
}

/** Phrase mode: a single flat ring of rhyme-match leaves (closest to the
 * reference screenshot's shape), colored by rhyme quality. Style suggestions
 * are appended as their own contiguous arc within the same ring, in a
 * dedicated color, rather than interleaved -- `evenAngles` hands out angles
 * in list order, so keeping matches first and style words last keeps each
 * group contiguous with no extra positioning logic. */
export function layoutPhraseRhymes(
  center: string,
  matches: PhraseRhymeMatch[],
  styleWords: string[] = [],
): GraphLayout {
  const nodes: GraphNode[] = [{ id: 'center', label: center, x: CENTER.x, y: CENTER.y, kind: 'center' }];
  const edges: GraphEdge[] = [];

  const items: { label: string; color: string }[] = [
    ...matches.map((m) => ({ label: m.word, color: QUALITY_COLOR[m.quality] })),
    ...styleWords.map((w) => ({ label: w, color: STYLE_COLOR })),
  ];

  const angles = evenAngles(items.length);
  items.forEach((item, i) => {
    const pos = polar(BRANCH_RADIUS, angles[i]);
    const id = `leaf:${i}`;
    nodes.push({ id, label: item.label, x: pos.x, y: pos.y, kind: 'leaf', color: item.color });
    edges.push({ from: 'center', to: id });
  });

  return { nodes, edges };
}

export interface WordGraphBranch {
  label: string;
  color: string;
}

export interface WordGraphConnector {
  fromIdx: number;
  toIdx: number;
  kind: 'sounds-like' | 'means-like';
  label: string;
}

/** Comma mode: one ring of branch nodes (one per comma-separated phrase, plus
 * an optional trailing "Your style" pseudo-branch the caller appends the same
 * way as any other branch), with connector nodes bridging only *adjacent*
 * branches -- placed at the angular midpoint between the two, one ring
 * further out, with dashed edges to both so they read as secondary/inferred
 * relationships rather than primary spokes. */
export function layoutCommaBranches(branches: WordGraphBranch[], connectors: WordGraphConnector[]): GraphLayout {
  const nodes: GraphNode[] = [
    { id: 'center', label: branches.map((b) => b.label).join(' · '), x: CENTER.x, y: CENTER.y, kind: 'center' },
  ];
  const edges: GraphEdge[] = [];

  const angles = evenAngles(branches.length);
  const branchIds = branches.map((_, i) => `branch:${i}`);
  branches.forEach((branch, i) => {
    const pos = polar(BRANCH_RADIUS, angles[i]);
    nodes.push({ id: branchIds[i], label: branch.label, x: pos.x, y: pos.y, kind: 'branch', color: branch.color });
    edges.push({ from: 'center', to: branchIds[i] });
  });

  connectors.forEach((connector, i) => {
    const midAngle = (angles[connector.fromIdx] + angles[connector.toIdx]) / 2;
    const pos = polar(CONNECTOR_RADIUS, midAngle);
    const id = `connector:${i}`;
    nodes.push({ id, label: connector.label, x: pos.x, y: pos.y, kind: 'connector' });
    edges.push({ from: id, to: branchIds[connector.fromIdx], dashed: true });
    edges.push({ from: id, to: branchIds[connector.toIdx], dashed: true });
  });

  return { nodes, edges };
}
