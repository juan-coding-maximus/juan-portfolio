/**
 * "AI-suggest similar categories" for the Search screen's category-exclude
 * list (Juan's redirect, 2026-09-09): given the category he is sweeping,
 * name a handful of near-miss business types Google tends to return alongside
 * it, so he can exclude them in one click instead of hand-typing each one
 * after a run turns up junk.
 *
 * SUGGESTION ONLY, NOTHING IS APPLIED HERE. Every phrase this route returns
 * lands in the exclude-list input for Juan to accept or discard; the actual
 * matching against a Places result happens in
 * bridges/nutribiotic/places_search_ingest.py's category_excluded(), which
 * does a lowercase substring match against the place's own types/primaryType/
 * name, so a suggested phrase never has to be a valid Places Table A type,
 * only a plain-English category a rep would recognise.
 */
import Anthropic from "@anthropic-ai/sdk";
import { hasAccess } from "../../../lib/devices";

export const runtime = "nodejs";
export const maxDuration = 20;

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const SUGGEST_TOOL = {
  name: "suggest_excluded_categories",
  description:
    "Suggest business categories that commonly show up as false positives in a Google Places sweep for one category, worth excluding from a field-sales prospecting search.",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "A short, plain business category phrase to exclude, e.g. 'nail salon'.",
            },
            why: {
              type: "string",
              description:
                "One short phrase on why it is a near-miss for this search, e.g. 'often shares Google's spa category but is not a wellness buyer'.",
            },
          },
          required: ["category", "why"],
        },
        description: "3 to 8 category phrases worth excluding. Fewer, better ones over a padded list.",
      },
    },
    required: ["suggestions"],
  },
};

export async function POST(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!client) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Expected a JSON body." }, { status: 400 });
  }

  const category = String(body.category ?? "").trim().slice(0, 120);
  if (!category) {
    return Response.json({ ok: false, error: "Say what the search category is." }, { status: 400 });
  }
  const existing = Array.isArray(body.exclude_categories)
    ? body.exclude_categories.map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 40)
    : [];

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "You help a NutriBiotic field rep narrow a Google Places category sweep before it runs. He gives " +
        "you the category he is searching for (e.g. 'medical spa') and you name businesses OF A DIFFERENT " +
        "KIND that Google's text search tends to return alongside it and that are not real prospects for " +
        "a wellness-supplement wholesale account -- for a spa/wellness sweep that is things like nail " +
        "salons, hair salons, tanning studios, tattoo parlors; for a health-food sweep it is things like " +
        "convenience stores or gas-station marts. Never suggest a phrase that IS the category itself or a " +
        "narrower kind of it (a 'day spa' is not an exclude for a 'medical spa' search). Never repeat a " +
        "phrase already excluded. Plain business-category English only, no Google Places type enum " +
        "syntax.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Search category: "${category}".` +
                (existing.length ? ` Already excluded, do not repeat: ${existing.join(", ")}.` : ""),
            },
          ],
        },
      ],
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "suggest_excluded_categories" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ ok: false, error: "Could not suggest anything for that category." }, { status: 422 });
    }
    const input = toolUse.input as { suggestions?: { category: string; why: string }[] };
    return Response.json({ ok: true, suggestions: input.suggestions ?? [] });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Suggestion failed." },
      { status: 500 },
    );
  }
}
