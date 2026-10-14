// 筋トレ & 食事管理アプリ (ビルド不要・データはブラウザのlocalStorageに保存)
(function () {
  'use strict';

  const STORAGE_KEY = 'fitness-app-v1';
  // 更新したら index.html の ?v= と一緒に上げる(古いファイルのキャッシュ対策)
  const APP_VERSION = '6';
  const WEEK = ['月', '火', '水', '木', '金', '土', '日'];
  const WEEK_PATTERNS = {
    1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5],
  };
  const MINUTE_OPTIONS = [20, 30, 45, 60, 90, 120];
  const PART_KEYS = Object.keys(PARTS);
  const EX_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

  // ---------- 保存 ----------
  function defaultState() {
    return {
      profile: null, plan: null, logs: [], meals: {}, customFoods: [], weights: [], active: null,
      prefs: { mealLevel: 'both', mealSlots: ['breakfast', 'lunch', 'dinner', 'snack'] },
      planSlots: {},
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* 読み込めない環境では初期状態で動かす */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境 */ }
  }

  let state = load();
  const ui = {
    tab: 'menu',
    obStep: 0,
    ob: null,
    obError: '',
    mealDate: today(),
    mealCat: 'breakfast',
    foodQuery: '',
    foodCat: null,
    selFood: null,
    selQty: 1,
    mealView: 'log',
    planPick: {},
    quick: { parts: [], minutes: 45, variant: 0, result: null },
    openLog: null,
  };

  // ---------- ユーティリティ ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function today() { return toDateStr(new Date()); }
  function toDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function shiftDate(str, days) {
    const [y, m, d] = str.split('-').map(Number);
    return toDateStr(new Date(y, m - 1, d + days));
  }
  function fmtDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    const wd = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
    return m + '/' + d + '(' + wd + ')';
  }
  function round(n, digits) { const k = Math.pow(10, digits || 0); return Math.round(n * k) / k; }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

  // ---------- メニュー作成ロジック ----------
  function userLevel(p) { return Number(p.experience); }

  function poolFor(part, p, variant) {
    const lv = userLevel(p);
    const list = EXERCISES.filter((e) => e.part === part && e.equip.includes(p.equipment) && e.lv <= lv && (e.maxLv === undefined || lv <= e.maxLv));
    const rot = (arr) => (arr.length ? arr.slice(variant % arr.length).concat(arr.slice(0, variant % arr.length)) : arr);
    return rot(list.filter((e) => e.c)).concat(rot(list.filter((e) => !e.c)));
  }

  // 目的・経験・年齢からセット数/回数/休憩を決める
  function prescribe(ex, p) {
    const lv = userLevel(p);
    const age = Number(p.age);
    if (ex.timed) {
      return { sets: lv === 0 ? 2 : 3, reps: lv === 0 ? '20〜30秒' : '30〜60秒', rest: 45 };
    }
    const table = {
      hypertrophy: { c: [4, '8〜10', 90], i: [3, '10〜15', 60] },
      strength: { c: [5, '3〜5', 180], i: [3, '8〜10', 90] },
      diet: { c: [3, '10〜12', 60], i: [3, '12〜15', 45] },
      tone: { c: [3, '10〜12', 60], i: [3, '12〜15', 45] },
      health: { c: [3, '10〜12', 60], i: [2, '12〜15', 60] },
    };
    let [sets, reps, rest] = table[p.goal][ex.c ? 'c' : 'i'];
    if (ex.part === 'abs' || ex.id === 'calf_raise') reps = '15〜20';
    if (lv === 0) {
      sets = Math.max(2, sets - 1);
      if (p.goal === 'strength') { reps = ex.c ? '8〜10' : '10〜12'; rest = 120; }
    } else if (lv === 1) {
      if (sets >= 4) sets -= 1;
      if (p.goal === 'strength' && ex.c) reps = '5〜8';
    }
    if (age >= 60) {
      sets = Math.min(sets, 3);
      if (p.goal === 'strength') reps = '8〜12';
      rest = Math.max(rest, 90);
    } else if (age < 18 && p.goal === 'strength') {
      reps = '8〜12';
    }
    return { sets, reps, rest };
  }

  function estimateSec(item) { return item.sets * (40 + item.rest) + 45; }

  function sessionFrame(p, minutes) {
    const lv = userLevel(p);
    const age = Number(p.age);
    // 短い時間でも筋トレ本体に6割以上を残す
    let warm = minutes >= 60 && (lv === 0 || age >= 40) ? 8 : minutes <= 20 ? 3 : 5;
    let cool = minutes <= 20 ? 2 : minutes <= 30 ? 3 : 5;
    let cardio = 0;
    if (p.goal === 'diet') cardio = minutes >= 90 ? 25 : minutes >= 60 ? 15 : minutes >= 45 ? 10 : 0;
    else if (p.goal === 'health') cardio = minutes >= 60 ? 10 : 0;
    else if (p.goal === 'tone') cardio = minutes >= 90 ? 10 : 0;
    return { warm, cool, cardio };
  }

  // 部位リストと時間から1回分のメニューを作る
  function buildSession(parts, opts) {
    const p = opts.profile;
    const focus = new Set(opts.focus || []);
    const frame = sessionFrame(p, opts.minutes);
    const budget = (opts.minutes - frame.warm - frame.cool - frame.cardio) * 60;
    const ordered = parts.filter((x) => focus.has(x)).concat(parts.filter((x) => !focus.has(x)));
    const pools = {}; const counts = {};
    ordered.forEach((part) => { pools[part] = poolFor(part, p, opts.variant || 0); counts[part] = 0; });

    const picked = [];
    const dropped = [];
    let used = 0;
    const tryAdd = (part, allowShrink) => {
      const ex = pools[part][counts[part]];
      if (!ex) return false;
      const item = Object.assign({ id: ex.id, part }, prescribe(ex, p));
      if (used + estimateSec(item) > budget) {
        if (!allowShrink || item.sets <= 2) return false;
        item.sets = 2;
        if (used + estimateSec(item) > budget) return false;
      }
      picked.push(item); used += estimateSec(item); counts[part] += 1;
      return true;
    };

    // 1周目: 各部位1種目ずつ(時間が足りなければセット数を減らす)
    ordered.forEach((part) => {
      if (!pools[part].length) return;
      if (!tryAdd(part, true)) dropped.push(part);
    });
    // 2周目以降: 時間が許す限り種目を追加(重点部位は多めに)
    const fullBody = parts.length >= 5;
    const maxPerPart = userLevel(p) <= 1 ? 3 : 5;
    const capFor = (part) => Math.min(maxPerPart, baseCap(part));
    const baseCap = (part) => {
      if (focus.has(part)) return fullBody ? 3 : 5;
      if (part === 'abs') return 2;
      if (fullBody) return 2;
      return parts.length <= 2 ? 5 : parts.length <= 3 ? 4 : 3;
    };
    let added = true;
    while (added) {
      added = false;
      for (const part of ordered) {
        if (dropped.includes(part)) continue;
        const times = focus.has(part) ? 2 : 1;
        for (let t = 0; t < times; t++) {
          if (counts[part] < capFor(part) && tryAdd(part, false)) added = true;
        }
      }
    }
    picked.sort((a, b) => ordered.indexOf(a.part) - ordered.indexOf(b.part));
    return {
      parts: parts.slice(),
      exercises: picked,
      warm: frame.warm,
      cool: frame.cool,
      cardio: frame.cardio,
      // 全身の日の腕・腹は時間があれば入れる扱いなので警告しない
      dropped: fullBody ? dropped.filter((x) => !['biceps', 'triceps', 'abs'].includes(x)) : dropped,
      estMin: Math.round(used / 60) + frame.warm + frame.cool + frame.cardio,
    };
  }

  function balancedTemplates(days, lv) {
    const FB = ['legs', 'chest', 'back', 'shoulders', 'triceps', 'biceps', 'abs'];
    const full = (s) => ({ title: '全身' + s, parts: FB });
    const push = { title: 'プッシュ(押す筋肉)', parts: ['chest', 'shoulders', 'triceps'] };
    const pull = { title: 'プル(引く筋肉)', parts: ['back', 'biceps', 'abs'] };
    const legs = { title: '脚の日', parts: ['legs', 'abs'] };
    const upper = (s) => ({ title: '上半身' + s, parts: ['chest', 'back', 'shoulders', 'triceps', 'biceps'] });
    const lower = (s) => ({ title: '下半身' + s, parts: ['legs', 'abs'] });
    switch (days) {
      case 1: return [full('')];
      case 2: return [full('A'), full('B')];
      case 3: return lv <= 1 ? [full('A'), full('B'), full('C')] : [push, pull, legs];
      case 4: return [upper('A'), lower('A'), upper('B'), lower('B')];
      case 5: return [
        { title: '胸の日', parts: ['chest'] },
        { title: '背中の日', parts: ['back'] },
        { title: '脚の日', parts: ['legs'] },
        { title: '肩・腹の日', parts: ['shoulders', 'abs'] },
        { title: '腕の日', parts: ['biceps', 'triceps'] },
      ];
      default: return [push, pull, legs, push, pull, legs];
    }
  }

  function splitTemplates(days, selected) {
    const groupsDef = [['chest', 'triceps'], ['back', 'biceps'], ['legs'], ['shoulders', 'abs']];
    const groups = groupsDef.map((g) => g.filter((x) => selected.includes(x))).filter((g) => g.length);
    let bins;
    if (days >= groups.length) {
      bins = Array.from({ length: days }, (_, i) => groups[i % groups.length]);
    } else {
      bins = Array.from({ length: days }, () => []);
      groups.forEach((g, i) => { bins[Math.floor((i * days) / groups.length)].push(...g); });
    }
    return bins.map((parts) => ({ title: parts.map((x) => PARTS[x]).join('・'), parts }));
  }

  function generatePlan(p) {
    const lv = userLevel(p);
    const days = Number(p.days);
    const templates = p.mode === 'split' ? splitTemplates(days, p.focus) : balancedTemplates(days, lv);
    const focus = p.mode === 'split' ? [] : p.focus;
    const seen = {};
    const pattern = WEEK_PATTERNS[days];
    const sessions = templates.map((t, i) => {
      const key = t.parts.join(',');
      const variant = seen[key] || 0;
      seen[key] = variant + 1;
      return Object.assign({ title: t.title, weekday: pattern[i] }, buildSession(t.parts, { profile: p, minutes: Number(p.minutes), focus, variant }));
    });
    return { createdAt: today(), days: sessions, notes: planNotes(p) };
  }

  function planNotes(p) {
    const lv = userLevel(p);
    const age = Number(p.age);
    const notes = [];
    const goalNote = {
      hypertrophy: '重さは「指定回数をやり切って、あと1〜2回できる」くらいが目安。筋肉を大きくするにはカロリーとタンパク質をしっかり摂りましょう。',
      strength: '多関節種目(ベンチプレス・スクワットなど)は重めの重量で、休憩をしっかり取って毎セット全力で。フォームが崩れる重さは避けましょう。',
      diet: '筋トレで筋肉を維持しつつ、有酸素運動と食事管理で脂肪を落とします。セット間の休憩は短めにして心拍数を保ちましょう。',
      tone: 'やや軽めの重さで回数を多めに。正しいフォームで狙った筋肉に効かせる意識が大切です。',
      health: '無理のない重さで、まずは継続することが一番。息を止めずに、呼吸しながら動作しましょう。',
    };
    notes.push(goalNote[p.goal]);
    notes.push('指定回数の上限が楽にできるようになったら、次回は重量を少し上げましょう(バーベル+2.5kg、ダンベル+1〜2kgが目安)。');
    if (lv === 0) notes.push('最初の2〜3週間は軽めの重さでフォームを覚えることを最優先に。筋肉痛が強い時は休んでOKです。');
    if ((p.goal === 'diet' || p.goal === 'health') && Number(p.minutes) < (p.goal === 'diet' ? 45 : 60)) notes.push('時間が短いので有酸素運動はメニューに入れていません。通勤で一駅歩く・階段を使うなど、日常で歩く量を増やすと効果的です。');
    if (age >= 50) notes.push('関節に痛みが出る種目は無理せず「↻」で入れ替えましょう。ウォーミングアップは念入りに。');
    if (age < 18) notes.push('成長期は重すぎる重量を避け、フォーム重視・自重中心で取り組みましょう。');
    if (p.mode === 'split' && !p.focus.includes('legs')) notes.push('下半身は大きな筋肉が多く、鍛えると代謝アップにも効果的です。余裕があれば脚も加えてみてください。');
    if (p.mode === 'split' && Number(p.days) > p.focus.length * 2) notes.push('同じ部位が続く場合は、筋肉痛が残っていれば軽めにするか休みましょう。');
    notes.push('痛み(関節・腰など)を感じたらすぐに中止してください。持病がある方は医師に相談のうえ行ってください。');
    return notes;
  }

  function swapExercise(dayIdx, exIdx) {
    const day = state.plan.days[dayIdx];
    const cur = day.exercises[exIdx];
    const curEx = EX_BY_ID[cur.id];
    const inDay = new Set(day.exercises.map((e) => e.id));
    const pool = poolFor(cur.part, state.profile, 0).filter((e) => !inDay.has(e.id));
    if (!pool.length) { notify('入れ替えられる種目がありません'); return; }
    const sameType = pool.filter((e) => e.c === curEx.c);
    const next = (sameType.length ? sameType : pool)[0];
    day.exercises[exIdx] = Object.assign({ id: next.id, part: cur.part }, prescribe(next, state.profile));
    save(); render();
  }

  // ---------- 栄養計算 ----------
  function latestWeight() {
    if (state.weights.length) {
      return state.weights.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0].kg;
    }
    return Number(state.profile.weight);
  }

  function nutritionTargets() {
    const p = state.profile;
    const w = latestWeight();
    const h = Number(p.height);
    const a = Number(p.age);
    const base = 10 * w + 6.25 * h - 5 * a;
    const bmr = p.sex === 'male' ? base + 5 : p.sex === 'female' ? base - 161 : base - 78;
    const d = Number(p.days);
    const factor = d <= 2 ? 1.375 : d <= 4 ? 1.55 : 1.725;
    const tdee = bmr * factor;
    const mult = { diet: 0.8, tone: 0.9, hypertrophy: 1.1, strength: 1.05, health: 1.0 }[p.goal];
    const kcal = Math.max(bmr, tdee * mult);
    const pPerKg = { hypertrophy: 2.0, strength: 1.8, diet: 2.0, tone: 1.6, health: 1.2 }[p.goal];
    const protein = w * pPerKg;
    const fat = (kcal * 0.25) / 9;
    const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), p: Math.round(protein), f: Math.round(fat), c: Math.round(carbs), weight: w };
  }

  // ---------- 記録 ----------
  function lastSetsFor(exId) {
    for (const log of state.logs) {
      const e = log.entries.find((x) => x.id === exId);
      if (e && e.sets.length) return e.sets;
    }
    return null;
  }

  function startSession(session, title) {
    if (state.active) {
      askConfirm('記録中のトレーニングがあります。破棄して新しく始めますか？', () => { state.active = null; startSession(session, title); }, '破棄して始める');
      return;
    }
    state.active = {
      date: today(),
      title,
      cardio: session.cardio,
      note: '',
      entries: session.exercises.map((it) => {
        const prev = lastSetsFor(it.id);
        return {
          id: it.id, reps: it.reps, rest: it.rest,
          sets: Array.from({ length: it.sets }, (_, i) => ({ w: prev && prev[i] ? prev[i].w : '', r: '', done: false })),
        };
      }),
    };
    save();
    ui.tab = 'log';
    render();
    window.scrollTo(0, 0);
  }

  // ---------- ダイアログ(alert/confirmが使えない環境向けに画面内で表示) ----------
  function showModal(html, onReady) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.id = 'modal';
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(wrap);
    if (onReady) onReady(wrap);
    const btn = wrap.querySelector('[data-modal-focus]') || wrap.querySelector('button');
    if (btn) btn.focus();
  }
  function closeModal() {
    const m = document.getElementById('modal');
    if (m) m.remove();
  }
  function notify(msg) {
    showModal('<p>' + esc(msg) + '</p><div class="modal-actions"><button class="btn primary" data-modal="close">OK</button></div>');
  }
  function askConfirm(msg, onYes, yesLabel) {
    showModal('<p>' + esc(msg) + '</p><div class="modal-actions"><button class="btn ghost" data-modal="close">キャンセル</button><button class="btn primary" data-modal="yes" data-modal-focus>' + esc(yesLabel || 'OK') + '</button></div>',
      (wrap) => { wrap.querySelector('[data-modal="yes"]').addEventListener('click', () => { closeModal(); onYes(); }); });
  }
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-modal="close"]') || ev.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeModal(); });

  // ---------- 描画 ----------
  const app = document.getElementById('app');

  function render() {
    if (!state.profile || ui.ob) { renderOnboarding(); return; }
    const views = { menu: viewMenu, log: viewLog, meals: viewMeals, weight: viewWeight, settings: viewSettings };
    app.innerHTML = '<main class="container">' + views[ui.tab]() + '</main>' + navBar();
  }

  function navBar() {
    const items = [['menu', '🏋️', 'メニュー'], ['log', '📝', '記録'], ['meals', '🍚', '食事'], ['weight', '⚖️', '体重'], ['settings', '⚙️', '設定']];
    return '<nav class="bottom-nav">' + items.map(([k, ic, lb]) =>
      `<button class="nav-btn ${ui.tab === k ? 'active' : ''}" data-action="tab" data-tab="${k}"><span class="nav-ic">${ic}</span><span>${lb}</span>${k === 'log' && state.active ? '<span class="dot"></span>' : ''}</button>`
    ).join('') + '</nav>';
  }

  // ----- オンボーディング -----
  function blankProfile() {
    return { goal: null, sex: null, age: '', height: '', weight: '', experience: null, equipment: null, days: 3, minutes: 60, mode: 'balanced', focus: [] };
  }

  function choiceCard(field, value, label, sub, icon, selected) {
    return `<button class="choice ${selected ? 'selected' : ''}" data-action="ob-set" data-field="${field}" data-value="${esc(value)}">
      ${icon ? `<span class="choice-ic">${icon}</span>` : ''}<span class="choice-text"><strong>${esc(label)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
  }
  function chip(action, value, label, selected, extra) {
    return `<button class="chip ${selected ? 'selected' : ''}" data-action="${action}" data-value="${esc(value)}" ${extra || ''}>${esc(label)}</button>`;
  }

  function renderOnboarding() {
    if (!ui.ob) ui.ob = blankProfile();
    const ob = ui.ob;
    const steps = ['目的', 'あなたについて', '経験と環境', '頻度と時間', 'メニューの形'];
    let body = '';
    switch (ui.obStep) {
      case 0:
        body = '<h2>どんな目的で筋トレを始めますか？</h2><div class="choices">' +
          Object.entries(GOALS).map(([k, g]) => choiceCard('goal', k, g.label, g.sub, g.icon, ob.goal === k)).join('') + '</div>';
        break;
      case 1:
        body = `<h2>あなたについて教えてください</h2>
          <label class="field-label">性別</label>
          <div class="chips">${chip('ob-set', 'male', '男性', ob.sex === 'male', 'data-field="sex"')}${chip('ob-set', 'female', '女性', ob.sex === 'female', 'data-field="sex"')}${chip('ob-set', 'other', '回答しない', ob.sex === 'other', 'data-field="sex"')}</div>
          <div class="grid3">
            <label class="field"><span>年齢</span><div class="input-unit"><input type="number" inputmode="numeric" data-ob-input="age" value="${esc(ob.age)}" min="10" max="100" placeholder="30"><em>歳</em></div></label>
            <label class="field"><span>身長</span><div class="input-unit"><input type="number" inputmode="decimal" data-ob-input="height" value="${esc(ob.height)}" min="100" max="250" placeholder="170"><em>cm</em></div></label>
            <label class="field"><span>体重</span><div class="input-unit"><input type="number" inputmode="decimal" data-ob-input="weight" value="${esc(ob.weight)}" min="25" max="250" step="0.1" placeholder="65"><em>kg</em></div></label>
          </div>
          <p class="hint">身長は食事の目標カロリー計算に使います。</p>`;
        break;
      case 2:
        body = '<h2>運動経験は？</h2><div class="choices">' +
          Object.entries(EXPERIENCE).map(([k, e]) => choiceCard('experience', k, e.label, e.sub, '', String(ob.experience) === k)).join('') +
          '</div><h2>どこでトレーニングしますか？</h2><div class="choices">' +
          Object.entries(EQUIPMENT).map(([k, e]) => choiceCard('equipment', k, e.label, e.sub, '', ob.equipment === k)).join('') + '</div>';
        break;
      case 3:
        body = '<h2>週に何回トレーニングしますか？</h2><div class="chips">' +
          [1, 2, 3, 4, 5, 6].map((n) => chip('ob-set', n, '週' + n + '回', Number(ob.days) === n, 'data-field="days"')).join('') +
          '</div><p class="hint">' + (WEEK_PATTERNS[ob.days] || []).map((i) => WEEK[i]).join('・') + ' に実施する想定で組みます(曜日は自由に変えてOK)。</p>' +
          '<h2>1回あたり何分使えますか？</h2><div class="chips">' +
          MINUTE_OPTIONS.map((m) => chip('ob-set', m, m >= 60 ? (m / 60) + '時間' + (m % 60 ? '半' : '') : m + '分', Number(ob.minutes) === m, 'data-field="minutes"')).join('') +
          '</div><p class="hint">ウォーミングアップ・ストレッチ込みの時間です。</p>';
        break;
      case 4: {
        const split = ob.mode === 'split';
        body = '<h2>どんなメニューにしますか？</h2><div class="choices">' +
          choiceCard('mode', 'balanced', 'おまかせ(全身バランス)', '頻度に合わせて全身を効率よく鍛える。初めての方におすすめ', '⚖️', !split) +
          choiceCard('mode', 'split', '部位別(分割法)', '鍛えたい部位を選んで、日ごとに部位を分けて集中的に鍛える', '🎯', split) +
          '</div><h2>' + (split ? '鍛えたい部位を選んでください' : '特に鍛えたい部位(任意)') + '</h2>' +
          '<div class="chips">' + PART_KEYS.map((k) => chip('ob-focus', k, PARTS[k], ob.focus.includes(k))).join('') +
          (split ? chip('ob-focus-all', '', 'すべて選択', false) : '') + '</div>' +
          '<p class="hint">' + (split ? '選んだ部位だけで、週' + ob.days + '回に振り分けたメニューを作ります。' : '選んだ部位は種目数を多めにします。') + '</p>';
        break;
      }
    }
    const isLast = ui.obStep === steps.length - 1;
    app.innerHTML = `<main class="container onboarding">
      <header class="ob-head"><h1>筋トレメニューを作ろう</h1>
        <div class="progress"><div style="width:${((ui.obStep + 1) / steps.length) * 100}%"></div></div>
        <p class="step-label">STEP ${ui.obStep + 1} / ${steps.length}: ${steps[ui.obStep]}</p></header>
      <section class="card">${body}</section>
      ${ui.obError ? `<p class="error">${esc(ui.obError)}</p>` : ''}
      <div class="ob-actions">
        ${ui.obStep > 0 ? '<button class="btn ghost" data-action="ob-back">戻る</button>' : (state.profile ? '<button class="btn ghost" data-action="ob-cancel">キャンセル</button>' : '<span></span>')}
        <button class="btn primary" data-action="ob-next">${isLast ? 'メニューを作成する' : '次へ'}</button>
      </div></main>`;
  }

  function validateStep() {
    const ob = ui.ob;
    switch (ui.obStep) {
      case 0: return ob.goal ? '' : '目的を選んでください';
      case 1: {
        if (!ob.sex) return '性別を選んでください';
        const a = num(ob.age), h = num(ob.height), w = num(ob.weight);
        if (!a || a < 10 || a > 100) return '年齢を正しく入力してください(10〜100)';
        if (!h || h < 100 || h > 250) return '身長を正しく入力してください(100〜250cm)';
        if (!w || w < 25 || w > 250) return '体重を正しく入力してください(25〜250kg)';
        return '';
      }
      case 2:
        if (ob.experience === null) return '運動経験を選んでください';
        return ob.equipment ? '' : 'トレーニング環境を選んでください';
      case 4:
        return ob.mode === 'split' && !ob.focus.length ? '鍛えたい部位を1つ以上選んでください' : '';
      default: return '';
    }
  }

  function finishOnboarding() {
    const ob = ui.ob;
    const profile = Object.assign({}, ob, { age: num(ob.age), height: num(ob.height), weight: num(ob.weight), days: Number(ob.days), minutes: Number(ob.minutes) });
    const weightChanged = !state.profile || state.profile.weight !== profile.weight;
    state.profile = profile;
    state.plan = generatePlan(profile);
    if (weightChanged) {
      state.weights = state.weights.filter((x) => x.date !== today());
      state.weights.push({ date: today(), kg: profile.weight });
    }
    ui.ob = null; ui.obStep = 0; ui.obError = ''; ui.tab = 'menu';
    save(); render(); window.scrollTo(0, 0);
  }

  // ----- メニュー画面 -----
  function exerciseRow(it, opts) {
    const ex = EX_BY_ID[it.id];
    return `<li class="ex">
      <div class="ex-main">
        <details><summary><span class="ex-name">${esc(ex.name)}</span> <span class="tag">${esc(PARTS[it.part])}</span></summary><p class="tip">💡 ${esc(ex.tip)}</p></details>
        <div class="ex-presc"><b>${it.sets}</b>セット × <b>${esc(it.reps)}</b>${ex.timed ? '' : '回'} <span class="muted">休憩${it.rest}秒</span></div>
      </div>
      ${opts && opts.swap ? `<button class="icon-btn" title="別の種目に入れ替え" data-action="swap" data-day="${opts.day}" data-ex="${opts.idx}">↻</button>` : ''}
    </li>`;
  }

  function sessionBlock(s, opts) {
    const cardioText = s.cardio ? `<li class="ex sub"><div class="ex-main"><span class="ex-name">🏃 有酸素運動 ${s.cardio}分</span><div class="muted small">${state.profile.equipment === 'g' ? 'トレッドミル早歩き・バイクなど' : 'ウォーキング・踏み台昇降など'}(会話できる程度の強度)</div></div></li>` : '';
    return `<ul class="ex-list">
      <li class="ex sub"><div class="ex-main"><span class="ex-name">🔥 ウォーミングアップ ${s.warm}分</span><div class="muted small">軽い有酸素 + 動的ストレッチ。最初の種目は軽い重さで1〜2セット練習</div></div></li>
      ${s.exercises.map((it, i) => exerciseRow(it, opts ? { swap: opts.swap, day: opts.day, idx: i } : null)).join('')}
      ${cardioText}
      <li class="ex sub"><div class="ex-main"><span class="ex-name">🧘 クールダウン ${s.cool}分</span><div class="muted small">使った部位の静的ストレッチ</div></div></li>
    </ul>
    ${s.dropped.length ? `<p class="warn small">時間の都合で「${s.dropped.map((x) => PARTS[x]).join('・')}」は入りませんでした。時間を増やすか部位を絞ると入ります。</p>` : ''}`;
  }

  function viewMenu() {
    const p = state.profile;
    const plan = state.plan;
    const g = GOALS[p.goal];
    const summary = `<section class="card summary">
      <div class="summary-top"><span class="goal-ic">${g.icon}</span><div><div class="muted small">目的</div><strong>${esc(g.label)}</strong></div></div>
      <div class="summary-tags">
        <span>${EXPERIENCE[p.experience].label}</span><span>${EQUIPMENT[p.equipment].label}</span>
        <span>週${p.days}回</span><span>1回${p.minutes}分</span><span>${p.mode === 'split' ? '部位別' : 'おまかせ'}</span>
      </div>
      <button class="btn small ghost" data-action="edit-profile">条件を変更</button>
    </section>`;

    const days = plan.days.map((s, di) => `<section class="card day">
      <header class="day-head">
        <div><span class="weekday">${WEEK[s.weekday]}</span><h3>Day${di + 1}: ${esc(s.title)}</h3></div>
        <span class="muted small">約${s.estMin}分</span>
      </header>
      ${sessionBlock(s, { swap: true, day: di })}
      <button class="btn primary block" data-action="start-day" data-day="${di}">このメニューで記録を始める</button>
    </section>`).join('');

    const notes = `<section class="card"><h3>ポイント</h3><ul class="notes">${plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>`;

    const q = ui.quick;
    const quick = `<section class="card">
      <h3>🎯 今日だけ部位を選んで作る</h3>
      <p class="muted small">予定とは別に、鍛えたい部位と時間を選んでその日のメニューを作れます。</p>
      <div class="chips">${PART_KEYS.map((k) => chip('quick-part', k, PARTS[k], q.parts.includes(k))).join('')}</div>
      <div class="chips">${MINUTE_OPTIONS.map((m) => chip('quick-min', m, m + '分', q.minutes === m)).join('')}</div>
      <div class="row-btns">
        <button class="btn primary" data-action="quick-build">メニューを作る</button>
        ${q.result ? '<button class="btn ghost" data-action="quick-reroll">別の種目で作る</button>' : ''}
      </div>
      ${q.result ? `<div class="quick-result"><p class="muted small">約${q.result.estMin}分</p>${sessionBlock(q.result)}<button class="btn primary block" data-action="start-quick">このメニューで記録を始める</button></div>` : ''}
    </section>`;

    return '<h1 class="page-title">あなたのメニュー</h1>' + summary + days + notes + quick;
  }

  // ----- 記録画面 -----
  function viewLog() {
    let html = '<h1 class="page-title">トレーニング記録</h1>';
    const a = state.active;
    if (a) {
      html += `<section class="card active-session">
        <header class="day-head"><div><span class="weekday">記録中</span><h3>${esc(a.title)}</h3></div>
        <input type="date" value="${esc(a.date)}" data-active-date class="date-input"></header>
        <p class="muted small">重さ(kg)と回数を入力。終わったセットは✓をタップ。前回の重さが入っています。</p>
        ${a.entries.map((e, ei) => {
          const ex = EX_BY_ID[e.id];
          const prev = lastSetsFor(e.id);
          return `<div class="log-ex">
            <div class="log-ex-head"><strong>${esc(ex.name)}</strong><span class="muted small">目標 ${esc(e.reps)}${ex.timed ? '' : '回'} / 休憩${e.rest}秒</span></div>
            ${prev ? `<div class="muted small">前回: ${prev.map((s) => (s.w ? s.w + 'kg×' : '') + (s.r || '-')).join(', ')}</div>` : ''}
            <div class="set-rows">
              ${e.sets.map((s, si) => `<div class="set-row ${s.done ? 'done' : ''}">
                <span class="set-no">${si + 1}</span>
                <div class="input-unit"><input type="number" inputmode="decimal" step="0.5" value="${esc(s.w)}" data-set="${ei}:${si}:w" placeholder="${ex.equip.length === 1 && ex.equip[0] === 'b' ? '自重' : '重さ'}"><em>kg</em></div>
                <div class="input-unit"><input type="number" inputmode="numeric" value="${esc(s.r)}" data-set="${ei}:${si}:r" placeholder="回数"><em>${ex.timed ? '秒' : '回'}</em></div>
                <button class="check ${s.done ? 'on' : ''}" data-action="set-done" data-ei="${ei}" data-si="${si}">✓</button>
              </div>`).join('')}
            </div>
            <div class="row-btns small-gap"><button class="btn tiny ghost" data-action="set-add" data-ei="${ei}">＋セット</button>${e.sets.length > 1 ? `<button class="btn tiny ghost" data-action="set-remove" data-ei="${ei}">−セット</button>` : ''}</div>
          </div>`;
        }).join('')}
        ${a.cardio ? `<p class="small">🏃 有酸素運動 ${a.cardio}分 も忘れずに！</p>` : ''}
        <label class="field"><span>メモ</span><textarea data-active-note rows="2" placeholder="調子・気づいたことなど">${esc(a.note)}</textarea></label>
        <div class="row-btns"><button class="btn ghost" data-action="active-discard">破棄</button><button class="btn primary" data-action="active-save">記録を保存</button></div>
      </section>`;
    } else {
      html += '<section class="card"><p>記録中のトレーニングはありません。<br>「メニュー」タブの各Dayから記録を始められます。</p><button class="btn primary" data-action="tab" data-tab="menu">メニューを見る</button></section>';
    }

    // 今週の実施状況
    const start = (() => { const d = new Date(); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toDateStr(d); })();
    const thisWeek = state.logs.filter((l) => l.date >= start).length;
    html += `<section class="card"><h3>今週の実施 ${thisWeek} / ${state.profile.days} 回</h3>
      <div class="meter"><div style="width:${Math.min(100, (thisWeek / state.profile.days) * 100)}%"></div></div></section>`;

    html += '<section class="card"><h3>履歴</h3>';
    if (!state.logs.length) html += '<p class="muted">まだ記録がありません。</p>';
    html += state.logs.map((l, li) => {
      const open = ui.openLog === li;
      const totalSets = l.entries.reduce((n, e) => n + e.sets.length, 0);
      return `<div class="history-item">
        <button class="history-head" data-action="toggle-log" data-li="${li}"><span>${fmtDate(l.date)} ${esc(l.title)}</span><span class="muted small">${l.entries.length}種目 ${totalSets}セット ${open ? '▲' : '▼'}</span></button>
        ${open ? `<div class="history-body">${l.entries.map((e) => `<div><strong>${esc(EX_BY_ID[e.id] ? EX_BY_ID[e.id].name : e.id)}</strong>: ${e.sets.map((s) => (s.w ? s.w + 'kg×' : '') + (s.r || '-')).join(', ')}</div>`).join('')}
          ${l.note ? `<p class="muted small">メモ: ${esc(l.note)}</p>` : ''}
          <button class="btn tiny danger" data-action="delete-log" data-li="${li}">この記録を削除</button></div>` : ''}
      </div>`;
    }).join('');
    html += '</section>';
    return html;
  }

  // ----- 食事画面 -----
  function sumMeals(items) {
    return items.reduce((s, it) => ({ kcal: s.kcal + it.kcal, p: s.p + it.p, f: s.f + it.f, c: s.c + it.c }), { kcal: 0, p: 0, f: 0, c: 0 });
  }

  function bar(label, val, target, unit, cls) {
    const pct = target ? Math.min(100, (val / target) * 100) : 0;
    const over = val > target * 1.1;
    return `<div class="bar-row"><div class="bar-label"><span>${label}</span><span><b>${round(val, unit === 'kcal' ? 0 : 1)}</b> / ${target}${unit}</span></div>
      <div class="meter ${cls} ${over ? 'over' : ''}"><div style="width:${pct}%"></div></div></div>`;
  }

  // カタカナ→ひらがな・全角半角をそろえて、「はむ」でも「ハム」が見つかるようにする
  function norm(str) {
    return String(str).normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function recentFoods() {
    const seen = new Set();
    const out = [];
    for (const date of Object.keys(state.meals).sort().reverse()) {
      for (const it of state.meals[date].slice().reverse()) {
        if (seen.has(it.name)) continue;
        seen.add(it.name);
        const q = it.qty || 1;
        out.push({ name: it.name, unit: it.unit || '', kcal: round(it.kcal / q), p: round(it.p / q, 1), f: round(it.f / q, 1), c: round(it.c / q, 1) });
        if (out.length >= 20) return out;
      }
    }
    return out;
  }

  function currentFoodCat() {
    if (ui.foodCat) return ui.foodCat;
    return recentFoods().length ? 'recent' : 'all';
  }

  // 今表示している候補リスト(検索中は全食品から探す)
  function pickList() {
    const custom = state.customFoods.map((f, ci) => Object.assign({ custom: true, ci }, f));
    const q = norm(ui.foodQuery.replace(/\s+/g, ''));
    if (q) return custom.concat(FOODS).filter((f) => norm(f.name + ' ' + (f.k || '')).includes(q));
    const cat = currentFoodCat();
    if (cat === 'recent') return recentFoods();
    if (cat === 'custom') return custom;
    if (cat === 'all') return custom.concat(FOODS);
    return FOODS.filter((f) => f.cat === cat);
  }

  function foodCatChips() {
    const cat = currentFoodCat();
    const items = [];
    if (recentFoods().length) items.push(['recent', '最近']);
    items.push(['all', 'すべて']);
    if (state.customFoods.length) items.push(['custom', 'マイ食品']);
    Object.entries(FOOD_CATS).forEach((e) => items.push(e));
    return items.map(([k, l]) => chip('food-cat', k, l, cat === k)).join('');
  }

  function foodPickItems() {
    return pickList().map((f, idx) =>
      `<li class="${ui.selFood && ui.selFood.name === f.name ? 'picked' : ''}"><button data-action="food-select" data-fi="${idx}"><span>${f.custom ? '⭐ ' : ''}${esc(f.name)} <small class="muted">${esc(f.unit)}</small></span><span class="muted small">${f.kcal}kcal P${f.p}</span></button>${f.custom ? `<button class="icon-btn tiny" data-action="custom-del" data-ci="${f.ci}" title="マイ食品から削除">✕</button>` : ''}</li>`
    ).join('') || '<li class="muted small">見つかりません。ひらがなでも探せます。ない場合は下の「手入力」で追加できます。</li>';
  }

  // ---------- 献立提案 ----------
  const SLOT_WEIGHT = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 };
  const LEVELS = { easy: '簡単', hard: '手の込んだ', both: 'どちらも' };
  const PORTIONS = [0.75, 1, 1.25, 1.5, 2];
  const addN = (a, b, k) => a.map((v, i) => v + b[i] * (k == null ? 1 : k));
  const scaleN = (n, k) => n.map((v) => v * k);

  // 主食は一般的な1食分で固定(ご飯: 男性180g・女性150g)
  function stapleItem(type) {
    const sex = state.profile.sex;
    switch (type) {
      case 'rice': {
        const g = sex === 'male' ? 180 : sex === 'female' ? 150 : 165;
        return { name: 'ご飯', amount: g + 'g', n: scaleN([1.56, 0.025, 0.003, 0.371], g) };
      }
      case 'bread': {
        const k = sex === 'male' ? 2 : 1;
        return { name: '食パン(6枚切)', amount: k + '枚', n: scaleN([149, 5.3, 2.5, 26.6], k) };
      }
      case 'pasta': {
        const g = sex === 'male' ? 100 : sex === 'female' ? 80 : 90;
        return { name: 'パスタ(乾麺)', amount: g + 'g', n: scaleN([3.47, 0.129, 0.018, 0.731], g) };
      }
      case 'udon': return { name: 'うどん(ゆで)', amount: '1玉', n: [219, 6.0, 0.9, 49.7] };
      case 'soba': return { name: 'そば(ゆで)', amount: '1玉', n: [234, 8.6, 1.8, 46.8] };
      default: return null;
    }
  }

  function levelOk(item, pref) { return pref !== 'easy' || item.level === 'easy'; }
  function rotate(list, seed) { return list.length ? list[((seed % list.length) + list.length) % list.length] : null; }

  function mealScore(n, T) {
    return Math.abs(n[0] - T[0]) / Math.max(T[0], 1) + 0.5 * Math.abs(n[1] - T[1]) / Math.max(T[1], 1) + 0.3 * Math.abs(n[2] - T[2]) / Math.max(T[2], 1);
  }

  // 1品の料理に主食・副菜・汁物を合わせ、目標(T=[kcal,P,F,C])に近づける
  function composeMeal(dish, slot, T, seed, pref) {
    const fixed = [];
    const staple = stapleItem(dish.staple);
    if (staple) fixed.push(staple);
    let side = null;
    if (slot === 'lunch' || slot === 'dinner') {
      if (dish.staple === 'rice') side = rotate(SIDES.filter((x) => levelOk(x, pref)), seed);
      else if (dish.staple === 'pasta') side = SIDES.find((x) => x.name === 'トマトとレタスのサラダ');
      else if (dish.staple === 'udon' || dish.staple === 'soba') side = SIDES.find((x) => x.name === 'ほうれん草のおひたし');
    }
    const soups = (slot !== 'snack' && SOUPS[dish.staple]) ? SOUPS[dish.staple].filter((x) => levelOk(x, pref)) : [];
    const soup = rotate(soups, seed + 1);
    if (soup) fixed.push({ name: soup.name, amount: '1杯', n: soup.n });

    const build = (m, withSide, addons) => {
      const items = [];
      if (staple) items.push(staple);
      items.push({ name: dish.name, amount: m === 1 ? '1人前' : m + '人前', n: scaleN(dish.n, m), main: true });
      if (withSide && side) items.push({ name: side.name, amount: '1皿', n: side.n, side });
      if (soup) items.push({ name: soup.name, amount: '1杯', n: soup.n });
      addons.forEach((a) => items.push({ name: a.name, amount: a.unit, n: a.n, addon: true }));
      const total = items.reduce((acc, it) => addN(acc, it.n), [0, 0, 0, 0]);
      return { dish, m, items, total, score: mealScore(total, T) };
    };

    let best = null;
    [true, false].forEach((withSide) => {
      if (!withSide && !side) return;
      (dish.portions || PORTIONS).forEach((m) => {
        const r = build(m, withSide, []);
        // 副菜は基本つける。外すのは多すぎる時だけ
        if (!withSide) r.score += 0.05;
        if (!best || r.score < best.score) best = r;
      });
    });
    // 足りなければ「もう一品」を最大2つ足す
    const addons = [];
    const maxAddons = T[0] > 900 ? 3 : 2;
    while (addons.length < maxAddons && best.total[0] < T[0] * 0.92) {
      let pick = null;
      ADDONS.filter((a) => !addons.includes(a)).forEach((a) => {
        (dish.portions || PORTIONS).forEach((m) => {
          const r = build(m, best.items.some((it) => it.side), addons.concat(a));
          if (!pick || r.score < pick.score) pick = Object.assign(r, { addon: a });
        });
      });
      if (!pick || pick.score >= best.score) break;
      addons.push(pick.addon);
      best = pick;
    }
    return best;
  }

  function slotsFor(date) { return state.planSlots[date] || state.prefs.mealSlots; }

  function mealPlan() {
    const t = nutritionTargets();
    const pref = state.prefs.mealLevel;
    const logged = state.meals[ui.mealDate] || [];
    const eaten = sumMeals(logged);
    const chosen = slotsFor(ui.mealDate);
    const doneSlots = Object.keys(MEAL_CATS).filter((cat) => logged.some((it) => it.cat === cat));
    const openSlots = Object.keys(MEAL_CATS).filter((cat) => chosen.includes(cat) && !doneSlots.includes(cat));
    const rem = [t.kcal - eaten.kcal, Math.max(0, t.p - eaten.p), Math.max(0, t.f - eaten.f), Math.max(0, t.c - eaten.c)];
    const wsum = openSlots.reduce((n, k) => n + SLOT_WEIGHT[k], 0);
    const seed = Number(ui.mealDate.replace(/-/g, '')) % 97;
    const slots = {};
    if (rem[0] >= 150) {
      openSlots.forEach((slot, i) => {
        const T = scaleN(rem, SLOT_WEIGHT[slot] / wsum);
        let dishes = DISHES.filter((d) => d.slots.includes(slot) && (pref === 'both' || d.level === pref));
        if (!dishes.length) dishes = DISHES.filter((d) => d.slots.includes(slot));
        const ranked = dishes.map((d) => composeMeal(d, slot, T, seed + i, pref)).sort((a, b) => a.score - b.score);
        // 日替わりで選ぶのは、いちばん合うものと大差ない候補だけ
        const good = Math.max(1, ranked.filter((r) => r.score <= ranked[0].score + 0.15).length);
        const pick = ranked[(seed % good + (ui.planPick[slot] || 0)) % ranked.length];
        slots[slot] = Object.assign(pick, { T });
      });
    }
    return { t, eaten, chosen, doneSlots, openSlots, rem, slots };
  }

  function viewMealPlan() {
    const plan = mealPlan();
    const pref = state.prefs.mealLevel;
    const planned = Object.values(plan.slots).reduce((acc, sl) => addN(acc, sl.total), [0, 0, 0, 0]);
    const day = addN([plan.eaten.kcal, plan.eaten.p, plan.eaten.f, plan.eaten.c], planned);
    const same = plan.chosen.join() === state.prefs.mealSlots.join();
    let html = `<section class="card">
      <div class="field-label">この日に食べる食事</div>
      <div class="chips">${Object.entries(MEAL_CATS).map(([k, l]) => chip('plan-slot-toggle', k, l, plan.chosen.includes(k))).join('')}</div>
      ${same ? '' : '<button class="btn tiny ghost" data-action="plan-slot-default">この組み合わせをいつもの設定にする</button>'}
      <div class="field-label" style="margin-top:12px">料理の手間</div>
      <div class="chips">${Object.entries(LEVELS).map(([k, l]) => chip('plan-level', k, l, pref === k)).join('')}</div>
    </section>
    <section class="card">
      <h3>目標 ${plan.t.kcal}kcal から逆算した献立</h3>
      <p class="muted small">${plan.doneSlots.length ? '記録済みの食事(' + Math.round(plan.eaten.kcal) + 'kcal)を差し引き、' : ''}残りを${plan.openSlots.map((k) => MEAL_CATS[k]).join('・') || '—'}に振り分けています。ご飯は${stapleItem('rice').amount}で固定し、おかずの量で調整しています。</p>
      ${bar('カロリー(この献立で食べた場合)', day[0], plan.t.kcal, 'kcal', 'k')}
      ${bar('タンパク質(P)', day[1], plan.t.p, 'g', 'p')}
      ${bar('脂質(F)', day[2], plan.t.f, 'g', 'f')}
      ${bar('炭水化物(C)', day[3], plan.t.c, 'g', 'c')}
    </section>`;
    const short = plan.t.kcal - day[0];
    if (plan.openSlots.length && plan.rem[0] >= 150 && short > plan.t.kcal * 0.08) {
      html += `<section class="card warn-card"><p class="small">この組み合わせだと目標まで<b>約${Math.round(short)}kcal</b>足りません。食事の回数が少ないと1食で食べきるのが難しいので、間食を増やすか、ご飯を大盛り(250g・+${Math.round((250 - parseInt(stapleItem('rice').amount, 10)) * 1.56)}kcal)にすると近づきます。</p></section>`;
    }
    if (!plan.openSlots.length) {
      html += '<section class="card"><p>提案する食事がありません。上の「この日に食べる食事」で選んでください。</p></section>';
    } else if (plan.rem[0] < 150) {
      html += '<section class="card"><p>この日はもう目標カロリーに届いています。食べるなら野菜や汁物など軽いものにしましょう。</p></section>';
    }
    Object.entries(MEAL_CATS).forEach(([slot, label]) => {
      if (plan.doneSlots.includes(slot)) {
        const s = sumMeals((state.meals[ui.mealDate] || []).filter((it) => it.cat === slot));
        html += `<section class="card plan-slot done"><header class="day-head"><h3>${label}</h3><span class="tag">記録済み ${Math.round(s.kcal)}kcal</span></header></section>`;
        return;
      }
      const sl = plan.slots[slot];
      if (!sl) return;
      const d = sl.dish;
      const sideItem = sl.items.find((it) => it.side);
      html += `<section class="card plan-slot">
        <header class="day-head"><h3>${label}</h3><span class="muted small">目安 ${Math.round(sl.T[0])}kcal</span></header>
        <div class="dish-title"><strong>${esc(d.name)}</strong><span class="lv ${d.level}">${d.level === 'easy' ? '簡単' : '手の込んだ'}・${d.min}分</span></div>
        <ul class="food-list">${sl.items.map((it) => `<li><span>${it.addon ? '＋ ' : ''}${esc(it.name)} <b>${esc(it.amount)}</b></span><span class="muted small">${Math.round(it.n[0])}kcal</span></li>`).join('')}</ul>
        <p class="plan-total"><b>${Math.round(sl.total[0])}kcal</b> <span class="muted small">P${round(sl.total[1], 1)} F${round(sl.total[2], 1)} C${round(sl.total[3], 1)}</span></p>
        <details class="recipe"><summary>作り方を見る</summary>
          <p class="small"><b>${esc(d.name)}</b>(材料は1人前${sl.m !== 1 ? '。今回は' + sl.m + '倍の量で' : ''})<br>${esc(d.ing)}</p>
          <ol class="small">${d.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>
          ${sideItem ? `<p class="small"><b>${esc(sideItem.side.name)}</b>: ${esc(sideItem.side.ing)}</p>` : ''}
          <a class="small" href="https://www.kurashiru.com/search?query=${encodeURIComponent(d.name.replace(/\(.*?\)/g, ''))}" target="_blank" rel="noopener">クラシルで「${esc(d.name.replace(/\(.*?\)/g, ''))}」の詳しいレシピを探す ↗</a>
        </details>
        <div class="row-btns"><button class="btn ghost" data-action="plan-reroll" data-slot="${slot}">↻ 別の献立</button><button class="btn primary" data-action="plan-log" data-slot="${slot}">食べたので記録する</button></div>
      </section>`;
    });
    html += '<p class="muted small">料理は定番の家庭料理の分量をもとにした目安です。</p>';
    return html;
  }

  function toast(msg) {
    const old = document.getElementById('toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function selPanel() {
    const f = ui.selFood;
    if (!f) return '<p class="muted small sel-hint">↓ 食品をタップして選び、量を決めてから「追加」を押してください。</p>';
    const q = ui.selQty;
    return `<div class="sel-panel">
      <div class="sel-name"><span class="muted small">選択中</span><strong>${esc(f.name)}</strong><small class="muted">${esc(f.unit)}</small></div>
      <div class="stepper"><button class="icon-btn" data-action="sel-qty" data-d="-0.5" aria-label="減らす">−</button><b>×${q}</b><button class="icon-btn" data-action="sel-qty" data-d="0.5" aria-label="増やす">＋</button></div>
      <div class="muted small">${Math.round(f.kcal * q)}kcal　P${round(f.p * q, 1)} F${round(f.f * q, 1)} C${round(f.c * q, 1)}</div>
      <div class="row-btns"><button class="btn ghost" data-action="sel-cancel">やめる</button><button class="btn primary" data-action="sel-add">${MEAL_CATS[ui.mealCat]}に追加</button></div>
    </div>`;
  }

  function viewMeals() {
    const t = nutritionTargets();
    const items = state.meals[ui.mealDate] || [];
    const total = sumMeals(items);
    const remain = t.kcal - total.kcal;
    const head = `<h1 class="page-title">食事管理</h1>
      <div class="seg">${[['log', '記録'], ['plan', '献立提案']].map(([k, l]) => `<button class="${ui.mealView === k ? 'on' : ''}" data-action="meal-view" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="date-nav"><button class="icon-btn" data-action="meal-date" data-d="-1">‹</button><strong>${fmtDate(ui.mealDate)}${ui.mealDate === today() ? ' 今日' : ''}</strong><button class="icon-btn" data-action="meal-date" data-d="1">›</button></div>`;
    if (ui.mealView === 'plan') return head + viewMealPlan();
    return head + `
      <section class="card">
        <div class="kcal-big"><span class="muted small">残り</span><b class="${remain < 0 ? 'neg' : ''}">${Math.round(remain)}</b><span>kcal</span></div>
        ${bar('カロリー', total.kcal, t.kcal, 'kcal', 'k')}
        ${bar('タンパク質(P)', total.p, t.p, 'g', 'p')}
        ${bar('脂質(F)', total.f, t.f, 'g', 'f')}
        ${bar('炭水化物(C)', total.c, t.c, 'g', 'c')}
        <details class="small"><summary>目標値の根拠</summary>
          <p>体重${t.weight}kgで計算。基礎代謝 約${t.bmr}kcal × 活動量(週${state.profile.days}回の運動) = 消費カロリー 約${t.tdee}kcal。目的「${GOALS[state.profile.goal].label}」に合わせて目標を${t.kcal}kcalにしています。タンパク質は体重×${round(t.p / t.weight, 1)}g、脂質はカロリーの25%、残りを炭水化物にしています。体重タブで記録した最新体重が反映されます。</p>
        </details>
      </section>

      ${Object.entries(MEAL_CATS).map(([cat, label]) => {
        const list = items.map((it, i) => Object.assign({ i }, it)).filter((it) => it.cat === cat);
        const s = sumMeals(list);
        return `<section class="card meal-cat">
          <header class="day-head"><h3>${label}</h3><span class="muted small">${Math.round(s.kcal)}kcal</span></header>
          ${list.length ? `<ul class="food-list">${list.map((it) => `<li><div><span>${esc(it.name)}${it.amount ? ' ' + esc(it.amount) : it.qty !== 1 ? ' ×' + it.qty : ''}</span><small class="muted">P${round(it.p, 1)} F${round(it.f, 1)} C${round(it.c, 1)}</small></div><span>${Math.round(it.kcal)}kcal <button class="icon-btn tiny" data-action="meal-del" data-i="${it.i}">✕</button></span></li>`).join('')}</ul>` : '<p class="muted small">まだ記録がありません</p>'}
        </section>`;
      }).join('')}

      <section class="card" id="food-add">
        <h3>食べたものを追加</h3>
        <div class="chips">${Object.entries(MEAL_CATS).map(([k, l]) => chip('meal-cat', k, l, ui.mealCat === k)).join('')}</div>
        <input type="search" placeholder="食品を検索(例: はむ、ぎゅうどん)" value="${esc(ui.foodQuery)}" data-food-query>
        <div class="chips scroll">${foodCatChips()}</div>
        <div id="sel-area">${selPanel()}</div>
        <ul class="food-pick">${foodPickItems()}</ul>
        <details class="manual"><summary>手入力で追加(外食・コンビニ商品など)</summary>
          <div class="manual-grid">
            <label class="field wide"><span>名前</span><input type="text" data-manual="name" placeholder="例: 牛丼並盛"></label>
            <label class="field"><span>カロリー(kcal)</span><input type="number" inputmode="decimal" data-manual="kcal"></label>
            <label class="field"><span>P(g)</span><input type="number" inputmode="decimal" data-manual="p"></label>
            <label class="field"><span>F(g)</span><input type="number" inputmode="decimal" data-manual="f"></label>
            <label class="field"><span>C(g)</span><input type="number" inputmode="decimal" data-manual="c"></label>
          </div>
          <label class="check-label"><input type="checkbox" data-manual-save checked> マイ食品に保存して次回から選べるようにする</label>
          <button class="btn primary" data-action="manual-add">追加</button>
        </details>
        <p class="muted small">※ 栄養価は目安です。</p>
      </section>`;
  }

  // ----- 体重画面 -----
  function weightChart(list) {
    if (list.length < 2) return '<p class="muted small">2日以上記録するとグラフが表示されます。</p>';
    const W = 320, H = 160, pad = 28;
    const kgs = list.map((x) => x.kg);
    let min = Math.min.apply(null, kgs), max = Math.max.apply(null, kgs);
    if (max - min < 2) { const mid = (max + min) / 2; min = mid - 1; max = mid + 1; }
    const t0 = new Date(list[0].date).getTime(), t1 = new Date(list[list.length - 1].date).getTime();
    const x = (d) => pad + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad * 1.5);
    const y = (kg) => H - pad + 8 - ((kg - min) / (max - min)) * (H - pad - 8);
    const pts = list.map((p) => `${round(x(p.date), 1)},${round(y(p.kg), 1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="体重の推移">
      <line x1="${pad}" y1="${y(max)}" x2="${W - pad / 2}" y2="${y(max)}" class="grid"/><text x="2" y="${y(max) + 4}" class="axis">${round(max, 1)}</text>
      <line x1="${pad}" y1="${y(min)}" x2="${W - pad / 2}" y2="${y(min)}" class="grid"/><text x="2" y="${y(min) + 4}" class="axis">${round(min, 1)}</text>
      <polyline points="${pts}" class="line"/>
      ${list.map((p) => `<circle cx="${round(x(p.date), 1)}" cy="${round(y(p.kg), 1)}" r="3" class="pt"/>`).join('')}
      <text x="${pad}" y="${H - 4}" class="axis">${fmtDate(list[0].date)}</text>
      <text x="${W - pad / 2}" y="${H - 4}" class="axis" text-anchor="end">${fmtDate(list[list.length - 1].date)}</text>
    </svg>`;
  }

  function viewWeight() {
    const list = state.weights.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const latest = list.length ? list[list.length - 1].kg : state.profile.weight;
    const first = list.length ? list[0].kg : latest;
    const h = state.profile.height / 100;
    const bmi = latest / (h * h);
    const diff = latest - first;
    return `<h1 class="page-title">体重記録</h1>
      <section class="card">
        <div class="stats">
          <div><span class="muted small">現在</span><b>${round(latest, 1)}</b><small>kg</small></div>
          <div><span class="muted small">開始から</span><b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${round(diff, 1)}</b><small>kg</small></div>
          <div><span class="muted small">BMI</span><b>${round(bmi, 1)}</b></div>
        </div>
        ${weightChart(list.slice(-60))}
      </section>
      <section class="card">
        <h3>体重を記録</h3>
        <div class="row">
          <input type="date" value="${today()}" data-w-date class="date-input">
          <div class="input-unit"><input type="number" inputmode="decimal" step="0.1" data-w-kg placeholder="${round(latest, 1)}"><em>kg</em></div>
          <button class="btn primary" data-action="w-add">記録</button>
        </div>
        <p class="muted small">毎日同じタイミング(朝起きてトイレの後など)に測ると変化が分かりやすいです。</p>
      </section>
      <section class="card"><h3>履歴</h3>
        <ul class="food-list">${list.slice().reverse().map((w) => `<li><span>${fmtDate(w.date)}</span><span>${w.kg}kg <button class="icon-btn tiny" data-action="w-del" data-date="${w.date}">✕</button></span></li>`).join('')}</ul>
      </section>`;
  }

  // ----- 設定画面 -----
  function viewSettings() {
    const p = state.profile;
    const sexL = { male: '男性', female: '女性', other: '回答しない' }[p.sex];
    return `<h1 class="page-title">設定</h1>
      <section class="card"><h3>プロフィール</h3>
        <dl class="kv">
          <dt>目的</dt><dd>${GOALS[p.goal].label}</dd>
          <dt>性別・年齢</dt><dd>${sexL}・${p.age}歳</dd>
          <dt>身長・体重</dt><dd>${p.height}cm・${p.weight}kg(登録時)</dd>
          <dt>運動経験</dt><dd>${EXPERIENCE[p.experience].label}</dd>
          <dt>環境</dt><dd>${EQUIPMENT[p.equipment].label}</dd>
          <dt>頻度・時間</dt><dd>週${p.days}回・1回${p.minutes}分</dd>
          <dt>メニュー</dt><dd>${p.mode === 'split' ? '部位別' : 'おまかせ'}${p.focus.length ? '(' + p.focus.map((k) => PARTS[k]).join('・') + ')' : ''}</dd>
        </dl>
        <button class="btn primary" data-action="edit-profile">条件を変更してメニューを作り直す</button>
      </section>
      <p class="muted small">バージョン ${APP_VERSION}</p>
      <section class="card"><h3>データ</h3>
        <p class="muted small">データはこの端末のブラウザに保存されています。機種変更やブラウザ変更の前にはバックアップしてください。</p>
        <div class="row-btns">
          <button class="btn ghost" data-action="export">バックアップを作成</button>
          <button class="btn ghost" data-action="import-paste">バックアップから復元</button>
          <label class="btn ghost">ファイルから復元<input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
        <button class="btn danger" data-action="reset">すべてのデータを削除</button>
      </section>`;
  }

  // ---------- イベント ----------
  app.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const d = el.dataset;
    switch (a) {
      case 'tab': ui.tab = d.tab; render(); window.scrollTo(0, 0); break;

      case 'ob-set': {
        const v = d.value;
        ui.ob[d.field] = ['days', 'minutes'].includes(d.field) ? Number(v) : v;
        ui.obError = '';
        render(); break;
      }
      case 'ob-focus': {
        const f = ui.ob.focus;
        ui.ob.focus = f.includes(d.value) ? f.filter((x) => x !== d.value) : f.concat(d.value);
        ui.obError = ''; render(); break;
      }
      case 'ob-focus-all': ui.ob.focus = PART_KEYS.slice(); ui.obError = ''; render(); break;
      case 'ob-back': ui.obStep -= 1; ui.obError = ''; render(); break;
      case 'ob-cancel': ui.ob = null; ui.obStep = 0; ui.obError = ''; render(); break;
      case 'ob-next': {
        const err = validateStep();
        if (err) { ui.obError = err; render(); break; }
        if (ui.obStep === 4) finishOnboarding();
        else { ui.obStep += 1; render(); window.scrollTo(0, 0); }
        break;
      }
      case 'edit-profile':
        ui.ob = JSON.parse(JSON.stringify(state.profile));
        ui.ob.experience = String(ui.ob.experience);
        ui.obStep = 0; render(); window.scrollTo(0, 0); break;

      case 'swap': swapExercise(Number(d.day), Number(d.ex)); break;
      case 'start-day': {
        const s = state.plan.days[Number(d.day)];
        startSession(s, 'Day' + (Number(d.day) + 1) + ': ' + s.title);
        break;
      }
      case 'quick-part': {
        const q = ui.quick;
        q.parts = q.parts.includes(d.value) ? q.parts.filter((x) => x !== d.value) : q.parts.concat(d.value);
        render(); break;
      }
      case 'quick-min': ui.quick.minutes = Number(d.value); render(); break;
      case 'quick-build':
      case 'quick-reroll': {
        const q = ui.quick;
        if (!q.parts.length) { notify('部位を1つ以上選んでください'); break; }
        q.variant = a === 'quick-reroll' ? q.variant + 1 : 0;
        const parts = PART_KEYS.filter((k) => q.parts.includes(k));
        q.result = buildSession(parts, { profile: state.profile, minutes: q.minutes, focus: [], variant: q.variant });
        render(); break;
      }
      case 'start-quick': startSession(ui.quick.result, ui.quick.parts.map((k) => PARTS[k]).join('・')); break;

      case 'set-done': {
        const s = state.active.entries[Number(d.ei)].sets[Number(d.si)];
        s.done = !s.done; save(); render(); break;
      }
      case 'set-add': {
        const sets = state.active.entries[Number(d.ei)].sets;
        const last = sets[sets.length - 1];
        sets.push({ w: last ? last.w : '', r: '', done: false }); save(); render(); break;
      }
      case 'set-remove': state.active.entries[Number(d.ei)].sets.pop(); save(); render(); break;
      case 'active-discard':
        askConfirm('記録中の内容を破棄しますか？', () => { state.active = null; save(); render(); }, '破棄する');
        break;
      case 'active-save': {
        const act = state.active;
        const entries = act.entries.map((e) => ({ id: e.id, sets: e.sets.filter((s) => s.done || s.r !== '') .map((s) => ({ w: s.w, r: s.r })) })).filter((e) => e.sets.length);
        const doSave = () => {
          state.logs.unshift({ date: act.date, title: act.title, entries, note: act.note });
          state.logs.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
          state.active = null; ui.openLog = null; save(); render(); window.scrollTo(0, 0);
        };
        if (!entries.length) askConfirm('入力されたセットがありません。それでも保存しますか？', doSave, '保存する');
        else doSave();
        break;
      }
      case 'toggle-log': ui.openLog = ui.openLog === Number(d.li) ? null : Number(d.li); render(); break;
      case 'delete-log':
        askConfirm('この記録を削除しますか？', () => { state.logs.splice(Number(d.li), 1); ui.openLog = null; save(); render(); }, '削除する');
        break;

      case 'meal-date': ui.mealDate = shiftDate(ui.mealDate, Number(d.d)); ui.planPick = {}; render(); break;
      case 'food-cat': ui.foodCat = d.value; ui.foodQuery = ''; render(); document.getElementById('food-add').scrollIntoView(); break;
      case 'meal-cat': ui.mealCat = d.value; render(); document.getElementById('food-add').scrollIntoView(); break;
      case 'food-select': {
        const f = pickList()[Number(d.fi)];
        if (!f) break;
        ui.selFood = Object.assign({}, f); ui.selQty = 1;
        render();
        document.getElementById('sel-area').scrollIntoView({ block: 'nearest' });
        break;
      }
      case 'sel-qty': ui.selQty = Math.min(20, Math.max(0.5, ui.selQty + Number(d.d))); render(); break;
      case 'sel-cancel': ui.selFood = null; render(); break;
      case 'sel-add': {
        const f = ui.selFood; const q = ui.selQty;
        if (!f) break;
        ui.selFood = null; ui.foodQuery = '';
        addMeal({ name: f.name, unit: f.unit, qty: q, kcal: f.kcal * q, p: f.p * q, f: f.f * q, c: f.c * q });
        toast(f.name + (q !== 1 ? ' ×' + q : '') + ' を' + MEAL_CATS[ui.mealCat] + 'に追加しました');
        break;
      }
      case 'meal-view': ui.mealView = d.v; render(); window.scrollTo(0, 0); break;
      case 'plan-slot-toggle': {
        const cur = slotsFor(ui.mealDate);
        const next = cur.includes(d.value) ? cur.filter((x) => x !== d.value) : cur.concat(d.value);
        state.planSlots[ui.mealDate] = Object.keys(MEAL_CATS).filter((k) => next.includes(k));
        save(); render(); break;
      }
      case 'plan-slot-default':
        state.prefs.mealSlots = slotsFor(ui.mealDate).slice();
        delete state.planSlots[ui.mealDate];
        save(); render(); toast('いつも食べる食事を保存しました'); break;
      case 'plan-level': state.prefs.mealLevel = d.value; ui.planPick = {}; save(); render(); break;
      case 'plan-reroll': ui.planPick[d.slot] = (ui.planPick[d.slot] || 0) + 1; render(); break;
      case 'plan-log': {
        const sl = mealPlan().slots[d.slot];
        if (!sl) break;
        const list = state.meals[ui.mealDate] || (state.meals[ui.mealDate] = []);
        sl.items.forEach((it) => list.push({ cat: d.slot, name: it.name, unit: '', amount: it.amount, qty: 1, kcal: it.n[0], p: it.n[1], f: it.n[2], c: it.n[3] }));
        save(); render();
        toast(MEAL_CATS[d.slot] + 'に「' + sl.dish.name + '」の献立を記録しました');
        break;
      }
      case 'custom-del':
        askConfirm('マイ食品から削除しますか？', () => { state.customFoods.splice(Number(d.ci), 1); save(); render(); }, '削除する');
        break;
      case 'manual-add': {
        const get = (k) => app.querySelector(`[data-manual="${k}"]`).value;
        const name = get('name').trim();
        const kcal = num(get('kcal'));
        if (!name || kcal === null) { notify('名前とカロリーを入力してください'); break; }
        const food = { name, unit: '1食', kcal, p: num(get('p')) || 0, f: num(get('f')) || 0, c: num(get('c')) || 0 };
        if (app.querySelector('[data-manual-save]').checked && !state.customFoods.some((x) => x.name === name)) state.customFoods.unshift(food);
        const qty = 1;
        toast(name + ' を' + MEAL_CATS[ui.mealCat] + 'に追加しました');
        addMeal({ name, unit: food.unit, qty, kcal: food.kcal * qty, p: food.p * qty, f: food.f * qty, c: food.c * qty });
        break;
      }
      case 'meal-del': state.meals[ui.mealDate].splice(Number(d.i), 1); save(); render(); break;

      case 'w-add': {
        const date = app.querySelector('[data-w-date]').value || today();
        const kg = num(app.querySelector('[data-w-kg]').value);
        if (!kg || kg < 25 || kg > 250) { notify('体重を正しく入力してください(25〜250kg)'); break; }
        state.weights = state.weights.filter((x) => x.date !== date);
        state.weights.push({ date, kg });
        save(); render(); break;
      }
      case 'w-del':
        state.weights = state.weights.filter((x) => x.date !== d.date); save(); render(); break;

      case 'export': {
        const json = JSON.stringify(state);
        showModal('<h3>バックアップ</h3><p class="small">下の文字列をコピーして、メモアプリなどに保存してください。復元するときは「バックアップから復元」に貼り付けます。</p>' +
          '<textarea id="backup-text" rows="6" readonly>' + esc(json) + '</textarea>' +
          '<div class="modal-actions"><button class="btn ghost" data-modal="close">閉じる</button><button class="btn ghost" data-backup="file">ファイルで保存</button><button class="btn primary" data-backup="copy" data-modal-focus>コピー</button></div>',
          (wrap) => {
            const ta = wrap.querySelector('#backup-text');
            wrap.querySelector('[data-backup="copy"]').addEventListener('click', (e) => {
              const b = e.currentTarget;
              const done = () => { b.textContent = 'コピーしました'; };
              const fallback = () => { ta.focus(); ta.select(); b.textContent = '選択しました。長押しでコピー'; };
              try { navigator.clipboard.writeText(json).then(done, fallback); } catch (err) { fallback(); }
            });
            wrap.querySelector('[data-backup="file"]').addEventListener('click', () => {
              const link = document.createElement('a');
              link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
              link.download = 'fitness-backup-' + today() + '.json';
              link.click();
              setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            });
          });
        break;
      }
      case 'import-paste':
        showModal('<h3>バックアップから復元</h3><p class="small">保存しておいたバックアップの文字列を貼り付けてください。現在のデータは上書きされます。</p>' +
          '<textarea id="restore-text" rows="6"></textarea><p class="error small" id="restore-err" hidden>バックアップを読み込めませんでした。文字列全体を貼り付けたか確認してください。</p>' +
          '<div class="modal-actions"><button class="btn ghost" data-modal="close">キャンセル</button><button class="btn primary" data-restore>復元する</button></div>',
          (wrap) => {
            wrap.querySelector('[data-restore]').addEventListener('click', () => {
              if (restoreFrom(wrap.querySelector('#restore-text').value)) closeModal();
              else wrap.querySelector('#restore-err').hidden = false;
            });
          });
        break;
      case 'reset':
        askConfirm('プロフィール・記録・食事など、すべてのデータを削除します。よろしいですか？', () => {
          state = defaultState(); save(); ui.ob = null; ui.obStep = 0; ui.tab = 'menu'; render();
        }, 'すべて削除');
        break;
    }
  });

  function addMeal(item) {
    const list = state.meals[ui.mealDate] || (state.meals[ui.mealDate] = []);
    list.push(Object.assign({ cat: ui.mealCat }, item));
    save(); render();
  }

  app.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.obInput) { ui.ob[t.dataset.obInput] = t.value; return; }
    if (t.dataset.set) {
      const [ei, si, k] = t.dataset.set.split(':');
      state.active.entries[Number(ei)].sets[Number(si)][k] = t.value; save(); return;
    }
    if (t.hasAttribute('data-active-note')) { state.active.note = t.value; save(); return; }
    if (t.hasAttribute('data-food-query')) {
      // 入力欄ごと描き直すと日本語入力中に文字が二重になるので、候補リストだけ更新する
      // 変換中は触らず、確定(compositionend)したときに更新する
      if (ev.isComposing) return;
      updateFoodPick(t);
    }
  });

  function updateFoodPick(input) {
    ui.foodQuery = input.value;
    const list = app.querySelector('.food-pick');
    if (list) list.innerHTML = foodPickItems();
  }
  app.addEventListener('compositionend', (ev) => {
    if (ev.target.hasAttribute && ev.target.hasAttribute('data-food-query')) updateFoodPick(ev.target);
  });

  app.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.hasAttribute('data-active-date')) { state.active.date = t.value || today(); save(); return; }
    if (t.hasAttribute('data-import') && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        askConfirm('現在のデータを上書きして復元しますか？', () => {
          if (!restoreFrom(reader.result)) notify('バックアップファイルを読み込めませんでした');
        }, '復元する');
      };
      reader.readAsText(t.files[0]);
      t.value = '';
    }
  });

  function restoreFrom(text) {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !('profile' in data)) return false;
      state = Object.assign(defaultState(), data); save(); ui.ob = null; ui.tab = 'menu'; render();
      return true;
    } catch (e) { return false; }
  }

  render();
})();
