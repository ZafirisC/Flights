#!/usr/bin/env python3
"""Build data/airports.json from OurAirports (public domain).

Keeps large and medium airports, plus small airports that have an ICAO or IATA code
and scheduled service. Output is compact JSON for the in-browser search and airport panel.

Usage:
  python3 scripts/build_airports.py                      # download CSVs
  python3 scripts/build_airports.py --airports a.csv --runways r.csv   # use local copies
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main"
OUT = Path(__file__).resolve().parent.parent / "data" / "airports.json"
ICAO_RE = re.compile(r"^[A-Z]{4}$")
IATA_RE = re.compile(r"^[A-Z]{3}$")


def read_csv(path, name):
    if path:
        text = Path(path).read_text(encoding="utf-8")
    else:
        url = f"{BASE_URL}/{name}.csv"
        print(f"Downloading {url}", file=sys.stderr)
        with urllib.request.urlopen(url, timeout=120) as res:
            text = res.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def num(value, digits=None):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return round(f, digits) if digits is not None else int(round(f))


def icao_of(a):
    for code in (a["icao_code"], a["gps_code"], a["ident"]):
        if ICAO_RE.match(code or ""):
            return code
    return None


def keep(a, icao, iata):
    if a["type"] in ("large_airport", "medium_airport"):
        return True
    return a["type"] == "small_airport" and a["scheduled_service"] == "yes" and bool(icao or iata)


def runways_by_airport(rows):
    out = {}
    for r in rows:
        if r["closed"] == "1":
            continue
        ends = "/".join(x for x in (r["le_ident"], r["he_ident"]) if x)
        if not ends:
            continue
        rwy = {"id": ends, "len": num(r["length_ft"]), "wid": num(r["width_ft"]),
               "surf": r["surface"] or None, "hdg": num(r["le_heading_degT"])}
        out.setdefault(r["airport_ref"], []).append({k: v for k, v in rwy.items() if v is not None})
    for rwys in out.values():
        rwys.sort(key=lambda x: -(x.get("len") or 0))
    return out


def build(airports, runways):
    rwys = runways_by_airport(runways)
    result = []
    for a in airports:
        icao = icao_of(a)
        iata = a["iata_code"] if IATA_RE.match(a["iata_code"] or "") else None
        if not keep(a, icao, iata):
            continue
        lat, lon = num(a["latitude_deg"], 4), num(a["longitude_deg"], 4)
        if lat is None or lon is None:
            continue
        item = {
            "icao": icao, "iata": iata, "name": a["name"], "city": a["municipality"] or None,
            "country": a["iso_country"] or None, "lat": lat, "lon": lon,
            "elev": num(a["elevation_ft"]), "type": a["type"].split("_")[0],
            "rwy": rwys.get(a["id"]),
        }
        result.append({k: v for k, v in item.items() if v is not None})
    result.sort(key=lambda x: (x.get("icao") or x.get("iata") or x["name"]))
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--airports", help="local airports.csv (default: download)")
    p.add_argument("--runways", help="local runways.csv (default: download)")
    args = p.parse_args()

    data = build(read_csv(args.airports, "airports"), read_csv(args.runways, "runways"))
    doc = {
        "source": "OurAirports (public domain), https://ourairports.com/data/",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fields": "icao, iata, name, city, country, lat, lon, elev (ft), type, "
                  "rwy[id, len (ft), wid (ft), surf, hdg (deg true)]",
        "airports": data,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} ({len(data)} airports, {OUT.stat().st_size / 1e6:.2f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
