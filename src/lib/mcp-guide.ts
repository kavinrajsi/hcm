// Screenshots for the "Connect an AI" guide (/mcp/instructions) and the
// admin setup on MCP access. Each lives at public/mcp-guide/<file>; a
// missing one is simply not shown, and MCP access lists which are missing.

export type GuideShot = { file: string; caption: string };

export const GUIDE_SHOTS = {
  claude: [
    { file: "claude-1-settings.png", caption: "claude.ai: your name (bottom left) → Settings" },
    { file: "claude-2-connectors.png", caption: "Settings → Connectors → Add custom connector" },
    { file: "claude-3-add.png", caption: "Name HCM, paste the URL, click Add" },
    { file: "claude-4-connect.png", caption: "HCM in the list → Connect" },
    { file: "claude-5-hcm-allow.png", caption: "HCM asks you to allow Claude → Allow" },
    { file: "claude-6-connected.png", caption: "Back in Claude: HCM shows as connected" },
    { file: "claude-7-chat.png", caption: "In a chat: Search and tools (the sliders icon) → HCM is on" },
    { file: "claude-8-answer.png", caption: "Ask a question; allow the HCM tool when Claude asks" },
  ],
  chatgpt: [
    { file: "chatgpt-1-settings.png", caption: "ChatGPT: your name → Settings → Apps & Connectors" },
    { file: "chatgpt-2-developer-mode.png", caption: "Advanced settings → turn on Developer mode" },
    { file: "chatgpt-3-create.png", caption: "Create: name HCM, paste the URL, OAuth, tick I trust this application" },
    { file: "chatgpt-4-hcm-allow.png", caption: "HCM asks you to allow ChatGPT → Allow" },
    { file: "chatgpt-5-chat.png", caption: "In a chat: + → More → Developer mode → turn on HCM" },
    { file: "chatgpt-6-answer.png", caption: "Ask a question; confirm when ChatGPT wants to change something" },
  ],
  admin: [
    { file: "vercel-1-env.png", caption: "Vercel → hcm project → Settings → Environment Variables → AUTH_URL" },
    { file: "vercel-2-edit.png", caption: "Edit AUTH_URL for Production: https://connect.madarth.com → Save" },
    { file: "vercel-3-redeploy.png", caption: "Deployments → latest Production → ⋯ → Redeploy" },
    { file: "vercel-4-check.png", caption: "The check link shows issuer https://connect.madarth.com" },
  ],
} satisfies Record<string, GuideShot[]>;

export const ALL_GUIDE_SHOTS: GuideShot[] = Object.values(GUIDE_SHOTS).flat();

export const shotPath = (file: string) => `/mcp-guide/${file}`;
