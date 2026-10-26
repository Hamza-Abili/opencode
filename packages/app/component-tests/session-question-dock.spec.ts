import { expect, story } from "../../stories/playwright/story"
import type { Locator, Page } from "@playwright/test"

story("resizes the dock to fit different answer counts", async ({ mount }) => {
  const component = await mount("app-current-session-surface--question-answer-counts")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const next = question.getByRole("button", { name: "Next", exact: true })
  await expect(question.getByRole("radio", { name: /Focused/ })).toBeFocused()
  await expect(next).toBeEnabled()

  const height = () => question.evaluate((element) => element.getBoundingClientRect().height)
  const initial = await height()
  await next.click()
  await expect.poll(height).toBeGreaterThan(initial)
  await expect(question.getByRole("checkbox", { name: "Diagnostics", exact: true })).toBeVisible()

  const expanded = await height()
  const back = question.getByRole("button", { name: "Back", exact: true })
  await expect(back).toBeEnabled()
  await back.click()
  await expect.poll(height).toBeLessThan(expanded)
  await expect(question.getByRole("radio", { name: /Focused/ })).toBeVisible()
})

story("selects single answers and toggles multiple answers with number keys", async ({ mount }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  const wide = question.getByRole("radio", { name: /Wide/ })
  const customRadio = question.getByRole("radio", { name: "Type your own answer…", exact: true })
  const input = question.getByRole("textbox", { name: "Type your own answer…", exact: true })
  const next = question.getByRole("button", { name: "Next", exact: true })
  await expect(focused).toBeFocused()

  await focused.press("2")
  await expect(wide).toBeChecked()
  await expect(focused).not.toBeChecked()
  await expect(wide).toBeFocused()
  await next.press("1")
  await expect(focused).toBeChecked()
  await expect(wide).not.toBeChecked()
  await focused.press("3")
  await expect(customRadio).toBeChecked()
  await expect(input).toBeFocused()
  await expect(focused).not.toBeChecked()
  await expect(wide).not.toBeChecked()
  await input.press("Escape")
  await expect(customRadio).toBeFocused()
  await customRadio.press("2")
  await expect(wide).toBeChecked()
  await expect(customRadio).not.toBeChecked()

  await next.click()
  const files = question.getByRole("checkbox", { name: "Changed files", exact: true })
  const terminal = question.getByRole("checkbox", { name: "Terminal", exact: true })
  const customCheckbox = question.getByRole("checkbox", { name: "Type your own answer…", exact: true })
  await expect(files).toBeFocused()
  await files.press("1")
  await expect(files).toBeChecked()
  await files.press("2")
  await expect(terminal).toBeChecked()
  await expect(files).toBeChecked()
  await terminal.press("2")
  await expect(terminal).not.toBeChecked()
  await expect(files).toBeChecked()

  await terminal.press("4")
  await expect(customCheckbox).toBeChecked()
  await expect(input).toBeFocused()
  await expect(files).toBeChecked()
  await expect(terminal).not.toBeChecked()
  await input.press("Escape")
  await expect(customCheckbox).toBeFocused()
  await customCheckbox.press("4")
  await expect(customCheckbox).not.toBeChecked()
  await expect(files).toBeChecked()
  await expect(terminal).not.toBeChecked()
})

story("moves only the highlight with Up and Down and marks it with Space", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  const wide = question.getByRole("radio", { name: /Wide/ })
  const custom = question.getByRole("radio", { name: "Type your own answer…", exact: true })
  const input = question.getByRole("textbox", { name: "Type your own answer…", exact: true })
  const highlight = question.locator('[data-slot="question-highlight"]')
  const clip = () => highlight.evaluate((element) => element.style.clipPath)
  await expect(focused).toBeFocused()
  await expect(focused).not.toBeChecked()
  const first = await clip()

  await page.keyboard.press("ArrowDown")
  await expect(wide).toBeFocused()
  await expect(wide).not.toBeChecked()
  await expect(focused).not.toBeChecked()
  await expect(wide).toHaveAttribute("tabindex", "0")
  await expect(focused).toHaveAttribute("tabindex", "-1")
  await expect.poll(clip).not.toBe(first)

  await page.keyboard.press("ArrowDown")
  await expect(custom).toBeFocused()
  await expect(custom).not.toBeChecked()
  await expect(input).not.toBeFocused()

  await page.keyboard.press("ArrowUp")
  await expect(wide).toBeFocused()
  await page.keyboard.press(" ")
  await expect(wide).toBeChecked()
  await expect(wide).toBeFocused()
  await expect(question.getByRole("button", { name: "Next", exact: true })).toBeVisible()

  await page.keyboard.press("Home")
  await expect(focused).toBeFocused()
  await expect(focused).not.toBeChecked()
  await expect(wide).toBeChecked()
})

story("Enter picks the highlighted answer and moves on", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  const wide = question.getByRole("radio", { name: /Wide/ })
  const files = question.getByRole("checkbox", { name: "Changed files", exact: true })
  const terminal = question.getByRole("checkbox", { name: "Terminal", exact: true })
  await expect(focused).toBeFocused()

  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(files).toBeFocused()
  await expect(files).not.toBeChecked()
  await expect(question.getByRole("button", { name: "Submit", exact: true })).toBeVisible()

  await page.keyboard.press("ArrowLeft")
  await expect(wide).toBeFocused()
  await expect(wide).toBeChecked()
  await expect(focused).not.toBeChecked()
  await page.keyboard.press("ArrowRight")

  await page.keyboard.press("ArrowDown")
  await page.keyboard.press(" ")
  await expect(terminal).toBeChecked()
  await expect(files).not.toBeChecked()
  await page.keyboard.press("Enter")
  await expect(question).toBeHidden()
})

story("typing on the highlighted custom answer starts it", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  const custom = question.getByRole("radio", { name: "Type your own answer…", exact: true })
  const input = question.getByRole("textbox", { name: "Type your own answer…", exact: true })
  await expect(focused).toBeFocused()
  await focused.press("1")
  await expect(focused).toBeChecked()

  await page.keyboard.press("End")
  await expect(custom).toBeFocused()
  await expect(custom).not.toBeChecked()
  await page.keyboard.press("S")
  await expect(input).toBeFocused()
  await expect(custom).toBeChecked()
  await expect(focused).not.toBeChecked()
  await page.keyboard.type("plit")
  await expect(input).toHaveValue("Split")

  await page.keyboard.press("Enter")
  await expect(question.getByRole("checkbox", { name: "Changed files", exact: true })).toBeFocused()
  await page.keyboard.press("ArrowLeft")
  await expect(custom).toBeChecked()
  await expect(input).toHaveValue("Split")
})

story("switches questions with Left and Right outside the text field", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  const files = question.getByRole("checkbox", { name: "Changed files", exact: true })
  const submit = question.getByRole("button", { name: "Submit", exact: true })
  const wide = question.getByRole("radio", { name: /Wide/ })
  await expect(focused).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press(" ")
  await expect(wide).toBeChecked()

  await page.keyboard.press("ArrowRight")
  await expect(files).toBeFocused()
  await expect(submit).toBeVisible()
  await page.keyboard.press("ArrowRight")
  await expect(submit).toBeVisible()
  await expect(files).toBeFocused()

  await page.keyboard.press("ArrowLeft")
  await expect(wide).toBeFocused()
  await expect(wide).toBeChecked()

  const input = question.getByRole("textbox", { name: "Type your own answer…", exact: true })
  await input.focus()
  await input.fill("ab")
  await page.keyboard.press("ArrowLeft")
  await expect(input).toBeFocused()
  await expect(focused).toBeVisible()
})

// Presses each key after waiting its number of frames, and samples every frame until the switch is at rest: how visible
// the copies of the question text and of the answers are together, how many outgoing copies there are, and how the
// live question text is moved, scaled, blurred and masked.
const play = (question: Locator, keys: { key: string; after?: number }[]) =>
  question.evaluate(async (root, keys) => {
    const opacity = (el: Element) => {
      let value = 1

      for (let node: Element | null = el; node && node !== root; node = node.parentElement)
        value *= Number(getComputedStyle(node).opacity)

      return value
    }

    const shown = (slot: string) =>
      [...root.querySelectorAll(`[data-slot="${slot}"]`)].reduce((sum, el) => sum + opacity(el), 0)

    const live = () => root.querySelector('[data-slot="question-details"]:not([data-ghost])')

    const press = (key: string) =>
      (document.activeElement ?? root).dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      )

    const frames: {
      text: number
      answers: number
      ghosts: number
      x: number
      scale: number
      blur: boolean
      mask: boolean
    }[] = []

    const queue = [...keys]
    let wait = 0
    let still = 0

    await new Promise<void>((resolve) => {
      const tick = () => {
        while (queue.length > 0 && wait <= 0) {
          const next = queue.shift()!
          press(next.key)
          wait = queue[0]?.after ?? 0
        }

        wait--
        const el = live()
        const style = el ? getComputedStyle(el) : undefined
        const matrix = new DOMMatrix(style?.transform === "none" ? undefined : style?.transform)

        const frame = {
          text: shown("question-details"),
          answers: shown("question-options-list"),
          ghosts: root.querySelectorAll("[data-ghost]").length,
          x: matrix.m41,
          scale: matrix.m11,
          blur: (style?.filter ?? "none") !== "none",
          mask: (style?.maskImage ?? "none") !== "none",
        }

        frames.push(frame)

        const resting =
          queue.length === 0 && frame.ghosts === 0 && style?.transform === "none" && !frame.blur && !frame.mask

        still = resting ? still + 1 : 0

        if (still >= 3 || frames.length >= 240) return resolve()
        requestAnimationFrame(tick)
      }

      requestAnimationFrame(tick)
    })

    return frames
  }, keys)

// The switch styles in the order of their knob's options, which is how a saved choice names them.
const styles = ["morph", "slide", "wipe"] as const

const choose = (page: Page, name: (typeof styles)[number]) =>
  page.addInitScript(
    (value) => localStorage.setItem("opencode.motion.v2", value),
    JSON.stringify({ "question.style": styles.indexOf(name) }),
  )

for (const name of styles)
  story(`keeps a question on screen while switching (${name})`, async ({ mount, page }) => {
    await choose(page, name)
    const component = await mount("app-current-session-surface--question-request")
    const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
    await expect(question.getByRole("radio", { name: /Focused/ })).toBeFocused()

    const forward = await play(question, [{ key: "ArrowRight" }])
    await expect(question.getByRole("checkbox", { name: "Changed files", exact: true })).toBeVisible()
    const backward = await play(question, [{ key: "ArrowLeft" }])
    await expect(question.getByRole("radio", { name: /Focused/ })).toBeVisible()
    await expect(question.locator("[data-ghost]")).toHaveCount(0)

    for (const frames of [forward, backward]) {
      expect(frames.length).toBeLessThan(240)
      expect(Math.min(...frames.map((frame) => frame.text))).toBeGreaterThanOrEqual(0.9)
      expect(Math.min(...frames.map((frame) => frame.answers))).toBeGreaterThanOrEqual(0.9)
      expect(frames.at(-1)).toMatchObject({ x: 0, scale: 1, blur: false, mask: false })
    }

    if (name === "morph") {
      expect(Math.min(...forward.map((frame) => frame.scale))).toBeLessThan(1)
      expect(forward.some((frame) => frame.blur)).toBe(true)
    }

    if (name === "slide") {
      // Forward comes in from the trailing side, and back from the leading one.
      expect(Math.max(...forward.map((frame) => frame.x))).toBeGreaterThan(0)
      expect(Math.min(...backward.map((frame) => frame.x))).toBeLessThan(0)
      expect(forward.some((frame) => frame.blur)).toBe(true)
    }

    if (name === "wipe") expect(forward.some((frame) => frame.mask)).toBe(true)
  })

for (const name of styles)
  story(`keeps one outgoing copy and a visible question through rapid switches (${name})`, async ({ mount, page }) => {
    await choose(page, name)
    const component = await mount("session-question-switch--question-series")
    const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
    const options = question.locator('[data-slot="question-options"]')
    await expect(question.getByRole("radio").first()).toBeFocused()
    // From the middle question, so every run can go two either way and comes back.
    await play(question, [{ key: "ArrowRight" }, { key: "ArrowRight", after: 30 }])

    const runs = [
      ["ArrowRight", "ArrowLeft"],
      ["ArrowLeft", "ArrowRight"],
      ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft"],
      ["ArrowLeft", "ArrowLeft", "ArrowRight", "ArrowRight"],
    ]

    for (const run of runs)
      for (const after of [0, 1, 2, 4]) {
        const frames = await play(
          question,
          run.map((key) => ({ key, after })),
        )

        const label = `${run.join(" ")} every ${after} frames`
        expect(frames.length, label).toBeLessThan(240)
        expect(Math.min(...frames.map((frame) => frame.text)), label).toBeGreaterThanOrEqual(0.5)
        expect(Math.min(...frames.map((frame) => frame.answers)), label).toBeGreaterThanOrEqual(0.5)
        expect(Math.max(...frames.map((frame) => frame.ghosts)), label).toBeLessThanOrEqual(2)
        await expect(question.locator("[data-ghost]")).toHaveCount(0)
        expect(await options.evaluate((el) => el.scrollLeft), label).toBe(0)
      }
  })

story("swaps questions at once under reduced motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const component = await mount("session-question-switch--question-series")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  await expect(question.getByRole("radio").first()).toBeFocused()

  const frames = await play(question, [{ key: "ArrowRight" }])
  expect(frames.every((frame) => frame.ghosts === 0 && frame.x === 0 && frame.scale === 1 && !frame.blur)).toBe(true)
  expect(Math.min(...frames.map((frame) => frame.text))).toBe(1)
})

story("toggles checkboxes with Space on key down and moves focus with arrows", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  await question.getByRole("button", { name: "Next", exact: true }).click()
  const files = question.getByRole("checkbox", { name: "Changed files", exact: true })
  const terminal = question.getByRole("checkbox", { name: "Terminal", exact: true })
  await expect(files).toBeFocused()

  await page.keyboard.down(" ")
  await expect(files).toBeChecked()
  await page.keyboard.down(" ")
  await page.keyboard.up(" ")
  await expect(files).toBeChecked()

  await page.keyboard.press("ArrowDown")
  await expect(terminal).toBeFocused()
  await expect(terminal).not.toBeChecked()
  await page.keyboard.press(" ")
  await expect(terminal).toBeChecked()
  await page.keyboard.press(" ")
  await expect(terminal).not.toBeChecked()
  await expect(files).toBeChecked()
})

story("ignores modified, out-of-range, and repeated number shortcuts", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  const wide = question.getByRole("radio", { name: /Wide/ })
  await expect(focused).toBeFocused()
  await focused.press("1")
  await focused.press("9")
  await focused.press("Alt+2")
  await expect(focused).toBeChecked()
  await expect(wide).not.toBeChecked()

  await question.getByRole("button", { name: "Next", exact: true }).click()
  const terminal = question.getByRole("checkbox", { name: "Terminal", exact: true })
  await expect(question.getByRole("checkbox", { name: "Changed files", exact: true })).toBeFocused()
  await page.keyboard.down("2")
  await expect(terminal).toBeChecked()
  await page.keyboard.down("2")
  await expect(terminal).toBeChecked()
  await page.keyboard.up("2")
})

story("types digits into the custom answer without selecting numbered options", async ({ mount }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  const custom = question.getByRole("radio", { name: "Type your own answer…", exact: true })
  const input = question.getByRole("textbox", { name: "Type your own answer…", exact: true })
  await expect(focused).toBeFocused()
  await focused.press("3")
  await expect(input).toBeFocused()
  await input.press("1")
  await input.press("2")
  await input.press("3")
  await expect(input).toHaveValue("123")
  await expect(custom).toBeChecked()
  await expect(focused).not.toBeChecked()
  await expect(question.getByRole("radio", { name: /Wide/ })).not.toBeChecked()
})

story("leaves Enter and Escape to an IME composition in the custom answer", async ({ mount }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const toggle = question.getByRole("radio", { name: "Type your own answer…", exact: true })
  const input = question.getByRole("textbox", { name: "Type your own answer…", exact: true })
  await input.focus()
  await input.fill("にほん")

  const compose = (key: string, keyCode: number) =>
    input.evaluate(
      (element, init) =>
        element.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true })),
      { key, keyCode, isComposing: keyCode !== 229 },
    )

  await compose("Enter", 13)
  await compose("Escape", 27)
  await compose("Enter", 229)
  await compose("Escape", 229)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue("にほん")
  await expect(question).toBeVisible()
  await input.press("Escape")
  await expect(toggle).toBeFocused()
  await expect(question).toBeVisible()
})

story("shows question navigation shortcuts in buttons and tooltips", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-request")
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform))
  const shortcut = mac ? "⌘⏎" : "Ctrl+⏎"
  const next = component.getByRole("button", { name: "Next", exact: true })
  await expect(next.locator('[data-slot="question-submit-shortcut"]')).toBeVisible()
  await expect(next.locator('[data-slot="question-submit-shortcut"]')).toHaveText(shortcut)
  await expect(next).toHaveAttribute("aria-keyshortcuts", "Meta+Enter Control+Enter")
  await next.hover()
  await expect(page.getByRole("tooltip")).toContainText("Next")
  await expect(page.getByRole("tooltip")).toContainText(shortcut)
  await next.press(mac ? "Meta+Enter" : "Control+Enter")
  const submit = component.getByRole("button", { name: "Submit", exact: true })
  await expect(submit.locator('[data-slot="question-submit-shortcut"]')).toBeVisible()
  await expect(submit.locator('[data-slot="question-submit-shortcut"]')).toHaveText(shortcut)
  await expect(submit).toHaveAttribute("aria-keyshortcuts", "Meta+Enter Control+Enter")
  await submit.hover()
  await expect(page.getByRole("tooltip")).toContainText("Submit")
  await expect(page.getByRole("tooltip")).toContainText(shortcut)
  const back = component.getByRole("button", { name: "Back", exact: true })
  await expect(back).toHaveText("Back")
  await expect(back).toHaveAttribute("aria-keyshortcuts", mac ? "Meta+[" : "Alt+ArrowLeft")
  await back.hover()
  await expect(page.getByRole("tooltip")).toContainText(mac ? "⌘[" : "Alt+←")
  await back.press(mac ? "Meta+[" : "Alt+ArrowLeft")
  await expect(next).toBeVisible()
})

story("keeps the custom answer input and dock geometry stable while editing", async ({ mount }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const row = question.locator('[data-slot="question-option"][data-custom="true"]')
  const input = question.getByRole("textbox", { name: "Type your own answer…", exact: true })
  const toggle = question.getByRole("radio", { name: "Type your own answer…", exact: true })
  await expect(question.getByRole("radio", { name: /Focused/ })).toBeFocused()
  await expect(input).toBeEditable()
  await expect(input).toHaveValue("")
  const node = await input.evaluateHandle((element) => element)
  const height = () => question.evaluate((element) => element.getBoundingClientRect().height)
  const initial = await height()
  const draft = "A custom answer long enough to wrap if the editor becomes multiline instead of staying single-line"

  const predefined = question.getByRole("radio", { name: /Focused/ })
  await predefined.click()
  await input.focus()
  await expect(input).toBeFocused()
  await expect(predefined).toBeChecked()
  await expect(toggle).not.toBeChecked()
  await row.click({ position: { x: 4, y: 4 } })
  await expect(toggle).toBeChecked()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue("")
  await expect(predefined).not.toBeChecked()
  await input.fill(draft)
  await expect(input).toHaveValue(draft)
  await expect(toggle).toBeChecked()
  await expect(predefined).not.toBeChecked()
  await expect.poll(height).toBe(initial)
  await input.press("Escape")
  await expect(toggle).toBeFocused()
  await expect(input).toHaveValue(draft)
  await row.click({ position: { x: 30, y: 20 } })
  await expect(input).toBeFocused()
  await expect(input).toHaveValue(draft)
  await expect
    .poll(() => input.evaluate((element, original) => element === original && original.isConnected, node))
    .toBe(true)
  await node.dispose()
})

story("marks one-answer questions with round keys and many-answer questions with square keys", async ({ mount }) => {
  const component = await mount("app-current-session-surface--question-request")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const keys = question.locator('[data-slot="question-option-key"]')
  const focused = question.getByRole("radio", { name: /Focused/ })
  await expect(focused).toBeFocused()
  await expect(keys).toHaveText(["1", "2", "3"])
  await expect(keys.first()).toBeVisible()
  await expect(keys.first()).toHaveAttribute("data-type", "radio")
  await expect(question.getByText("Pick any", { exact: true })).toHaveCount(0)
  await focused.press("1")
  await expect(focused.locator('[data-slot="question-option-key"]')).toHaveAttribute("data-picked", "true")

  await question.getByRole("button", { name: "Next", exact: true }).click()
  const files = question.getByRole("checkbox", { name: "Changed files", exact: true })
  await expect(files).toBeFocused()
  await expect(keys.first()).toHaveAttribute("data-type", "checkbox")
  await expect(question.getByText("Pick any", { exact: true })).toBeVisible()
})

story("toggles a lone many-answer question and sends it with Enter", async ({ mount, page }) => {
  const component = await mount("app-current-session-surface--question-multi-select")
  const question = component.locator('[data-component="dock-prompt"][data-kind="question"]')
  const files = question.getByRole("checkbox", { name: "Changed files", exact: true })
  const terminal = question.getByRole("checkbox", { name: "Terminal", exact: true })
  await expect(files).toBeFocused()
  await expect(question.getByText("Pick any", { exact: true })).toBeVisible()
  await expect(question.locator('[data-slot="question-option-key"][data-type="radio"]')).toHaveCount(0)

  await page.keyboard.press(" ")
  await page.keyboard.press("2")
  await expect(files).toBeChecked()
  await expect(terminal).toBeChecked()
  await expect(terminal.locator('[data-slot="question-option-key"]')).toHaveAttribute("data-picked", "true")
  await page.keyboard.press("Enter")
  await expect(question).toBeHidden()
})
