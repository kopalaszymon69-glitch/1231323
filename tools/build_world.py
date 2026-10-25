#!/usr/bin/env python3
"""Combine tools/world_def.py with real encounter data into js/data/world.js.

Run tools/build_data.py first (it produces tools/encounters.json and the js/data/*.js files).
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import world_def  # noqa: E402

POST = world_def.POST
WILD_METHODS = ("walk", "surf", "old-rod", "good-rod", "super-rod", "rock-smash", "headbutt")


def load_js(name):
    src = open(os.path.join(ROOT, "js", "data", name + ".js"), encoding="utf-8").read()
    start = src.index("]=", src.index("g.PW_DATA[")) + 2
    end = src.rindex(";})(")
    return json.loads(src[start:end])


pokemon = load_js("pokemon")
species = load_js("species")
moves = load_js("moves")
items = load_js("items")
encounters = json.load(open(os.path.join(ROOT, "tools", "encounters.json")))
loc_names = json.load(open(os.path.join(ROOT, "tools", "location_names.json"), encoding="utf-8"))
paldea = json.load(open(os.path.join(ROOT, "tools", "paldea_species.json"), encoding="utf-8"))

by_ident = {p["k"]: int(pid) for pid, p in pokemon.items()}
for sid, s in species.items():
    default = min(s["f"]) if s["f"] else None
    if default is not None:
        by_ident.setdefault(s["k"], default)
move_by_ident = {m["k"]: int(mid) for mid, m in moves.items()}
item_by_ident = {it["k"]: int(iid) for iid, it in items.items()}
errors = []


def pid_of(ident):
    if ident.startswith("$"):
        return ident
    if ident not in by_ident:
        errors.append("unknown pokemon " + ident)
        return None
    return by_ident[ident]


def team_of(team):
    out = []
    for entry in team:
        ident, lvl = entry[0], entry[1]
        extra = dict(entry[2]) if len(entry) > 2 else {}
        if "item" in extra:
            if extra["item"] not in item_by_ident:
                errors.append("unknown item " + extra["item"])
            extra["item"] = item_by_ident.get(extra["item"])
        d = {"p": pid_of(ident), "l": lvl}
        d.update(extra)
        out.append(d)
    return out


def trainer_of(t):
    d = {k: v for k, v in t.items() if k != "team"}
    d["team"] = team_of(t["team"])
    return d


def stage_of(sid):
    depth = 0
    s = species[str(sid)]
    while s.get("ef"):
        depth += 1
        s = species[str(s["ef"])]
    return depth


def paldea_table(key, lv):
    lo, hi = lv
    out = []
    for code, name in paldea.get(key, []):
        if code >= 10000:
            sid, form = code // 100, code % 100
        else:
            sid, form = code // 10, code % 10
        s = species.get(str(sid))
        if not s:
            errors.append("paldea: unknown species %s %s" % (code, name))
            continue
        forms = sorted(s["f"], key=lambda x: (x > 10000, x))
        pid = forms[form] if form < len(forms) else forms[0]
        if sid == 194:
            pid = by_ident["wooper-paldea"]
        if sid == 128 and form:
            pid = by_ident[["tauros-paldea-combat-breed", "tauros-paldea-blaze-breed",
                            "tauros-paldea-aqua-breed"][min(form, 3) - 1]]
        cr = s["cr"]
        w = 10 if cr >= 190 else 7 if cr >= 120 else 5 if cr >= 75 else 3 if cr >= 45 else 2 if cr >= 25 else 1
        if s["leg"] or s["myth"]:
            w = 0.5
        st = stage_of(sid)
        if st == 0:
            a, b = lo, hi
        elif st == 1:
            a, b = (lo + hi) // 2, hi + 3
        else:
            a, b = max(lo, hi - 3), hi + 6
        types = pokemon[str(pid)]["t"]
        method = "walk"
        if key.endswith("sea") or (10 in types and key in ("casseroyalake",) and s["hab"] in ("sea", "waters-edge")):
            method = "surf" if key.endswith("sea") else "walk"
        out.append([pid, method, w, a, b])
    return out


def convert_location(region, loc, enc_set):
    ident = loc["id"]
    name = loc.get("name") or loc_names.get(ident) or ident.replace("-", " ").title()
    out = {"id": ident, "n": name, "k": loc["kind"], "r": loc["req"], "f": loc["fac"]}
    if loc.get("desc"):
        out["d"] = loc["desc"]
    wild = {}
    events = []
    if enc_set == "paldea":
        if loc.get("lv"):
            table = paldea_table(ident, loc["lv"])
            for e in table:
                wild.setdefault(e[1], []).append(e[:1] + e[2:])
            out["lv"] = list(loc["lv"])
    else:
        for e in encounters.get(enc_set, {}).get(ident, []):
            pid, method, weight, lo, hi = e[:5]
            conds = e[5] if len(e) > 5 else []
            post = e[6] if len(e) > 6 else None
            if method in WILD_METHODS:
                row = [pid, weight, lo, hi]
                if conds or post:
                    row.append(conds)
                if post:
                    row.append(post)
                wild.setdefault(method, []).append(row)
            elif method in ("static", "gift", "trade"):
                ev = {"t": method, "p": pid, "l": lo}
                if conds:
                    ev["c"] = conds
                events.append(ev)
            elif method == "raid":
                wild.setdefault("raid", []).append([pid, weight, lo, hi] + ([conds] if conds else []))
            elif method == "roam":
                region.setdefault("_roam", []).append({"p": pid, "l": lo, "c": conds})
    statics = [e for e in events if e["t"] == "static"]
    if len(statics) > 4:
        # Places like Ultra Space Wilds are full of one-off encounters: treat them as a wild table.
        for e in statics:
            wild.setdefault("walk", []).append([e["p"], 10, e["l"], e["l"]])
        events = [e for e in events if e["t"] != "static"]
    if wild:
        out["w"] = wild
    if events:
        out["e"] = events
    return out


def dedupe_events(events):
    seen = set()
    out = []
    for e in events:
        key = (e["t"], e["p"], tuple(e.get("c", [])))
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def main():
    regions_out = []
    for r in world_def.REGIONS:
        reg = {k: v for k, v in r.items() if k not in ("locs", "gyms", "e4", "champ", "extra")}
        reg["starters"] = [pid_of(s) for s in r["starters"]]
        v = dict(r["villain"])
        v["mons"] = [pid_of(m) for m in v["mons"]]
        reg["villain"] = v
        rv = dict(r["rival"])
        rv["mons"] = [pid_of(m) for m in rv["mons"]]
        rv["late"] = [pid_of(m) for m in rv["late"]]
        reg["rival"] = rv
        locs = []
        ids = set()
        for loc in r["locs"]:
            if loc["id"] in ids:
                errors.append("duplicate location %s/%s" % (r["id"], loc["id"]))
            ids.add(loc["id"])
            if r["enc"] != "paldea" and loc["id"] not in loc_names and not loc.get("name"):
                errors.append("no name for %s/%s" % (r["id"], loc["id"]))
            locs.append(convert_location(reg, loc, r["enc"]))
        by_id = {l["id"]: l for l in locs}
        for (rid, lid, ident, lvl, req, note) in world_def.EXTRA_STATICS:
            if rid != r["id"]:
                continue
            if lid not in by_id:
                nl = convert_location(reg, {"id": lid, "kind": "ruins", "req": req, "fac": []}, r["enc"])
                locs.append(nl)
                by_id[lid] = nl
            ev = {"t": "static", "p": pid_of(ident), "l": lvl, "req": req}
            if note:
                ev["note"] = note
            by_id[lid].setdefault("e", []).append(ev)
        for l in locs:
            if "e" in l:
                l["e"] = dedupe_events(l["e"])
        gyms = []
        for i, g in enumerate(r["gyms"]):
            gd = {k: v for k, v in g.items() if k not in ("team", "alt")}
            gd["team"] = team_of(g["team"])
            if g.get("tm"):
                tm = g["tm"]
                if tm in move_by_ident:
                    gd["tm"] = move_by_ident[tm]
                elif tm in item_by_ident:
                    gd["item"] = item_by_ident[tm]
                    del gd["tm"]
                else:
                    errors.append("unknown reward %s" % tm)
            if g.get("alt"):
                alt = dict(g["alt"])
                alt["team"] = team_of(alt["team"])
                gd["alt"] = alt
            if g["loc"] not in by_id:
                errors.append("gym location missing %s" % g["loc"])
            gyms.append(gd)
        reg["gyms"] = gyms
        reg["e4"] = [trainer_of(t) for t in r["e4"]]
        reg["champ"] = trainer_of(r["champ"])
        reg["extra"] = [trainer_of(t) for t in r.get("extra", [])]
        if r["enc"] in encounters:
            for key, lst in encounters[r["enc"]].items():
                if key.startswith("roaming"):
                    for e in lst:
                        reg.setdefault("_roam", []).append(
                            {"p": e[0], "l": e[3], "c": e[5] if len(e) > 5 else []})
        if "_roam" in reg:
            seen = {}
            for rm in reg.pop("_roam"):
                seen.setdefault(rm["p"], rm)
            reg["roam"] = list(seen.values())
        reg["locs"] = locs
        regions_out.append(reg)
    if errors:
        print("\n".join(sorted(set(errors))))
    path = os.path.join(ROOT, "js", "data", "world.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* Generated by tools/build_world.py. Do not edit by hand. */\n")
        f.write("(function(g){g.PW_DATA=g.PW_DATA||{};g.PW_DATA.world=%s;})(typeof window!=='undefined'?window:globalThis);\n"
                % json.dumps(regions_out, separators=(",", ":"), ensure_ascii=False))
    print("wrote world.js %.1f KB, %d regions, %d locations" % (
        os.path.getsize(path) / 1024, len(regions_out), sum(len(r["locs"]) for r in regions_out)))


if __name__ == "__main__":
    main()
