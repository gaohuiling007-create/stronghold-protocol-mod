// 结城理 (chess_char_4217_makoto, 傀儡师 dollkeeper, 阶 III) attack-range regression.
//
// 口径 (what this file freezes — the previous revision asserted the two behaviours that were later corrected):
//   1. 本体 form = range_table `1-1` = **2 tiles** (`10,4 10,5` at row 10, col 4, dir RIGHT). That is the 傀儡师 职业统一
//      口径 (风丸 / 归溟幽灵鲨 carry the same 2-tile 本体), NOT a bug and NOT the mask's range. `rangeGrid` / `rangeKeys` /
//      `baseRangeKeys` are those 2 tiles in the 本体 form.
//   2. 结城理's OWN 人格面具 / 不羁之力 range is the OFFICIAL range_table `x-1` = **13 tiles** (菱形 3-3-3-3 + the centring
//      row's 5, 正前方 2nd tile (10,6) included, (9,2)/(11,2) NOT). All three of his skills AND both talents are `rangeId`
//      x-1 (风丸 / 归溟幽灵鲨's <替身> form is `x-4` = 3×3 instead).
//   3. That 13-tile net exists **only inside the <替身> state**:
//        - S1 / S2 are 手动 skills whose cast is what enters the state ("主动：立即切换为<替身>状态作战"). They are
//          authored as `duration` skills whose `duration` is the 特性's own bb.duration (20 s) — the skill bar IS the
//          <替身> timer (see 6.) — and their registered trigger range (addTriggerRange) is gated on `unit.trait.doll`,
//          so in the 本体 form the net neither widens the range nor satisfies the DEFAULT 技能策略: an enemy 2 tiles
//          ahead (10,6) is inside x-1 and outside the 本体 2 tiles, and must NOT make them cast.
//        - entering the state sets `unit.rangeGrid` = the 13-tile net (`battle.refreshRange`); the 本体 2 tiles come back
//          when the LAST phase of the state ends (item 5), never before.
//        - S3 needs no trigger gate: its own `targeting.rangeGrid` IS the x-1 net, so the engine's live range covers the
//          mask while the skill runs.
//   4. Inside the state HP = 本体 maxHp × 1.35 (不羁之力 生命值+35 %, over the profession's 0.5 substitute share).
//   5. The state machine is TWO 20 s states, not one (user's rule: "先只攻击，技能结束或者被击杀切换治疗，这时候是新的技能
//      条，技能条结束切换为正常状态" / "塔纳托斯 20 秒；击杀/致命伤后俄耳甫斯再重新跑完整的 20 秒"):
//        塔纳托斯 20 s（13 格网）→ 到期、或在替身态内吃到致命伤 → 俄耳甫斯，**全新的 20 s**（仍是 13 格网）
//        → 俄耳甫斯自己的 20 s 到期 → 回本体（rangeGrid 2 格、form null、HP 回满）。
//      So "20 s and then back to the 本体" is TRUE of the 俄耳甫斯 phase only: the 塔纳托斯 phase relays into a fresh
//      state instead (kits/tier3.js `mem.makotoRelay` 1 = 塔纳托斯 ran, 2 = the 俄耳甫斯 half).
//   6. **技能条 = <替身> 剩余时间** (the user's 口径, added by the fix this file now freezes): all three skills are
//      authored as `duration` skills of the 特性's 20 s even though the data declares them 瞬发 (duration 0 /
//      durationType NONE — the 20 s belong to `char_4217_makoto.trait` "持续20秒后自身再次替换<替身>"). The client bar
//      fills `sp / spCost` and only tints it with `UF.SKILL` (public/js/render/units.js), so an instant skill shows an
//      empty idle bar while the <替身> runs; as `duration` the bar is the state's timer (snapshot.js unitTuple sends
//      `spCost × timeLeft / duration`). S3 is NOT ammo: its data carries no `attack@trigger_time` (the old `?? 31` was
//      invented) and its passive runs "直到<替身>状态结束". The relay re-activates the same skill (free, reason
//      'relay') so the 俄耳甫斯 half gets its OWN fresh 20 s bar, and 阻回 keeps `sp` at 0 while a bar runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';
import { COLS } from '../../server/sim/constants.js';
import { UF } from '../../shared/constants.js';
import KITS from '../../server/sim/content/kits/tier3.js';
import { DOLL_SWITCH } from '../../server/sim/professions.js';

const ds = getDefaultSource();
const KEY = 'chess_char_4217_makoto';
const A = 'chess_char_4217_makoto_a';
const B = 'chess_char_4217_makoto_b';
const S1 = 'skchr_makoto_1', S2 = 'skchr_makoto_2', S3 = 'skchr_makoto_3';
const IDX = (id, skillId) => ds.rawChess(id).skills.find((s) => s.skillId === skillId).index;
/** Def of `id` with `skillId` selected. */
const LD = (id, skillId) => ds.getChess(id, { skillIndex: IDX(id, skillId) });
/** The <替身> duration as the DATA carries it (特性 bb.duration, professions.js dollkeeper `dollDuration`) — never 20. */
const DOLL = ds.rawChess(A).trait.bb.duration;
/** The skill-bar flag the client tints with (render/units.js `flags & UF.SKILL`), from a live snapshot. */
const snapOf = (h, u) => (h.snapshot().units || []).find((x) => x[0] === u.id) ?? [];

/** Official range_table "x-1" (13 tiles, facing-RIGHT offsets); also what data/chess.json carries for all 3 skills. */
const X1 = [[2, 0], [1, -1], [1, 0], [1, 1], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, -1], [-1, 0], [-1, 1], [-2, 0]];
/** The 9 surrounding tiles the kit used to hard-code for 结城理 (file-level `NINE`). */
const NINE9 = [[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]];
const keysOf = (grid, r = 10, c = 4, d = 'RIGHT') => new Set(absoluteRangeKeys(grid, r, c, d, 0));
const rcOf = (keys) => [...keys].map((k) => `${(k / COLS) | 0},${k % COLS}`).sort();
const X1_AT_10_4 = rcOf(keysOf(X1));
const NINE_AT_10_4 = rcOf(keysOf(NINE9));
/** The 本体 1-1 net (傀儡师 职业统一口径) at (10,4) RIGHT. */
const BODY_AT_10_4 = ['10,4', '10,5'];

const dummy = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 0, def: 0, res: 0, ...o });
/** Enemy records for `keys` and their spawn entries at `positions` ([row, col]). */
const mobs = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`e${i}`, dummy(`e${i}`)]));
const at = (...positions) => positions.map(([r, c], i) => ({ key: `e${i}`, pos: [r, c] }));
/** Damage events `u` dealt to the enemy standing on `pos`. */
const hitsOn = (h, u, pos) => {
  const e = h.b.enemies.find((x) => x.alive && x.tileR === pos[0] && x.tileC === pos[1]);
  return h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
};
/**
 * `u`'s 塔纳托斯-tagged damage events grouped by the attack that dealt them: `Battle._attackSeq` is not on the `damaged`
 * ctx, but every victim of one attack is hit at the SAME battle time (`performAttack` resolves them in one pass), so the
 * event time is the attack. Map<timeString, events>, insertion-ordered. Used to assert the PER-ATTACK cap.
 */
const groupByAttack = (u, damaged) => {
  const out = new Map();
  for (const c of damaged) {
    if (c.source !== u || !c.dmg?.tags?.includes('makoto')) continue;
    const k = c.t.toFixed(6);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(c);
  }
  return out;
};

test('makoto range x-1: the official 13-tile grid is what the data carries (rangeId x-1 on all 3 skills + both talents)', () => {
  for (const id of [A, B]) {
    const d = ds.getChess(id);
    // 本体 1-1 = 2 tiles is the 傀儡师 class-wide 口径 (风丸/归溟幽灵鲨 too): untouched, not the mask's range
    assert.deepEqual(rcOf(keysOf(d.rangeGrid)), BODY_AT_10_4, `${id} 本体 stays 1-1`);
    assert.equal(d.raw.rangeId, '1-1');
    for (const sid of [S1, S2, S3]) {
      assert.equal(ds.rawChess(id).skills.find((s) => s.skillId === sid).rangeId, 'x-1', `${id} ${sid} rangeId`);
      const g = LD(id, sid).skill.rangeGrid;
      assert.equal(g.length, 13, `${id} ${sid} rangeGrid`);
      assert.deepEqual(rcOf(keysOf(g)), X1_AT_10_4, `${id} ${sid} rotated x-1`);
    }
    // both talents point at x-1 (their `talent.rangeGrid` slot is null in data/chess.json, so it is bb.range_id)
    assert.equal(d.talents[0].bb.range_id, 'x-1', '不羁之力');
    assert.equal(d.talents[1].bb.range_id, 'x-1', 'S.E.E.S.队长');
    // and the derived net is exactly the official one: it adds only the 4 tiles NINE was missing, drops none
    const extra = X1_AT_10_4.filter((k) => !NINE_AT_10_4.includes(k));
    assert.deepEqual(extra, ['10,2', '10,6', '12,4', '8,4'], 'x-1 ⊃ NINE: the 正前方 2nd tile + the diamond tips');
    assert.deepEqual(NINE_AT_10_4.filter((k) => !X1_AT_10_4.includes(k)), [], 'x-1 keeps every NINE tile');
  }
});

test('makoto range x-1 (assert A/C): the 13-tile net is the <替身> form\'s range — S3\'s targeting grid, and S1/S2\'s trigger only in the state', () => {
  for (const id of [A, B]) {
    // --- S3: its own `targeting.rangeGrid` IS the x-1 net, so the engine's live range is the 13 tiles while the skill runs
    {
      const d = LD(id, S3);
      const spec = KITS[KEY](d.skill.bb, d.raw, d).skills[S3];
      // 时长型 (item 6): the bar is the <替身> timer. The data's S3 has no `attack@trigger_time` at all — the old
      // `?? 31` ammo count was invented, and a 31-attack bar ran straight through the 塔纳托斯→俄耳甫斯 relay.
      assert.equal(spec.kind, 'duration', `${id} S3 duration (the bar is the <替身> timer, not ammo)`);
      assert.equal(spec.duration, DOLL, `${id} S3 duration = the 特性's <替身> duration`);
      assert.equal(spec.ammo, undefined, `${id} S3 keeps no ammo count`);
      assert.equal(d.skill.bb['attack@trigger_time'], undefined, `${id} S3's own blackboard has no attack@trigger_time`);
      assert.equal(spec.targeting.rangeGrid.length, 13, `${id} S3 targeting grid`);
      assert.deepEqual(rcOf(keysOf(spec.targeting.rangeGrid)), X1_AT_10_4, `${id} S3 targeting grid is x-1`);
      assert.equal(spec.targeting.maxTargets, Math.floor(d.skill.bb['attack@max_target']), `${id} S3 maxTargets`);
      const h = makeBattle({
        defs: { enemies: mobs(1) }, timeLimit: 30, autoFinish: false,
        units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, S3), carryState: { sp: 999 } }],
        enemies: at([8, 2]), // outside x-1: nothing to cast at, so the S3 bar is activated by hand
      });
      const u = h.unit(id);
      h.step();
      assert.deepEqual(rcOf(new Set(u.rangeKeys)), BODY_AT_10_4, `${id} 本体 range before the S3 cast`);
      assert.deepEqual(rcOf(new Set(u.baseRangeKeys)), BODY_AT_10_4, `${id} 本体 baseRangeKeys before the S3 cast`);
      assert.equal(u.skill.activate('test'), true);
      h.step();
      const live = rcOf(new Set(u.rangeKeys));
      assert.equal(live.length, 13, `${id} S3 live rangeKeys`);
      assert.deepEqual(live, X1_AT_10_4);
      assert.ok(live.includes('10,6'), 'the 正前方 2nd tile (the tile the old hard-coded 9-tile net was missing)');
      assert.ok(!live.includes('9,2') && !live.includes('11,2'), 'no (row≠0, col=−2) tile: x-1 is a diamond, not a 5×5');
    }
    // --- S1 / S2: the mask's x-1 net is their registered trigger range, gated on the <替身> state — in the 本体 form it
    // reports NO tiles at all (so the DEFAULT 技能策略 sees the ordinary 1-1). Both are 时长型 skills of the 特性's 20 s
    // (item 6 — the cast is what enters <替身>, and the bar then runs as long as the state does)
    for (const sid of [S1, S2]) {
      const d = LD(id, sid);
      const spec = KITS[KEY](d.skill.bb, d.raw, d).skills?.[sid] ?? KITS[KEY](d.skill.bb, d.raw, d).skill;
      assert.equal(spec.kind, 'duration', `${id} ${sid} duration (the bar is the <替身> timer)`);
      assert.equal(spec.duration, DOLL, `${id} ${sid} duration = the 特性's <替身> duration`);
      assert.equal(spec.targeting, undefined, `${id} ${sid} keeps no targeting override (its hit resolves in onStart)`);

      const g = makeBattle({
        defs: { enemies: mobs(1) }, timeLimit: 30, autoFinish: false,
        units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, sid), carryState: { sp: 999 } }],
        enemies: at([10, 6]), // inside x-1, outside the 本体 2 tiles
      });
      const v = g.unit(id);
      g.step();
      assert.equal(v.skill.triggerRanges.length, 1, `${id} ${sid} registers exactly one trigger range`);
      assert.equal(v.skill.triggerRanges[0](g.b, v).length, 0, `${id} ${sid} 本体: the mask net is not a trigger`);
      assert.ok(!v.trait.doll, `${id} ${sid} still 本体`);

      const h = makeBattle({
        defs: { enemies: mobs(1) }, timeLimit: 30, autoFinish: false,
        units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, sid), carryState: { sp: 999 } }],
        enemies: at([10, 5]), // inside the 本体 2 tiles: the DEFAULT cast enters the <替身> state
      });
      const u = h.unit(id);
      h.step();
      assert.ok(u.trait.doll, `${id} ${sid} cast entered the <替身> state`);
      const lists = u.skill.triggerRanges[0](h.b, u);
      assert.equal(lists.length, 1, `${id} ${sid} 替身: one list`);
      const keys = new Set(lists[0]);
      assert.equal(keys.size, 13, `${id} ${sid} 替身 trigger net`);
      assert.deepEqual(rcOf(keys), X1_AT_10_4, `${id} ${sid} 替身 trigger net is x-1`);
      assert.ok(rcOf(keys).includes('10,6'));
      assert.ok(!rcOf(keys).includes('9,2') && !rcOf(keys).includes('11,2'));
    }
  }
});

test('makoto range x-1 (assert B): S2 never casts for an enemy only on (10,6); from (10,5) it enters <替身>, whose 13-tile net covers (10,6)', () => {
  for (const id of [A, B]) {
    // (a) 本体 = 2 tiles: the enemy 2 tiles ahead is inside x-1 but outside the 本体 range and nothing blocks it, so the
    // DEFAULT 技能策略 ("about to attack") is never satisfied and S2 must stay un-cast (measured: 0 activations)
    const a = makeBattle({
      defs: { enemies: mobs(1) }, timeLimit: 30, hooks: ['damaged'], captureNoisy: true, seed: 5, autoFinish: false,
      units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, S2), carryState: { sp: 999 } }],
      enemies: at([10, 6]),
    });
    const ua = a.unit(id);
    a.step();
    a.run(20);
    assert.equal(ua.skill.activations, 0, `${id} S2 must not auto-cast for an enemy only on (10,6)`);
    assert.ok(!ua.trait.doll, `${id} no <替身> from a non-cast`);
    assert.equal(ua.form, null);
    assert.equal(ua.rangeGrid.length, 2, `${id} 本体 rangeGrid stays 2 tiles`);
    assert.deepEqual(rcOf(new Set(ua.rangeKeys)), BODY_AT_10_4, `${id} 本体 rangeKeys stay 2 tiles`);
    assert.deepEqual(rcOf(new Set(ua.baseRangeKeys)), BODY_AT_10_4, `${id} 本体 baseRangeKeys stay 2 tiles`);
    assert.ok(!ua.findBuff('trait:substitute') && !ua.findBuff('makoto:mask'), `${id} no mask state`);
    assert.equal(hitsOn(a, ua, [10, 6]).length, 0, `${id} no damage in the 本体 form`);

    // (b) an enemy inside the 本体 2 tiles DOES cast: the cast enters <替身> (塔纳托斯) and the mask's own 13-tile net
    // becomes the live range — including (10,6), which the 本体 range could never reach
    const b = makeBattle({
      defs: { enemies: mobs(2) }, timeLimit: 30, hooks: ['damaged', 'skillStart'], captureNoisy: true, seed: 5, autoFinish: false,
      units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, S2), carryState: { sp: 999 } }],
      enemies: at([10, 5], [10, 6]),
    });
    const u = b.unit(id);
    b.step();
    assert.ok(b.runUntil(() => u.skill.activations >= 1, 8), `${id} S2 casts with an enemy on (10,5)`);
    b.run(0.5);
    // "S2 must not auto-cast again": the counter to read is the REAL casts (reason 'DEFAULT' / manual), because the
    // relay's own fresh bar is an extra `activate(reason 'relay')` — upstream v0.1.3's `dollSwitch` handler
    // (professions.js `startSwitch`) ends the running skill, so kits/tier3.js `restartBar` pulls the bar back with one
    // bookkeeping activation of the same skill (its `onStart` early-returns on that reason). `activations` is therefore
    // 2 for one cast; what has to stay 1 is the number of casts for the (10,6)-only enemy.
    assert.equal(b.hooksOf('skillStart').filter((c) => c.reason !== 'relay').length, 1, `${id} S2 must not auto-cast for an enemy only on (10,6)`);
    assert.ok(u.trait.doll, `${id} <替身> entered`);
    assert.equal(u.mem.makotoMask, 'thanatos');
    assert.equal(u.form, 'doll2');
    assert.ok(u.findBuff('trait:substitute') && u.findBuff('makoto:mask'), `${id} substitute + mask buffs`);
    assert.equal(u.rangeGrid.length, 13, `${id} <替身> rangeGrid is the 13-tile net`);
    const live = rcOf(new Set(u.rangeKeys));
    assert.deepEqual(live, X1_AT_10_4, `${id} <替身> live range is x-1`);
    assert.ok(live.includes('10,6'), 'the 正前方 2nd tile is in the mask net');
    assert.ok(Math.abs(u.hp - u.base.maxHp * 1.35) < 1e-6, `${id} 替身态 HP = 本体 maxHp × 1.35`);
    // The mask's damage is its rewritten ORDINARY attack (kits/tier3.js header: the 被动 is the normal attack, not a hit
    // fired by the cast), so it lands on the mask's own 攻击间隔: BAT 1.2 + 不羁之力 base_attack_time 0.4 = 1.6 s, the first
    // one after the 1 s `dollSwitch` animation (measured: t = 1.6). The old `run(0.5)` fitted a cast-time burst.
    assert.ok(b.runUntil(() => hitsOn(b, u, [10, 6]).length > 0, 3), `${id} 塔纳托斯's attack reaches the (10,6) enemy`);
    assert.ok(hitsOn(b, u, [10, 5]).length >= 1, `${id} 塔纳托斯 hit the (10,5) enemy`);
    assert.ok(hitsOn(b, u, [10, 6]).length >= 1, `${id} 塔纳托斯 also hit the (10,6) enemy — the 13-tile net is really live`);
    assert.equal(b.b.errors.length, 0, `${id} no content errors`);
  }
});

test('makoto range x-1 (assert D): no maxTargets regression — S1 is single-target, S2/S3 take attack@max_target', () => {
  for (const [id, targets] of [[A, 3], [B, 4]]) {
    const d2 = LD(id, S2);
    assert.equal(Math.floor(d2.skill.bb['attack@max_target']), targets, `${id} S2 attack@max_target`);
    assert.equal(Math.floor(LD(id, S3).skill.bb['attack@max_target']), targets, `${id} S3 attack@max_target`);
    assert.equal(LD(id, S1).skill.bb['attack@max_target'], undefined, `${id} S1 has no max_target`);

    const kit = KITS[KEY](d2.skill.bb, d2.raw, d2);
    assert.equal(kit.skill.kind, 'duration', 'default skill = S2, 时长型 (its bar is the <替身> timer)');
    assert.equal(kit.skill.duration, DOLL, 'S2 duration = the 特性 <替身> duration');
    assert.equal(kit.skill.targeting, undefined, 'S2 keeps no targeting override (its hit resolves in onStart)');
    assert.equal(kit.skills[S1].kind, 'duration', 'S1 时长型 (same bar)');
    assert.equal(kit.skills[S1].duration, DOLL, 'S1 duration = the 特性 <替身> duration');
    assert.equal(kit.skills[S1].targeting, undefined, 'S1 stays single-target: no maxTargets anywhere');
    assert.equal(kit.skills[S3].kind, 'duration', 'S3 时长型 (NOT ammo: no attack@trigger_time in the data)');
    assert.equal(kit.skills[S3].duration, DOLL, 'S3 duration = the 特性 <替身> duration');
    assert.equal(kit.skills[S3].targeting.maxTargets, targets, `${id} S3 maxTargets unchanged (from attack@max_target)`);
    assert.equal(kit.skills[S3].targeting.allInRange, false, `${id} S3 allInRange unchanged`);
    assert.equal(kit.skills[S3].ammo, undefined, `${id} S3 has no ammo count (the old 31 was a fallback, not data)`);
    // functional S2: 6 enemies inside x-1 (one of them on the 本体 2 tiles, so the DEFAULT cast happens) ⇒ exactly
    // attack@max_target of them take the 塔纳托斯 hit
    const pos = [[11, 3], [9, 3], [10, 5], [10, 6], [8, 4], [12, 4]];
    const h = makeBattle({
      defs: { enemies: mobs(6) }, timeLimit: 30, hooks: ['damaged'], captureNoisy: true, seed: 5, autoFinish: false,
      units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, S2), carryState: { sp: 999 } }],
      enemies: at(...pos),
    });
    const u = h.unit(id);
    h.step();
    assert.ok(h.runUntil(() => u.skill.activations >= 1, 8), `${id} S2 cast with 6 candidates`);
    // The 被动 rewrites the mask's ORDINARY attack (kits/tier3.js header), so after the 1 s `dollSwitch` animation the
    // mask attacks once per its own 攻击间隔 (BAT 1.2 + 不羁之力 0.4 = 1.6 s) for as long as the bar runs. ONE attack takes
    // exactly attack@max_target of the 6 candidates; a later attack may take the same or another set, so the frozen
    // numbers are per ATTACK, not over the whole run (`hitsOn` was the old cast-time burst).
    assert.ok(h.runUntil(() => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('makoto')).length > 0, 3),
      `${id} 塔纳托斯's rewritten ordinary attack fired`);
    for (const [t, chunk] of groupByAttack(u, h.hooksOf('damaged')).entries()) {
      assert.equal(chunk.length, targets, `${id} S2 attack at t=${t} hits exactly attack@max_target enemies`);
      assert.equal(new Set(chunk.map((c) => c.target)).size, targets, `${id} distinct enemies at t=${t}`);
      for (const c of chunk) {
        assert.ok(Math.abs(c.amount - u.s.atk * d2.skill.bb['attack@atk_scale']) < 1e-6, `${id} S2 damage = ATK × ${d2.skill.bb['attack@atk_scale']}`);
        assert.equal(c.type, 'arts', `${id} S2 damage type is 法术`);
      }
    }

    // functional S1: one enemy on the 本体 2 tiles casts it (the others are only inside the mask net) ⇒ the mask's single
    // -target ordinary attack hits one enemy per attack at attack@atk_scale × ATK (no ally is hurt, so the 50 %-HP heal
    // alternative of "改为对其治疗" is not taken)
    const g = makeBattle({
      defs: { enemies: mobs(3) }, timeLimit: 30, hooks: ['damaged'], captureNoisy: true, seed: 5, autoFinish: false,
      units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, S1), carryState: { sp: 999 } }],
      enemies: at([10, 5], [10, 6], [9, 3]),
    });
    const v = g.unit(id);
    g.step();
    assert.ok(g.runUntil(() => v.skill.activations >= 1, 8), `${id} S1 cast with an enemy on (10,5)`);
    assert.ok(g.runUntil(() => g.hooksOf('damaged').filter((c) => c.source === v && c.dmg?.tags?.includes('makoto')).length > 0, 3),
      `${id} S1's rewritten ordinary attack fired`);
    for (const [t, chunk] of groupByAttack(v, g.hooksOf('damaged')).entries()) {
      assert.equal(chunk.length, 1, `${id} S1 is single-target (3 candidates in the mask net), attack at t=${t}`);
      assert.ok(Math.abs(chunk[0].amount - v.s.atk * LD(id, S1).skill.bb['attack@atk_scale']) < 1e-6, `${id} S1 damage`);
      assert.equal(chunk[0].type, 'arts', `${id} S1 damage type is 法术`);
    }
  }
});

test('makoto range x-1: the mask net does not leak into the 本体 range (本体 = 傀儡师 1-1 = 2 tiles)', () => {
  for (const id of [A, B]) {
    const h = makeBattle({
      defs: { enemies: mobs(1) }, timeLimit: 30, hooks: ['damaged'], captureNoisy: true, seed: 5, autoFinish: false,
      units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, S2), carryState: { sp: 999 } }],
      enemies: at([10, 6]), // inside x-1, outside the 本体 2 tiles
    });
    const u = h.unit(id);
    h.step();
    assert.equal(u.rangeGrid.length, 2, `${id} 本体 rangeGrid = 1-1`);
    assert.deepEqual(rcOf(new Set(u.rangeKeys)), BODY_AT_10_4, `${id} 本体 rangeKeys = 1-1`);
    assert.deepEqual(rcOf(new Set(u.baseRangeKeys)), BODY_AT_10_4, `${id} 本体 baseRangeKeys = 1-1`);
    assert.ok(!u.trait.doll && u.form === null, `${id} 本体 form`);
    // 10 s with an enemy that only the mask's net could reach: no cast, no widening at all
    h.run(10);
    assert.equal(u.skill.activations, 0, `${id} the 13-tile net does not satisfy the 本体 DEFAULT strategy`);
    assert.deepEqual(rcOf(new Set(u.rangeKeys)), BODY_AT_10_4, `${id} rangeKeys untouched by the net`);
    assert.equal(hitsOn(h, u, [10, 6]).length, 0, `${id} no damage from the 本体 form`);
    // cast by hand: the net is the SKILL/state's range — and the enemy the 本体 range could not reach is hit through it
    h.step();
    assert.equal(u.skill.activate('test'), true, `${id} S2 cast by hand`);
    h.step();
    assert.equal(u.rangeGrid.length, 13, `${id} the net is the range only while the mask runs`);
    assert.deepEqual(rcOf(new Set(u.rangeKeys)), X1_AT_10_4, `${id} the mask range while the skill runs`);
    // The mask reaches it with its rewritten ORDINARY attack, one 攻击间隔 after the 1 s `dollSwitch` animation (measured
    // t = 1.6: BAT 1.2 + 不羁之力 0.4) — not with a hit fired by the cast.
    assert.ok(h.runUntil(() => hitsOn(h, u, [10, 6]).length >= 1, 3), `${id} the mask reaches (10,6)`);
    assert.equal(h.b.errors.length, 0, `${id} no content errors`);
  }
});

test('makoto: 塔纳托斯\'s 20 s relays into a FRESH 俄耳甫斯 <替身> (still 13 tiles), whose own 20 s returns the 本体 2 tiles', () => {
  for (const id of [A, B]) {
    const h = makeBattle({
      // The lone enemy dies to 塔纳托斯's own first hit. That keeps the two phases below deterministic: once it is gone
      // NOTHING can satisfy the 本体 DEFAULT strategy again, so no later S2 re-cast can re-enter <替身> and no assertion
      // here depends on a cumulative clock (both transitions are reached with `runUntil`, not with a fixed run length).
      defs: { enemies: { e0: dummy('e0', { hp: 10 }) } }, timeLimit: 90, hooks: ['damaged'], captureNoisy: true, seed: 5,
      autoFinish: false,
      units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(id, S2), carryState: { sp: 999 } }],
      enemies: at([10, 5]), // inside the 本体 2 tiles: this is what makes the DEFAULT 技能策略 cast S2 at all
    });
    const u = h.unit(id);
    h.step();
    assert.ok(h.runUntil(() => u.skill.activations >= 1, 8), `${id} S2 cast from the 本体 2 tiles`);
    h.step();
    // --- 塔纳托斯 phase: <替身> + the mask's own 13-tile net
    assert.ok(u.trait.doll, `${id} <替身> entered`);
    assert.equal(u.mem.makotoMask, 'thanatos');
    assert.equal(u.mem.makotoRelay, 1, `${id} the 塔纳托斯 half of the relay`);
    assert.equal(u.rangeGrid.length, 13, `${id} 塔纳托斯 rangeGrid = 13 tiles`);
    assert.deepEqual(rcOf(new Set(u.rangeKeys)), X1_AT_10_4, `${id} 塔纳托斯 rangeKeys = x-1`);
    assert.ok(!h.enemies().length, `${id} the trigger enemy died to the 塔纳托斯 hit`);

    // --- assert A (item 6): the CAST starts a 时长型 bar that IS the <替身> timer, and the client bit that tints the bar
    // (`UF.SKILL`, render/units.js `flags & UF.SKILL`) is set; snapshot.js sends the draining `spCost × timeLeft/duration`
    // Timing note (upstream v0.1.3 semantics): the switch to <替身> runs a 1 s animation (`professions.js DOLL_SWITCH`)
    // during which the old bar has been ended by `startSwitch()`. The kit re-activates the bar once the animation is over
    // (`trait:dollSwitching` gone), so the bar's own lifetime is exactly the <替身> remaining time. The assertions below
    // therefore run one animation later — the numbers stay just as strict.
    assert.ok(h.runUntil(() => !u.findBuff('trait:dollSwitching'), 3), `${id} A: the switch animation finished`);
    assert.equal(u.skill.active, true, `${id} A: skill active once the <替身> state has begun`);
    assert.equal(u.skill.isTimed, true, `${id} A: skill is timed`);
    assert.equal(u.skill.duration, DOLL, `${id} A: skill duration = the <替身> duration`);
    assert.equal(u.skill.kind, 'duration', `${id} A: skill kind`);
    const snapA = snapOf(h, u);
    assert.ok(snapA[7] & UF.SKILL, `${id} A: snapshot UF.SKILL set (the client paints the active bar)`);
    assert.equal(snapA[6], u.skill.spCost, `${id} A: snapshot spMax = spCost`);
    assert.ok(snapA[5] > u.skill.spCost * 0.9, `${id} A: the bar starts full (${snapA[5]}/${snapA[6]})`);

    // --- assert D (item 6): 阻回 — a running bar gains no SP, so the fill is the timer and nothing else
    const spSeen = [];
    for (let i = 0; i < 4; i++) { spSeen.push(u.skill.sp); h.run(4); assert.ok(u.trait.doll, `${id} D: still <替身>`); }
    assert.deepEqual(spSeen, [0, 0, 0, 0], `${id} D: sp stays 0 while the bar runs (阻回)`);
    assert.equal(u.skill.active, true, `${id} D: the bar is still the running one`);
    const snapD = snapOf(h, u);
    assert.ok(snapD[7] & UF.SKILL && snapD[5] < snapD[6], `${id} D: snapshot drains (${snapD[5]}/${snapD[6]}) with UF.SKILL set`);

    // --- 塔纳托斯's 20 s run out: the relay enters 俄耳甫斯 with a FRESH 20 s (not a return to the 本体)
    assert.ok(h.runUntil(() => u.mem.makotoRelay === 2, 30), `${id} relayed to 俄耳甫斯`);
    assert.ok(u.trait.doll, `${id} doll stays true across the relay`);
    assert.equal(u.mem.makotoMask, 'orpheus', `${id} the mask switched to 俄耳甫斯`);
    assert.equal(u.rangeGrid.length, 13, `${id} the relay keeps the 13-tile net`);
    assert.deepEqual(rcOf(new Set(u.rangeKeys)), X1_AT_10_4, `${id} still x-1`);
    const sub = u.findBuff('trait:substitute');
    // upstream v0.1.3 builds the state's buff as `DOLL_SWITCH + dollDuration` (professions.js: the 1 s switch animation
    // plus the 特性's 20 s), so a freshly entered relay reads DOLL_SWITCH + DOLL seconds left.
    assert.ok(sub && sub.timeLeft > DOLL && sub.timeLeft <= DOLL_SWITCH + DOLL,
      `${id} the relay reset the substitute to a fresh ${DOLL} s (+${DOLL_SWITCH}s switch) (${sub?.timeLeft})`);
    // --- assert B (item 6): the P2 half has its OWN fresh bar, not the remainder of the P1 one
    assert.equal(u.skill.active, true, `${id} B: the skill re-activated for the 俄耳甫斯 half`);
    assert.equal(u.skill.duration, 20, `${id} B: duration again 20`);
    assert.ok(u.skill.timeLeft > 19, `${id} B: a FRESH bar (timeLeft ${u.skill.timeLeft.toFixed(3)})`);
    // The bar's own duration is the 特性's DOLL (20 s), while the state's buff carries the switch animation on top
    // (`professions.js`: `DOLL_SWITCH + dollDuration`), so after a relay the buff reads exactly DOLL_SWITCH more than
    // the bar. Both still finish when the <替身> has actually fought its DOLL seconds — measured: during the P1 half
    // the bar and the state differ by 0.000 s, and the only offset is that DOLL_SWITCH constant after the relay.
    assert.ok(Math.abs((u.skill.timeLeft + DOLL_SWITCH) - sub.timeLeft) <= 1 / 30 + 1e-6,
      `${id} B: the bar + ${DOLL_SWITCH}s switch = the state's remaining time (bar ${u.skill.timeLeft.toFixed(3)}, state ${sub.timeLeft.toFixed(3)})`);
    assert.equal(u.skill.sp, 0, `${id} B: 阻回 — sp still 0`);
    assert.ok(snapOf(h, u)[7] & UF.SKILL, `${id} B: snapshot UF.SKILL set for the P2 bar`);

    // --- 俄耳甫斯's OWN 20 s ending is the one that returns the 本体 1-1 (2 tiles), with the HP back to the 本体 maxHp
    assert.ok(h.runUntil(() => !u.trait.doll, 30), `${id} 俄耳甫斯's 20 s ended`);
    assert.equal(u.form, null, `${id} mask form cleared`);
    assert.equal(u.rangeGrid.length, 2, `${id} rangeGrid back to the 本体 1-1`);
    assert.deepEqual(rcOf(new Set(u.rangeKeys)), BODY_AT_10_4, `${id} rangeKeys back to 2 tiles`);
    assert.deepEqual(rcOf(new Set(u.baseRangeKeys)), BODY_AT_10_4, `${id} baseRangeKeys back to 2 tiles`);
    assert.ok(!u.findBuff('trait:substitute') && !u.findBuff('makoto:mask'), `${id} mask buffs dropped`);
    assert.ok(Math.abs(u.hp - u.s.maxHp) < 1e-6 && Math.abs(u.s.maxHp - u.base.maxHp) < 1e-6, `${id} HP back to the 本体 maxHp`);
    // --- assert C (item 6): the bar is cleared with the state and the 本体 starts saving SP again
    assert.equal(u.skill.active, false, `${id} C: the bar ended with the state`);
    assert.ok(!(snapOf(h, u)[7] & UF.SKILL), `${id} C: snapshot UF.SKILL cleared`);
    const spBack = u.skill.sp;
    h.run(2);
    assert.ok(u.skill.sp > spBack, `${id} C: SP accrues again in the 本体 form (${spBack} → ${u.skill.sp})`);
    assert.equal(h.b.errors.length, 0, `${id} no content errors`);
  }
});
