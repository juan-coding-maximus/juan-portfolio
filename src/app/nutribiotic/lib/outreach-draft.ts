"use server";

import Anthropic from "@anthropic-ai/sdk";
import { listActivities } from "./dal";

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

export type OutreachDraft = {
  draft: string;
  basedOn: { detail: string; kind: string; at: string } | null;
  needsAttachment: boolean;
  attachmentHint: string | null;
};

const DRAFT_TOOL = {
  name: "draft_outreach",
  description: "Draft a short WhatsApp follow-up message continuing directly from a specific logged interaction.",
  input_schema: {
    type: "object" as const,
    properties: {
      draft: {
        type: "string",
        description:
          "The WhatsApp message, in Juan's own first-person voice, 2-4 sentences, natural and specific to what was actually discussed. Never invent a product, price, promise, date, or detail that is not in the note provided.",
      },
      needs_attachment: {
        type: "boolean",
        description:
          "True only if the note explicitly says or clearly implies Juan promised or the client asked for a document, sample sheet, pricing, flyer, or similar material.",
      },
      attachment_hint: {
        type: ["string", "null"],
        description: "If needs_attachment is true, a short phrase naming what was mentioned (e.g. 'the pricing sheet'), taken from the note. Null otherwise.",
      },
    },
    required: ["draft", "needs_attachment", "attachment_hint"],
  },
};

function systemPrompt(accountName: string, note: { detail: string; kind: string; at: string } | null): string {
  if (!note) {
    return `Draft a short, natural first-contact WhatsApp message from Juan, a NutriBiotic field rep, to ${accountName}. There is no prior logged interaction with this account, so the message must NOT claim or imply an earlier conversation. Keep it brief (2-3 sentences), first person, no invented facts about the account.`;
  }
  return `Draft a short WhatsApp follow-up message from Juan, a NutriBiotic field rep, to ${accountName}, continuing DIRECTLY from this specific logged interaction (this is the same text already filed as the HubSpot note, so it is what actually happened, not a summary you should second-guess):

kind: ${note.kind}
when: ${note.at}
what was said/happened: "${note.detail}"

Rules: use ONLY facts in that note. Never invent a product, price, promise, or detail not stated there. Keep it natural, first person, 2-4 sentences. Set needs_attachment=true only if the note itself says or clearly implies a document/sample/pricing/flyer was promised or requested.`;
}

/** Pulls the account's most recent logged activity (the same detail that
 *  becomes the HubSpot Note body, see hubspot_notes.py's note_lines()) and
 *  drafts a message that explicitly continues from it, rather than a generic
 *  template. Grounded, tool-forced, same no-fabrication discipline as
 *  touchpoint.ts's extractor: the model may only use what's in the note. */
export async function draftOutreachMessage(accountId: string, accountName: string): Promise<OutreachDraft> {
  const activities = await listActivities(accountId, 5);
  const last = activities.data.find((a) => (a.detail ?? "").trim().length > 0) ?? null;
  const note = last ? { detail: last.detail as string, kind: last.kind, at: last.at } : null;

  if (!client) {
    return {
      draft: note
        ? `Hi! Following up on our last conversation — wanted to check back in.`
        : `Hi! This is Juan from NutriBiotic, reaching out to introduce myself.`,
      basedOn: note,
      needsAttachment: false,
      attachmentHint: null,
    };
  }

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system: systemPrompt(accountName, note),
      messages: [{ role: "user", content: "Draft it." }],
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "draft_outreach" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { draft: "", basedOn: note, needsAttachment: false, attachmentHint: null };
    }
    const out = toolUse.input as { draft: string; needs_attachment: boolean; attachment_hint: string | null };
    return { draft: out.draft, basedOn: note, needsAttachment: out.needs_attachment, attachmentHint: out.attachment_hint };
  } catch {
    return {
      draft: note ? `Hi! Following up on our last conversation.` : `Hi! This is Juan from NutriBiotic.`,
      basedOn: note,
      needsAttachment: false,
      attachmentHint: null,
    };
  }
}
