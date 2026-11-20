#!/usr/bin/env bash
# Run the Maestro flows in e2e/ against ONE booted device, one flow at a time, in a fixed order.
#
#   scripts/ci/maestro-run.sh <android|ios> [filter]
#
# filter (or $FLOWS): "all" (default), or comma/space separated pieces of flow paths, e.g.
#   "today"  "meals/03"  "workout,progress/01_log_weight"
#
# Env:
#   DEVICE     adb serial / simulator UDID (optional when only one device is booted)
#   APP_PATH   .apk / .app to install before the run (optional)
#   OUT_DIR    artifact folder (default: e2e-artifacts)
#   RETRIES    re-runs of a failed flow (default: 1)
#
# Order: flows that wipe app state run first, then onboarding/01 (leaves the app onboarded),
# then everything else alphabetically. If the filter picks flows that need an onboarded app but
# not onboarding/01, that flow is added as a setup step.
#
# Written for bash 3.2 too (macOS runners): no mapfile, no associative arrays.
set -uo pipefail

PLATFORM=${1:?usage: maestro-run.sh <android|ios> [filter]}
FILTER=${2:-${FLOWS:-all}}
OUT=${OUT_DIR:-e2e-artifacts}
RETRIES=${RETRIES:-1}
APP_ID=com.client.repwise
SETUP_FLOW=e2e/onboarding/01_f1_happy_path.yaml
# State-wiping flows (clearState) first, in this order; onboarding/01 last so the app ends onboarded.
# settings/03 ends on Welcome (all data deleted), so it must run before the setup flow too.
PRIORITY="e2e/onboarding/02_f1_resume_after_kill.yaml
e2e/notifications/notifications-permission-off.yaml
e2e/onboarding/03_f1_maintain_permission_granted.yaml
e2e/settings/03_delete_all_data.yaml
$SETUP_FLOW"
# Flows that cannot pass on iOS because they rely on an Android-only command.
# Format: path|reason
IOS_SKIP="e2e/today/06_start_workout.yaml|uses the Android back button (Maestro 'back' is a no-op on iOS)"

case "$PLATFORM" in android | ios) ;; *) echo "platform must be android or ios" >&2; exit 2 ;; esac
command -v maestro >/dev/null || { echo "maestro is not on PATH" >&2; exit 2; }

mkdir -p "$OUT/junit" "$OUT/screenshots" "$OUT/logs" "$OUT/debug"
RESULTS="$OUT/results.tsv"
printf 'flow\tstatus\tseconds\tnote\n' >"$RESULTS"

# ---------- pick and order the flows ----------
ALL=$(find e2e -name '*.yaml' ! -name 'config.yaml' | LC_ALL=C sort)
if [ "$FILTER" = "all" ] || [ -z "${FILTER// /}" ]; then
  SELECTED=$ALL
else
  SELECTED=""
  for f in $ALL; do
    for tok in $(echo "$FILTER" | tr ',' ' '); do
      case "$f" in *"$tok"*) SELECTED="$SELECTED$f"$'\n'; break ;; esac
    done
  done
fi
SELECTED=$(printf '%s' "$SELECTED" | sed '/^$/d')
[ -n "$SELECTED" ] || { echo "No flow matches filter '$FILTER'" >&2; exit 2; }

ORDERED=""
for p in $PRIORITY; do
  if printf '%s\n' "$SELECTED" | grep -qxF "$p"; then ORDERED="$ORDERED$p"$'\n'; fi
done
NEEDS_SETUP=0
for f in $SELECTED; do
  printf '%s\n' "$PRIORITY" | grep -qxF "$f" && continue
  ORDERED="$ORDERED$f"$'\n'
  grep -q 'clearState: *true' "$f" || NEEDS_SETUP=1
done
SETUP_ADDED=0
if [ "$NEEDS_SETUP" = 1 ] && ! printf '%s\n' "$SELECTED" | grep -qxF "$SETUP_FLOW"; then
  ORDERED="$SETUP_FLOW"$'\n'"$ORDERED"
  SETUP_ADDED=1
fi

echo "Flows to run on $PLATFORM:"
printf '%s' "$ORDERED" | sed 's/^/  /'

# ---------- device helpers ----------
adb_() { if [ -n "${DEVICE:-}" ]; then adb -s "$DEVICE" "$@"; else adb "$@"; fi; }
SIM=${DEVICE:-booted}

screenshot() {
  if [ "$PLATFORM" = android ]; then
    adb_ exec-out screencap -p >"$1" 2>/dev/null || rm -f "$1"
  else
    xcrun simctl io "$SIM" screenshot "$1" >/dev/null 2>&1 || rm -f "$1"
  fi
}

LOG_PID=""
start_device_log() {
  if [ "$PLATFORM" = android ]; then
    adb_ logcat -c || true
    adb_ logcat -v threadtime >"$OUT/logs/logcat.txt" 2>&1 &
  else
    xcrun simctl spawn "$SIM" log stream --level debug --style compact \
      --predicate 'process == "Repwise" OR subsystem BEGINSWITH "com.client.repwise"' \
      >"$OUT/logs/ios-device.log" 2>&1 &
  fi
  LOG_PID=$!
}
stop_device_log() { [ -n "$LOG_PID" ] && kill "$LOG_PID" 2>/dev/null; wait "$LOG_PID" 2>/dev/null; true; }
trap stop_device_log EXIT

if [ -n "${APP_PATH:-}" ]; then
  echo "Installing $APP_PATH"
  if [ "$PLATFORM" = android ]; then
    # No -g: launchApp grants or denies permissions per flow (a pre-grant can mask "deny").
    adb_ install -r "$APP_PATH" || { echo "adb install failed" >&2; exit 1; }
  else
    xcrun simctl install "$SIM" "$APP_PATH" || { echo "simctl install failed" >&2; exit 1; }
  fi
fi
start_device_log

maestro_device_args=()
[ -n "${DEVICE:-}" ] && maestro_device_args=(--device "$DEVICE")

# ---------- run ----------
FAILED=0
for flow in $ORDERED; do
  slug=$(echo "${flow#e2e/}" | sed 's#/#__#g; s#\.yaml$##')
  note=""
  [ "$SETUP_ADDED" = 1 ] && [ "$flow" = "$SETUP_FLOW" ] && note="setup"

  if [ "$PLATFORM" = ios ]; then
    reason=$(printf '%s\n' "$IOS_SKIP" | awk -F'|' -v f="$flow" '$1 == f { print $2 }')
    if [ -n "$reason" ]; then
      echo "::notice title=Skipped on iOS::$flow $reason"
      printf '%s\tskipped\t0\t%s\n' "$flow" "$reason" >>"$RESULTS"
      continue
    fi
  fi

  # Workout flows turn airplane mode on; never let one leak into the next flow.
  [ "$PLATFORM" = android ] && adb_ shell cmd connectivity airplane-mode disable >/dev/null 2>&1
  # A cold emulator can show "Pixel Launcher isn't responding" over the app; close system dialogs.
  [ "$PLATFORM" = android ] && adb_ shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1
  # Maestro's launchApp `notifications: deny` does not revoke an earlier grant on Android
  # (the app still read "granted"); revoke it here for flows that need it denied.
  if [ "$PLATFORM" = android ] && grep -qe 'notifications: deny' -e '01_f1_happy_path.yaml' "$flow"; then
    adb_ shell pm revoke "$APP_ID" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1
  fi

  attempt=0
  status=failed
  start=$(date +%s)
  while :; do
    echo "::group::$flow (attempt $((attempt + 1)))"
    # ${a[@]+...} form: an empty array is "unbound" under set -u in bash 3.2.
    maestro ${maestro_device_args[@]+"${maestro_device_args[@]}"} test "$flow" \
      --format junit --output "$OUT/junit/$slug.xml" \
      --debug-output "$OUT/debug/$slug" 2>&1 | tee "$OUT/logs/$slug.maestro.log"
    rc=${PIPESTATUS[0]}
    echo "::endgroup::"
    screenshot "$OUT/screenshots/$slug.png"
    if [ "$rc" = 0 ]; then
      status=passed
      [ "$attempt" -gt 0 ] && note="${note:+$note, }passed on retry $attempt"
      break
    fi
    attempt=$((attempt + 1))
    [ "$attempt" -gt "$RETRIES" ] && break
    # Keep the failed attempt's evidence; the retry overwrites the plain names.
    cp "$OUT/logs/$slug.maestro.log" "$OUT/logs/$slug.try$attempt.maestro.log" 2>/dev/null
    cp "$OUT/screenshots/$slug.png" "$OUT/screenshots/$slug.try$attempt.png" 2>/dev/null
    echo "Retrying $flow"
  done
  secs=$(($(date +%s) - start))
  if [ "$status" = failed ]; then
    FAILED=$((FAILED + 1))
    echo "::error title=Maestro flow failed::$flow ($PLATFORM)"
  fi
  printf '%s\t%s\t%s\t%s\n' "$flow" "$status" "$secs" "$note" >>"$RESULTS"
done

stop_device_log
# Maestro also keeps its own per-run folders (screenshots on failure, commands JSON).
[ -d "$HOME/.maestro/tests" ] && cp -R "$HOME/.maestro/tests" "$OUT/debug/maestro-home-tests" 2>/dev/null

node "$(dirname "$0")/maestro-summary.mjs" "$OUT" "$PLATFORM"
[ "$FAILED" = 0 ]
