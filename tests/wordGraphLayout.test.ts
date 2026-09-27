import { describe, expect, it } from 'vitest';
import {
  BRANCH_RADIUS,
  CATEGORY_RADIUS,
  CENTER,
  LEAF_RADIUS,
  branchColor,
  layoutCommaBranches,
  layoutPhraseRhymes,
  layoutSingleWord,
} from '../src/ui/wordGraphLayout';

function distanceFromCenter(x: number, y: number): number {
  return Math.hypot(x - CENTER.x, y - CENTER.y);
}

/** Angle difference wrapped into [0, pi] so it stays correct across the
 * +-pi atan2 discontinuity, which real angle sequences can cross. */
function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}

describe('layoutSingleWord', () => {
  it('creates one category node per category plus one leaf per word', () => {
    const layout = layoutSingleWord('happy', [
      { label: 'Synonyms', words: ['glad', 'joyful'] },
      { label: 'Antonyms', words: ['sad'] },
    ]);
    expect(layout.nodes.filter((n) => n.kind === 'center')).toHaveLength(1);
    expect(layout.nodes.filter((n) => n.kind === 'category')).toHaveLength(2);
    expect(layout.nodes.filter((n) => n.kind === 'leaf')).toHaveLength(3);
  });

  it('places the center node at the layout origin', () => {
    const layout = layoutSingleWord('anything', [{ label: 'A', words: [] }]);
    const center = layout.nodes.find((n) => n.kind === 'center')!;
    expect(center.x).toBe(CENTER.x);
    expect(center.y).toBe(CENTER.y);
  });

  it('spaces category nodes evenly around the center, all at the same radius', () => {
    const layout = layoutSingleWord('x', [
      { label: 'A', words: [] },
      { label: 'B', words: [] },
      { label: 'C', words: [] },
    ]);
    const categories = layout.nodes.filter((n) => n.kind === 'category');
    categories.forEach((n) => expect(distanceFromCenter(n.x, n.y)).toBeCloseTo(CATEGORY_RADIUS, 5));

    const angles = categories.map((n) => Math.atan2(n.y - CENTER.y, n.x - CENTER.x));
    const expectedStep = (2 * Math.PI) / categories.length;
    for (let i = 1; i < angles.length; i += 1) {
      expect(angleDiff(angles[i], angles[i - 1])).toBeCloseTo(expectedStep, 5);
    }
  });

  it('places leaves further from the center than their parent category', () => {
    const layout = layoutSingleWord('x', [{ label: 'A', words: ['one', 'two', 'three'] }]);
    const leaves = layout.nodes.filter((n) => n.kind === 'leaf');
    expect(leaves).toHaveLength(3);
    leaves.forEach((leaf) => expect(distanceFromCenter(leaf.x, leaf.y)).toBeCloseTo(LEAF_RADIUS, 5));
    expect(LEAF_RADIUS).toBeGreaterThan(CATEGORY_RADIUS);
  });

  it('wires every leaf to its own category, not the center directly', () => {
    const layout = layoutSingleWord('x', [{ label: 'A', words: ['one'] }]);
    const leaf = layout.nodes.find((n) => n.kind === 'leaf')!;
    const category = layout.nodes.find((n) => n.kind === 'category')!;
    expect(layout.edges).toContainEqual({ from: category.id, to: leaf.id });
    expect(layout.edges.some((e) => e.from === 'center' && e.to === leaf.id)).toBe(false);
  });

  it('produces no leaves for a category with no words yet', () => {
    const layout = layoutSingleWord('x', [{ label: 'Loading', words: [] }]);
    expect(layout.nodes.filter((n) => n.kind === 'leaf')).toHaveLength(0);
    expect(layout.nodes.filter((n) => n.kind === 'category')).toHaveLength(1);
  });
});

describe('layoutPhraseRhymes', () => {
  it('places rhyme matches and style words together in one flat ring', () => {
    const layout = layoutPhraseRhymes(
      'magic dragon',
      [
        { word: 'tragic wagon', quality: 'perfect' },
        { word: 'classic beacon', quality: 'near' },
      ],
      ['bonus phrase'],
    );
    const leaves = layout.nodes.filter((n) => n.kind === 'leaf');
    expect(leaves).toHaveLength(3);
    leaves.forEach((leaf) => expect(distanceFromCenter(leaf.x, leaf.y)).toBeCloseTo(BRANCH_RADIUS, 5));
  });

  it('keeps style words as a contiguous trailing group, not interleaved with matches', () => {
    const layout = layoutPhraseRhymes(
      'x',
      [
        { word: 'a', quality: 'perfect' },
        { word: 'b', quality: 'perfect' },
      ],
      ['style-one', 'style-two'],
    );
    const leaves = layout.nodes.filter((n) => n.kind === 'leaf');
    expect(leaves.map((l) => l.label)).toEqual(['a', 'b', 'style-one', 'style-two']);
  });

  it('produces just the center node when there are no matches or style words', () => {
    const layout = layoutPhraseRhymes('x', [], []);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
  });
});

describe('layoutCommaBranches', () => {
  const branches = [
    { label: 'night', color: branchColor(0) },
    { label: 'light', color: branchColor(1) },
    { label: 'sight', color: branchColor(2) },
  ];

  it('creates one branch node per branch, all on the same ring', () => {
    const layout = layoutCommaBranches(branches, []);
    const branchNodes = layout.nodes.filter((n) => n.kind === 'branch');
    expect(branchNodes).toHaveLength(3);
    branchNodes.forEach((n) => expect(distanceFromCenter(n.x, n.y)).toBeCloseTo(BRANCH_RADIUS, 5));
  });

  it('gives every branch its own color, cycling the same 12-hue rotation', () => {
    expect(branchColor(0)).not.toBe(branchColor(1));
    expect(branchColor(0)).toBe(branchColor(12));
  });

  it('wires each connector only to its two declared branches', () => {
    const connectors = [
      { fromIdx: 0, toIdx: 1, kind: 'sounds-like' as const, label: 'sounds like' },
      { fromIdx: 1, toIdx: 2, kind: 'means-like' as const, label: 'means like' },
    ];
    const layout = layoutCommaBranches(branches, connectors);
    const connectorNodes = layout.nodes.filter((n) => n.kind === 'connector');
    expect(connectorNodes).toHaveLength(2);

    const branchIds = layout.nodes.filter((n) => n.kind === 'branch').map((n) => n.id);
    connectorNodes.forEach((connector) => {
      const edgesFromConnector = layout.edges.filter((e) => e.from === connector.id);
      expect(edgesFromConnector).toHaveLength(2);
      expect(edgesFromConnector.every((e) => branchIds.includes(e.to))).toBe(true);
      expect(edgesFromConnector.every((e) => e.dashed)).toBe(true);
    });
  });

  it('places a connector at the angular midpoint between its two branches, further out', () => {
    const connectors = [{ fromIdx: 0, toIdx: 1, kind: 'sounds-like' as const, label: 'sounds like' }];
    const layout = layoutCommaBranches(branches, connectors);
    const [a, b] = layout.nodes.filter((n) => n.kind === 'branch');
    const connector = layout.nodes.find((n) => n.kind === 'connector')!;

    const angleA = Math.atan2(a.y - CENTER.y, a.x - CENTER.x);
    const angleB = Math.atan2(b.y - CENTER.y, b.x - CENTER.x);
    const angleConnector = Math.atan2(connector.y - CENTER.y, connector.x - CENTER.x);

    expect(angleDiff(angleConnector, (angleA + angleB) / 2)).toBeCloseTo(0, 5);
    expect(distanceFromCenter(connector.x, connector.y)).toBeGreaterThan(BRANCH_RADIUS);
  });

  it('produces no connector nodes when none are given', () => {
    const layout = layoutCommaBranches(branches, []);
    expect(layout.nodes.filter((n) => n.kind === 'connector')).toHaveLength(0);
  });
});
