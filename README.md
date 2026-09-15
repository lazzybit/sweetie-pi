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

## openai-proxy

Set custom endpoint:

```bash
sed -i 's|https://example.invalid|https://your-endpoint.example|' extensions/openai-proxy/config.ts
```
