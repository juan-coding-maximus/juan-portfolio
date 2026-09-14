// Shared scoring rules, used by both the phone tap client and the host dashboard
// so a tap is graded exactly the same way everywhere. deltaMs: negative = early
// (ahead of the click), positive = late (behind the click).
const SCORING = (() => {
  const PERFECT_MS = 20;
  const GOOD_MS = 45;
  const OKAY_MS = 90;

  const COLORS = {
    perfect: '#3ecf6e',
    good: '#7fe0a0',
    okay: '#e8c547',
    rushing: '#ef5555',
    dragging: '#ef5555',
  };

  function classify(deltaMs) {
    const abs = Math.abs(deltaMs);
    if (abs <= PERFECT_MS) return { key: 'perfect', label: 'Perfect', color: COLORS.perfect };
    if (abs <= GOOD_MS) return { key: 'good', label: 'Good', color: COLORS.good };
    if (abs <= OKAY_MS) return { key: 'okay', label: 'Okay', color: COLORS.okay };
    if (deltaMs > 0) return { key: 'dragging', label: 'Dragging', color: COLORS.dragging };
    return { key: 'rushing', label: 'Rushing', color: COLORS.rushing };
  }

  function summarize(taps) {
    const counts = { perfect: 0, good: 0, okay: 0, rushing: 0, dragging: 0 };
    for (const t of taps) counts[classify(t.deltaMs).key]++;
    const total = taps.length || 1;
    const pct = {};
    for (const k of Object.keys(counts)) pct[k] = (counts[k] / total) * 100;
    return { counts, pct, total: taps.length };
  }

  return { PERFECT_MS, GOOD_MS, OKAY_MS, COLORS, classify, summarize };
})();
