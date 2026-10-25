import { For, Show, batch, createEffect, createMemo, onCleanup, onMount, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useMutation } from "@tanstack/solid-query"
import { Button } from "@opencode/ui/button"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Icon } from "@opencode/ui/icon"
import { TextInput } from "@opencode/ui/text-input"
import {
  frameLoop,
  observeReducedMotion,
  prefersReducedMotion,
  Spring,
  type DurationOptions,
} from "@opencode/ui/motion"
import { motionTuning } from "@opencode/ui/motion-tuning"
import { showToast } from "@/shell/notifications/toast"
import type { FormAnswer, FormInfo, FormMultiselectField, FormStringField } from "@opencode/client/promise"
import { useLanguage } from "@/runtime/i18n/language"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { useServerSDK } from "@/runtime/server/client"
import { ScopedKey } from "@/runtime/server/scope"
import { useCommand } from "@/shell/commands/command"
import { questionKey, type QuestionKeyZone } from "./question-keys"

const cache = new Map<string, { tab: number; answers: string[][]; custom: string[]; customOn: boolean[] }>()

const IS_MAC = /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)

const group = "Timeline"

const subsection = "Question"

const target = '[data-component="dock-prompt"][data-kind="question"]'

// Switching questions slides the old question out toward one side while the new one comes in from the other. They
// cross on one spring, so the card is never empty.
const slide = motionTuning.spring("question.switch", {
  label: "Switch",
  group,
  subsection,
  description: "Moving between questions with ← and →",
  target,
  presets: {
    snappy: { duration: 0.3, bounce: 0 },
    smooth: { duration: 0.4, bounce: 0 },
    calm: { duration: 0.55, bounce: 0 },
  },
})

// The question text and the answers box follow their new heights on this spring.
const resize = motionTuning.spring("question.height", {
  label: "Height",
  group,
  subsection,
  target,
  shipped: "smooth",
  presets: {
    snappy: { duration: 0.35, bounce: 0 },
    smooth: { duration: 0.45, bounce: 0 },
    calm: { duration: 0.55, bounce: 0 },
  },
})

const travel = motionTuning.number("question.travel", {
  label: "Travel",
  group,
  subsection,
  value: 16,
  min: 0,
  max: 48,
  step: 1,
  unit: "px",
})

// How far through the switch the new question is fully shown, and the old one fully gone.
const fadeIn = motionTuning.number("question.fade-in", {
  label: "Fade in by",
  group,
  subsection,
  value: 0.35,
  min: 0.05,
  max: 1,
  step: 0.05,
})

const fadeOut = motionTuning.number("question.fade-out", {
  label: "Fade out by",
  group,
  subsection,
  value: 0.5,
  min: 0.05,
  max: 1,
  step: 0.05,
})

// A switch starts at this multiple of the spring's natural speed instead of from rest, so it answers the key at once;
// at 1 it eases out like an exponential, and up to 1 it never overshoots.
const launch = motionTuning.number("question.launch", {
  label: "Launch speed",
  group,
  subsection,
  value: 1,
  min: 0,
  max: 1,
  step: 0.05,
})

const fade: DurationOptions = { duration: 0.2, bounce: 0 }

const minimizing: DurationOptions = { duration: 0.3, bounce: 0 }

// Where a copy of the question sits on screen, relative to its place at rest.
type Pose = { x: number; opacity: number }

const rest: Pose = { x: 0, opacity: 1 }

// A copy of the question on its way somewhere: it set off from `from` toward the offset `to`, and its spring runs from 0
// to 1 along the way.
type Track = { from: Pose; to: number; spring: Spring }

// The question being left: inert copies of its text and its answers, and how tall they are.
type Ghost = Track & { tab: number; els: HTMLElement[]; details: number; list: number }

type QuestionField = FormStringField | FormMultiselectField

function questionField(field: FormInfo["fields"][number]): field is QuestionField {
  return field.type === "string" || field.type === "multiselect"
}

// The key that picks an answer is also its mark: round like a radio for one answer, a square like a checkbox for many.
function Mark(props: { multi: boolean; picked: boolean; shortcut?: string }) {
  return (
    <span data-slot="question-option-check" aria-hidden="true">
      <span data-slot="question-option-key" data-type={props.multi ? "checkbox" : "radio"} data-picked={props.picked}>
        {props.shortcut}
      </span>
    </span>
  )
}

function Option(props: {
  multi: boolean
  picked: boolean
  label: string
  description?: string
  shortcut?: string
  disabled: boolean
  tabbable: boolean
  ref?: (el: HTMLButtonElement) => void
  onFocus?: VoidFunction
  onPointerMove?: (event: PointerEvent) => void
  onClick: VoidFunction
}) {
  return (
    <button
      type="button"
      ref={props.ref}
      data-slot="question-option"
      data-picked={props.picked}
      role={props.multi ? "checkbox" : "radio"}
      aria-checked={props.picked}
      aria-keyshortcuts={props.shortcut}
      tabindex={props.tabbable ? 0 : -1}
      disabled={props.disabled}
      onFocus={props.onFocus}
      onPointerMove={props.onPointerMove}
      onClick={props.onClick}
    >
      <Mark multi={props.multi} picked={props.picked} shortcut={props.shortcut} />
      <span data-slot="question-option-main">
        <span data-slot="option-label">
          <bdi>{props.label}</bdi>
        </span>
        <Show when={props.description}>
          <span data-slot="option-description">
            <bdi>{props.description}</bdi>
          </span>
        </Show>
      </span>
    </button>
  )
}

export const SessionQuestionDock: Component<{ request: FormInfo; onSubmit: () => void }> = (props) => {
  const serverSDK = useServerSDK()
  const language = useLanguage()
  const command = useCommand()
  const cacheKey = ScopedKey.from(serverSDK.scope, props.request.id)

  const questions = createMemo(() =>
    props.request.fields.filter(questionField).map((field) => ({
      field,
      header: field.title ?? "",
      question: field.description ?? field.title ?? "",
      options: field.type === "string" ? (field.options ?? []) : field.options,
      multiple: field.type === "multiselect",
    })),
  )

  const total = createMemo(() => questions().length)

  const cached = cache.get(cacheKey)

  const [store, setStore] = createStore({
    tab: cached?.tab ?? 0,
    answers: cached?.answers ?? [],
    custom: cached?.custom ?? [],
    customOn: cached?.customOn ?? [],
    editing: false,
    focus: 0,
    minimized: false,
    listHeight: 0,
  })

  let root: HTMLDivElement | undefined
  let chevron: HTMLButtonElement | undefined
  let detailsFrame: HTMLDivElement | undefined
  let detailsRef: HTMLDivElement | undefined
  let optionsRef: HTMLDivElement | undefined
  let optionsTrack: HTMLDivElement | undefined
  let listRef: HTMLDivElement | undefined
  let customRef: HTMLButtonElement | undefined
  let customRow: HTMLDivElement | undefined
  let highlightRef: HTMLSpanElement | undefined
  let customInput: HTMLInputElement | undefined
  let optsRef: HTMLButtonElement[] = []
  let replied = false

  const question = createMemo(() => questions()[store.tab])
  const options = createMemo(() => question()?.options ?? [])
  const input = createMemo(() => store.custom[store.tab] ?? "")
  const on = createMemo(() => store.customOn[store.tab] === true)
  const multi = createMemo(() => question()?.multiple === true)
  const count = createMemo(() => options().length + 1)

  const summary = createMemo(() => {
    if (total() === 1) return language.t("session.question.title")
    const n = Math.min(store.tab + 1, total())

    return language.t("session.question.progress", { current: n, total: total() })
  })

  const customLabel = () => language.t("ui.question.custom.answerPlaceholder")

  const last = createMemo(() => store.tab >= total() - 1)
  // The question text and the answers box follow their measured heights on springs, so the dock grows and shrinks with
  // each question, and the answers box folds away when the dock is minimized. One frame job steps these springs and the
  // switch between questions, and writes the results straight to the elements. Under reduced motion heights land at once.
  const content = { details: 0, list: 0 }
  const boxes = { details: new Spring(0), list: new Spring(0), folded: new Spring(0) }
  let ghost: Ghost | undefined
  let into: Track | undefined
  let stop: VoidFunction | undefined

  const customUpdate = (value: string, selected: boolean = on()) => {
    const prev = input().trim()
    const next = value.trim()

    setStore("custom", store.tab, value)

    if (!selected) return

    if (multi()) {
      setStore("answers", store.tab, (current = []) => {
        const removed = prev ? current.filter((item) => item.trim() !== prev) : current

        if (!next) return removed

        if (removed.some((item) => item.trim() === next)) return removed

        return [...removed, next]
      })

      return
    }

    setStore("answers", store.tab, next ? [next] : [])
  }

  const measure = () => {
    if (!root) return

    const scroller = document.querySelector('[data-slot="session-timeline-scroll"] > .scroll-view__viewport')
    const head = scroller instanceof HTMLElement ? scroller.firstElementChild : undefined

    const top =
      head instanceof HTMLElement && head.classList.contains("sticky") ? head.getBoundingClientRect().bottom : 0

    if (!top) {
      root.style.removeProperty("--question-prompt-max-height")

      return
    }

    const dock = root.closest('[data-component="session-composer-dock"]')

    if (!(dock instanceof HTMLElement)) return

    const dockBottom = dock.getBoundingClientRect().bottom
    const below = Math.max(0, dockBottom - root.getBoundingClientRect().bottom)
    const gap = 8
    const max = Math.max(240, Math.floor(dockBottom - top - gap - below))
    root.style.setProperty("--question-prompt-max-height", `${max}px`)
  }

  const clamp = (i: number) => Math.max(0, Math.min(count() - 1, i))

  const pickFocus = (tab: number = store.tab) => {
    const list = questions()[tab]?.options ?? []

    if (store.customOn[tab] === true) return list.length

    return Math.max(
      0,
      list.findIndex((item) => store.answers[tab]?.includes(item.value) ?? false),
    )
  }

  // Focus moves in the same task as the key that moved it, so the highlight and the focus never disagree for a frame.
  const focus = (i: number, how?: FocusOptions) => {
    const next = clamp(i)
    setStore("focus", next)

    if (store.editing) return
    const el = next === options().length ? customRef : optsRef[next]
    el?.focus(how)
  }

  // Measuring reads layout, so it waits while the dock's own springs are moving and runs once they come to rest.
  let measuring: number | undefined

  const requestMeasure = () => {
    if (stop || measuring !== undefined) return
    measuring = requestAnimationFrame(() => {
      measuring = undefined
      measure()
    })
  }

  onMount(() => {
    requestMeasure()

    makeEventListener(window, "resize", requestMeasure)

    const dock = root?.closest('[data-component="session-composer-dock"]')
    const scroller = document.querySelector('[data-slot="session-timeline-scroll"] > .scroll-view__viewport')
    createResizeObserver([dock, scroller], requestMeasure)

    onCleanup(() => {
      if (measuring !== undefined) cancelAnimationFrame(measuring)
    })

    focus(pickFocus())
  })

  createEffect(() => {
    const list = listRef
    const details = detailsRef

    if (!list || !details) return

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const size = entry.borderBoxSize[0]?.blockSize

        if (size === undefined) return
        const key = entry.target === list ? "list" : "details"
        const spring = boxes[key]

        if (content[key] === 0 || prefersReducedMotion()) spring.snap(size)
        else tune(spring, resize()).set(size)
        content[key] = size

        if (key === "list") setStore("listHeight", size)
      })
      wake()
    })

    observer.observe(list)
    observer.observe(details)
    onCleanup(() => observer.disconnect())
  })

  // One highlight card glides between answers by its clip, so only one answer ever looks highlighted. It lands at once
  // on a new question, and under reduced motion it fades in at its new answer instead of gliding.
  let placed = { tab: -1, index: -1 }
  createEffect(() => {
    const el = highlightRef
    const index = store.focus
    const row = index === options().length ? customRow : optsRef[index]
    void store.listHeight

    if (!el || !row || !listRef) return
    const clip = `inset(${row.offsetTop}px 0 ${listRef.offsetHeight - row.offsetTop - row.offsetHeight}px round 6px)`
    const fresh = placed.tab !== store.tab
    const moved = fresh || placed.index !== index
    const reduced = prefersReducedMotion()
    placed = { tab: store.tab, index }

    if (!fresh && !reduced) {
      el.style.clipPath = clip

      return
    }

    el.style.transition = "none"
    el.style.clipPath = clip
    void el.offsetHeight
    el.style.removeProperty("transition")

    if (reduced && moved && el.animate)
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "linear" })
  })

  onCleanup(() => {
    if (replied) return
    cache.set(cacheKey, {
      tab: store.tab,
      answers: store.answers.map((a) => (a ? [...a] : [])),
      custom: store.custom.map((s) => s ?? ""),
      customOn: store.customOn.map((b) => b ?? false),
    })
  })

  const fail = (err: Error) => showToast({ title: language.t("common.requestFailed"), description: err.message })

  const replyMutation = useMutation(() => ({
    mutationFn: (answer: FormAnswer) =>
      serverSDK.api.session.form.reply({ sessionID: props.request.sessionID, formID: props.request.id, answer }),
    onMutate: () => {
      props.onSubmit()
    },
    onSuccess: () => {
      replied = true
      cache.delete(cacheKey)
    },
    onError: fail,
  }))

  const rejectMutation = useMutation(() => ({
    mutationFn: () =>
      serverSDK.api.session.form.cancel({ sessionID: props.request.sessionID, formID: props.request.id }),
    onMutate: () => {
      props.onSubmit()
    },
    onSuccess: () => {
      replied = true
      cache.delete(cacheKey)
    },
    onError: fail,
  }))

  const sending = createMemo(() => replyMutation.isPending || rejectMutation.isPending)
  const submitShortcut = () => (IS_MAC ? "⌘⏎" : `${language.t("common.key.ctrl")}+⏎`)
  const backShortcut = () => (IS_MAC ? "⌘[" : `${language.t("common.key.alt")}+←`)

  const reply = (answer: FormAnswer) => {
    if (sending()) return
    replyMutation.mutate(answer)
  }

  const reject = () => {
    if (sending()) return
    rejectMutation.mutate()
  }

  const submit = () =>
    reply(
      Object.fromEntries(
        questions().flatMap((question, index) => {
          const answers = store.answers[index] ?? []

          if (answers.length === 0) return []

          return [[question.field.key, question.multiple ? answers : answers[0]]]
        }),
      ),
    )

  const answered = (i: number) => {
    if ((store.answers[i]?.length ?? 0) > 0) return true

    return store.customOn[i] === true && (store.custom[i] ?? "").trim().length > 0
  }

  const picked = (answer: string) => store.answers[store.tab]?.includes(answer) ?? false

  const pick = (answer: string) => {
    setStore("answers", store.tab, [answer])
    setStore("customOn", store.tab, false)
    setStore("editing", false)
  }

  const toggle = (answer: string) => {
    setStore("answers", store.tab, (current = []) => {
      if (current.includes(answer)) return current.filter((item) => item !== answer)

      return [...current, answer]
    })
  }

  const startCustom = () => {
    setStore("focus", options().length)
    setStore("customOn", store.tab, true)
    setStore("editing", true)
    customUpdate(input(), true)
    customInput?.focus()
    customInput?.setSelectionRange(input().length, input().length)
  }

  const customToggle = () => {
    if (sending()) return

    if (!multi() || !on()) return startCustom()

    setStore("customOn", store.tab, false)
    const value = input().trim()

    if (value) setStore("answers", store.tab, (current = []) => current.filter((item) => item.trim() !== value))
    setStore("editing", false)
    focus(options().length)
  }

  // The pointer moves the highlight like the arrows do, but never takes focus from the custom answer's field.
  const hover = (i: number, event: PointerEvent) => {
    if (event.pointerType !== "mouse" || store.editing || sending()) return
    setStore("focus", i)
  }

  // Enter picks the highlighted answer of a single-choice question, then moves on. An empty custom answer opens its
  // field instead, since there is nothing to pick yet.
  const commit = () => {
    if (multi()) return next()

    if (store.focus < options().length) {
      selectOption(store.focus)

      return next()
    }

    if (!input().trim()) return startCustom()
    setStore("customOn", store.tab, true)
    customUpdate(input(), true)
    next()
  }

  const zone = (target: EventTarget | null): QuestionKeyZone => {
    if (store.editing) return "input"

    if (!(target instanceof HTMLElement)) return "other"

    if (target.closest(".question-custom-field")) return "input"

    if (target.matches('[data-slot="question-custom-toggle"]')) return "custom"

    if (target.matches('[data-slot="question-option"]')) return "option"

    return "other"
  }

  const nav = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return

    const intent = questionKey(event, { mac: IS_MAC, zone: zone(event.target), count: count() })

    if (intent.type === "none") return

    if (intent.type === "dismiss") {
      event.preventDefault()
      reject()

      return
    }

    if (intent.type === "advance") {
      event.preventDefault()
      next()

      return
    }

    if (intent.type === "question") {
      event.preventDefault()
      const rtl = event.key.startsWith("Arrow") && !event.altKey && root?.matches(":dir(rtl)")
      const step = rtl ? -intent.step : intent.step

      if (step < 0) return back()

      if (!last()) jump(store.tab + 1)

      return
    }

    if (store.minimized || sending()) return

    if (intent.type === "number") {
      event.preventDefault()

      if (intent.index === options().length) return customToggle()

      selectOption(intent.index)
      focus(intent.index)

      return
    }

    event.preventDefault()

    if (intent.type === "type") {
      setStore("customOn", store.tab, true)
      customUpdate(input() + event.key, true)

      return startCustom()
    }

    if (intent.type === "swallow") return

    if (intent.type === "commit") return commit()

    if (intent.type === "activate") {
      if (store.focus === options().length) return customToggle()

      return selectOption(store.focus)
    }

    focus(intent.type === "edge" ? (intent.to === "first" ? 0 : count() - 1) : store.focus + intent.step)
  }

  const selectOption = (optIndex: number) => {
    if (sending()) return

    const opt = options()[optIndex]

    if (!opt) return

    if (multi()) {
      setStore("editing", false)
      toggle(opt.value)

      return
    }

    pick(opt.value)
  }

  const commitCustom = () => {
    setStore("editing", false)
    customUpdate(input())
    focus(options().length)
  }

  const next = () => {
    if (sending()) return

    if (store.editing) commitCustom()

    if (store.tab >= total() - 1) {
      submit()

      return
    }

    jump(store.tab + 1)
  }

  const back = () => {
    if (sending()) return

    if (store.tab <= 0) return
    jump(store.tab - 1)
  }

  // Switching questions: the question being left is copied into a still, inert ghost over its place, which slides out
  // toward the side it is left on and fades, while the live text and answers, now showing the new question, slide in
  // from the other side. The ghost fades out only as the new question fades in, so the card is never empty. Under
  // reduced motion they only cross-fade.
  //
  // A key pressed mid-switch carries on from what is on screen, at the speed it is moving. Going back to the question
  // still leaving brings that copy back from where it is, while the live one turns into the leaving ghost. Going on to
  // another question keeps only the more visible of the two copies on screen as the one ghost, and the new question
  // comes in.
  const depart = (tab: number) => {
    if (!detailsRef || !listRef || !detailsFrame || !optionsTrack) return
    const reduced = prefersReducedMotion()
    const step = Math.sign(tab - store.tab)
    const dir = root?.matches(":dir(rtl)") ? -step : step
    const reach = reduced ? 0 : travel()
    const options = reduced ? fade : slide()
    const live = into ? arriving(into) : rest
    const moving = into ? speed(into) : 0
    const back = ghost?.tab === tab ? ghost : undefined
    const kept = !back && ghost && leaving(ghost).opacity > live.opacity ? ghost : undefined

    if (ghost && ghost !== kept) ghost.els.forEach((el) => el.remove())
    ghost = kept ?? {
      ...track(live, -dir * reach, moving, options),
      tab: store.tab,
      els: [copy(detailsRef, detailsFrame), copy(listRef, optionsTrack)],
      details: content.details,
      list: content.list,
    }
    into = back ? track(leaving(back), 0, speed(back), options) : track({ x: dir * reach, opacity: 0 }, 0, 0, options)
  }

  const dropSwitch = () => {
    ghost?.els.forEach((el) => el.remove())
    ghost = undefined
    into = undefined
  }

  const paint = () => {
    const live = into ? arriving(into) : rest

    const sliding = !!(into || ghost)

    ;[detailsRef, listRef].forEach((el) => el && place(el, live))

    if (ghost) {
      const pose = leaving(ghost)
      ghost.els.forEach((el) => place(el, pose))
    }

    const folded = Math.max(0, Math.min(1, boxes.folded.value))
    const reduced = prefersReducedMotion()

    if (detailsFrame && content.details > 0) {
      const shown = boxes.details.value
      detailsFrame.style.height = `${shown.toFixed(2)}px`
      mask(detailsFrame, Math.max(content.details, ghost?.details ?? 0) - shown, shown, sliding)
    }

    if (optionsRef && content.list > 0) {
      const shown = boxes.list.value
      const open = reduced ? 1 - boxes.folded.target : 1 - folded
      optionsRef.style.height = `${(shown * open).toFixed(2)}px`
      mask(optionsRef, Math.max(content.list, ghost?.list ?? 0) - shown, shown, sliding)
    }

    if (optionsRef) {
      optionsRef.style.opacity = folded > 0 ? (1 - folded).toFixed(4) : ""
      optionsRef.style.visibility = folded > 0.98 ? "hidden" : ""
    }

    const turn = reduced ? boxes.folded.target : folded

    if (chevron) chevron.style.transform = turn > 0 ? `rotate(${(turn * 180).toFixed(2)}deg)` : ""
  }

  const tick = (dt: number) => {
    into?.spring.step(dt)
    ghost?.spring.step(dt)
    boxes.details.step(dt)
    boxes.list.step(dt)
    boxes.folded.step(dt)

    if (into?.spring.resting) into = undefined

    if (ghost && (ghost.spring.value >= fadeOut() || ghost.spring.resting)) {
      ghost.els.forEach((el) => el.remove())
      ghost = undefined
    }

    paint()

    if (into || ghost || !boxes.details.resting || !boxes.list.resting || !boxes.folded.resting) return true
    stop = undefined
    requestMeasure()

    return false
  }

  const wake = () => {
    stop ??= frameLoop.add(tick)
  }

  onCleanup(
    observeReducedMotion(() => {
      if (!prefersReducedMotion() || !stop) return
      dropSwitch()
      Object.values(boxes).forEach((spring) => spring.snap(spring.target))
      paint()
    }),
  )
  onCleanup(() => stop?.())

  const jump = (tab: number) => {
    if (sending() || tab === store.tab) return
    const animate = !store.minimized

    if (animate) depart(tab)
    else dropSwitch()
    // The highlight's index moves before the question does, so it lands on the new question's answer instead of
    // gliding from the old one.
    batch(() => {
      setStore("focus", pickFocus(tab))
      setStore("tab", tab)
      setStore("editing", false)
    })
    optsRef.length = options().length
    // The first frame is painted now, so the new question never shows at rest before it slides in.
    paint()

    if (!animate) return
    // The answers box is still springing to the new list's height, so focusing must not scroll it.
    focus(pickFocus(tab), { preventScroll: true })
    wake()
  }

  const cycle = (by: number) => {
    if (total() < 2) return
    jump((store.tab + by + total()) % total())
  }

  onCleanup(
    motionTuning.action({ id: "question.next", label: "Next question", group, subsection, run: () => cycle(1) }),
  )
  onCleanup(
    motionTuning.action({ id: "question.back", label: "Previous question", group, subsection, run: () => cycle(-1) }),
  )

  command.register("session.question.back", () => [
    {
      id: "session.question.back",
      title: language.t("ui.common.back"),
      keybind: IS_MAC ? "mod+[" : "alt+arrowleft",
      hidden: true,
      // Stay registered while sending so the shortcut does not fall through to history navigation.
      disabled: store.tab <= 0,
      when: () => store.tab > 0,
      onSelect: back,
    },
  ])

  const minimize = () => {
    if (sending()) return
    setStore("editing", false)
    setStore("minimized", true)
    fold(1)
  }

  const restore = () => {
    if (sending()) return
    setStore("minimized", false)
    fold(0)
    focus(pickFocus())
  }

  const fold = (target: number) => {
    tune(boxes.folded, prefersReducedMotion() ? fade : minimizing).set(target)
    wake()
  }

  return (
    <div data-component="session-question-dock">
      <DockPrompt
        kind="question"
        ref={(el) => (root = el)}
        onKeyDown={nav}
        header={
          <>
            <div data-slot="question-header-top">
              <div data-slot="question-header-title">
                <bdi>{summary()}</bdi>
              </div>
              <div data-slot="question-header-actions">
                <Show when={total() > 1}>
                  <div data-slot="question-progress">
                    <For each={questions()}>
                      {(_, i) => (
                        <button
                          type="button"
                          data-slot="question-progress-segment"
                          data-active={i() === store.tab}
                          data-answered={answered(i())}
                          disabled={sending()}
                          onClick={() => jump(i())}
                          aria-label={language.t("ui.tool.questions.numbered", { number: i() + 1 })}
                          aria-current={i() === store.tab ? "step" : undefined}
                        >
                          <span data-slot="question-progress-bar" aria-hidden="true" />
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <IconButton
                  ref={(el: HTMLButtonElement) => (chevron = el)}
                  icon={<Icon name="outline-chevron-down" size="normal" />}
                  variant="ghost"
                  size="large"
                  disabled={sending()}
                  onClick={store.minimized ? restore : minimize}
                  aria-label={language.t(store.minimized ? "session.question.restore" : "session.question.minimize")}
                />
              </div>
            </div>
            <div data-slot="question-details-frame" ref={(el) => (detailsFrame = el)}>
              <div data-slot="question-details" ref={(el) => (detailsRef = el)}>
                <div
                  data-slot="question-text"
                  style={{
                    display: store.minimized ? "-webkit-box" : undefined,
                    "-webkit-line-clamp": store.minimized ? "3" : undefined,
                    "-webkit-box-orient": store.minimized ? "vertical" : undefined,
                    overflow: store.minimized ? "hidden" : undefined,
                  }}
                >
                  <bdi>{question()?.question}</bdi>
                </div>
                <Show when={!store.minimized && multi()}>
                  <div data-slot="question-hint">{language.t("ui.question.multiHint")}</div>
                </Show>
              </div>
            </div>
          </>
        }
        footer={
          <>
            <Button variant="ghost" size="large" disabled={sending()} onClick={reject} aria-keyshortcuts="Escape">
              {language.t("ui.common.dismiss")}
            </Button>
            <div data-slot="question-footer-actions">
              <Show when={store.tab > 0}>
                <Tooltip
                  placement="top"
                  value={
                    <>
                      {language.t("ui.common.back")}
                      <span style={{ opacity: 0.6 }}>{backShortcut()}</span>
                    </>
                  }
                >
                  <Button
                    variant="neutral"
                    size="large"
                    disabled={sending()}
                    onClick={back}
                    aria-keyshortcuts={IS_MAC ? "Meta+[" : "Alt+ArrowLeft"}
                  >
                    {language.t("ui.common.back")}
                  </Button>
                </Tooltip>
              </Show>
              <Tooltip
                placement="top"
                value={
                  <>
                    {language.t(last() ? "ui.common.submit" : "ui.common.next")}
                    <span style={{ opacity: 0.6 }}>{submitShortcut()}</span>
                  </>
                }
              >
                <Button
                  variant={last() ? "submit" : "neutral"}
                  size="large"
                  disabled={sending()}
                  onClick={next}
                  aria-keyshortcuts="Meta+Enter Control+Enter"
                >
                  {language.t(last() ? "ui.common.submit" : "ui.common.next")}
                  <span data-slot="question-submit-shortcut" aria-hidden="true">
                    {submitShortcut()}
                  </span>
                </Button>
              </Tooltip>
            </div>
          </>
        }
      >
        <div
          ref={(el) => (optionsRef = el)}
          data-slot="question-options"
          role={multi() ? "group" : "radiogroup"}
          aria-label={question()?.question}
          inert={store.minimized}
          aria-hidden={store.minimized ? "true" : undefined}
          // Space already acted on key down; its release must not click the button again.
          onKeyUp={(event) => {
            if (event.key !== " ") return
            const where = zone(event.target)

            if (where === "option" || where === "custom") event.preventDefault()
          }}
        >
          <div data-slot="question-options-track" ref={(el) => (optionsTrack = el)}>
            <div data-slot="question-options-list" ref={(el) => (listRef = el)}>
              <span data-slot="question-highlight" ref={(el) => (highlightRef = el)} aria-hidden="true" />
              <For each={options()}>
                {(opt, i) => (
                  <Option
                    multi={multi()}
                    picked={picked(opt.value)}
                    label={opt.label}
                    description={opt.description}
                    shortcut={i() < 9 ? String(i() + 1) : undefined}
                    disabled={sending()}
                    tabbable={store.focus === i()}
                    ref={(el) => (optsRef[i()] = el)}
                    onFocus={() => setStore("focus", i())}
                    onPointerMove={(event) => hover(i(), event)}
                    onClick={() => selectOption(i())}
                  />
                )}
              </For>

              <div
                ref={(el) => (customRow = el)}
                data-slot="question-option"
                data-custom="true"
                data-picked={on()}
                data-editing={store.editing}
                data-disabled={sending()}
                onPointerMove={(event) => hover(options().length, event)}
                onClick={(event) => {
                  if (event.target !== event.currentTarget || sending()) return
                  startCustom()
                }}
              >
                <button
                  type="button"
                  ref={customRef}
                  data-slot="question-custom-toggle"
                  role={multi() ? "checkbox" : "radio"}
                  aria-checked={on()}
                  aria-label={customLabel()}
                  aria-keyshortcuts={count() <= 9 ? String(count()) : undefined}
                  tabindex={store.focus === options().length ? 0 : -1}
                  disabled={sending()}
                  onFocus={() => setStore("focus", options().length)}
                  onClick={customToggle}
                >
                  <Mark multi={multi()} picked={on()} shortcut={count() <= 9 ? String(count()) : undefined} />
                </button>
                <TextInput
                  ref={(el) => (customInput = el)}
                  class="question-custom-field"
                  dir="auto"
                  aria-label={customLabel()}
                  placeholder={customLabel()}
                  value={input()}
                  disabled={sending()}
                  onFocus={() => {
                    setStore("focus", options().length)
                    setStore("editing", true)
                  }}
                  onClick={() => {
                    setStore("customOn", store.tab, true)
                    customUpdate(input(), true)
                  }}
                  onBlur={() => setStore("editing", false)}
                  onKeyDown={(e) => {
                    if (e.isComposing || e.keyCode === 229) return

                    if (e.key === "Escape") {
                      e.preventDefault()
                      setStore("editing", false)
                      focus(options().length)

                      return
                    }

                    if ((e.metaKey || e.ctrlKey) && !e.altKey) return

                    if (e.key !== "Enter") return
                    e.preventDefault()

                    if (!e.repeat) next()
                  }}
                  onInput={(e) => {
                    setStore("customOn", store.tab, true)
                    customUpdate(e.currentTarget.value, true)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </DockPrompt>
    </div>
  )
}

// Comes into place from where it set off, fully shown by the fade-in point.
function arriving(track: Track): Pose {
  const p = track.spring.value

  return {
    x: track.from.x + (track.to - track.from.x) * p,
    opacity: track.from.opacity + (1 - track.from.opacity) * Math.max(0, Math.min(1, p / fadeIn())),
  }
}

// Leaves from where it set off, fully gone by the fade-out point.
function leaving(track: Track): Pose {
  const p = track.spring.value

  return {
    x: track.from.x + (track.to - track.from.x) * p,
    opacity: track.from.opacity * Math.max(0, Math.min(1, 1 - p / fadeOut())),
  }
}

function speed(track: Track) {
  return (track.to - track.from.x) * track.spring.velocity
}

// Sets off from `from` at the speed it already had on screen, plus the key's launch. The start is capped at the
// spring's natural speed so it never overshoots its place.
function track(from: Pose, to: number, moving: number, options: DurationOptions): Track {
  const spring = Spring.fromDuration(0, options)
  const distance = to - from.x
  const carried = Math.abs(distance) < 0.5 ? 0 : moving / distance

  return { from, to, spring: spring.set(1, { velocity: Math.min(spring.omega, carried + spring.omega * launch()) }) }
}

function tune(spring: Spring, options: DurationOptions) {
  spring.omega = (2 * Math.PI) / options.duration
  spring.zeta = 1 - options.bounce

  return spring
}

function place(el: HTMLElement, pose: Pose) {
  el.style.transform = pose.x ? `translate3d(${pose.x.toFixed(2)}px,0,0)` : ""
  el.style.opacity = pose.opacity < 1 ? pose.opacity.toFixed(4) : ""
}

// While a switch is under way, content sliding into a box's side gutters fades out there. While a box is shorter than
// what it holds, its bottom fades instead of ending hard, over no more than a third of the box.
function mask(el: HTMLElement, cut: number, shown: number, sliding: boolean) {
  const bottom = Math.min(24, cut, shown / 3)

  const layers = [
    sliding
      ? "linear-gradient(to right, transparent, #000 var(--question-gutter), #000 calc(100% - var(--question-gutter)), transparent)"
      : "",
    bottom > 0.5 ? `linear-gradient(to top, transparent, #000 ${bottom.toFixed(2)}px)` : "",
  ].filter(Boolean)

  if (layers.length === 0) return el.style.removeProperty("mask-image")
  el.style.setProperty("mask-image", layers.join(", "))
}

// A still copy of `el` laid over it in `host`, after the live content so it never comes first in the DOM, inert and
// hidden from assistive tech. Ids are dropped so they stay unique, and typed text is carried over.
function copy(el: HTMLElement, host: HTMLElement) {
  // SAFETY: a deep clone of an element is an element of the same kind.
  const clone = el.cloneNode(true) as HTMLElement
  clone.removeAttribute("id")
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"))
  const inputs = el.querySelectorAll("input")
  clone.querySelectorAll("input").forEach((input, index) => (input.value = inputs[index]?.value ?? ""))
  clone.dataset.ghost = "true"
  clone.inert = true
  clone.setAttribute("aria-hidden", "true")
  clone.style.position = "absolute"
  clone.style.top = "0"
  clone.style.insetInline = "var(--question-gutter)"
  clone.style.pointerEvents = "none"
  host.append(clone)

  return clone
}
