// Niche content templates — one-click presets for the highest-performing
// faceless-video formats (per market research: Reddit stories, scary stories,
// motivation, finance/high-CPM, fact countdowns, history). Selecting one
// pre-fills the script style/audience/duration and feeds format-specific
// guidance to the script generator. `guidance` is server-validated (looked up
// by id in the API route) so it can't be used to inject arbitrary prompt text.

export interface NicheTemplate {
  id: string
  name: string
  emoji: string
  description: string
  style: string
  audience: string
  duration: string
  guidance: string
}

export const NICHE_TEMPLATES: NicheTemplate[] = [
  {
    id: "reddit-story",
    name: "Reddit Story",
    emoji: "📖",
    description: "Dramatic first-person story (AITA, revenge, confession)",
    style: "dramatic",
    audience: "tiktok",
    duration: "60",
    guidance:
      "Write as a gripping first-person Reddit-style story (e.g. AITA, malicious compliance, revenge). Open mid-conflict, escalate with specific concrete details, and end on a twist or satisfying payoff.",
  },
  {
    id: "scary-story",
    name: "Scary Story",
    emoji: "👻",
    description: "Creepy short horror that keeps viewers on edge",
    style: "dramatic",
    audience: "tiktok",
    duration: "60",
    guidance:
      "Write a chilling short horror story in first person. Build dread slowly with sensory detail, keep it atmospheric and tense, and land a sudden unsettling twist at the very end.",
  },
  {
    id: "motivation",
    name: "Motivation",
    emoji: "🔥",
    description: "High-energy motivational speech",
    style: "dramatic",
    audience: "general",
    duration: "30",
    guidance:
      "Write a punchy, high-energy motivational monologue. Short hard-hitting sentences, direct 'you' address, building to an inspiring climax that makes the viewer want to act right now.",
  },
  {
    id: "finance-tip",
    name: "Finance Tip",
    emoji: "💰",
    description: "Money tip (high-CPM niche)",
    style: "educational",
    audience: "general",
    duration: "60",
    guidance:
      "Write a clear, credible money tip for beginners. Open with a bold money claim, deliver one specific actionable insight, avoid hype and personalized investment advice, and end with a follow CTA.",
  },
  {
    id: "did-you-know",
    name: "Did You Know",
    emoji: "🤯",
    description: "Surprising facts countdown",
    style: "engaging",
    audience: "general",
    duration: "30",
    guidance:
      "Write a tight list of surprising, little-known facts on the topic. Each fact should be punchy and shareable, with the single most mind-blowing one saved for last.",
  },
  {
    id: "history",
    name: "History",
    emoji: "🏛️",
    description: "Fascinating true history story",
    style: "educational",
    audience: "general",
    duration: "60",
    guidance:
      "Tell a fascinating, lesser-known true history story. Open with an intriguing hook, narrate vividly with concrete details, and close with why it still matters today.",
  },
]

export function getNicheGuidance(id: unknown): string | null {
  if (typeof id !== "string") return null
  return NICHE_TEMPLATES.find((n) => n.id === id)?.guidance ?? null
}
