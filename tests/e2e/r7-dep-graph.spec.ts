/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M3 spec R7 E2E — DepGraphView: dependency graph with nodes,
 * typed edges, blocked highlights, click-to-open.
 *
 * Given the fixture workspace from scripts/make-fixture.sh
 * (25 issues, 5 blocks edges, 5 parent-child edges, 2 blocked
 * statuses — see make-fixture.sh's footer + tests/graph.rs in
 * src-tauri/tests/),
 *
 *   when the user switches to the Graph view,
 *     then one SVG node per issue renders (>=20 nodes) AND
 *     one SVG edge per dependency renders (>=5 edges) AND
 *     at least one node carries data-blocked="true" (the
 *     fixture sets OPT and REFAC to status=blocked) AND
 *     the canvas exposes its pan/zoom state via data
 *     attributes so the wheel-zoom math is observable.
 *   and when the user clicks a node,
 *     then the issue detail drawer opens.
 *
 * The fixture contract is asserted in src-tauri/tests/graph.rs;
 * this spec asserts only what the React side does with the data.
 * The ">=20 nodes / >=5 edges" floors below are the documented
 * fixture minima per scripts/make-fixture.sh — bumping the
 * fixture (or asserting exact counts) is fine; the spec stays
 * useful as long as the React side renders what bd_graph returns.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary —
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * The "open the fixture workspace" step is shared via
 * tests/e2e/helpers.ts — see that file for the isolation
 * rationale.
 */

import { browser, expect, $, $$ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

describe('Collier M3 R7 dependency graph', () => {
  before(async () => {
    await openFixtureWorkspace('r7')

    // The fixture is fully loaded once the issue-list footer
    // reports 25 issues. The graph view derives its nodes from
    // the same `bd list --all` call (commands.bdGraph wraps it),
    // so waiting for the list guarantees the graph has the
    // full node set on first paint.
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(
          () =>
            document.querySelector('[data-testid="list-footer"]')
              ?.textContent ?? null
        )
        return typeof text === 'string' && text.includes('25 issues')
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'full fixture never loaded',
      }
    )
  })

  it('renders one SVG node per issue and one SVG edge per dependency', async () => {
    // -- When: switch to the Graph view via the sidebar --
    const graphTab = await $('[data-testid="sidebar-view-graph"]')
    await graphTab.waitForDisplayed({ timeout: 5_000 })
    await graphTab.click()

    // -- Then: the DepGraphView mounts --
    const graphView = await $('[data-testid="dep-graph-view"]')
    await graphView.waitForDisplayed({ timeout: 10_000 })

    const canvas = await $('[data-testid="graph-canvas"]')
    await canvas.waitForDisplayed({ timeout: 10_000 })

    // -- And: the node count + edge count are wired up --
    const nodeCountAttr = await graphView.getAttribute('data-node-count')
    const edgeCountAttr = await graphView.getAttribute('data-edge-count')
    const nodeCount = Number.parseInt(nodeCountAttr ?? '', 10)
    const edgeCount = Number.parseInt(edgeCountAttr ?? '', 10)
    expect(Number.isFinite(nodeCount) && nodeCount >= 20).toBe(true)
    expect(Number.isFinite(edgeCount) && edgeCount >= 5).toBe(true)

    // -- And: at least that many SVG node groups + edge groups
    //    are rendered in the DOM. Using >=
    //    document.querySelectorAll(...).length matches the
    //    floor contract (extra nodes from a future fixture bump
    //    don't break the spec).
    const nodes = await $$('[data-testid="graph-node"]')
    expect(nodes.length).toBeGreaterThanOrEqual(20)
    const edges = await $$('[data-testid="graph-edge"]')
    expect(edges.length).toBeGreaterThanOrEqual(5)
  })

  it('highlights at least one blocked node and reports the count', async () => {
    // Re-navigate so the view is mounted regardless of what the
    // sibling test left behind.
    const graphTab = await $('[data-testid="sidebar-view-graph"]')
    await graphTab.click()
    const graphView = await $('[data-testid="dep-graph-view"]')
    await graphView.waitForDisplayed({ timeout: 5_000 })

    // The fixture sets OPT and REFAC to status=blocked. The
    // React component surfaces this via data-blocked="true"
    // and a header counter — both must agree on a non-zero
    // count, otherwise the highlight feature is broken.
    const blockedNodes = await $$(
      '[data-testid="graph-node"][data-blocked="true"]'
    )
    expect(blockedNodes.length).toBeGreaterThanOrEqual(1)

    const blockedCounter = await $('[data-testid="graph-blocked-count"]')
    await blockedCounter.waitForDisplayed({ timeout: 5_000 })
    const counterText = (await blockedCounter.getText()) ?? ''
    const counterMatch = counterText.match(/(\d+)/)
    const counterValue =
      counterMatch && counterMatch[1]
        ? Number.parseInt(counterMatch[1], 10)
        : NaN
    expect(Number.isFinite(counterValue) && counterValue >= 1).toBe(true)
    // The DOM count and the header count must agree.
    expect(counterValue).toBe(blockedNodes.length)
  })

  it('classifies at least one edge as a "blocker" kind', async () => {
    // The fixture seeds blocks edges (MIGRATE->OPT, OPT->CACHE,
    // REFAC->LOGIN, INV->BUG1, OAUTH->LOGIN). The view tags
    // them with data-kind="blocker" so the SVG renderer can
    // pick the right stroke colour + arrow head style.
    const graphTab = await $('[data-testid="sidebar-view-graph"]')
    await graphTab.click()
    const graphView = await $('[data-testid="dep-graph-view"]')
    await graphView.waitForDisplayed({ timeout: 5_000 })

    const blockerEdges = await $$(
      '[data-testid="graph-edge"][data-kind="blocker"]'
    )
    expect(blockerEdges.length).toBeGreaterThanOrEqual(1)
    // And at least one parent-child edge (the fixture seeds 5).
    const parentEdges = await $$(
      '[data-testid="graph-edge"][data-dep-type="parent-child"]'
    )
    expect(parentEdges.length).toBeGreaterThanOrEqual(1)
  })

  it('opens the issue detail drawer when a node is clicked', async () => {
    const graphTab = await $('[data-testid="sidebar-view-graph"]')
    await graphTab.click()
    const graphView = await $('[data-testid="dep-graph-view"]')
    await graphView.waitForDisplayed({ timeout: 5_000 })

    const nodes = await $$('[data-testid="graph-node"]')
    expect(nodes.length).toBeGreaterThan(0)
    // Click any node — the contract is "clicking a node opens
    // the drawer", not "clicking a specific node". Pick the
    // first one for determinism.
    const firstNode = nodes[0] as unknown as WebdriverIO.Element
    const nodeId = await firstNode.getAttribute('data-node-id')
    expect(nodeId).toBeTruthy()
    await firstNode.click()

    // The issue detail drawer uses data-testid="issue-detail-view"
    // (same selector the r5 epic spec uses). Wait for it
    // explicitly so the assertion doesn't race React's commit.
    const drawer = await $('[data-testid="issue-detail-view"]')
    await drawer.waitForDisplayed({ timeout: 5_000 })

    // ponytail: clean up the drawer so the next test's sidebar
    // click (sidebar-view-graph) isn't intercepted by the
    // drawer's `fixed inset-0` backdrop. Same pattern as
    // r3-inline-edit.spec.ts, r4-detail.spec.ts, and the
    // "renders a header dep badge" spec in r8 — see those
    // for the close-button selector + reverse waitForDisplayed
    // rationale.
    const closeButton = await $('[data-testid="close-button"]')
    await closeButton.waitForDisplayed({ timeout: 5_000 })
    await closeButton.click()
    await drawer.waitForDisplayed({ timeout: 1_000, reverse: true })
  })

  it('exposes pan + zoom attributes on the canvas', async () => {
    // Pan / zoom state lives on the SVG's data attributes so
    // the wheel-zoom math (zoomAroundPoint in depGraphLayout.ts)
    // is observable from outside. The initial values are 0/0/1
    // (centre happens after the first ResizeObserver fires; in
    // Xvfb + tauri-driver the viewport is non-zero so the
    // centre effect runs, but we only assert the attributes
    // exist — exact values are unit-tested in
    // depGraphLayout.test.ts).
    const graphTab = await $('[data-testid="sidebar-view-graph"]')
    await graphTab.click()
    const canvas = await $('[data-testid="graph-canvas"]')
    await canvas.waitForDisplayed({ timeout: 5_000 })

    expect(await canvas.getAttribute('data-pan-x')).not.toBeNull()
    expect(await canvas.getAttribute('data-pan-y')).not.toBeNull()
    expect(await canvas.getAttribute('data-zoom')).not.toBeNull()
  })
})
