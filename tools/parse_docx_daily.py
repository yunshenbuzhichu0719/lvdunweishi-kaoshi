# -*- coding: utf-8 -*-
"""
解析桌面「绿盾卫士培训 / 分岗位题库」下的 11 个 docx 题库文件，
合并进日常培训考核内置题库 data/bank-daily.js（保留原 D1）。

docx 题目格式：
  1. 题干（　）                 ← 题干，可能含（　）占位
  A. 选项一
  B. 选项二
  ...
  【答案】B                    ← 单选/多选答案（可多字母）
  【解析】……                  ← 解析（可选）
  判断题无选项行，【答案】√/×

题型分区标题：一、单项选择题（共 70 题）/ 二、多项选择题 / 三、判断题
分类小标题：（一）xxx（8题）   ← 仅用于题目分类标签 c
"""
import os, re, sys, json, glob, hashlib, zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def docx_paras(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body')
    out = []
    for el in body:
        if el.tag == W + 'p':
            out.append(''.join(t.text or '' for t in el.iter(W + 't')))
    return out


def detect_type(line):
    s = line.strip()
    if '判断题' in s:
        return 'judge'
    if '多项选择题' in s or '多选题' in s:
        return 'multi'
    if '单项选择题' in s or '单选题' in s:
        return 'single'
    return None


CAT_RE = re.compile(r'^（[一二三四五六七八九十]+）\s*(.+?)\s*（\d+题）')
ANS_RE = re.compile(r'【答案】\s*([A-Ga-g√×对错误误正TrueFalseTF]+)')
EXP_RE = re.compile(r'【解析】\s*(.*)', re.S)
OPT_RE = re.compile(r'^([A-G])[\.．、]\s*(.*)$')
Q_RE = re.compile(r'^\d+[\.、]\s*')


def norm_ans(raw):
    raw = raw.strip()
    up = raw.upper()
    if any(k in raw for k in ['√', '对', '正', 'T', 'Y']):
        return 'A'
    if any(k in raw for k in ['×', '错', '误', 'F', 'N']):
        return 'B'
    letters = re.findall(r'[A-G]', up)
    return ''.join(sorted(set(letters)))


def parse_question(buffer, cur_type, cur_cat, bank_id):
    """buffer: list of lines for one question. 返回题目 dict 或 None。"""
    text = '\n'.join(buffer)
    am = ANS_RE.search(text)
    if not am:
        return None
    ans = norm_ans(am.group(1))
    if not ans:
        return None

    em = EXP_RE.search(text)
    explain = em.group(1).strip() if em else ''

    # 题干与选项（以实际选项行 / 答案行为准，不依赖分区标题）
    stem_parts = []
    options = []
    opt_collecting = False
    for line in buffer:
        s = line.strip()
        if not s:
            continue
        if ANS_RE.search(s) or EXP_RE.search(s):
            # 答案 / 解析行：跳过，不计入选项或题干
            opt_collecting = False
            continue
        om = OPT_RE.match(s)
        if om:
            options.append(om.group(2).strip())
            opt_collecting = True
            continue
        if Q_RE.match(s):
            stem_parts = [re.sub(r'^\d+[\.、]\s*', '', s)]
            opt_collecting = False
            continue
        # 普通续接行
        if opt_collecting:
            if options:
                options[-1] += s
        elif stem_parts:
            stem_parts[-1] += s

    stem = ''.join(stem_parts).strip().replace('（　）', '（ ）').strip()
    if not stem:
        return None

    # 题型由实际选项 / 答案决定
    if options:
        t = 2 if len(ans) > 1 else 1
    else:
        t = 3
        options = ['正确', '错误']

    if t != 3 and len(options) < 2:
        return None
    # 答案字母必须落在选项范围内
    if t != 3 and max(ord(c) - 64 for c in ans) > len(options):
        return None

    item = {
        't': t, 'q': stem, 'o': options, 'a': ans, 's': ans,
        'c': cur_cat or 'misc', 'bank': bank_id,
    }
    if explain:
        item['e'] = explain
    return item


def parse_file(path, bank_id):
    lines = [l.strip() for l in docx_paras(path) if l.strip()]
    cur_type = None
    cur_cat = None
    cur_buf = []
    questions = []
    skipped = 0
    stats = {'1': 0, '2': 0, '3': 0}

    for s in lines:
        t = detect_type(s)
        if t:
            cur_type = t
            continue
        cm = CAT_RE.match(s)
        if cm:
            cur_cat = cm.group(1).strip()
            continue
        if Q_RE.match(s):
            if cur_buf:
                q = parse_question(cur_buf, cur_type, cur_cat, bank_id)
                if q:
                    questions.append(q); stats[str(q['t'])] += 1
                else:
                    skipped += 1
            cur_buf = [s]
        else:
            if cur_buf is not None:
                cur_buf.append(s)
    if cur_buf:
        q = parse_question(cur_buf, cur_type, cur_cat, bank_id)
        if q:
            questions.append(q); stats[str(q['t'])] += 1
        else:
            skipped += 1

    return questions, stats, skipped


def load_existing(out_path):
    if not os.path.exists(out_path):
        return {'version': '2025', 'generated': '', 'banks': [], 'questions': []}
    with open(out_path, 'r', encoding='utf-8') as f:
        txt = f.read()
    m = re.match(r'^\s*window\.__DAILY_BANK__\s*=\s*', txt)
    if m:
        txt = txt[m.end():]
        if txt.rstrip().endswith(';'):
            txt = txt.rstrip()[:-1]
        return json.loads(txt)
    return json.loads(txt)


def bank_meta_from_filename(fn):
    base = re.sub(r'\.docx$', '', fn, flags=re.I)
    m = re.match(r'^\s*(\d+)\s*(.*)$', base)
    num = int(m.group(1)) if m else 0
    rest = m.group(2) if m else base
    sm = re.match(r'^(.*?)题库', rest)
    subject = sm.group(1) if sm else rest
    return 'D' + str(num + 2), subject, rest


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else '--build'
    src_dir = r'C:\Users\ydyyf\Desktop\绿盾卫士培训\分岗位题库'
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
    out_path = os.path.join(out_dir, 'bank-daily.js')

    files = sorted(glob.glob(os.path.join(src_dir, '*.docx')))
    print('发现 %d 个 docx 文件' % len(files))

    existing = load_existing(out_path)
    existing_bank_ids = {b['id'] for b in existing.get('banks', [])}
    existing_q_by_bank = {}
    for q in existing.get('questions', []):
        existing_q_by_bank.setdefault(q.get('bank'), []).append(q)

    all_banks = list(existing.get('banks', []))
    all_questions = list(existing.get('questions', []))
    seen_qkeys = set()
    for q in all_questions:
        seen_qkeys.add(hashlib.md5((q.get('bank', '') + '#' + q['q'] + '#' + q['a'] + '#' + '|'.join(q['o'])).encode('utf-8')).hexdigest())

    total_new = 0
    for fp in files:
        fn = os.path.basename(fp)
        bid, subject, name = bank_meta_from_filename(fn)
        if bid in existing_bank_ids:
            print('  跳过（已存在）:', bid, name)
            continue
        qs, stats, skipped = parse_file(fp, bid)
        # 去重（同一文件内）
        uniq = []
        for q in qs:
            key = hashlib.md5((bid + '#' + q['q'] + '#' + q['a'] + '#' + '|'.join(q['o'])).encode('utf-8')).hexdigest()
            if key in seen_qkeys:
                continue
            seen_qkeys.add(key)
            q['id'] = bid + '%04d' % (len(uniq) + 1)
            uniq.append(q)
        n1 = sum(1 for q in uniq if q['t'] == 1)
        n2 = sum(1 for q in uniq if q['t'] == 2)
        n3 = sum(1 for q in uniq if q['t'] == 3)
        all_banks.append({'id': bid, 'subject': subject, 'name': name, 'n1': n1, 'n2': n2, 'n3': n3, 'total': len(uniq)})
        all_questions.extend(uniq)
        total_new += len(uniq)
        print('  %-10s %-34s 单%-4d 多%-4d 判%-4d 合计%-4d (跳过 %d)' % (bid, name[:32], n1, n2, n3, len(uniq), skipped))

    payload = {
        'version': existing.get('version', '2025'),
        'generated': '2026-08-09',
        'banks': all_banks,
        'questions': all_questions,
    }
    os.makedirs(out_dir, exist_ok=True)
    js = 'window.__DAILY_BANK__=' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';'
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(js)
    print('\n写出:', out_path, '%.2f MB' % (len(js.encode('utf-8')) / 1024 / 1024))
    print('题库数:', len(all_banks), ' 题目总数:', len(all_questions), ' (本次新增 %d)' % total_new)


if __name__ == '__main__':
    main()
