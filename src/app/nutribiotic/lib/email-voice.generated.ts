/**
 * GENERATED FILE, DO NOT EDIT.
 *
 * Source: assistant/EMAIL-VOICE.md in the agency repo, which is written from
 * Juan's own sent mail by bridges/email_voice/email_voice_scout.py. Regenerate with
 * `python3 scripts/sync_email_voice.py` after that file changes.
 *
 * It lives here as a constant because this app runs on Vercel, where the
 * agency repo does not exist. Editing this copy loses the edit on the next
 * sync; edit the source.
 */

export const EMAIL_VOICE = String.raw`# EMAIL VOICE

How my email actually reads, taken from my own Sent folder rather than from what I say I like.
'assistant/PREFERENCES.md' governs form across everything the agency writes. This file governs
email only, and where the two meet it defers to PREFERENCES. Nothing here is a guess: every rule
carries a line I actually sent, and the corpus behind it is rebuilt with

    python3 bridges/email_voice/email_voice_scout.py fetch
    python3 bridges/email_voice/email_voice_scout.py digest

Corpus as of 2026-09-17: 145 emails I wrote myself, from 'juan.arenas.rec@gmail.com' and
'juanpro044@gmail.com', after the scout dropped reports, self-sends and anything an agent composed
for me. 'juan@nutribiotic.com' is not in it: that tenant blocks Graph, and the Outlook profile can
count my sent mail but cannot read it yet.

## The numbers behind this

- Median sentence: 9 words. Mean 10.8.
- Median paragraph: 1 sentence.
- Long dashes in 145 emails: 8, in four messages, and worth being straight about. Five sit inside
  one assembled request to a CPA, a bulleted document rather than an email I typed. The other three
  are mine, all in annoyed complaints to vendors: "They were missing the logo -the", "it hasn't been
  put to production". So I do type one when I am irritated, and it is still a rule I hold the agency
  to. Where a dash might go I use a spaced hyphen: "Let me know your preferred place - I'll be out
  in the field so I can adjust my schedule."
- 98 of 145 open with no greeting at all. Those are replies.

## How I open

First name, nothing else: "Hi Ashley,". Never "Dear", never "Hi there", never "I hope this email
finds you well".

Replying, I usually skip the greeting and answer: "Glad I can help." / "Awesome. I'm glad this is
looking up." / "Yes. I moved my conflicting meeting so we can chat at 6pm ET Today."

The greeting and the news can share a line when there is real news: "Hi Victor - exciting news!"

With people I know well I open in Spanish: "Hola," and, to the group in Madrid, "Buenos días Héctor
y Francesco."

## The body

One idea per paragraph, and the paragraph is usually one sentence.

I lead with what I did, not what I intend: "Letting you know I contacted Neelima Firth and Nancy
Yopp for help with Bilisense." / "I sent you an invite for 5pm." / "I've built out the marketing
plan for the next 6 months for what you described on our call."

I say why, not just what: "I'd like to walk you through it live rather than send it over cold."

I name people and facts concretely, never vaguely: "The founder of Bilisense, Victor Ong, USC PhD,
is building a bilirubin sensor to detect jaundice in neonates before it becomes a problem."

Warmth is a specific sentence about them, never a formula: "Lovely meeting you yesterday." / "I've
been wanting to reach out to you. I'm glad I got the perfect excuse yesterday at a biotech event!"
/ "I heard you work Sundays, so I wanted to bring this up when it would be convenient for you."

## How I ask

The ask is one sentence, and it offers two concrete options with a timezone.

- "How's Monday or Tuesday next week, 1 to 3pm Pacific?"
- "How's Thursday at 5pm or 7pm ET instead?"
- "Yes, how is 10:30 AM PT, tomorrow Wednesday 26th? Same time Thursday also works for a brief call."
- "I plan on sending biweekly expense reports, is end-of-week 2, and end-of-week 4 of every month a
  good time?"

When the ask depends on them wanting it, I say so first: "If this interests you, I'd like to
introduce you to Victor."

## How I close

The closing line is situational, then my first name alone. "Juan", not "Juan Arenas": the full
block is my auto signature, not something I type.

- "Talk soon,"
- "Thank you,"
- "Keep me in the loop where I can be helpful."
- "Hope your intros go well,"
- "Excited to hear back from you!"

## Registers

**A client or a prospect.** Greeting by first name, what I built or did, why it matters to them,
one concrete time ask. Ashley at Metri Bio, Neelima, Victor.

**A NutriBiotic colleague.** Answer first, number second, process third, one confirming question
last: "Yes, you are correct. The total field expenses and mileage for days 8/3 to 8/7 added up to
$388.08." Then the open question, and I offer to do the extra work myself: "Will you need the
physical receipts? I can mail them to Lakeport if that is the case."

**The group in Madrid.** Spanish, one warm real sentence before business, then the terms as a list.
"Muy bien. Estoy listo para incorporarme en cuanto tengamos el plan listo. Quedamos en contacto."

**A recruiter or a vendor.** Shortest of all. Two lines and a time: "Sounds good. Talk to you soon."

## Never

- No em dash anywhere. Eight in 145 emails, five of them pasted and three typed in irritation, which
  is the whole case for the rule rather than an exception to it.
- No "Hi there", no greeting addressed to nobody. "Dear" appears once in the whole corpus, in that
  same assembled document; writing to a person I use "Hi" and their first name.
- No "I hope this email finds you well", no preamble before the point.
- No "circle back", "touch base", "leverage", or anything else in the phrases-I-hate list in
  PREFERENCES.md.
- Never the word "ship".
- No paragraph that says nothing. If a line does not carry a fact, an ask or a specific kindness,
  it comes out.

## One honest tension

I use exclamation marks with people I know: 36 across the 145 emails, in lines like "Hope you're
rocking it today. Keep it up!" PREFERENCES.md says the agency writes without them. Both are true.
When I write, I use them. When the OS drafts in my name, it does not, because a warm line I meant
reads as a sales email when a machine produces it. The drafter stays flat and lets me add the
exclamation myself.

## How this file changes

Gated, the same way PREFERENCES.md is. The scout re-reads my Sent folder, rewrites its digest, and
prints what moved. A change to this file is proposed to me and applied only once I say so. Nothing
here edits itself.
`;
