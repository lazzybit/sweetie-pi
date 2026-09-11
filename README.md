## Setup

```bash
./setup.sh
```

## advisor

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

## openai-proxy

Set the local endpoint without committing the change:

```bash
sed -i 's|https://example.invalid|https://your-endpoint.example|' extensions/openai-proxy/openai-proxy.const.ts
```
