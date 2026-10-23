"""Parse phpMyAdmin/MariaDB dumps into value tuples (no MySQL needed)."""
import re


def read_dump(path):
    return open(path, encoding='utf-8', errors='replace').read()


def extract_inserts(dump, table):
    """Find `INSERT INTO `table` [(cols)] VALUES (...);` statements.

    Returns a list of (column_names, values_body) tuples.
    """
    out = []
    pat = re.compile(r"INSERT INTO `%s`\s*(\([^)]*\))?\s*VALUES\s*" % table)
    for m in pat.finditer(dump):
        cols = None
        if m.group(1):
            cols = [c.strip().strip('`') for c in m.group(1)[1:-1].split(',')]
        i = m.end()
        depth = 0
        j = i
        instr = False
        started = False
        while j < len(dump):
            c = dump[j]
            if instr:
                if c == '\\':
                    j += 2
                    continue
                if c == "'":
                    instr = False
            else:
                if c == "'":
                    instr = True
                elif c == '(':
                    depth += 1
                    started = True
                elif c == ')':
                    depth -= 1
                elif c == ';' and depth == 0 and started:
                    break
            j += 1
        out.append((cols, dump[i:j]))
    return out


def split_tuples(s):
    res = []
    depth = 0
    instr = False
    start = None
    i = 0
    while i < len(s):
        c = s[i]
        if instr:
            if c == '\\':
                i += 2
                continue
            if c == "'":
                instr = False
        else:
            if c == "'":
                instr = True
            elif c == '(':
                if depth == 0:
                    start = i
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    res.append(s[start:i+1])
        i += 1
    return res


def split_fields(t):
    body = t[1:-1]
    res = []
    depth = 0
    instr = False
    cur = []
    i = 0
    while i < len(body):
        c = body[i]
        if instr:
            cur.append(c)
            if c == '\\':
                cur.append(body[i+1])
                i += 2
                continue
            if c == "'":
                instr = False
        else:
            if c == "'":
                instr = True
                cur.append(c)
            elif c == '(':
                depth += 1
                cur.append(c)
            elif c == ')':
                depth -= 1
                cur.append(c)
            elif c == ',' and depth == 0:
                res.append(''.join(cur))
                cur = []
            else:
                cur.append(c)
        i += 1
    res.append(''.join(cur))
    return [v.strip() for v in res]


def unquote(v):
    if v == 'NULL':
        return None
    if v.startswith("'") and v.endswith("'"):
        body = v[1:-1]
        out = []
        i = 0
        mapping = {'0': '\0', 'n': '\n', 't': '\t', 'r': '\r',
                   'Z': '\x1a', '\\': '\\', "'": "'", '"': '"'}
        while i < len(body):
            c = body[i]
            if c == '\\' and i + 1 < len(body):
                nxt = body[i+1]
                out.append(mapping.get(nxt, nxt))
                i += 2
                continue
            out.append(c)
            i += 1
        return ''.join(out)
    return v


def table_rows(path, table):
    """Return list of dicts mapping column name -> raw (quoted) value."""
    d = read_dump(path)
    out = []
    for cols, body in extract_inserts(d, table):
        tuples = split_tuples(body)
        if cols is None:
            cols = None
        for t in tuples:
            fields = split_fields(t)
            if cols is not None and len(cols) != len(fields):
                raise ValueError('column/field mismatch %s: %d cols vs %d fields'
                                 % (table, len(cols), len(fields)))
            if cols is None:
                out.append(fields)
            else:
                out.append(dict(zip(cols, fields)))
    return out
