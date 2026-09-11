## Setup

```bash
./setup.sh
```

## openai-proxy

Set the local endpoint without committing the change:

```bash
sed -i 's|https://example.invalid|https://your-endpoint.example|' extensions/openai-proxy/openai-proxy.const.ts
```
