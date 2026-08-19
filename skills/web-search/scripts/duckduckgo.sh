#!/usr/bin/env bash
set -euo pipefail

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
CIPHERS='ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305'
CURVES='X25519:prime256v1:secp384r1'

QUERY=""; PAGE=1; TIMELIMIT=""; REGION="us-en"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --page|-p) PAGE="$2"; shift 2 ;;
        --time|-t) TIMELIMIT="$2"; shift 2 ;;
        --region|-r) REGION="$2"; shift 2 ;;
        *) QUERY="$QUERY $1"; shift ;;
    esac
done
QUERY="${QUERY# }"
[[ -z "$QUERY" ]] && { echo "QUERY required" >&2; exit 1; }

EXTRA_PARAMS="b=&l=$REGION"
[[ -n "$TIMELIMIT" ]] && EXTRA_PARAMS+="&df=$TIMELIMIT"
[[ "$PAGE" -gt 1 ]] && EXTRA_PARAMS+="&s=$(( 10 + (PAGE - 2) * 15 ))"

HTML=$(curl -s --http2 --max-time 10 \
    --ciphers "$CIPHERS" --curves "$CURVES" \
    -H "User-Agent: $UA" \
    -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" \
    -H "Accept-Language: en-US,en;q=0.9" \
    --data-urlencode "q=$QUERY" \
    -d "$EXTRA_PARAMS" \
    'https://html.duckduckgo.com/html/' 2>/dev/null)

[[ -z "$HTML" ]] && { echo "Error: no response" >&2; exit 1; }

echo "$HTML" | awk '
function clean(str) {
    gsub(/<[^>]*>/, "", str)
    gsub(/&amp;/, "\\&", str)
    gsub(/&lt;/, "<", str)
    gsub(/&gt;/, ">", str)
    gsub(/&quot;/, "\"", str)
    gsub(/&#x27;|&#39;/, "\047", str)
    gsub(/  +/, " ", str)
    gsub(/^ +| +$/, "", str)
    return str
}
/class="result__a"/ {
    url = ""; title = ""
    if (match($0, /href="([^"]*)"/, m))        url = m[1]
    if (match($0, /<a[^>]*class="result__a"[^>]*>(.*)<\/a>/, m)) title = clean(m[1])
}
/class="result__snippet"/ {
    desc = ""
    if (match($0, /<a[^>]*class="result__snippet"[^>]*>(.*)<\/a>/, m)) desc = clean(m[1])
    if (url && title && url !~ /duckduckgo\.com\/y\.js/) {
        n++
        printf "%d.\n    Title: %s\n    URL:   %s\n", n, title, url
        if (desc != "") printf "    Desc:  %s\n", desc
        printf "\n"
    }
    url = title = ""
}
END { if (n == 0) print "No results found." }'
