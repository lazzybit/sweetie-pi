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
    "provider": "openai-proxy",
    "model": "gpt-6-astra",
    "effort": "xhigh"
  }
}
```

## openai-proxy

Set the local endpoint without committing the change:

```bash
sed -i 's|https://example.invalid|https://your-endpoint.example|' extensions/openai-proxy/openai-proxy.const.ts
```
