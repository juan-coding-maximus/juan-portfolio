"use client";

/**
 * The Matrix screen: Juan's own board of projects and immediate to-dos.
 *
 * Nothing here is derived. A task exists only because Juan typed it, through
 * the "+" in whichever quadrant it belongs to, or because a visit log
 * surfaced it (clientos/whatsappos, source: 'visit_log'). Its quadrant
 * (urgent x important, I-IV, same letters and sense as matrix.ts's account
 * board) and its effort/yield position are two separate facts he sets by
 * hand, because he was explicit that a task's urgency and its effort/yield
 * don't move together: a thing can be urgent and small (III, low effort, low
 * yield) or worth a lot of work and not yet urgent (II, high effort, high
 * yield).
 *
 * Checking a task off holds a confirmation in place (ResolvingRow, the same
 * pattern Outbound's queue uses), then it leaves the quadrant for the Success
 * list at the foot of the screen, unchecked from there if it was a mistake.
 */

import { useRef, useState } from "react";
import type { MatrixQuadrant, MatrixTask } from "./dal";
import { ResolvingRow } from "./queue-ui";
import { Ico, SuccessNote, daysAgo } from "./ui";

const QUADRANTS: Record<MatrixQuadrant, { title: string; sense: string }> = {
  I: { title: "Do now", sense: "Urgent and worth it" },
  II: { title: "Schedule", sense: "Worth it, not yet urgent" },
  III: { title: "Clear fast", sense: "Urgent, small" },
  IV: { title: "Later", sense: "Neither, for now" },
};

const ORDER: MatrixQuadrant[] = ["I", "II", "III", "IV"];

/** One accent, then a neutral ramp: quadrant I wears the department's green,
 *  the rest get progressively lighter ink. Nothing below I is colored, so a
 *  quiet quadrant never reads as "these are fine". */
const RAIL: Record<MatrixQuadrant, string> = {
  I: "#2C6A46",
  II: "#3D4A44",
  III: "#8A928C",
  IV: "#C9CCC6",
};

async function postJSON(url: string, body: unknown): Promise<{ ok: boolean; task?: MatrixTask }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; task?: MatrixTask };
  } catch {
    return { ok: false };
  }
}

/* ------------------------------------------------------------- placement */

/** A small tap-to-place square: pointer down or drag sets effort (x) and
 *  yield (y, inverted so up is high). Used both in the add form and, larger,
 *  as the main board in the Effort/Yield view. No drag gesture is required to
 *  use it, a single tap is a complete placement; a held drag just refines it. */
function PlacementPad({
  x,
  y,
  onPick,
  size = 64,
  accent = "#2C6A46",
}: {
  x: number;
  y: number;
  onPick: (x: number, y: number) => void;
  size?: number;
  accent?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onPick(nx, 1 - ny);
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) pick(e);
      }}
      className="relative shrink-0 touch-none rounded-md border border-[#E2DFD5] bg-white"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-[#EDEBE3]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-[#EDEBE3]" />
      <div
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
        style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%`, background: accent }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ add */

function AddTaskForm({
  quadrant,
  onAdd,
  onClose,
}: {
  quadrant: MatrixQuadrant;
  onAdd: (text: string, description: string | null, effort: number, yieldScore: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [point, setPoint] = useState({ x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onAdd(t, description.trim() || null, point.x, point.y);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="border-t border-[#EDEBE3] bg-[#FAF9F5] p-2.5">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") onClose();
        }}
        placeholder="What needs to happen"
        className="w-full rounded-md border border-[#E2DFD5] bg-white px-2.5 py-2 text-[13px] text-[#14201B] placeholder:text-[#8A928C] focus:outline-none focus:ring-1 focus:ring-[#2C6A46]"
      />

      {showDetails ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Details"
          className="mt-1.5 w-full resize-none rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[12.5px] text-[#14201B] placeholder:text-[#8A928C] focus:outline-none focus:ring-1 focus:ring-[#2C6A46]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="mt-1 text-[11.5px] text-[#8A928C] transition-colors hover:text-[#3D4A44]"
        >
          + details
        </button>
      )}

      <div className="mt-2.5 flex items-center gap-2.5">
        <PlacementPad x={point.x} y={point.y} onPick={(x, y) => setPoint({ x, y })} />
        <div className="text-[10px] uppercase tracking-[0.1em] text-[#8A928C]">
          Effort · Yield
        </div>
      </div>

      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[32px] rounded-md px-2.5 text-[12.5px] text-[#5B6560] transition-colors hover:bg-[#ECEAE1]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!text.trim() || busy}
          className="min-h-[32px] rounded-md bg-[#14201B] px-3 text-[12.5px] text-[#F7F6F1] transition-colors hover:bg-[#25332C] disabled:opacity-40"
        >
          Add to {QUADRANTS[quadrant].title}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- task row */

function TaskRow({
  task,
  onCheck,
  onGone,
}: {
  task: MatrixTask;
  onCheck: (id: string) => Promise<boolean>;
  onGone: (task: MatrixTask) => void;
}) {
  const [resolved, setResolved] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (busy || resolved) return;
    setBusy(true);
    const ok = await onCheck(task.id);
    setBusy(false);
    if (ok) setResolved(true);
  };

  return (
    <ResolvingRow resolved={resolved} onGone={() => onGone(task)}>
      <div className="flex items-start gap-2.5 border-t border-[#EDEBE3] px-2.5 py-2 first:border-t-0">
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy || resolved}
          aria-label="Mark done"
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#C9CCC6] text-transparent transition-colors hover:border-[#2C6A46] hover:text-[#2C6A46]"
        >
          <Ico name="check" size={11} />
        </button>
        <div className="min-w-0 flex-1">
          {resolved ? (
            <SuccessNote title="Done" />
          ) : (
            <>
              <p className="text-[13px] font-medium leading-snug text-[#14201B]">{task.text}</p>
              {task.description && (
                <p className="mt-0.5 text-[11.5px] leading-snug text-[#5B6560]">{task.description}</p>
              )}
            </>
          )}
        </div>
      </div>
    </ResolvingRow>
  );
}

/* ------------------------------------------------------------------ cell */

const CELL_ROWS = 4;

function Cell({
  q,
  tasks,
  focused,
  onFocus,
  adding,
  onAddOpen,
  onAddClose,
  onAdd,
  onCheck,
  onGone,
}: {
  q: MatrixQuadrant;
  tasks: MatrixTask[];
  focused: boolean;
  onFocus: () => void;
  adding: boolean;
  onAddOpen: () => void;
  onAddClose: () => void;
  onAdd: (text: string, description: string | null, effort: number, yieldScore: number) => Promise<boolean>;
  onCheck: (id: string) => Promise<boolean>;
  onGone: (task: MatrixTask) => void;
}) {
  const shown = focused ? tasks : tasks.slice(0, CELL_ROWS);
  const rest = tasks.length - shown.length;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
      <div className="flex w-full items-center gap-2 border-l-[3px] px-2.5 py-2.5" style={{ borderLeftColor: RAIL[q] }}>
        <button
          type="button"
          onClick={onFocus}
          aria-expanded={focused}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:opacity-80"
        >
          <span className="font-[family-name:var(--font-fraunces)] text-[15px] font-semibold leading-none text-[#14201B]">
            {q}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[#14201B]">{QUADRANTS[q].title}</span>
            <span className="block truncate text-[11px] text-[#8A928C]">{QUADRANTS[q].sense}</span>
          </span>
          <span className="shrink-0 text-[13px] tabular-nums text-[#5B6560]">{tasks.length}</span>
        </button>
        <button
          type="button"
          onClick={onAddOpen}
          aria-label={`Add to ${QUADRANTS[q].title}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#5B6560] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
        >
          <Ico name="plus" size={14} />
        </button>
      </div>

      {adding && <AddTaskForm quadrant={q} onAdd={onAdd} onClose={onAddClose} />}

      {tasks.length === 0 ? (
        !adding && (
          <p className="flex flex-1 items-center justify-center border-t border-[#EDEBE3] px-2.5 py-6 text-[12px] text-[#8A928C]">
            Nothing here.
          </p>
        )
      ) : (
        <div>
          {shown.map((t) => (
            <TaskRow key={t.id} task={t} onCheck={onCheck} onGone={onGone} />
          ))}
          {rest > 0 && (
            <button
              type="button"
              onClick={onFocus}
              className="flex min-h-[40px] w-full items-center justify-center border-t border-[#EDEBE3] px-2.5 text-[12px] text-[#3D4A44] transition-colors hover:bg-[#F7F6F1]"
            >
              {rest} more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- scatter */

const PAD = 11;

function ScatterBoard({
  tasks,
  onMove,
  onDone,
}: {
  tasks: MatrixTask[];
  onMove: (task: MatrixTask, effort: number, yieldScore: number) => void;
  onDone: (task: MatrixTask) => void;
}) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const pinned = tasks.find((t) => t.id === pinnedId) ?? null;

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!moving || !pinned) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onMove(pinned, x, 1 - y);
  };

  return (
    <div>
      <div className="flex gap-2">
        <span className="flex w-5 shrink-0 items-center justify-center text-[10.5px] tracking-wide text-[#8A928C] [writing-mode:vertical-lr] rotate-180">
          Yield
        </span>
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          onPointerDown={(e) => {
            if (!moving) return;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            pick(e);
          }}
          onPointerMove={(e) => {
            if (moving && e.buttons === 1) pick(e);
          }}
          className={`aspect-square w-full touch-none rounded-lg border border-[#E2DFD5] bg-white ${moving ? "cursor-crosshair" : ""}`}
        >
          <line x1="50" y1="0" x2="50" y2="100" stroke="#E2DFD5" strokeWidth="0.4" strokeDasharray="2 2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#E2DFD5" strokeWidth="0.4" strokeDasharray="2 2" />

          {tasks.map((t) => {
            const x = PAD + (t.effort ?? 0.5) * (100 - 2 * PAD);
            const y = PAD + (1 - (t.yield_score ?? 0.5)) * (100 - 2 * PAD);
            const on = t.id === pinnedId;
            return (
              <g
                key={t.id}
                onClick={() => {
                  setPinnedId(t.id);
                  setMoving(false);
                }}
                className="cursor-pointer"
              >
                <circle cx={x} cy={y} r="4.5" fill="transparent" />
                <circle cx={x} cy={y} r={on ? 2.8 : 2} fill={RAIL[t.quadrant]} stroke="#FFFFFF" strokeWidth="0.5">
                  <title>{t.text}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="ml-7 mt-1.5 text-center text-[10.5px] tracking-wide text-[#8A928C]">Effort</p>

      <div className="mt-3 min-h-[76px] rounded-lg border border-[#E2DFD5] bg-white p-3">
        {pinned ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[14px] font-medium text-[#14201B]">{pinned.text}</span>
              <span className="shrink-0 text-[11px] text-[#8A928C]">{QUADRANTS[pinned.quadrant].title}</span>
            </div>
            {pinned.description && (
              <p className="mt-1 text-[12.5px] leading-snug text-[#5B6560]">{pinned.description}</p>
            )}
            <div className="mt-2.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => setMoving((m) => !m)}
                aria-pressed={moving}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 text-[12.5px] transition-colors ${
                  moving ? "bg-[#2C6A46] text-white" : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
                }`}
              >
                {moving ? "Tap the board" : "Move"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDone(pinned);
                  setPinnedId(null);
                  setMoving(false);
                }}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md bg-[#14201B] px-3 text-[12.5px] text-[#F7F6F1] transition-colors hover:bg-[#25332C]"
              >
                <Ico name="check" size={13} />
                Done
              </button>
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-[#8A928C]">Tap a dot.</p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- success */

function SuccessList({ tasks, onReopen }: { tasks: MatrixTask[]; onReopen: (task: MatrixTask) => void }) {
  if (tasks.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        Success <span className="tabular-nums text-[#B4B9B3]">{tasks.length}</span>
      </h2>
      <ul className="mt-2 divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => onReopen(t)}
              aria-label="Reopen"
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2C6A46] text-white transition-colors hover:bg-[#25332C]"
            >
              <Ico name="check" size={11} />
            </button>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[#3D4A44] line-through decoration-[#C9CCC6]">
              {t.text}
            </span>
            <span className="shrink-0 text-[12px] text-[#8A928C]">{daysAgo(t.done_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ screen */

export function MatrixScreen({
  initialOpen,
  initialDone,
}: {
  initialOpen: MatrixTask[];
  initialDone: MatrixTask[];
}) {
  const [view, setView] = useState<"eisenhower" | "effort">("eisenhower");
  const [focus, setFocus] = useState<MatrixQuadrant | null>(null);
  const [addingIn, setAddingIn] = useState<MatrixQuadrant | null>(null);
  const [openTasks, setOpenTasks] = useState<MatrixTask[]>(initialOpen);
  const [doneTasks, setDoneTasks] = useState<MatrixTask[]>(initialDone);

  const byQuadrant: Record<MatrixQuadrant, MatrixTask[]> = { I: [], II: [], III: [], IV: [] };
  for (const t of openTasks) byQuadrant[t.quadrant].push(t);

  async function addTask(
    quadrant: MatrixQuadrant,
    text: string,
    description: string | null,
    effort: number,
    yieldScore: number,
  ): Promise<boolean> {
    const res = await postJSON("/nutribiotic/api/matrix", {
      quadrant,
      text,
      description,
      effort,
      yield_score: yieldScore,
    });
    if (res.ok && res.task) {
      setOpenTasks((prev) => [...prev, res.task!]);
      return true;
    }
    return false;
  }

  async function checkOff(id: string): Promise<boolean> {
    const res = await postJSON("/nutribiotic/api/matrix/done", { id, done: true });
    return res.ok;
  }

  function taskGone(task: MatrixTask) {
    setOpenTasks((prev) => prev.filter((t) => t.id !== task.id));
    setDoneTasks((prev) => [{ ...task, done: true, done_at: new Date().toISOString() }, ...prev].slice(0, 60));
  }

  async function reopen(task: MatrixTask) {
    const res = await postJSON("/nutribiotic/api/matrix/done", { id: task.id, done: false });
    if (!res.ok) return;
    setDoneTasks((prev) => prev.filter((t) => t.id !== task.id));
    setOpenTasks((prev) => [...prev, { ...task, done: false, done_at: null }]);
  }

  async function scatterDone(task: MatrixTask) {
    const ok = await checkOff(task.id);
    if (ok) taskGone(task);
  }

  function move(task: MatrixTask, effort: number, yieldScore: number) {
    setOpenTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, effort, yield_score: yieldScore } : t)),
    );
    void postJSON("/nutribiotic/api/matrix/position", { id: task.id, effort, yield_score: yieldScore });
  }

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ["eisenhower", "Eisenhower"],
            ["effort", "Effort / yield"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`min-h-[36px] rounded-md px-3 text-[13px] transition-colors ${
              view === key ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "eisenhower" ? (
        focus ? (
          <div>
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="mb-2 inline-flex min-h-[36px] items-center gap-1.5 text-[13px] text-[#3D4A44] transition-colors hover:text-[#14201B]"
            >
              <Ico name="chevron-up" size={14} />
              All four
            </button>
            <Cell
              q={focus}
              tasks={byQuadrant[focus]}
              focused
              onFocus={() => setFocus(null)}
              adding={addingIn === focus}
              onAddOpen={() => setAddingIn(focus)}
              onAddClose={() => setAddingIn(null)}
              onAdd={(text, description, effort, yieldScore) => addTask(focus, text, description, effort, yieldScore)}
              onCheck={checkOff}
              onGone={taskGone}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {ORDER.map((q) => (
              <Cell
                key={q}
                q={q}
                tasks={byQuadrant[q]}
                focused={false}
                onFocus={() => setFocus(q)}
                adding={addingIn === q}
                onAddOpen={() => setAddingIn(q)}
                onAddClose={() => setAddingIn(null)}
                onAdd={(text, description, effort, yieldScore) => addTask(q, text, description, effort, yieldScore)}
                onCheck={checkOff}
                onGone={taskGone}
              />
            ))}
          </div>
        )
      ) : (
        <ScatterBoard tasks={openTasks} onMove={move} onDone={scatterDone} />
      )}

      <SuccessList tasks={doneTasks} onReopen={reopen} />
    </div>
  );
}
