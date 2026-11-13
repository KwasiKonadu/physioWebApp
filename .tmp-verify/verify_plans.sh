#!/usr/bin/env bash
# Verifies the treatment-plans API lifecycle end-to-end (resilient to dev-server churn from parallel agents).
set -u
BASE=http://localhost:3000
T=/home/z/my-project/.tmp-verify

req() { # req <out-file> <curl-args...>
  local out="$1"; shift
  for i in $(seq 1 30); do
    code=$(curl -s -m 25 -o "$out" -w "%{http_code}" "$@" 2>/dev/null)
    if [ "$code" = "200" ] || [ "$code" = "201" ]; then
      echo "$code"; return 0
    fi
    sleep 3
  done
  echo "$code"; return 1
}

code_req() { # single-shot status capture
  curl -s -m 25 -o /dev/null -w "%{http_code}" "$@" 2>/dev/null
}

for i in $(seq 1 60); do
  c=$(code_req "$BASE/api/auth/login" -X POST -H "Content-Type: application/json" -d '{"email":"admin@gmrsphysio.com.gh","password":"demo1234"}')
  [ "$c" = "200" ] && break
  sleep 4
done

# login with retries
for i in $(seq 1 30); do
  curl -s -m 20 "$BASE/api/auth/login" -X POST -H "Content-Type: application/json" -d '{"email":"admin@gmrsphysio.com.gh","password":"demo1234"}' > $T/login.json 2>/dev/null
  TOKEN=$(python3 -c "import json;print(json.load(open('$T/login.json')).get('accessToken',''))" 2>/dev/null)
  [ -n "$TOKEN" ] && break
  sleep 4
done
AUTH="Authorization: Bearer $TOKEN"
echo "== login ok (token ${#TOKEN} chars)"

py() { python3 -c "$1"; }

# 1) find patient PT-000002
req $T/pat.json "$BASE/api/patients?search=PT-000002&pageSize=5" -H "$AUTH" >/dev/null
PATID=$(py "import json;d=json.load(open('$T/pat.json'));items=d.get('items') or (d.get('patient') or {}).get('items') or (d.get('data') or {}).get('items') or [];print(items[0]['id'] if items else '')")
echo "== patientId=$PATID"
[ -n "$PATID" ] || { echo "patients API response:"; head -c 400 $T/pat.json; echo; exit 1; }

req $T/patdetail.json "$BASE/api/patients/$PATID" -H "$AUTH" >/dev/null
EPID=$(py "
import json
d=json.load(open('$T/patdetail.json'))
eps = d.get('episodes') or (d.get('patient') or {}).get('episodes') or (d.get('data') or {}).get('episodes') or []
eps = [e for e in eps if e.get('status') in ('AWAITING_PLAN','ACTIVE_TREATMENT','UNDER_REVIEW','ON_HOLD')]
eps.sort(key=lambda e: e.get('episodeNumber') or 0)
print(eps[0]['id'] if eps else '')
")
echo "== episodeId=$EPID"
[ -n "$EPID" ] || { echo "FAIL: no open episode found for PT-000002"; head -c 400 $T/patdetail.json; exit 1; }

# 2) create draft plan v1
req $T/plan_v1.json "$BASE/api/plans" -X POST -H "$AUTH" -H "Content-Type: application/json" -d @- >/dev/null <<JSON
{"episodeId":"$EPID","status":"DRAFT","sessionsPerWeek":3,"expectedTotalSessions":12,"sessionDurationMin":45,"startDate":"2026-01-05","endDate":"2026-04-30",
 "objectives":[
  {"description":"Restore full knee extension 0 deg","baseline":"-15","target":"0","unit":"degrees","priority":"HIGH","expectedDate":"2026-02-15"},
  {"description":"Quad strength MRC 4+/5","baseline":"3+","target":"4+","unit":"MRC grade","priority":"MEDIUM"}],
 "milestones":[
  {"description":"Full passive extension","objectiveIdx":0,"expectedDate":"2026-01-25","status":"PENDING"},
  {"description":"Straight leg raise without lag","objectiveIdx":1,"expectedDate":"2026-02-20"}],
 "interventions":[
  {"name":"Manual therapy","description":"Patellar mobilisations","frequency":"2x/week","duration":"6 weeks","instructions":"Grades III-IV"},
  {"name":"Strengthening","description":"Closed-chain quad programme","frequency":"3x/week","duration":"10 weeks"}],
 "precautions":{"contraindications":"None noted","restrictions":"No deep squats > 90 deg for 8 weeks"}}
JSON
PLAN1=$(py "import json;print(json.load(open('$T/plan_v1.json'))['id'])")
echo "== created v1: id=$PLAN1 $(py "import json;d=json.load(open('$T/plan_v1.json'));print('| version', d['version'], d['status'], '| threshold', d['reviewThresholdSessions'], '| obj', len(d['objectives']), 'ms', len(d['milestones']), 'iv', len(d['interventions']))")"

# 3) GET detail — check milestone→objective mapping + versions
req $T/detail1.json "$BASE/api/plans/$PLAN1" -H "$AUTH" >/dev/null
py "
import json
d=json.load(open('$T/detail1.json'))
objids=[o['id'] for o in d['objectives']]
ms=[(m['description'][:28], (m['objectiveId']==objids[0]) if objids else m['objectiveId']) for m in d['milestones']]
print('detail versions:', d['versions'])
print('milestone links:', ms)
print('episode status:', d['episode']['status'], '| therapist:', d['episode']['therapist']['lastName'] if d['episode']['therapist'] else None)
"

# 4) PATCH the draft
req $T/patch1.json -X PATCH "$BASE/api/plans/$PLAN1" -H "$AUTH" -H "Content-Type: application/json" -d '{"sessionsPerWeek":4,"patientRecommendations":"Ice after sessions"}' >/dev/null
echo "== patch v1: $(py "import json;d=json.load(open('$T/patch1.json'));print('sessionsPerWeek', d.get('sessionsPerWeek'), '| patientRecs', d.get('patientRecommendations'), '| status', d.get('status'))")"

# 5) activate v1 → episode ACTIVE_TREATMENT
req $T/act1.json -X POST "$BASE/api/plans/$PLAN1/activate" -H "$AUTH" >/dev/null
echo "== activate v1: $(py "import json;d=json.load(open('$T/act1.json'));print(d.get('status'), '| activatedAt set:', d.get('activatedAt') is not None, '| episode', d['episode']['status'] if 'episode' in d else '')")"
req $T/pat2.json "$BASE/api/patients/$PATID" -H "$AUTH" >/dev/null
py "
import sys,json
d=json.load(open('$T/pat2.json'))
eps = d.get('episodes') or (d.get('patient') or {}).get('episodes') or []
e=[x for x in eps if x['id']=='$EPID']
print('episode after activate:', e[0]['status'] if e else 'NOT FOUND', '| patient:', (d.get('currentStatus') or (d.get('patient') or {}).get('currentStatus')))
"

# 6) revise → v2 draft (v1 stays ACTIVE)
req $T/plan_v2.json -X POST "$BASE/api/plans/$PLAN1/revise" -H "$AUTH" -H "Content-Type: application/json" -d '{"changeReason":"Progress faster than expected - increase load","schedule":{"sessionsPerWeek":4,"expectedTotalSessions":16},"interventions":[{"name":"Strengthening","description":"Progressed to open-chain + weighted programme","frequency":"3x/week","duration":"8 weeks","instructions":"Add leg press 3x10"}]}' >/dev/null
PLAN2=$(py "import json;print(json.load(open('$T/plan_v2.json'))['id'])")
echo "== revised v2: id=$PLAN2 $(py "import json;d=json.load(open('$T/plan_v2.json'));print('| version', d['version'], d['status'], '| revisedFrom ok:', d['revisedFromId']=='$PLAN1', '| perWeek', d['sessionsPerWeek'], '| total', d['expectedTotalSessions'], '| copied objectives', len(d['objectives']), '| interventions', len(d['interventions']), '| copied precautions:', bool(d['contraindications']))")"
req $T/detail1b.json "$BASE/api/plans/$PLAN1" -H "$AUTH" >/dev/null
py "
import sys,json
d=json.load(open('$T/detail1b.json'))
print('after revise: v1 status', d['status'], '| versions', [(v['version'], v['status']) for v in d['versions']])
"

# 7) activate v2 → v1 REVISED, v2 ACTIVE
req $T/act2.json -X POST "$BASE/api/plans/$PLAN2/activate" -H "$AUTH" >/dev/null
echo "== activate v2: $(py "import json;d=json.load(open('$T/act2.json'));print(d.get('status'))")"
req $T/detail2.json "$BASE/api/plans/$PLAN2" -H "$AUTH" >/dev/null
py "
import sys,json
d=json.load(open('$T/detail2.json'))
print('final versions:', [(v['version'], v['status']) for v in d['versions']], '| episode:', d['episode']['status'])
"

# 8) guard: activating v1 (REVISED) now → 409
echo "== activate revised v1 → expect 409, got $(code_req -X POST "$BASE/api/plans/$PLAN1/activate" -H "$AUTH")"

# 9) discontinue v2 → episode back to AWAITING_PLAN
req $T/disc.json -X POST "$BASE/api/plans/$PLAN2/discontinue" -H "$AUTH" -H "Content-Type: application/json" -d '{"reason":"Patient relocated out of Accra"}' >/dev/null
echo "== discontinue v2: $(py "import json;d=json.load(open('$T/disc.json'));print(d.get('status'))")"
req $T/pat3.json "$BASE/api/patients/$PATID" -H "$AUTH" >/dev/null
py "
import sys,json
d=json.load(open('$T/pat3.json'))
eps = d.get('episodes') or (d.get('patient') or {}).get('episodes') or []
e=[x for x in eps if x['id']=='$EPID']
print('episode after discontinue:', e[0]['status'] if e else 'NOT FOUND', '| patient:', (d.get('currentStatus') or (d.get('patient') or {}).get('currentStatus')))
"

# 10) list filters
echo "== filters:"
req $T/f1.json "$BASE/api/plans?status=DISCONTINUED&pageSize=3" -H "$AUTH" >/dev/null && py "import json;d=json.load(open('$T/f1.json'));print('  status=DISCONTINUED total:', d['total'], [(i['version'], i['status']) for i in d['items']][:3])"
req $T/f2.json "$BASE/api/plans?patientId=$PATID" -H "$AUTH" >/dev/null && py "import json;d=json.load(open('$T/f2.json'));print('  patientId filter total:', d['total'], 'versions:', [i['version'] for i in d['items']])"
req $T/f3.json "$BASE/api/plans?episodeId=$EPID" -H "$AUTH" >/dev/null && py "import json;d=json.load(open('$T/f3.json'));print('  episodeId filter total:', d['total'], 'versions:', [i['version'] for i in d['items']])"
req $T/f4.json "$BASE/api/plans?search=abena" -H "$AUTH" >/dev/null && py "import json;d=json.load(open('$T/f4.json'));print('  search=abena total:', d['total'])"
req $T/f5.json "$BASE/api/plans?page=1&pageSize=2" -H "$AUTH" >/dev/null && py "import json;d=json.load(open('$T/f5.json'));print('  page1 size2: items', len(d['items']), 'page', d['page'], 'of', d['total'])"

# 11) validation guards
echo "== guards:"
echo "  create w/o episodeId → expect 400, got $(code_req "$BASE/api/plans" -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"status":"DRAFT"}')"
echo "  discontinue w/o reason → expect 400, got $(code_req -X POST "$BASE/api/plans/$PLAN2/discontinue" -H "$AUTH" -H "Content-Type: application/json" -d '{}')"
echo "  revise DISCONTINUED plan → expect 409, got $(code_req -X POST "$BASE/api/plans/$PLAN2/revise" -H "$AUTH" -H "Content-Type: application/json" -d '{"changeReason":"x"}')"

echo "== DONE"
