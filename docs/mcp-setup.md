# Connecting AI apps to HCM

HCM's MCP server is at `https://connect.madarth.com/api/mcp`. People sign in with their HCM account and see only what they can see in HCM. The same steps, with screenshots, are on the public page `/mcp/instructions` (Connect an AI in the menu). HR sees the admin setup and a screenshot checklist on **Admin → MCP access**.

## Claude (claude.ai, desktop, mobile)

On Team or Enterprise plans an Owner adds the connector once under Admin settings → Connectors; members start at step 4.

1. claude.ai: your name (bottom left) → Settings  
   ![Step 1](../public/mcp-guide/claude-1-settings.png)
2. Settings → Connectors → Add custom connector  
   ![Step 2](../public/mcp-guide/claude-2-connectors.png)
3. Name HCM, paste the URL, click Add  
   ![Step 3](../public/mcp-guide/claude-3-add.png)
4. HCM in the list → Connect  
   ![Step 4](../public/mcp-guide/claude-4-connect.png)
5. HCM asks you to allow Claude → Allow  
   ![Step 5](../public/mcp-guide/claude-5-hcm-allow.png)
6. Back in Claude: HCM shows as connected  
   ![Step 6](../public/mcp-guide/claude-6-connected.png)
7. In a chat: Search and tools (the sliders icon) → HCM is on  
   ![Step 7](../public/mcp-guide/claude-7-chat.png)
8. Ask a question; allow the HCM tool when Claude asks  
   ![Step 8](../public/mcp-guide/claude-8-answer.png)

## ChatGPT (Plus, Pro, Business, Enterprise)

1. ChatGPT: your name → Settings → Apps & Connectors  
   ![Step 1](../public/mcp-guide/chatgpt-1-settings.png)
2. Advanced settings → turn on Developer mode  
   ![Step 2](../public/mcp-guide/chatgpt-2-developer-mode.png)
3. Create: name HCM, paste the URL, OAuth, tick I trust this application  
   ![Step 3](../public/mcp-guide/chatgpt-3-create.png)
4. HCM asks you to allow ChatGPT → Allow  
   ![Step 4](../public/mcp-guide/chatgpt-4-hcm-allow.png)
5. In a chat: + → More → Developer mode → turn on HCM  
   ![Step 5](../public/mcp-guide/chatgpt-5-chat.png)
6. Ask a question; confirm when ChatGPT wants to change something  
   ![Step 6](../public/mcp-guide/chatgpt-6-answer.png)

## Admin: AUTH_URL on Vercel

AI apps discover HCM's sign-in through `AUTH_URL`. It must be exactly `https://connect.madarth.com` (https, no trailing slash) for Production. Checked on 2026-10-01: the live site already reports `issuer: https://connect.madarth.com`.

1. Vercel → hcm project → Settings → Environment Variables → AUTH_URL  
   ![Step 1](../public/mcp-guide/vercel-1-env.png)
2. Edit AUTH_URL for Production: https://connect.madarth.com → Save  
   ![Step 2](../public/mcp-guide/vercel-2-edit.png)
3. Deployments → latest Production → ⋯ → Redeploy  
   ![Step 3](../public/mcp-guide/vercel-3-redeploy.png)
4. The check link shows issuer https://connect.madarth.com  
   ![Step 4](../public/mcp-guide/vercel-4-check.png)

## Screenshots

Save each as PNG under `public/mcp-guide/` with the file name above, then deploy. Missing screenshots are hidden on the guide page.
