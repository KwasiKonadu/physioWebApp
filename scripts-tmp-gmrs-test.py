#!/usr/bin/env python3
"""End-to-end curl tests for the GMRS assessments + diagnoses module."""
import json, subprocess, time, urllib.request, urllib.error

BASE = "http://localhost:3000"
EPS = "cmwf36p53005snqqh17y9asf9"  # AWAITING_ASSESSMENT episode from seed
THERAPIST = "cmwf36p1c000inqqhmff2uc00"  # Akosua Frimpong (PHYSIOTHERAPIST)
PASS = 0
FAIL = 0

def req(method, path, token=None, body=None, expect=None, label=""):
    global PASS, FAIL
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token: r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            code = resp.status
            payload = json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        code = e.code
        try: payload = json.loads(e.read().decode() or "{}")
        except Exception: payload = {}
    except Exception as e:
        code = 0; payload = {"error": str(e)}
    ok = (expect is None) or (code == expect)
    if expect is not None:
        if ok: PASS += 1; print(f"  PASS [{label}] {method} {path} -> {code}")
        else:
            FAIL += 1
            print(f"  FAIL [{label}] {method} {path} -> {code} (expected {expect}) :: {json.dumps(payload)[:220]}")
    return code, payload

def dbq(script):
    return subprocess.run(["bun", "-e", script], capture_output=True, text=True, cwd="/home/z/my-project", timeout=60).stdout.strip()

# ---------- wait for server ----------
for i in range(60):
    try:
        with urllib.request.urlopen(BASE + "/api/auth/login", data=b"{}", method="POST", timeout=5) as r:
            break
    except urllib.error.HTTPError:
        break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit("server never came up")

print("== login ==")
code, payload = req("POST", "/api/auth/login", body={"email": "admin@gmrsphysio.com.gh", "password": "demo1234"}, expect=200, label="login")
TOKEN = payload["accessToken"]

print("== 1. assessments list ==")
c, d = req("GET", "/api/assessments?pageSize=3", TOKEN, expect=200, label="list")
print(f"    total={d.get('total')} items={len(d.get('items', []))}")
assert d.get("total", 0) >= 7, "seed assessments missing"
assert all("episode" in i and "therapistName" in i for i in d.get("items", [])), "episode/therapistName missing"
c, d = req("GET", "/api/assessments?status=DRAFT", TOKEN, expect=200, label="list?status=DRAFT")
print(f"    drafts={d.get('total')}")

print("== 2. auth guards ==")
req("GET", "/api/assessments", None, expect=401, label="no token -> 401")

print("== 3. therapist default guard (admin user is not a therapist) ==")
req("POST", "/api/assessments", TOKEN, body={"episodeId": EPS, "status": "DRAFT"}, expect=400, label="no therapistId -> 400")

print("== 4. create DRAFT ==")
c, draft = req("POST", "/api/assessments", TOKEN, body={
    "episodeId": EPS, "therapistId": THERAPIST, "status": "DRAFT",
    "primaryComplaint": "Test knee complaint", "bodyPart": "Knee", "affectedSide": "LEFT",
    "duration": "2 weeks", "onset": "SUDDEN", "painCurrent": 4, "painWorst": 8,
    "rom": [{"bodyPart": "Knee", "movement": "Flexion", "side": "LEFT", "activeRom": 90, "passiveRom": 105, "normalValue": 135}],
    "strength": [{"bodyPart": "Knee", "muscleGroup": "Quadriceps", "side": "LEFT", "grade": 4}],
    "functional": [{"activity": "Walking", "difficulty": 2}],
}, expect=201, label="create draft")
AID = draft["id"]
ep_status = dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.treatmentEpisode.findUnique({{where:{{id:'{EPS}'}}}}).then(e=>{{console.log(e.status);process.exit(0)}})")
print(f"    episode status after draft save: {ep_status} (expect ASSESSMENT_IN_PROGRESS)")
assert ep_status == "ASSESSMENT_IN_PROGRESS"

print("== 5. PATCH draft ==")
c, upd = req("PATCH", f"/api/assessments/{AID}", TOKEN, body={"painCurrent": 5, "clinicalFindings": "Effusion noted", "rom": [
    {"bodyPart": "Knee", "movement": "Flexion", "side": "LEFT", "activeRom": 95, "passiveRom": 110, "normalValue": 135},
    {"bodyPart": "Knee", "movement": "Extension", "side": "LEFT", "activeRom": 10, "passiveRom": 5, "normalValue": 0},
]}, expect=200, label="patch draft")
assert upd["painCurrent"] == 5 and len(upd["romMeasurements"]) == 2, "draft patch did not persist"
print(f"    painCurrent={upd['painCurrent']} romRows={len(upd['romMeasurements'])}")

print("== 6. complete assessment ==")
c, done = req("PATCH", f"/api/assessments/{AID}", TOKEN, body={"status": "COMPLETED", "therapistSignature": "A. Boateng"}, expect=200, label="complete")
ep = json.loads(dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.treatmentEpisode.findUnique({{where:{{id:'{EPS}'}}}}).then(e=>{{console.log(JSON.stringify(e));process.exit(0)}})"))
pat = json.loads(dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.patient.findUnique({{where:{{id:'{ep['patientId']}'}}}}).then(e=>{{console.log(JSON.stringify({{s:e.currentStatus,t:e.assignedTherapistId}}));process.exit(0)}})"))
notif = dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.notification.count({{where:{{type:'ASSESSMENT_COMPLETED'}}}}).then(n=>{{console.log(n);process.exit(0)}})")
audit = dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.auditLog.count({{where:{{action:'ASSESSMENT_COMPLETED',entityId:'{AID}'}}}}).then(n=>{{console.log(n);process.exit(0)}})")
print(f"    episode={ep['status']} (expect AWAITING_PLAN) | patient={pat} | notif={notif} | audit={audit}")
assert ep["status"] == "AWAITING_PLAN" and pat["s"] == "AWAITING_PLAN" and int(notif) >= 1 and int(audit) == 1
assert done["status"] == "COMPLETED" and done["completedAt"]

print("== 7. completed is immutable ==")
req("PATCH", f"/api/assessments/{AID}", TOKEN, body={"painCurrent": 1}, expect=409, label="patch completed -> 409")

print("== 8. correction flow ==")
req("PATCH", f"/api/assessments/{AID}", TOKEN, body={"action": "correct"}, expect=400, label="correct w/o reason -> 400")
c, corr = req("PATCH", f"/api/assessments/{AID}", TOKEN, body={"action": "correct", "reason": "Transcription error - ROM values from wrong side"}, expect=201, label="correct -> 201")
NID = corr["id"]
print(f"    new draft id={NID} status={corr['status']} painCurrent={corr['painCurrent']} romRows={len(corr['romMeasurements'])}")
assert corr["status"] == "DRAFT" and corr["painCurrent"] == 5 and len(corr["romMeasurements"]) == 2
old = req("GET", f"/api/assessments/{AID}", TOKEN, expect=200, label="old still completed")[1]
assert old["status"] == "COMPLETED"
corr_audit = dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.auditLog.findFirst({{where:{{action:'ASSESSMENT_CORRECTION'}}}}).then(a=>{{console.log(JSON.stringify({{a:a.action,r:a.reason}}));process.exit(0)}})")
print(f"    audit: {corr_audit}")

print("== 9. edit the correction draft ==")
c, e2 = req("PATCH", f"/api/assessments/{NID}", TOKEN, body={"painCurrent": 3}, expect=200, label="patch correction draft")
assert e2["painCurrent"] == 3

print("== 10. diagnoses create (provisional) ==")
c, dx = req("POST", "/api/diagnoses", TOKEN, body={
    "episodeId": EPS, "title": "Test provisional meniscus tear", "category": "MUSCULOSKELETAL",
    "bodyPart": "Knee", "affectedSide": "LEFT", "severity": "MODERATE",
    "explanation": "Joint line tenderness, positive McMurray", "provisional": True, "therapistId": THERAPIST,
}, expect=201, label="create diagnosis")
DXID = dx["id"]
assert dx["status"] == "ACTIVE" and dx["provisional"] is True
req("POST", "/api/diagnoses", TOKEN, body={"episodeId": EPS, "title": "Bad", "category": "NOT_A_CAT"}, expect=400, label="invalid category -> 400")

print("== 11. provisional minor update ==")
c, u = req("PATCH", f"/api/diagnoses/{DXID}", TOKEN, body={"action": "update", "explanation": "Minor update while provisional"}, expect=200, label="provisional update")
assert u["provisional"] is True and u["explanation"] == "Minor update while provisional"

print("== 12. revise diagnosis ==")
req("PATCH", f"/api/diagnoses/{DXID}", TOKEN, body={"action": "revise", "title": "Revised diagnosis", "justification": "x"}, expect=400, label="revise w/o justification(min3) -> 400")
c, rev = req("PATCH", f"/api/diagnoses/{DXID}", TOKEN, body={
    "action": "revise", "title": "Confirmed medial meniscus tear", "severity": "SEVERE",
    "provisional": False, "justification": "MRI confirms medial meniscus tear",
}, expect=201, label="revise -> 201")
NEWDX = rev["id"]
oldDx = dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.diagnosis.findUnique({{where:{{id:'{DXID}'}}}}).then(d=>{{console.log(JSON.stringify({{s:d.status,h:d.changeHistory}}));process.exit(0)}})")
oldDx = json.loads(oldDx)
print(f"    old status={oldDx['s']} history={oldDx['h'][:140]}")
assert oldDx["s"] == "SUPERSEDED" and "MRI confirms" in oldDx["h"] and '"from":"Test provisional meniscus tear"' in oldDx["h"]
assert rev["status"] == "ACTIVE" and rev["title"] == "Confirmed medial meniscus tear"
rev_audit = dbq(f"const{{PrismaClient}}=require('@prisma/client');const db=new PrismaClient();db.auditLog.findFirst({{where:{{action:'DIAGNOSIS_REVISED',entityId:'{DXID}'}}}}).then(a=>{{console.log(JSON.stringify({{r:a.reason}}));process.exit(0)}})")
print(f"    audit: {rev_audit}")

print("== 13. non-provisional direct update blocked ==")
req("PATCH", f"/api/diagnoses/{NEWDX}", TOKEN, body={"action": "update", "explanation": "nope"}, expect=409, label="update non-provisional -> 409")

print("== 14. DELETE not allowed ==")
req("DELETE", f"/api/diagnoses/{NEWDX}", TOKEN, expect=405, label="DELETE -> 405")

print("== 15. diagnoses list filters ==")
c, dl = req("GET", f"/api/diagnoses?episodeId={EPS}", TOKEN, expect=200, label="list?episodeId")
print(f"    total={dl.get('total')}")
c, dl2 = req("GET", "/api/diagnoses?category=MUSCULOSKELETAL&status=ACTIVE", TOKEN, expect=200, label="list?category+status")
print(f"    active MSK={dl2.get('total')}")
c, dl3 = req("GET", "/api/diagnoses?search=meniscus", TOKEN, expect=200, label="list?search")
print(f"    search 'meniscus'={dl3.get('total')}")

print("== 16. patientId scoping ==")
pid = ep["patientId"]
c, pl = req("GET", f"/api/assessments?patientId={pid}", TOKEN, expect=200, label="list?patientId")
print(f"    assessments for patient={pl.get('total')}")
c, pl2 = req("GET", f"/api/diagnoses?patientId={pid}", TOKEN, expect=200, label="dx list?patientId")
print(f"    diagnoses for patient={pl2.get('total')}")

print(f"\nRESULTS: PASS={PASS} FAIL={FAIL}")
raise SystemExit(1 if FAIL else 0)
