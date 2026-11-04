#!/usr/bin/env bash
# verify.sh: launch, drive and tear down a throwaway Expense Tracking for verification.
#
# Every run gets its own Postgres database (in one shared Docker container), a stand-in on
# loopback that speaks Neon's HTTP protocol and the Vercel Blob API in front of it and holds the
# paid-call budget, a snapshot of the checkout served by its own `next dev` on a free loopback port
# (never 3000, the owner's `npm run dev` default), three seeded users and minted session cookies.
# z.ai (the parser and the /stats summary) is real under a per-run budget. Nothing touches the
# production Neon database, the production Blob store, Google, Vercel or GitHub.
# Evidence lives under $VERIFY_HOME/<run>/evidence and survives `down`.
#
#   verify.sh up [--llm=N | --offline]   start a run from the current checkout; prints RUN= URL= EVIDENCE= MODE=
#   verify.sh doctor RUN                 is this run worth driving? (read-only)
#   verify.sh api RUN [--as USER|--anon] METHOD PATH [JSON]
#                                        HTTP as a seeded user (demo, stranger, newcomer) or signed out;
#                                        request + response saved as evidence, pages as visible text
#   verify.sh parse RUN [--as USER] "PASTED TEXT"
#                                        POST /api/parse exactly as /new's Rapikan does (todayISO = Jakarta today)
#   verify.sh ui RUN STEPS.mjs [--as USER|--anon] [--width N] [--theme light|dark] [-- ARG...]
#                                        drive the app with Playwright (video + screenshots), fenced;
#                                        ARGs reach the steps module as `args`
#   verify.sh sql RUN [--value] "SELECT ..."
#                                        read the run's Postgres (read-only transaction); --value: one bare cell
#   verify.sh blobs RUN [PREFIX]         list the run's stand-in Blob store
#   verify.sh logs RUN [REGEX] [N]       the server log's matching lines (default: errors, refusals, blocks)
#   verify.sh budget RUN                 paid calls spent / left / refused
#   verify.sh note RUN "TEXT"            append a line to evidence/LOG.md (what you proved)
#   verify.sh down RUN|--all             stop what `up` started, drop its DB; evidence stays
#   verify.sh ls                         runs with state, mode and evidence count
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_HOME="${VERIFY_HOME:-$HOME/.local/state/expense-tracking-verify}"
# The harness's own dependencies (Playwright, pg), installed once, outside every checkout: the
# repo's package.json stays exactly what the app needs.
TOOLS="$VERIFY_HOME/.tools"
TOOL_PKGS=(playwright@1.62.1 pg@8.16.3)
PG_CONTAINER=expense-tracking-pg-verify
PG_IMAGE=postgres:16
PG_PORT=55440
# `npm run dev` with no -p takes 3000: that is the owner's server. A run never binds it and never
# touches whatever listens there.
OWNER_PORT=3000
# The run's fake Blob store. Its public host matches next.config.ts's remotePatterns
# (*.public.blob.vercel-storage.com); preload.mjs and ui.mjs serve it from the stand-in, and every
# other store host, production's included, is refused.
STORE_ID=etverifystore0000
STORE_HOST=$STORE_ID.public.blob.vercel-storage.com
# next/font/google downloads Archivo while compiling: a public font CDN, nothing else.
FONT_HOSTS=fonts.googleapis.com,fonts.gstatic.com
DEFAULT_LLM=10
USERS=(demo stranger newcomer)

die() { echo "verify: $*" >&2; exit 1; }
repo_root() { git rev-parse --show-toplevel 2>/dev/null || die "run from inside an expense-tracking checkout"; }
# The main checkout: where .env.local lives (a worktree may not have one).
main_root() { (cd "$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)/.." && pwd); }

run_dir() {
  local run=${1:-}
  [ -n "$run" ] || die "missing RUN id (see: verify.sh ls)"
  [ -d "$VERIFY_HOME/$run" ] || die "no run $run under $VERIFY_HOME"
  echo "$VERIFY_HOME/$run"
}
live_dir() { local d; d="$(run_dir "${1:-}")"; [ ! -f "$d/state" ] || die "run $1 is stopped"; echo "$d"; }
meta() { sed -n "s/^$2=//p" "$1/meta" | sed -n 1p; }
free_port() {
  local p
  while :; do
    p="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
    [ "$p" != "$OWNER_PORT" ] && { echo "$p"; return; }
  done
}
slug() { printf %s "$1" | tr -c 'a-zA-Z0-9_.-' '_' | cut -c1-40; }
jakarta_today() { TZ=Asia/Jakarta date +%F; }

# Numbered evidence: evidence/NN-<kind>-<slug>.<ext>, counting only the primary .txt files.
next_evidence() {
  local dir=$1/evidence n
  n=$(find "$dir" -maxdepth 1 -type f -name '[0-9][0-9]-*.txt' ! -name '00-*' | wc -l)   # 00-*: up's own
  printf '%s/%02d-%s-%s.%s' "$dir" $((n + 1)) "$2" "$(slug "$3")" "$4"
}

# What the code under test is: HEAD plus a digest of uncommitted changes to the app's own paths.
# .workflows/ and docs/ are left out so a peer's bookkeeping does not read as drift.
APP_PATHS=(app components lib public types auth.ts auth.config.ts proxy.ts next.config.ts drizzle scripts
  package.json package-lock.json tsconfig.json postcss.config.mjs)
tree_digest() {
  { git -C "$1" diff HEAD -- "${APP_PATHS[@]}"
    git -C "$1" ls-files --others --exclude-standard -- "${APP_PATHS[@]}" | sort | while read -r f; do sha1sum "$1/$f"; done
  } 2>/dev/null | sha1sum | cut -c1-12
}

ensure_tools() {
  local want have
  want="$(printf '%s\n' "${TOOL_PKGS[@]}")"
  have="$(cat "$TOOLS/.installed" 2>/dev/null || true)"
  [ "$want" = "$have" ] && [ -d "$TOOLS/node_modules/playwright" ] && return 0
  mkdir -p "$TOOLS"
  [ -f "$TOOLS/package.json" ] || echo '{"name":"et-verify-tools","private":true}' >"$TOOLS/package.json"
  # Harness tooling, fetched from the npm registry once; the app's own processes never see it.
  (cd "$TOOLS" && npm install --no-audit --no-fund --save-exact "${TOOL_PKGS[@]}") >"$TOOLS/install.log" 2>&1 \
    || { tail -20 "$TOOLS/install.log" >&2; die "could not install the harness tools into $TOOLS"; }
  echo "$want" >"$TOOLS/.installed"
}

ensure_pg() {
  command -v docker >/dev/null || die "docker is not on PATH"
  local state
  state="$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null)" || state=missing
  case "$state" in
    true) ;;
    false) docker start "$PG_CONTAINER" >/dev/null ;;
    # trust auth: bound to 127.0.0.1 only, holds nothing but throwaway v_* databases.
    *) docker run -d --name "$PG_CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust \
         -p "127.0.0.1:$PG_PORT:5432" "$PG_IMAGE" >/dev/null ;;
  esac
  for _ in $(seq 1 60); do
    docker exec "$PG_CONTAINER" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  die "$PG_CONTAINER did not become ready in 60s"
}
psql_run() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -X -q -U postgres "$@"; }

# One value from the main checkout's .env.local, parsed (never sourced).
env_value() {
  sed -n "s/^$2=//p" "$1/.env.local" 2>/dev/null | sed -n 1p | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
host_of() { printf %s "$1" | sed -E 's#^[a-z]+://([^/:]+).*#\1#'; }

# The environment of the app: nothing inherited but PATH/HOME/locale, so no secret in the caller's
# shell (VERCEL_OIDC_TOKEN, BLOB_*, the production DATABASE_URL) leaks in. The snapshot has no
# .env* file, so Next finds nothing to load either. PHOTO_MAX_PER_GROUP is left unset (the
# default, 20) and AUTH_URL is the run's own origin: Auth.js and shareOrigin() both read it.
write_web_env() {
  local dir=$1 sp port
  sp="http://127.0.0.1:$(cat "$dir/standin_port")"; port="$(cat "$dir/port")"
  {
    printf '%s\n' "PATH=$PATH" "HOME=$dir/home" "LANG=${LANG:-C.UTF-8}" "TERM=dumb" "NEXT_TELEMETRY_DISABLED=1"
    echo "PORT=$port"
    echo "DATABASE_URL=$(meta "$dir" neon_url)"
    echo "DATABASE_URL_UNPOOLED=$(meta "$dir" neon_url)"
    echo "AUTH_SECRET=$(cat "$dir/secrets/auth")"
    echo "AUTH_GOOGLE_ID=et-verify-unused"
    echo "AUTH_GOOGLE_SECRET=et-verify-unused"
    echo "AUTH_URL=http://localhost:$port"
    echo "AUTH_TRUST_HOST=true"
    cat "$dir/secrets/llm.env"
    echo "BLOB_READ_WRITE_TOKEN=$(cat "$dir/secrets/blob")"
    echo "VERCEL_BLOB_API_URL=$sp/blob"
    # The browser's twin (inlined into the client bundle) is the stand-in's HTTPS + HTTP/2 listener:
    # the Blob client streams its PUT body, which Chromium sends only over HTTP/2.
    echo "NEXT_PUBLIC_VERCEL_BLOB_API_URL=https://127.0.0.1:$(cat "$dir/standin_tls_port")/blob"
    echo "NODE_OPTIONS=--import=file://$HERE/preload.mjs"
    echo "ET_VERIFY_STANDIN=$sp"
    echo "ET_VERIFY_STORE_HOST=$STORE_HOST"
    echo "ET_VERIFY_ALLOW_HOSTS=$FONT_HOSTS"
    echo "ET_VERIFY_PAID_HOSTS=$(meta "$dir" paid_hosts)"
  } >"$dir/web.env"
  chmod 600 "$dir/web.env"
}

# Run a command under an env file (one VAR=value per line), with nothing else inherited.
with_env() { local file=$1; shift; local -a e=(); mapfile -t e <"$file"; env -i "${e[@]}" "$@"; }

# The run is addressed as localhost (bound to 127.0.0.1 only): `next dev` reports every request's
# req.url as http://localhost:PORT whatever the Host header said, and AUTH_URL says the same.
base_of() { echo "http://localhost:$(cat "$1/port")"; }
cookie_of() { local f="$1/sessions/${2:-demo}"; [ -f "$f" ] || die "no seeded user ${2:-} (users: ${USERS[*]})"; cat "$f"; }

# curl as a seeded user (or signed out with USER=-), from the same origin (server actions check it).
curl_app() {
  local dir=$1 user=$2; shift 2
  local -a h=(-H "Origin: $(base_of "$dir")")
  [ "$user" = - ] || h+=(-H "Cookie: authjs.session-token=$(cookie_of "$dir" "$user")")
  curl -sS -m 180 "${h[@]}" "$@"
}

migrate() {
  local dir=$1 root=$2 db=$3 tag n=0
  psql_run -d "$db" -c 'create schema if not exists drizzle; create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)' >/dev/null
  # drizzle-kit migrate cannot reach a local Postgres (no TCP driver is installed: the app ships
  # only Neon's HTTP one), so apply the journal in order the way it would: each file in one
  # transaction, recorded with its sha256. `--> statement-breakpoint` is an SQL comment to psql.
  while read -r tag when; do
    local f="$root/drizzle/$tag.sql"
    [ -f "$f" ] || die "migrate: $f is in the journal but missing"
    psql_run -d "$db" -1 <"$f" >>"$dir/migrate.log" 2>&1 || { tail -20 "$dir/migrate.log" >&2; die "migration $tag failed (verify.sh down $(basename "$dir"))"; }
    psql_run -d "$db" -c "insert into drizzle.__drizzle_migrations (hash, created_at) values ('$(sha256sum "$f" | cut -d' ' -f1)', $when)" </dev/null >/dev/null   # -i would eat the journal loop's stdin
    n=$((n + 1))
  done < <(python3 -c 'import json,sys; [print(e["tag"], e["when"]) for e in json.load(open(sys.argv[1]))["entries"]]' "$root/drizzle/meta/_journal.json")
  echo "migrations=$n" >>"$dir/meta"
}

cmd_up() {
  local llm=$DEFAULT_LLM
  for a in "$@"; do
    case "$a" in
      --llm=*) llm=${a#--llm=}; [[ $llm =~ ^[0-9]+$ ]] || die "--llm=N takes a number" ;;
      --offline) llm=0 ;;
      *) die "up: unknown flag $a (see verify.sh with no arguments)" ;;
    esac
  done
  local root main run dir db
  root="$(repo_root)"
  [ -f "$root/lib/env.ts" ] && [ -f "$root/lib/llm/parseExpense.ts" ] || die "$root is not an expense-tracking checkout"
  [ -d "$root/node_modules/next" ] || die "no node_modules in $root (npm ci)"
  main="$(main_root "$root")"
  if [ "$llm" != 0 ]; then [ -n "$(env_value "$main" LLM_API_KEY)" ] || die "LLM_API_KEY is not in $main/.env.local (or run --offline)"; fi
  ensure_tools

  run="$(date +%m%d-%H%M%S)-$$"
  dir="$VERIFY_HOME/$run"
  db="v_$(echo "$run" | tr -- '-' '_')"
  mkdir -p "$dir/evidence" "$dir/secrets" "$dir/home" "$dir/blobs" "$dir/sessions"
  chmod 700 "$dir/secrets" "$dir/sessions"
  : >"$dir/pgids"

  # The paid host: the LLM endpoint the code under test is configured for.
  local text_url
  text_url="$(env_value "$main" LLM_BASE_URL)"; text_url=${text_url:-https://api.z.ai/api/anthropic}
  {
    echo "repo=$root"; echo "main=$main"
    echo "head=$(git -C "$root" rev-parse --short HEAD)"; echo "tree=$(tree_digest "$root")"
    echo "db=$db"; echo "llm=$llm"
    echo "mode=$([ "$llm" = 0 ] && echo offline || echo "real(llm=$llm)")"
    echo "paid_hosts=$(host_of "$text_url")=llm"
    echo "neon_url=postgresql://postgres:etverify@pg.etverify.invalid/$db?sslmode=require"
    echo "started=$(date -Iseconds)"
  } >"$dir/meta"

  # Secrets of the run's own: random, or the real LLM key only when the budget allows paid calls.
  head -c 32 /dev/urandom | base64 >"$dir/secrets/auth"
  echo "vercel_blob_rw_${STORE_ID}_$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" >"$dir/secrets/blob"
  {
    # LLM_* are in lib/env.ts's eager core: the app does not boot without them. Offline they hold
    # a placeholder key and the budget refuses every call before it leaves.
    if [ "$llm" != 0 ]; then echo "LLM_API_KEY=$(env_value "$main" LLM_API_KEY)"; else echo "LLM_API_KEY=et-verify-offline-no-key"; fi
    echo "LLM_BASE_URL=$text_url"
    echo "LLM_MODEL=$(env_value "$main" LLM_MODEL | sed 's/^$/glm-5.2/')"
  } >"$dir/secrets/llm.env"

  # The app is served from a snapshot: Next 16's `next dev` locks .next/dev per project directory,
  # so two runs (or the owner's own dev server) cannot share the checkout. The snapshot has no
  # .env*, no .vercel link, no git. node_modules is hard-linked (a symlink breaks Turbopack).
  # Edits after `up` are not picked up: doctor warns, down + up again.
  rsync -a --exclude /node_modules --exclude /.next --exclude /.git --exclude '/.env*' --exclude /.vercel \
    --exclude /.worktrees --exclude /.workflows --exclude /docs --exclude /.claude --exclude /coverage \
    --exclude /tsconfig.tsbuildinfo --exclude /public/vendor "$root/" "$dir/app/"
  cp -al "$root/node_modules" "$dir/app/node_modules"
  (cd "$dir/app" && node scripts/copy-image-compression-worker.mjs) >"$dir/predev.log" 2>&1 || die "copy-image-compression-worker failed"

  ensure_pg
  psql_run -c "create database $db" >/dev/null
  migrate "$dir" "$dir/app" "$db"
  python3 "$HERE/seed.py" >"$dir/seed.sql"
  psql_run -d "$db" <"$dir/seed.sql" >"$dir/seed.log" 2>&1 || { tail -20 "$dir/seed.log" >&2; die "seed failed (verify.sh down $run)"; }

  free_port >"$dir/standin_port"
  free_port >"$dir/standin_tls_port"
  free_port >"$dir/port"
  # A self-signed certificate for the stand-in's browser-facing HTTPS listener, minted per run and
  # accepted only by the run's own Playwright context (ignoreHTTPSErrors); nothing else trusts it.
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 \
    -keyout "$dir/secrets/tls.key" -out "$dir/secrets/tls.crt" >/dev/null 2>&1 || die "openssl could not mint the stand-in's certificate"
  ET_STANDIN_RW_TOKEN="$(cat "$dir/secrets/blob")" ET_STANDIN_TLS_PORT="$(cat "$dir/standin_tls_port")" \
    ET_STANDIN_TLS_KEY="$dir/secrets/tls.key" ET_STANDIN_TLS_CERT="$dir/secrets/tls.crt" setsid node "$HERE/standin.mjs" "$TOOLS" "$(cat "$dir/standin_port")" "$PG_PORT" "$db" "$dir/blobs" "$STORE_ID" \
    "$dir/budget.json" "$llm" </dev/null >"$dir/standin.log" 2>&1 &
  echo "standin $!" >>"$dir/pgids"
  local sp="http://127.0.0.1:$(cat "$dir/standin_port")"
  for _ in $(seq 1 40); do curl -fsS -m 2 "$sp/health" >/dev/null 2>&1 && break; sleep 0.25; done
  curl -fsS -m 2 "$sp/health" >/dev/null || { cat "$dir/standin.log" >&2; die "stand-in did not start (verify.sh down $run)"; }
  write_web_env "$dir"

  # One JWT session cookie per seeded user, minted with Auth.js's own encoder and the run's random
  # AUTH_SECRET (auth.config.ts: strategy 'jwt'; the salt is the cookie's name). Not a bypass:
  # the app decrypts it like any other.
  local u
  for u in "${USERS[@]}"; do
    (cd "$dir/app" && with_env "$dir/web.env" node --input-type=module -e "
      import { encode } from 'next-auth/jwt';
      const [id, name, email] = process.argv.slice(1);
      process.stdout.write(await encode({ token: { sub: id, name, email }, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token', maxAge: 86400 }));
    " "et-verify-$u" "$(tr a-z A-Z <<<"${u:0:1}")${u:1} Verify" "$u@et-verify.invalid") >"$dir/sessions/$u" || die "could not mint a session for $u"
  done

  local port; port="$(cat "$dir/port")"
  # setsid: own process group (down kills exactly this tree); every fd redirected so no caller's
  # pipe stays open behind the server. Not `(cd ... && setsid ... &)`: that backgrounds a bash
  # wrapper and records its pid.
  local -a webenv=()
  mapfile -t webenv <"$dir/web.env"
  cd "$dir/app"
  setsid env -i "${webenv[@]}" node node_modules/next/dist/bin/next dev -p "$port" -H 127.0.0.1 </dev/null >"$dir/next.log" 2>&1 &
  echo "next $!" >>"$dir/pgids"
  local url month code="" last="" same=0
  url="$(base_of "$dir")"; month="$(jakarta_today | cut -c1-7)"
  # Usable means the demo user's month list renders its seeded expenses, signed in.
  for _ in $(seq 1 240); do
    code="$(curl -s -o "$dir/ready.html" -m 90 -w '%{http_code}' -H "Cookie: authjs.session-token=$(cookie_of "$dir" demo)" "$url/m/$month" || true)"
    [ "$code" = 200 ] && grep -q 'makan siang kantor' "$dir/ready.html" && break
    # The same 5xx several times in a row is a broken page, not a slow compile.
    if [[ $code == 5* ]] && [ "$code" = "$last" ]; then same=$((same + 1)); else same=0; fi
    last=$code
    [ "$same" -ge 4 ] && break
    kill -0 "$(awk '$1=="next"{print $2}' "$dir/pgids")" 2>/dev/null || { tail -30 "$dir/next.log" >&2; die "next dev exited during startup (verify.sh down $run)"; }
    sleep 1
  done
  [ "$code" = 200 ] && grep -q 'makan siang kantor' "$dir/ready.html" \
    || { tail -30 "$dir/next.log" >&2; die "/m/$month did not render the demo user's expenses (last $code; log $dir/next.log; verify.sh down $run)"; }
  rm -f "$dir/ready.html"
  curl -fsS -m 5 -X POST "$sp/budget/arm" >/dev/null || die "could not arm the budget"
  echo "RUN=$run"; echo "URL=$url"; echo "EVIDENCE=$dir/evidence"; echo "MODE=$(meta "$dir" mode)"
}

pgid_of() { awk -v k="$2" '$1==k{print $2}' "$1/pgids" 2>/dev/null; }
listener_pid() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | sed -n 1p | cut -d= -f2 || true; }

cmd_doctor() {
  local dir ok=1 root
  dir="$(live_dir "${1:-}")"
  root="$(meta "$dir" repo)"
  local si next sp port db
  si="$(pgid_of "$dir" standin)"; next="$(pgid_of "$dir" next)"; db="$(meta "$dir" db)"
  sp="http://127.0.0.1:$(cat "$dir/standin_port")"; port="$(cat "$dir/port")"
  if curl -fsS -m 3 "$sp/health" | grep -q expense-tracking-verify-standin; then echo "standin  ok   $sp (pgid $si)"; else echo "standin  FAIL $sp not answering"; ok=0; fi
  if [ -n "$next" ] && kill -0 "$next" 2>/dev/null; then echo "next     ok   pgid $next"; else echo "next     FAIL not running"; ok=0; fi
  local owner
  owner="$(listener_pid "$port")"
  if [ -n "$owner" ] && [ "$(ps -o pgid= -p "$owner" | tr -d ' ')" = "$next" ]; then
    echo "port     ok   :$port owned by this run (pid $owner)"
  else
    echo "port     FAIL :$port is ${owner:+owned by pid $owner, }not this run's next"; ok=0
  fi
  local o3000; o3000="$(listener_pid "$OWNER_PORT")"
  echo "$OWNER_PORT     --   ${o3000:+the owner's server (pid $o3000), not this run's: never driven}${o3000:-nothing listening (not ours either way)}"
  local code u month
  month="$(jakarta_today | cut -c1-7)"
  for u in "${USERS[@]}"; do
    code="$(curl -s -o "$dir/doctor.html" -m 60 -w '%{http_code}' -H "Cookie: authjs.session-token=$(cookie_of "$dir" "$u")" "$(base_of "$dir")/m/$month" || true)"
    if [ "$code" = 200 ] && ! grep -q 'Lanjut dengan Google' "$dir/doctor.html"; then echo "signin   ok   $u: /m/$month answers 200 signed in"
    else echo "signin   FAIL $u: /m/$month answered $code"; ok=0; fi
  done
  rm -f "$dir/doctor.html"
  local counts
  if counts="$(psql_run -d "$db" -tAc "select (select count(*) from drizzle.__drizzle_migrations)||' migrations, users '||(select count(*) from \"user\")||', groups '||(select count(*) from expense_groups)||', items '||(select count(*) from expense_items)||', photos '||(select count(*) from expense_photos)||', share_links '||(select count(*) from share_links)||', insights '||(select count(*) from expense_insights)" 2>/dev/null)"; then
    echo "database ok   $db ($counts)"
  else echo "database FAIL $db"; ok=0; fi
  echo "blobs    ok   $(find "$dir/blobs" -type f ! -name '*.__meta.json' | wc -l) object(s) in the run's store ($STORE_HOST)"
  echo "mode     $(meta "$dir" mode)"
  echo "budget   $(curl -fsS -m 3 "$sp/budget" | python3 -c 'import json,sys; s=json.load(sys.stdin); print("armed" if s["armed"] else "SEEDING", "; ".join("%s: %d spent, %d left, %d refused" % (k, v["spent"], v["left"], v["refused"]) for k,v in s["pools"].items()))')"
  printf 'meta     repo=%s head=%s\n' "$root" "$(meta "$dir" head)"
  if [ "$(git -C "$root" rev-parse --short HEAD)" != "$(meta "$dir" head)" ]; then
    echo "code     WARN HEAD moved since up: the snapshot is stale (down + up)"
  fi
  if [ "$(tree_digest "$root")" != "$(meta "$dir" tree)" ]; then
    echo "code     WARN working tree changed since up: the snapshot is stale (down + up)"
  fi
  # Egress, from a process with the server's exact env and preload. Nothing leaves either way:
  # the guard refuses before connecting.
  local probe
  probe="$(cd "$dir/app" && with_env "$dir/web.env" node --input-type=module -e "
    import https from 'node:https';
    const out = [];
    for (const u of ['https://api.github.com/', 'https://abcdefghij123456.public.blob.vercel-storage.com/photos/x.jpg', 'https://console.neon.tech/', 'https://accounts.google.com/', 'https://api.vercel.com/']) {
      try { await fetch(u); out.push('REACHED ' + u) } catch (e) { out.push((/blocked/.test(e.message) ? 'blocked ' : 'error ') + new URL(u).host) }
    }
    try { https.request('https://api.github.com/').end(); out.push('REACHED https.request') } catch (e) { out.push((/blocked/.test(e.message) ? 'blocked ' : 'error ') + 'https.request') }
    try { const r = await fetch('https://$STORE_HOST/__doctor_probe__'); out.push('store ' + r.status) } catch (e) { out.push('store ERROR ' + e.message) }
    console.log(out.join('; '));
  " 2>/dev/null)"
  if [[ $probe == *REACHED* ]] || [[ $probe == *error* ]] || [[ $probe != *"store 404"* ]]; then echo "egress   FAIL $probe"; ok=0
  else echo "egress   ok   $probe (fake store answers from the stand-in)"; fi
  local blocked
  blocked="$(grep -oE '(egress BLOCKED|paid call REFUSED) [A-Za-z.]+ (https?://)?[^/ :]+' "$dir/next.log" 2>/dev/null | sort | uniq -c || true)"
  [ -n "$blocked" ] && echo "$blocked" | sed 's/^/egress   /'
  grep -E "⨯|Error:" "$dir/next.log" 2>/dev/null | grep -v "et-verify" | tail -3 | sed 's/^/log      /' || true
  [ "$ok" = 1 ] || exit 1
}

save_response() {
  # save_response OUT BODYFILE CODE CTYPE [REDIRECT]: prints the response as text, binary goes to a file.
  local out=$1 bodyf=$2 code=$3 ctype=$4 redir=${5:-}
  echo "< HTTP $code ${ctype:-} ${redir:+-> $redir}"
  if [[ ${ctype:-} =~ json|text|javascript ]] || [[ $code == 3* ]] || [ ! -s "$bodyf" ]; then
    if [[ ${ctype:-} =~ html ]]; then
      echo "[html $(wc -c <"$bodyf") bytes; visible text:]"
      python3 "$HERE/htmltext.py" "$bodyf" 150
      mv "$bodyf" "${out%.txt}.html"; echo "[full html: ${out%.txt}.html]"
    elif [[ ${ctype:-} =~ json ]]; then
      python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), indent=1, ensure_ascii=False)[:20000])' "$bodyf" 2>/dev/null || cat "$bodyf"
      echo; rm -f "$bodyf"
    else cat "$bodyf"; echo; rm -f "$bodyf"; fi
  else
    mv "$bodyf" "${out%.txt}.bin"
    echo "[binary $(wc -c <"${out%.txt}.bin") bytes, sha256 $(sha256sum "${out%.txt}.bin" | cut -c1-16): ${out%.txt}.bin]"
  fi
}

# --as USER / --anon, leading a drive's arguments. Sets AS (a user name, or - for signed out).
AS=demo; NARGS=0
parse_as() {
  AS=demo; NARGS=0
  case "${1:-}" in
    --as) [ -n "${2:-}" ] || die "--as takes a user (${USERS[*]})"; AS=$2; NARGS=2 ;;
    --as=*) AS=${1#--as=}; NARGS=1 ;;
    --anon) AS=-; NARGS=1 ;;
  esac
  if [ "$AS" != - ]; then [[ " ${USERS[*]} " == *" $AS "* ]] || die "unknown user $AS (users: ${USERS[*]})"; fi
}

cmd_api() {
  local dir; dir="$(live_dir "${1:-}")"; shift
  parse_as "$@"; shift "$NARGS"
  local method=${1:?METHOD} path=${2:?PATH} body=${3:-} out
  out="$(next_evidence "$dir" api "$method$path" txt)"
  local -a args=(-o "$out.body" -w '%{http_code}|%{content_type}|%{redirect_url}' -X "$method" "$(base_of "$dir")$path")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  local m code ctype redir
  m="$(curl_app "$dir" "$AS" "${args[@]}")"
  IFS='|' read -r code ctype redir <<<"$m"
  { echo "> $method $path  (as ${AS/#-/signed out})"; [ -n "$body" ] && echo "> $(printf %s "$body" | cut -c1-400)"
    save_response "$out" "$out.body" "$code" "$ctype" "$redir"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_parse() {
  local dir; dir="$(live_dir "${1:-}")"; shift
  parse_as "$@"; shift "$NARGS"
  local text=${1:?PASTED TEXT} body
  body="$(python3 -c 'import json,sys; print(json.dumps({"rawText": sys.argv[1], "todayISO": sys.argv[2]}))' "$text" "$(jakarta_today)")"
  if [ "$AS" = - ]; then cmd_api "$(basename "$dir")" --anon POST /api/parse "$body"
  else cmd_api "$(basename "$dir")" --as "$AS" POST /api/parse "$body"; fi
}

cmd_ui() {
  local dir steps; dir="$(live_dir "${1:-}")"; steps=${2:?STEPS.mjs}; shift 2
  local width=390 theme=light as=demo
  local -a args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --as) as=${2:?--as USER}; shift 2 ;;
      --anon) as=-; shift ;;
      --width) width=$2; shift 2 ;;
      --theme) theme=$2; shift 2 ;;
      --) shift; args=("$@"); break ;;
      *) die "ui: unknown flag $1 (step arguments go after --)" ;;
    esac
  done
  [ -f "$steps" ] || die "no such steps file: $steps"
  steps="$(realpath "$steps")"   # before the cd into the snapshot, so relative paths work
  local cookie=-; [ "$as" = - ] || cookie="$(cookie_of "$dir" "$as")"
  local argv
  argv="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "${args[@]}")"
  (cd "$dir/app" && env -i PATH="$PATH" HOME="$dir/home" PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" \
    ET_VERIFY_ARGS="$argv" node "$HERE/ui.mjs" "$(base_of "$dir")" "$steps" "$dir/evidence" "$cookie" \
    "http://127.0.0.1:$(cat "$dir/standin_port")" "$STORE_HOST" "$TOOLS" "$width" "$theme")
}

cmd_sql() {
  local dir; dir="$(live_dir "${1:-}")"; shift
  if [ "${1:-}" = --value ]; then
    printf 'begin read only;\n%s;\nrollback;\n' "${2:?SQL}" | psql_run -d "$(meta "$dir" db)" -tA 2>&1 | sed -n 1p
    return
  fi
  local out; out="$(next_evidence "$dir" sql query txt)"
  { echo "> ${1:?SQL}"; printf 'begin read only;\n%s;\nrollback;\n' "$1" | psql_run -d "$(meta "$dir" db)" 2>&1; } >"$out" || true
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_blobs() {
  local dir out
  dir="$(live_dir "${1:-}")"
  out="$(next_evidence "$dir" blobs "${2:-all}" txt)"
  { echo "> list ${2:-(all)} in $STORE_HOST (the run's stand-in store)"
    (cd "$dir/blobs" && find . -type f ! -name '*.__meta.json' -path "./${2:-}*" -printf '%P  %s bytes  %TY-%Tm-%Td %TH:%TM\n' | sort); } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_logs() {
  local dir re=${2:-'⨯|Error|error|REFUSED|BLOCKED'} n=${3:-40} out
  dir="$(run_dir "${1:-}")"
  local log="$dir/next.log"; [ -f "$log" ] || log="$dir/evidence/zz-next.log"
  out="$(next_evidence "$dir" logs "$re" txt)"
  { echo "> grep -E '$re' next.log (last $n)"; grep -E -- "$re" "$log" | tail -n "$n" || echo "(no match)"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_budget() {
  local dir; dir="$(run_dir "${1:-}")"
  if [ -f "$dir/state" ]; then cat "$dir/evidence/zz-budget.json"; else curl -fsS -m 3 "http://127.0.0.1:$(cat "$dir/standin_port")/budget"; fi
  echo
  grep -E '^paid ' "$dir/standin.log" "$dir/evidence/zz-standin.log" 2>/dev/null | tail -20 || true
}

cmd_note() {
  local dir; dir="$(run_dir "${1:-}")"
  echo "$(date -Iseconds) ${2:?TEXT}" >>"$dir/evidence/LOG.md"
}

stop_run() {
  local dir=$1 kind pgid
  while read -r kind pgid; do
    [ -n "${pgid:-}" ] || continue
    # Wait for the whole group, not the leader: next dev's workers outlive it and keep writing
    # into the snapshot, which made a plain rm -rf fail half way.
    if pgrep -g "$pgid" >/dev/null 2>&1; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
      for _ in $(seq 1 20); do pgrep -g "$pgid" >/dev/null 2>&1 || break; sleep 0.25; done
      kill -KILL -- "-$pgid" 2>/dev/null || true
      for _ in $(seq 1 20); do pgrep -g "$pgid" >/dev/null 2>&1 || break; sleep 0.25; done
    fi
  done <"$dir/pgids"
  for f in next.log standin.log seed.log seed.sql migrate.log predev.log meta; do [ -f "$dir/$f" ] && cp "$dir/$f" "$dir/evidence/zz-$f"; done
  [ -f "$dir/budget.json" ] && cp "$dir/budget.json" "$dir/evidence/zz-budget.json"
  if docker inspect "$PG_CONTAINER" >/dev/null 2>&1 && [ -n "$(meta "$dir" db)" ]; then
    psql_run -c "drop database if exists $(meta "$dir" db) with (force)" </dev/null >/dev/null || true
  fi
  for _ in 1 2 3 4 5; do
    rm -rf "$dir/app" "$dir/blobs" "$dir/home" "$dir/secrets" "$dir/sessions" "$dir/web.env" "$dir/port" "$dir/standin_port" "$dir/standin_tls_port" 2>/dev/null && break
    sleep 1
  done
  : >"$dir/pgids"; echo stopped >"$dir/state"
  echo "verify: stopped $(basename "$dir"); evidence kept in $dir/evidence ($(find "$dir/evidence" -type f | wc -l) files)"
}

cmd_down() {
  if [ "${1:-}" = --all ]; then
    for d in "$VERIFY_HOME"/*/; do [ -f "$d/meta" ] && [ ! -f "$d/state" ] && stop_run "${d%/}"; done
    return 0
  fi
  local dir; dir="$(run_dir "${1:-}")"
  [ ! -f "$dir/state" ] || { echo "verify: $1 is already stopped"; return 0; }
  stop_run "$dir"
}

cmd_ls() {
  [ -d "$VERIFY_HOME" ] || return 0
  for d in "$VERIFY_HOME"/*/; do
    d=${d%/}
    [ -f "$d/meta" ] || continue
    local state=stopped
    [ -f "$d/state" ] || state="up:$(cat "$d/port" 2>/dev/null || echo '?')"
    printf '%-20s %-10s %-16s %3s evidence  %s\n' "$(basename "$d")" "$state" "$(meta "$d" mode 2>/dev/null)" \
      "$(find "$d/evidence" -type f 2>/dev/null | wc -l)" "$(meta "$d" repo 2>/dev/null)"
  done
}

sub=${1:-}; shift || true
case "$sub" in
  up) cmd_up "$@" ;;
  doctor) cmd_doctor "$@" ;;
  api) cmd_api "$@" ;;
  parse) cmd_parse "$@" ;;
  ui) cmd_ui "$@" ;;
  sql) cmd_sql "$@" ;;
  blobs) cmd_blobs "$@" ;;
  logs) cmd_logs "$@" ;;
  budget) cmd_budget "$@" ;;
  note) cmd_note "$@" ;;
  down) cmd_down "$@" ;;
  ls) cmd_ls ;;
  *) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
