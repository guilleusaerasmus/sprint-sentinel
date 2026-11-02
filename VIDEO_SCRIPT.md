# Sprint Sentinel — demo video script (< 5 min)

Target: 3–4 minutes. Judges score "Presentation". Show the product working on
real data, and make the "it can't lie" point clearly.

Record your screen (Jira is already set up: board 211, active sprint, Rovo open).
Narration in English is safest for judging, but Spanish is fine too — a script
for both is below. Keep the Jira tab full-screen and zoom the Rovo panel a bit.

---

## Shot list

**0:00–0:25 — The problem (talking over the board view)**
Show the ShopFast board with the active sprint.
> "Every sprint check-in runs on gut feel. The signals that predict a missed
> sprint are right here on the board — blocked tickets, overdue work, one person
> overloaded — but nobody has time to comb for them. And if you just ask a
> general AI 'how's the sprint?', it'll invent a confident answer. Sprint
> Sentinel fixes that."

**0:25–0:45 — What it is**
> "It's one Atlassian Forge app that ships as both a Rovo agent and an MCP
> server. Four tools, and every answer is backed by the exact Jira issue it
> came from — the AI never makes up a number."

**0:45–2:15 — Live demo (the core)**
Open "Ask Rovo", type `@Sprint Sentinel`, select it.
Ask: **"How healthy is the sprint on board 211?"**
While it runs, narrate the "Analyzing / Pulling issues in the active sprint" steps:
> "It's calling our Forge tool, which reads the live sprint from the Jira Agile
> API and runs a pure analysis engine — not the language model — to compute the
> findings."
When the answer lands, walk through it:
> "24% done. The biggest item, SHOP-2, is flagged and blocked by SHOP-6. SHOP-1
> was due the 1st and is still in progress. SHOP-6 is due tomorrow and not
> started. And one person is holding four in-progress items at once. Notice
> every single line cites an issue key — and they're clickable."
Click one issue link to show it opens the real issue.

**2:15–2:55 — Ask a focused follow-up**
Ask: **"Who is overloaded on board 211?"** and/or **"What is blocked on board 211?"**
> "The same four tools answer focused questions too — workload per person, and
> blockers with the issue that's blocking each one."

**2:55–3:30 — Why it's trustworthy (show the code briefly)**
Cut to `src/lib/analysis.js` and `npm test` output (21 passing).
> "Here's the key design choice. The language model never computes anything. The
> tool fetches the board, this pure, unit-tested engine derives every finding,
> and the agent's prompt only lets it relay what the tool returned, always
> citing the key. That hard logic has 21 tests that run with no Jira at all — so
> the AI is architecturally unable to invent a risk."

**3:30–3:50 — Close**
> "One Forge app: the main track, plus the Rovo-agent and MCP bonus categories
> from a single shared implementation. That's Sprint Sentinel — sprint health
> you can actually trust."

---

## Guion en español (por si prefieres narrar en español)

- **Problema:** "Cada revisión de sprint se hace a ojo. Las señales que predicen
  un sprint fallido están en el tablero —tareas bloqueadas, vencidas, una
  persona saturada— pero nadie tiene tiempo de buscarlas. Y si le preguntas a
  una IA genérica, se inventa una respuesta. Sprint Sentinel lo arregla."
- **Qué es:** "Una app de Atlassian Forge que es a la vez agente de Rovo y
  servidor MCP. Cuatro herramientas, y cada respuesta está respaldada por la
  incidencia exacta de Jira: la IA nunca inventa un número."
- **Demo:** pregunta "How healthy is the sprint on board 211?" y explica cada
  aviso citando la clave (SHOP-2 bloqueada, SHOP-1 vencida, SHOP-6 vence mañana,
  una persona con 4 en curso). Haz clic en un enlace para abrir la incidencia.
- **Por qué es fiable:** enseña `analysis.js` y `npm test` (21 pruebas). "El
  modelo nunca calcula nada: la herramienta trae el tablero, este motor probado
  deriva cada hallazgo, y el agente solo lo transmite citando la clave."
- **Cierre:** "Una sola app de Forge: track principal más las categorías extra
  de agente Rovo y MCP. Esto es Sprint Sentinel: salud de sprint en la que
  puedes confiar."

---

## Recording tips
- Tools like the free **Loom**, **OBS Studio**, or Windows **Game Bar**
  (Win+G → record) work. Loom uploads straight to a shareable link.
- Upload to **YouTube** (unlisted is allowed by most hackathons; check the rule
  — Codegeist accepts a YouTube link). Keep it under 5:00.
- Do a silent screen pass first; narrate on a second take if you want it clean.
