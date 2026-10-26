import { Plugin } from "@opencode/plugin/tui"
import { SessionGoal } from "@opencode/schema/session-goal"
import { createMemo, createSignal, Show } from "solid-js"
import { Keymap } from "../../context/keymap"
import { useTheme } from "../../context/theme"
import { SplitBorder } from "../../ui/border"
import { DialogFooter, DialogHeader, DialogLayout, type DialogFooterAction } from "../../ui/dialog"

/** The goal `/goal` set on this Session, read from its metadata. */
export function sessionGoal(context: Plugin.Context, sessionID: string) {
  const session = context.data.session.get(sessionID)
  return session ? SessionGoal.fromMetadata(session.id, session.metadata) : undefined
}

function goalTitle(goal: SessionGoal.State) {
  if (goal.status === "paused") return "Goal paused"
  if (goal.status === "complete") return "Goal met"
  return "Goal"
}

function goalColor(theme: Plugin.Context["theme"], goal: SessionGoal.State) {
  if (goal.status === "paused") return theme.text.feedback.warning.base
  if (goal.status === "complete") return theme.text.feedback.success.base
  return theme.text.feedback.info.base
}

/**
 * The goal pinned above the prompt, so it stays in view however long the conversation grows. Its continuations are
 * hidden from the timeline, so this is where a running goal shows.
 */
export function GoalBar(props: { context: Plugin.Context; sessionID: string }) {
  const [hovered, setHovered] = createSignal(false)
  const goal = createMemo(() => sessionGoal(props.context, props.sessionID))
  const theme = () => props.context.theme

  return (
    <Show when={goal()}>
      {(current) => (
        <box
          marginBottom={1}
          border={["left"]}
          borderColor={goalColor(theme(), current())}
          customBorderChars={SplitBorder.customBorderChars}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          onMouseUp={() => showGoal(props.context, props.sessionID)}
        >
          <box
            width="100%"
            paddingLeft={2}
            paddingRight={1}
            backgroundColor={
              hovered() ? theme().decrease(theme().background.raised.base) : theme().background.raised.base
            }
            flexDirection="row"
          >
            <text fg={theme().text.muted} wrapMode="none" truncate flexGrow={1} flexShrink={1} minWidth={0}>
              <span style={{ fg: goalColor(theme(), current()) }}>◎ {goalTitle(current())}</span>
              <span style={{ fg: theme().text.base }}> · {current().objective.replace(/\s+/g, " ")}</span>
            </text>
          </box>
        </box>
      )}
    </Show>
  )
}

/** Opens the goal dialog for a Session, or explains how to start one. */
export function showGoal(context: Plugin.Context, sessionID: string) {
  if (!sessionGoal(context, sessionID)) {
    context.ui.toast.show({ message: "No goal is set. Start one with /goal <objective>.", variant: "info" })
    return
  }
  context.ui.dialog.show(() => <GoalDialog context={context} sessionID={sessionID} />)
}

function GoalDialog(props: { context: Plugin.Context; sessionID: string }) {
  const theme = useTheme().surface("dialog")
  const goal = createMemo(() => sessionGoal(props.context, props.sessionID))
  const run = (text: "pause" | "resume" | "clear") => {
    if (text === "clear") props.context.ui.dialog.clear()
    void props.context.client.session.command({ sessionID: props.sessionID, name: "goal", text }).catch((error) =>
      props.context.ui.toast.show({
        title: "Failed to update the goal",
        message: error instanceof Error ? error.message : String(error),
        variant: "error",
      }),
    )
  }
  const actions = createMemo((): DialogFooterAction[] => {
    const current = goal()
    if (!current) return []
    return [
      ...(current.status === "active" ? [{ title: "pause", key: "p", onTrigger: () => run("pause") }] : []),
      ...(current.status === "paused" ? [{ title: "resume", key: "r", onTrigger: () => run("resume") }] : []),
      { title: "clear", key: "x", onTrigger: () => run("clear") },
    ]
  })

  Keymap.createLayer(() => ({
    mode: "modal",
    commands: [
      {
        bind: "p",
        title: "Pause goal",
        group: "Dialog",
        enabled: goal()?.status === "active",
        run: () => run("pause"),
      },
      {
        bind: "r",
        title: "Resume goal",
        group: "Dialog",
        enabled: goal()?.status === "paused",
        run: () => run("resume"),
      },
      { bind: "x", title: "Clear goal", group: "Dialog", enabled: goal() !== undefined, run: () => run("clear") },
    ],
  }))

  return (
    <Show when={goal()}>
      {(current) => (
        <DialogLayout
          header={<DialogHeader title="Goal" />}
          footer={{ actions: { primary: actions() } }}
          legacyFooter={<DialogFooter actions={{ primary: actions() }} />}
        >
          <box gap={1}>
            <text fg={theme.text.base}>{current().objective}</text>
            <box>
              <text fg={goalColor(theme, current())} wrapMode="none">
                ◎ {current().status === "active" ? "Active" : current().status === "paused" ? "Paused" : "Met"}
              </text>
              <Show when={current().reason}>{(reason) => <text fg={theme.text.muted}>{reason()}</text>}</Show>
            </box>
          </box>
        </DialogLayout>
      )}
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.prompt.goal",
  setup(context) {
    context.ui.slot({
      append: "session.composer.top",
      render: (props) => <GoalBar context={context} sessionID={props.sessionID} />,
    })
  },
})
