## Setup

```bash
./setup.sh
```

## advisor

Configure the advisor model in `settings.json`:

```json
{
  "advisor": {
    "enabled": true,
    "provider": "openai",
    "model": "gpt-6-astra",
    "thinkingLevel": "xhigh"
  }
}
```

Or run `/settings-advisor`.

## usage

Run `/usage` to show stats.

## openai-proxy

Set custom endpoint:

```bash
sed -i 's|https://example.invalid|https://your-endpoint.example|' extensions/openai-proxy/config.ts
```
