/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { Context } from "@opencode/plugin/tui/context"
import { createSignal } from "solid-js"
import { GoalBar } from "../../src/feature-plugins/prompt/goal"

test("goal bar pins the session's goal above the prompt and opens it on click", async () => {
  const color = RGBA.fromInts(200, 200, 200)
  const goal = {
    id: "goal",
    sessionID: "session",
    objective: "Make the test suite pass",
    status: "active",
    rounds: 3,
    maxRounds: 50,
    boot: "boot",
    updatedAt: 0,
  }
  const [metadata, setMetadata] = createSignal<Record<string, unknown>>({ "opencode.goal": goal })
  const dialogs: unknown[] = []
  const context = {
    theme: {
      text: {
        base: color,
        muted: color,
        feedback: { info: { base: color }, warning: { base: color }, success: { base: color } },
      },
      background: { raised: { base: RGBA.fromInts(20, 20, 20) } },
      decrease: (value: RGBA) => value,
    },
    ui: { dialog: { show: (render: unknown) => dialogs.push(render) }, toast: { show: () => {} } },
    data: {
      session: { get: () => ({ id: "session", location: { directory: "/workspace" }, metadata: metadata() }) },
    },
  } as unknown as Context
  const app = await testRender(() => <GoalBar context={context} sessionID="session" />, { width: 60, height: 4 })

  try {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(frame).toContain("◎ Goal · Make the test suite pass")
    // No round counter: the bar shows what the goal is and whether it runs.
    expect(frame).not.toMatch(/\d+\/\d+/)

    await app.mockMouse.click(4, 0)
    expect(dialogs).toHaveLength(1)

    setMetadata({ "opencode.goal": { ...goal, status: "paused", reason: "Stopped by the user" } })
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("◎ Goal paused · Make the test suite pass")

    setMetadata({ "opencode.goal": { ...goal, status: "complete" } })
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("◎ Goal met · Make the test suite pass")

    // A goal copied from a parent belongs to the parent, so the bar ignores it.
    setMetadata({ "opencode.goal": { ...goal, sessionID: "parent" } })
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("Goal")
  } finally {
    app.renderer.destroy()
  }
})
