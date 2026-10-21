import pymupdf, sys

def lines(path, page=0):
    d = pymupdf.open(path)
    p = d[page]
    hs, vs = [], []
    for dr in p.get_drawings():
        r = dr["rect"]
        for it in dr["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if abs(a.y - b.y) < 1.2 and abs(b.x - a.x) > 3:
                    hs.append((round(a.y, 1), round(a.x, 1), round(b.x, 1)))
                elif abs(a.x - b.x) < 1.2 and abs(b.y - a.y) > 3:
                    vs.append((round(a.x, 1), round(a.y, 1), round(b.y, 1)))
            elif it[0] == "re":
                rr = it[1]
                if rr.height < 2 and rr.width >= 3:
                    hs.append((round(rr.y0, 1), round(rr.x0, 1), round(rr.x1, 1)))
                elif rr.width < 2 and rr.height >= 3:
                    vs.append((round(rr.x0, 1), round(rr.y0, 1), round(rr.y1, 1)))
    return sorted(set(hs)), sorted(set(vs))

def spans(path, page=0):
    d = pymupdf.open(path)
    p = d[page]
    out = []
    for b in p.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                t = s["text"].strip()
                if t:
                    out.append((t, round(s["bbox"][0], 1), round(s["bbox"][1], 1),
                                round(s["bbox"][2], 1), round(s["bbox"][3], 1), round(s["size"], 1)))
    return out

def geom_report(path, label):
    d = pymupdf.open(path)
    p = d[0]
    hs, vs = lines(path)
    info = (p.rect.width, p.rect.height)
    sp = spans(path)
    return hs, vs, info, sp

def write_report(path, label, outpath):
    """Write a geometry report to a UTF-8 file (avoids Windows console UTF-16 issues)."""
    hs, vs, info, sp = geom_report(path, label)
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(f"===== {label} page 0\n")
        f.write(f"  page: {info[0]:.1f} x {info[1]:.1f}\n")
        f.write(f"  H-lines: {len(hs)}\n")
        for y, x0, x1 in hs[:60]:
            f.write(f"    H y={y:7.1f} x={x0:7.1f}..{x1:7.1f}\n")
        if len(hs) > 60:
            f.write(f"    ... ({len(hs)-60} more)\n")
        f.write(f"  V-lines: {len(vs)}\n")
        for x, y0, y1 in vs[:40]:
            f.write(f"    V x={x:7.1f} y={y0:7.1f}..{y1:7.1f}\n")
        if len(vs) > 40:
            f.write(f"    ... ({len(vs)-40} more)\n")
        f.write(f"  Spans: {len(sp)}\n")
        for t, x0, y0, x1, y1, sz in sp:
            f.write(f"  x0={x0:7.1f} y0={y0:7.1f} x1={x1:7.1f} sz={sz:4.1f} {t}\n")
    return hs, vs, sp

def compare_lines(ref_path, fresh_path, tol=1.0):
    """Compare H-lines and V-lines between two PDFs.
    Returns results list and unmatched items.
    """
    ref_hs, ref_vs, _, _ = geom_report(ref_path, ref_path)
    fresh_hs, fresh_vs, _, _ = geom_report(fresh_path, fresh_path)

    results = []
    unmatched_ref_h, unmatched_fresh_h = [], []

    used_fresh = set()
    for ry, rx0, rx1 in ref_hs:
        best = None
        best_dy = 999
        for i, (fy, fx0, fx1) in enumerate(fresh_hs):
            if i in used_fresh:
                continue
            dy = abs(fy - ry)
            if dy < best_dy and dy <= tol:
                best_dy = dy
                best = i
        if best is not None:
            fy, fx0, fx1 = fresh_hs[best]
            used_fresh.add(best)
            dx0 = fx0 - rx0
            dx1 = fx1 - rx1
            results.append(("H", ry, rx0, rx1, fy, fx0, fx1, best_dy, dx0, dx1))
        else:
            unmatched_ref_h.append((ry, rx0, rx1))
    for i, (fy, fx0, fx1) in enumerate(fresh_hs):
        if i not in used_fresh:
            unmatched_fresh_h.append((fy, fx0, fx1))

    used_fresh = set()
    unmatched_ref_v, unmatched_fresh_v = [], []
    for rx, ry0, ry1 in ref_vs:
        best = None
        best_dx = 999
        for i, (fx, fy0, fy1) in enumerate(fresh_vs):
            if i in used_fresh:
                continue
            dx = abs(fx - rx)
            if dx < best_dx and dx <= tol:
                best_dx = dx
                best = i
        if best is not None:
            fx, fy0, fy1 = fresh_vs[best]
            used_fresh.add(best)
            dy0 = fy0 - ry0
            dy1 = fy1 - ry1
            results.append(("V", rx, ry0, ry1, fx, fy0, fy1, best_dx, dy0, dy1))
        else:
            unmatched_ref_v.append((rx, ry0, ry1))
    for i, (fx, fy0, fy1) in enumerate(fresh_vs):
        if i not in used_fresh:
            unmatched_fresh_v.append((fx, fy0, fy1))

    return results, unmatched_ref_h, unmatched_fresh_h, unmatched_ref_v, unmatched_fresh_v

def run_comparison(ref_path, fresh_path, label, outpath, tol=1.0):
    """Run a full geometry comparison and write results to a UTF-8 file."""
    results, umh_r, umh_f, umv_r, umv_f = compare_lines(ref_path, fresh_path, tol)

    passed = 0
    failed = 0
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(f"=== {label} geometry comparison (tol={tol}pt) ===\n")
        f.write(f"  Reference: {ref_path}\n")
        f.write(f"  Fresh:     {fresh_path}\n")

        total = len(results) + len(umh_r) + len(umh_f) + len(umv_r) + len(umv_f)
        f.write(f"  Total line/edge items: {total}\n")
        f.write(f"  Paired (matched): {len(results)}\n")
        f.write(f"  Unmatched in ref: H={len(umh_r)}, V={len(umv_r)}\n")
        f.write(f"  Unmatched in fresh: H={len(umh_f)}, V={len(umv_f)}\n\n")

        f.write("--- H-lines (horizontal) ---\n")
        for r in results:
            if r[0] == "H":
                _, ry, rx0, rx1, fy, fx0, fx1, dy, dx0, dx1 = r
                ok = abs(dx0) <= tol and abs(dx1) <= tol
                status = "PASS" if ok else "FAIL"
                if ok:
                    passed += 1
                else:
                    failed += 1
                f.write(f"  [{status}] y={ry:7.1f} ref x={rx0:7.1f}..{rx1:7.1f}  fresh x={fx0:7.1f}..{fx1:7.1f}  dy={dy:+.1f} dx0={dx0:+.1f} dx1={dx1:+.1f}\n")

        f.write("\n--- V-lines (vertical) ---\n")
        for r in results:
            if r[0] == "V":
                _, rx, ry0, ry1, fx, fy0, fy1, dx, dy0, dy1 = r
                ok = abs(dy0) <= tol and abs(dy1) <= tol
                status = "PASS" if ok else "FAIL"
                if ok:
                    passed += 1
                else:
                    failed += 1
                f.write(f"  [{status}] x={rx:7.1f} ref y={ry0:7.1f}..{ry1:7.1f}  fresh y={fy0:7.1f}..{fy1:7.1f}  dx={dx:+.1f} dy0={dy0:+.1f} dy1={dy1:+.1f}\n")

        if umh_r:
            f.write(f"\n--- Unmatched H-lines in reference ({len(umh_r)}) ---\n")
            for ry, rx0, rx1 in umh_r:
                f.write(f"  y={ry:7.1f} x={rx0:7.1f}..{rx1:7.1f}\n")
        if umh_f:
            f.write(f"\n--- Unmatched H-lines in fresh ({len(umh_f)}) ---\n")
            for fy, fx0, fx1 in umh_f:
                f.write(f"  y={fy:7.1f} x={fx0:7.1f}..{fx1:7.1f}\n")
        if umv_r:
            f.write(f"\n--- Unmatched V-lines in reference ({len(umv_r)}) ---\n")
            for rx, ry0, ry1 in umv_r:
                f.write(f"  x={rx:7.1f} y={ry0:7.1f}..{ry1:7.1f}\n")
        if umv_f:
            f.write(f"\n--- Unmatched V-lines in fresh ({len(umv_f)}) ---\n")
            for fx, fy0, fy1 in umv_f:
                f.write(f"  x={fx:7.1f} y={fy0:7.1f}..{fy1:7.1f}\n")

        f.write(f"\n=== Summary: {passed} passed, {failed} failed, {len(umh_r)+len(umv_r)+len(umh_f)+len(umv_f)} unmatched ===\n")

    return passed, failed, len(results), total

if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "report":
        # Usage: python _geomcmp.py report path [label]
        for path in sys.argv[2:]:
            label = path
            outpath = f"_geom_{path.split('/')[-1].replace('.pdf','')}.txt"
            hs, vs, sp = write_report(path, label, outpath)
            print(f"Wrote {outpath}: {len(hs)} H-lines, {len(vs)} V-lines, {len(sp)} spans")
    elif len(sys.argv) >= 4 and sys.argv[1] == "compare":
        # Usage: python _geomcmp.py compare ref.pdf fresh.pdf label
        ref_path = sys.argv[2]
        fresh_path = sys.argv[3]
        label = sys.argv[4] if len(sys.argv) > 4 else "comparison"
        outpath = f"_cmp_{label}.txt"
        passed, failed, paired, total = run_comparison(ref_path, fresh_path, label, outpath)
        print(f"Wrote {outpath}: {passed} passed, {failed} failed, {paired} paired, {total} total")
    else:
        # Default: run all predefined comparisons for the KIRIAINI_AHP_Compaction suite
        comparisons = [
            ("KIRIAINI_AHP_Cubes.pdf", "_fresh_cube.pdf", "cube"),
            ("Additional docs/PSD (5).pdf", "_fresh_psd.pdf", "psd"),
            ("KIRIAINI_AHP_Cubes.pdf", "_fresh_cube_now.pdf", "cube_now"),
            ("Additional docs/PSD (5).pdf", "_fresh_psd_now.pdf", "psd_now"),
        ]
        for ref, fresh, label in comparisons:
            outpath = f"_cmp_{label}.txt"
            passed, failed, paired, total = run_comparison(ref, fresh, label, outpath)
            print(f"Wrote {outpath}: {passed} passed, {failed} failed, {paired} paired, {total} total")
