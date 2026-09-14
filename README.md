## Setup

```bash
./setup.sh
```

## advisor

Ask a stronger reviewer model for guidance. The extension is a folder plugin at
`extensions/advisor/`:

| File | Responsibility |
|------|----------------|
| `index.ts` | Extension lifecycle and tool registration |
| `config.ts` | Load and validate the `advisor` settings block |
| `context.ts` | Build the reviewer conversation and tool inventory |
| `execute.ts` | Resolve the model, call it, and map the response |
| `render.ts` | TUI rendering for the call and result |
| `prompt.ts` | Reviewer instructions and user-facing copy |

Configure the reviewer model in `settings.json`:

```json
{
  "advisor": {
    "enabled": true,
    "provider": "openai-proxy",
    "model": "gpt-6-astra",
    "effort": "xhigh"
  }
}
```

Set `enabled` to `false` to omit the advisor tool. When advisor is unavailable, the tool returns a generic message and the detailed reason appears as a UI error notification. Project-local `.pi/settings.json` values override the global settings.

After editing the extension, run `/reload` in pi to pick up the changes (auto-discovered extensions hot-reload).

## openai-proxy

Set the local endpoint without committing the change:

```bash
sed -i 's|https://example.invalid|https://your-endpoint.example|' extensions/openai-proxy/openai-proxy.const.ts
```
