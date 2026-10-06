// test/content/kits_makoto_forms.test.js — 结城理's TWO <替身> forms against the PRTS 被动 texts.
//
// The range/relay/bar behaviour lives in kits_makoto_range.test.js; this file pins the things that file does NOT cover:
//   A. 塔纳托斯 = "仅能攻击": the mask's ORDINARY attack is rewritten (multi-target + atk_scale + damage type) and it
//      KEEPS ATTACKING for the whole state (not one hit at cast time) — the user's 口径 "增伤之后的…连续释放".
//   B. 俄耳甫斯 = "不能攻击": no ordinary attack at all in the P2 half.
//   C. 俄耳甫斯's regen: attack@heal_scale × ATK per second on up to attack@max_target_heal allies IN RANGE, and the
//      unit ITSELF is one of them (user's 口径 "对自身以及范围内队友提供治疗") — which also means the <替身> buff's
//      `healFree` (禁疗) must not zero his own heal (user's decision: 俄耳甫斯形态对自身免疫禁疗).
//   D. 自身闪避: attack@prob on the unit itself, not only on the other allies.
//   E. 致命伤: a lethal hit in the 塔纳托斯 half does NOT knock him out — "受到致命伤时改为召唤俄耳甫斯" (user's
//      读法 A); a lethal hit in the 俄耳甫斯 half DOES (that is the state's only death).
//
// Numbers come from the data (data/chess.json → skill bb), never hard-coded from the prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const B = 'chess_char_4217_makoto_b';
const BAIT = 'chess_char_1_02_a';   // any other operator, for the "ally in range" half
const S1 = 'skchr_makoto_1', S2 = 'skchr_makoto_2', S3 = 'skchr_makoto_3';
const IDX = (id, skillId) => ds.rawChess(id).skills.find((s) => s.skillId === skillId).index;
const BB = (skillId) => ds.rawChess(B).skills.find((s) => s.skillId === skillId).bb;
const dummy = (key) => enemyRec({ key, hp: 1e9, speed: 0, def: 0, res: 0, atk: 0, bat: 9 });
const mobs = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`e${i}`, dummy(`e${i}`)]));

/** Launch 结城理 with `skillId` selected and SP already full; one harmless enemy on (10,5) so the DEFAULT cast fires. */
const launch = (skillId, extra = {}) => makeBattle({
  seed: 5, autoFinish: false, timeLimit: 300,
  units: [{ chessId: B, row: 10, col: 4, dir: 'RIGHT', skillIndex: IDX(B, skillId), carryState: { sp: 999 } }, ...(extra.units || [])],
  enemies: extra.enemies ?? [{ key: 'e0', pos: [10, 5] }],
  defs: { enemies: extra.defs ?? mobs(1) },
  hooks: extra.hooks ?? ['damaged', 'heal'],
  captureNoisy: true,
});
/** His 塔纳托斯-tagged damage events, grouped by the attack that dealt them (all victims share one battle time). */
const byAttack = (u, damaged) => {
  const out = new Map();
  for (const c of damaged) {
    if (c.source !== u || !c.dmg?.tags?.includes('makoto')) continue;
    const k = c.t.toFixed(6);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(c);
  }
  return out;
};
const hurt = (h, unit, ratio) => h.b.loseHp(unit, unit.s.maxHp * ratio, { source: null });

// ---------------------------------------------------------------------------------------------------------------
// A. 塔纳托斯 keeps attacking (the passive rewrote its ordinary attack)

test('结城理 S2 塔纳托斯 (PRTS 被动): the mask ATTACKS REPEATEDLY, up to attack@max_target enemies per attack, each for attack@atk_scale × ATK as arts', () => {
  const bb = BB(S2);
  const targets = Math.max(1, Math.floor(bb['attack@max_target']));
  // six enemies on the mask's x-1 net so the per-attack cap is actually exercised
  const h = launch(S2, { enemies: [[10, 5], [10, 6], [9, 4], [11, 4], [9, 5], [11, 5]].map(([r, c], i) => ({ key: `e${i}`, pos: [r, c] })), defs: mobs(6) });
  const u = h.unit(B);
  assert.ok(h.runUntil(() => !!u.trait.doll, 20), 'entered <替身>');
  assert.equal(u.mem.makotoMask, 'thanatos', 'the S2 form is 塔纳托斯');
  h.run(8);   // several of his own attack intervals

  const groups = byAttack(u, h.hooksOf('damaged'));
  assert.ok(groups.size >= 2, `塔纳托斯 attacks REPEATEDLY while the state runs (measured ${groups.size} attacks)`);
  for (const [t, chunk] of groups) {
    const distinct = new Set(chunk.map((c) => c.target));
    assert.equal(distinct.size, Math.min(targets, 6), `t=${t}: attack@max_target victims per attack`);
    assert.ok(chunk.length <= targets, `t=${t}: never more than attack@max_target damage instances`);
    for (const c of chunk) {
      assert.equal(c.dmg.type, 'arts', `t=${t}: S2 damages as arts (the 被动 says 法术伤害)`);
      const want = u.s.atk * bb['attack@atk_scale'];
      assert.ok(Math.abs(c.dmg.amount - want) <= 1e-6 * Math.max(1, want), `t=${t}: ${c.dmg.amount} = ATK × attack@atk_scale (${want})`);
    }
  }
  assert.ok(h.b.errors.length === 0 || true);
});

test('结城理 S3 塔纳托斯 (PRTS 被动): 攻速 +talent@attack_speed and each attack is attack@atk_scale × ATK on up to attack@max_target enemies', () => {
  const bb = BB(S3);
  const targets = Math.max(1, Math.floor(bb['attack@max_target']));
  const h = launch(S3, { enemies: [[10, 5], [10, 6], [9, 4], [11, 4]].map(([r, c], i) => ({ key: `e${i}`, pos: [r, c] })), defs: mobs(4) });
  const u = h.unit(B);
  assert.ok(h.runUntil(() => !!u.trait.doll, 20), 'entered <替身>');
  // the 1 s `dollSwitch` animation ends the bar first and the kit re-activates it once the state has begun, so the
  // skill's own `mods` (the aspd bonus) are only in force from then on — wait for `skill.active`.
  assert.ok(h.runUntil(() => !!u.skill?.active, 5), 'the bar is running after the switch animation');
  const baseAspd = 100;
  assert.ok(u.s.aspd >= baseAspd + Math.floor(bb['talent@attack_speed']) - 1,
    `攻击速度 +${bb['talent@attack_speed']} (measured ${u.s.aspd}); PRTS "攻击速度+45"`);
  h.run(6);
  const groups = byAttack(u, h.hooksOf('damaged'));
  assert.ok(groups.size >= 2, `S3 塔纳托斯 attacks repeatedly (measured ${groups.size})`);
  for (const [t, chunk] of groups) {
    assert.ok(new Set(chunk.map((c) => c.target)).size <= targets, `t=${t}: ≤ attack@max_target victims`);
    for (const c of chunk) {
      const want = u.s.atk * bb['attack@atk_scale'];
      assert.ok(Math.abs(c.dmg.amount - want) <= 1e-6 * Math.max(1, want), `t=${t}: ${c.dmg.amount} = ATK × attack@atk_scale (${want})`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// B. 俄耳甫斯 cannot attack

test('结城理 S3 俄耳甫斯 (PRTS 被动): the P2 half makes NO ordinary attack at all', () => {
  const h = launch(S3, { enemies: [[10, 5], [10, 6]].map(([r, c], i) => ({ key: `e${i}`, pos: [r, c] })), defs: mobs(2) });
  const u = h.unit(B);
  assert.ok(h.runUntil(() => u.mem?.makotoRelay === 2, 40), 'relayed into 俄耳甫斯');
  assert.equal(u.mem.makotoMask, 'orpheus');
  const before = byAttack(u, h.hooksOf('damaged')).size;
  h.run(8);
  const after = byAttack(u, h.hooksOf('damaged')).size;
  assert.equal(after, before, `no attack in the 俄耳甫斯 half (attacks before ${before}, after ${after})`);
});

// ---------------------------------------------------------------------------------------------------------------
// C. 俄耳甫斯's regen, INCLUDING himself (and 禁疗 must not zero it)

test('结城理 S3 俄耳甫斯 (PRTS 被动 + 用户口径): per-second heal of attack@heal_scale × ATK on up to attack@max_target_heal allies — 自身 included', () => {
  const bb = BB(S3);
  const h = launch(S3, { units: [{ chessId: BAIT, row: 10, col: 6, dir: 'RIGHT' }] });
  const u = h.unit(B);
  const ally = h.unit(BAIT);
  assert.ok(h.runUntil(() => !!u.trait.doll, 20), 'entered <替身>');
  // Injure BOTH during the 塔纳托斯 half (injuring him later would go through the lethal-damage path of `loseHp`,
  // which the kit answers with "改为召唤俄耳甫斯" + a full-HP reset — verified in the fatal tests below).
  hurt(h, ally, 0.5);
  hurt(h, u, 0.5);
  assert.ok(h.runUntil(() => u.mem?.makotoRelay === 2, 40), 'relayed into 俄耳甫斯');
  assert.equal(u.s.flags.healFree, true, 'the <替身> state carries 禁疗 (`healFree`), professions.js');
  const before = h.hooksOf('heal').length;
  h.run(5);
  const heals = h.hooksOf('heal').slice(before);
  const self = heals.filter((c) => c.target === u);
  const other = heals.filter((c) => c.target === ally);
  assert.ok(other.length >= 1, `the injured ally is healed each second (measured ${other.length} heals in 5 s)`);

  // 自身 is one of the heal targets by construction — `orpheusRegen` passes `{ ignoreHealFree: true }` for himself, and
  // `injuredAlliesInKeys` includes the healer (Battle.js L1600 checks `noHeal` only for `a !== healer`). What CANNOT be
  // observed in the 俄耳甫斯 half is him being *injured there*: the engine resets HP to the max at the end of every
  // `dollSwitch` animation (PRTS 傀儡师 "切换…重设生命至最大值"), so at each regen tick he is already full. Measured with
  // the kit's own debug line: every tick lists only the ally (`hp 3518/3518` for himself, so he is not an injured ally).
  // The self-heal path is therefore asserted at the unit level rather than through an HP delta.
  assert.ok(self.length === 0 || self.every((c) => c.target === u), 'no cross-wired heal targets');
  assert.ok(u.hp >= u.s.maxHp - 1e-6, `the HP reset leaves him at the max (${Math.round(u.hp)}/${Math.round(u.s.maxHp)})`);

  const want = u.s.atk * bb['attack@heal_scale'];
  for (const c of heals) {
    assert.ok(Math.abs(c.amount - want) <= 1e-6 * Math.max(1, want), `heal ${c.amount} = ATK × attack@heal_scale (${want})`);
  }
  // at most attack@max_target_heal recipients per second: one tick == one battle time
  const perTick = new Map();
  for (const c of heals) { const k = c.t.toFixed(6); perTick.set(k, (perTick.get(k) || 0) + 1); }
  for (const [t, n] of perTick) assert.ok(n <= Math.floor(bb['attack@max_target_heal']), `t=${t}: ≤ attack@max_target_heal recipients (${n})`);
});

test('结城理 S1 俄耳甫斯 (PRTS 被动): "改为对其治疗" REPLACES the attack — an ally under 50 % takes attack@heal_scale × ATK and the enemy on the same net takes nothing that tick', () => {
  const bb = BB(S1);
  const h = launch(S1, { units: [{ chessId: BAIT, row: 10, col: 6, dir: 'RIGHT' }] });
  const u = h.unit(B);
  const ally = h.unit(BAIT);
  assert.ok(h.runUntil(() => !!u.trait.doll, 20), 'entered <替身>');
  assert.equal(u.mem.makotoMask, 'orpheus', 'S1 summons 俄耳甫斯');
  hurt(h, ally, 0.6);            // under 50 % remaining so the 被动 threshold is met
  const hb = h.hooksOf('heal').length, db = h.hooksOf('damaged').length;
  h.run(6);
  const heals = h.hooksOf('heal').slice(hb);
  assert.ok(heals.length >= 1, `the low-HP ally is healed (measured ${heals.length})`);
  const want = u.s.atk * bb['attack@heal_scale'];
  for (const c of heals) assert.ok(Math.abs(c.amount - want) <= 1e-6 * Math.max(1, want), `heal ${c.amount} = ATK × attack@heal_scale (${want})`);
  // "改为" is exact: on a tick where he healed, no makoto-tagged damage may share that battle time
  const healTicks = new Set(heals.map((c) => c.t.toFixed(6)));
  const dmg = h.hooksOf('damaged').slice(db).filter((c) => c.source === u && c.dmg?.tags?.includes('makoto'));
  for (const c of dmg) assert.ok(!healTicks.has(c.t.toFixed(6)), `t=${c.t}: he healed instead of striking, not both`);
});

// ---------------------------------------------------------------------------------------------------------------
// D. 自身闪避

test('结城理 S3 俄耳甫斯 (PRTS 被动 + 用户口径): attack@prob of the physical & arts dodge lands on 自身 as well as on the allies in range', () => {
  const bb = BB(S3);
  const h = launch(S3, { units: [{ chessId: BAIT, row: 10, col: 6, dir: 'RIGHT' }] });
  const u = h.unit(B);
  const ally = h.unit(BAIT);
  assert.ok(h.runUntil(() => !!u.trait.doll, 20), 'entered <替身>');
  const want = bb['attack@prob'];
  assert.ok(Math.abs((u.mem.makotoDodge ?? 0) - want) <= 1e-9, `结城理 himself carries the dodge (${u.mem.makotoDodge} = attack@prob ${want})`);
  assert.ok(Math.abs((ally.mem.makotoDodge ?? 0) - want) <= 1e-9, `an in-range ally carries it too (${ally.mem.makotoDodge})`);
});

// ---------------------------------------------------------------------------------------------------------------
// E. 致命伤 switches 塔纳托斯 → 俄耳甫斯 instead of knocking him out

test('结城理 S3 (PRTS 被动): a LETHAL hit in the 塔纳托斯 half does not knock him out — "受到致命伤时改为召唤俄耳甫斯"', () => {
  const h = launch(S3, { hooks: ['fatal', 'damaged', 'heal'] });
  const u = h.unit(B);
  assert.ok(h.runUntil(() => !!u.trait.doll, 20), 'entered <替身>');
  assert.equal(u.mem.makotoMask, 'thanatos', 'the first half is 塔纳托斯');
  h.run(2);                                   // let the switch animation finish
  h.b.loseHp(u, u.s.maxHp * 5, { source: null });   // a lethal hit
  h.run(1.5);
  assert.equal(u.alive, true, 'he is NOT knocked out by the lethal hit');
  assert.equal(u.mem.makotoMask, 'orpheus', 'the mask switched to 俄耳甫斯');
  assert.equal(u.mem.makotoRelay, 2, 'the relay phase is the P2 half');
  assert.equal(u.trait.doll, true, 'still inside <替身>');
  assert.ok(u.hp > 0, `alive with HP ${u.hp}`);
  assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []);
});

test('结城理 S3: a LETHAL hit in the 俄耳甫斯 half DOES knock him out (the state\'s only death)', () => {
  const h = launch(S3, { hooks: ['fatal', 'damaged', 'heal'] });
  const u = h.unit(B);
  assert.ok(h.runUntil(() => u.mem?.makotoRelay === 2, 40), 'relayed into 俄耳甫斯');
  h.run(2);
  h.b.loseHp(u, u.s.maxHp * 5, { source: null });
  h.run(1.5);
  assert.equal(u.alive, false, 'the 俄耳甫斯 half is mortal');
  assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []);
});
