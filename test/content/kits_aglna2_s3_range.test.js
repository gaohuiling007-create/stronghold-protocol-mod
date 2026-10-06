// test/content/kits_aglna2_s3_range.test.js — 予愿安洁莉娜 S3 酸橙的心事 (chess_char_1015_aglna2, tier3 kit,
// server/sim/content/kits/tier3.js): the official 攻击范围 of the skill and the target count of one of its attacks.
//
// The two defects this pins down (measured before the fix):
//   (1) range — the spec used the skill's OWN grid only (rangeId "3-9", 19 格). The skill text says "攻击范围扩大，且
//       周围8格视作予愿安洁莉娜的额外攻击范围" and the data agrees: bbStr `attack@attack_range_id` = "x-4" (range_table:
//       the 3×3 block without its centre). 3-9 has NO cell behind her (col < 0 does not exist in it), so her own tile
//       and the three tiles behind it — the tiles an enemy walks onto when it reaches / passes her — were untargetable
//       during the whole skill (measured rangeKeys.length 19; (10,4)/(10,3)/(9,3)/(11,3) all outside). The spec now
//       unions the two grids (kit `withSurround8`): at (row 10, col 4, dir RIGHT) 19 + 8 − 5 shared = 22 格.
//   (2) targets — `targeting.maxTargets` was `attack@max_target` (4), the TOTAL the skill text gives as "3 敌人 + 额外
//       1 飞行敌人", so a ground-only crowd let one attack pick 4 GROUND enemies (measured "target counts = 4"). The
//       ground cap is `attack@max_walk_target` (3) plus the ONE flyer the skill adds on top (the beforeAttack hook, which
//       re-derives the list so a flyer the sort ranks inside the walk targets never costs her a ground target).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';
import KITS from '../../server/sim/content/kits/tier3.js';

const ds = getDefaultSource();
const AG = 'chess_char_1015_aglna2_a';
const AG_B = 'chess_char_1015_aglna2_b';
const S3 = 'skchr_aglna2_3';
const IDX = (id, sk) => ds.rawChess(id).skills.find((s) => s.skillId === sk).index;
const kitOf = (id, sk) => {
  const def = ds.getChess(id, { skillIndex: IDX(id, sk) });
  return { def, kit: KITS.chess_char_1015_aglna2(def.skill.bb, def.raw, def) };
};
/** The spec of a skill (the cartesian default spec lives in `kit.skill`, the others in `kit.skills`). */
const specOf = (kit, sk) => (Object.keys(kit.skills ?? {}).includes(sk) ? kit.skills[sk] : kit.skill);

const ROW = 10, COL = 4, DIR = 'RIGHT';
const NINE = [[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]];
const key = (r, c) => r * 21 + c;
const dummy = (k, o = {}) => enemyRec({ key: k, hp: 1e7, speed: 0, def: 0, res: 0, ...o });
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };

/** A battle with `id` deployed at (10,4,RIGHT) holding S3 at once (carryState sp 999). */
function castS3(id, spawns, defs) {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120, defs: { enemies: defs },
    units: [{ chessId: id, row: ROW, col: COL, dir: DIR, skillIndex: IDX(id, S3), carryState: { sp: 999 } }],
    enemies: spawns, hooks: ['beforeAttack'], captureNoisy: true,
  });
  h.step(1);
  const u = h.unit(id);
  assert.equal(u.skill.id, S3, `${id}: S3 is the selected skill`);
  assert.equal(u.skill.kind, 'ammo', `${id}: S3 is an ammo skill`);
  if (!u.skill.active) {
    u.skill.charges = 1; u.skill.sp = u.skill.spCost;
    assert.ok(u.skill.activate('test', { free: true }), `${id}: S3 cast`);
  }
  h.step();
  return { h, u };
}

// ---------------------------------------------------------------------------------------------------------------
// A) 范围: 3-9 (19 格) ∪ 周围8格 (x-4) — including her own tile and the tiles BEHIND her

test('予愿安洁莉娜 S3: the range is 3-9 joined with the 周围8格 of the skill text (x-4) — 19 → 22 格 at (10,4,RIGHT)', () => {
  for (const id of [AG, AG_B]) {
    const { def, kit } = kitOf(id, S3);
    const spec = specOf(kit, S3);
    // the two official grids: the skill's own range ("3-9", 19 格) and the 周围8格 ("x-4" = NINE minus its centre)
    const base = new Set(absoluteRangeKeys(def.skill.rangeGrid, ROW, COL, DIR, 0));
    const nine = new Set(absoluteRangeKeys(NINE, ROW, COL, DIR, 0));
    nine.delete(key(ROW, COL));
    assert.equal(def.skill.rangeGrid.length, 19, `${id}: the skill's own 攻击范围 is 3-9 (19 格)`);
    assert.equal(def.raw.skill.rangeId, '3-9', `${id}: rangeId of the skill record`);
    assert.equal(def.raw.skill.bbStr['attack@attack_range_id'], 'x-4', `${id}: the data's own extra-range id (周围8格)`);
    assert.equal(nine.size, 8, `${id}: 周围8格 = the 3×3 block of x-4 without her own tile`);
    const overlap = [...nine].filter((k) => base.has(k));
    const merged = new Set([...base, ...nine]);
    assert.equal(overlap.length, 5, `${id}: 周围8格 ∩ 3-9 = 5 格 ${JSON.stringify(overlap)}`);
    assert.equal(merged.size, 22, `${id}: 19 + 8 − 5 = 22 格`);

    // the spec's grid must be exactly that union (at every facing: compare in the ABSOLUTE frame on a real battle)
    const live = [...new Set(absoluteRangeKeys(spec.targeting.rangeGrid, ROW, COL, DIR, 0))].sort((a, b) => a - b);
    assert.deepEqual(live, [...merged].sort((a, b) => a - b), `${id}: the spec's rangeGrid is 3-9 ∪ 周围8格`);

    // the key evidence: 3-9 alone contains NONE of these — they all come from 周围8格
    assert.equal(base.has(key(ROW, COL)), true, `${id}: 3-9 does contain her own tile`);
    for (const [r, c] of [[ROW, COL - 1], [ROW - 1, COL - 1], [ROW + 1, COL - 1]]) {
      assert.equal(base.has(key(r, c)), false, `${id}: 3-9 has no cell at (${r},${c}) — it has no col < 0 cell at all`);
    }
    assert.deepEqual([...nine].sort((a, b) => a - b).map((k) => [Math.floor(k / 21), k % 21]),
      [[9, 3], [9, 4], [9, 5], [10, 3], [10, 5], [11, 3], [11, 4], [11, 5]], `${id}: 周围8格 absolute cells`);

    // ... and in the REAL battle the live range is that same merged set (the spec grid → Battle._refreshRange)
    const { h, u } = castS3(id, [], {});
    assert.equal(u.rangeKeys.length, 22, `${id}: live rangeKeys = 22 格`);
    assert.deepEqual(u.rangeKeys.slice().sort((a, b) => a - b), [...merged].sort((a, b) => a - b), `${id}: live rangeKeys are the merged set`);
    for (const [r, c] of [[ROW, COL], [ROW, COL - 1], [ROW - 1, COL - 1], [ROW + 1, COL - 1]]) {
      assert.ok(u.rangeKeys.includes(key(r, c)), `${id}: (${r},${c}) is inside the S3 range`);
    }
    assert.equal(u.skill.active, true, `${id}: the skill is running`);
    done(h);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// B) 目标数: one S3 attack = at most 3 GROUND enemies + exactly 1 flyer (never 4 ground, never 2 flyers)

test('予愿安洁莉娜 S3: one attack hits ≤ 3 ground enemies and ≤ 1 flyer (4 ground + 1 flyer in range)', () => {
  const defs = {
    g1: dummy('g1'), g2: dummy('g2'), g3: dummy('g3'), g4: dummy('g4'),
    fly: dummy('fly', { motion: 'FLY', taunt: 10 }), fly2: dummy('fly2', { motion: 'FLY' }),
  };
  for (const id of [AG, AG_B]) {
    // the flyer carries the highest taunt, so the engine's own sort ranks it INSIDE the walk targets — the worst case
    // for the ground cap (the beforeAttack hook must still hand her 3 ground targets + that flyer)
    // It is already BLOCKED by a bait operator next to it: since S3 gained its official dash ("移动至该敌人所在格" —
    // "未被阻挡的可阻挡飞行敌人", test/content/kits_aglna2_s3_dash.test.js) a free flyer of her range is a legal
    // DESTINATION, and a move would re-measure every range this test asserts on. The blocked flyer is the same scenario
    // the skill text describes minus the relocation, so she stands still and the target counts are those of the cast tile.
    // The link is made by hand the way Battle._checkBlock does it (a 0-speed enemy is not re-scanned by the block pass):
    // both bodies must stay within the ground block radius, hence the cardinal neighbour. The cast is then OURS, so the
    // state at the moment of the cast is exactly the state asserted below.
    const h = makeBattle({
      seed: 3, autoFinish: false, timeLimit: 120, defs: { enemies: defs },
      units: [
        { chessId: id, row: ROW, col: COL, dir: DIR, skillIndex: IDX(id, S3), carryState: { sp: 0 } },
        { chessId: 'chess_char_1_02_a', uid: 91, row: 10, col: 7 },
      ],
      enemies: [
        { key: 'g1', pos: [10, 6] }, { key: 'g2', pos: [10, 8] }, { key: 'g3', pos: [8, 5] },
        { key: 'g4', pos: [12, 5] }, { key: 'fly', pos: [9, 7] },
      ],
      hooks: ['beforeAttack'], captureNoisy: true,
    });
    h.step(1);
    const u = h.unit(id);
    assert.equal(u.skill.id, S3, `${id}: S3 is the selected skill`);
    const bait = h.unit(91);
    const fly = h.b.enemies.find((e) => e.defId === 'enemy_fly');
    bait.blocking.push(fly);
    fly.blockedBy = bait;
    assert.equal(fly.blockedBy, bait, `${id}: the flyer is already blocked by the bait (未被阻挡 = false)`);
    u.skill.charges = 1; u.skill.sp = u.skill.spCost;
    assert.ok(u.skill.activate('test', { free: true }), `${id}: S3 cast`);
    h.step();
    assert.deepEqual([fly.tileR, fly.tileC], [9, 7], `${id}: the flyer still stands where it was placed (blocked, not moved)`);
    assert.deepEqual([u.tileR, u.tileC], [10, 4], `${id}: so the dash has no destination and she stays on the cast tile`);
    assert.equal(u.mem.aglna2Home ?? null, null, `${id}: no dash was recorded`);
    const inRange = h.b.enemiesInKeys(u.rangeKeys, u, { ...u.profile, canHitFly: true });
    assert.equal(inRange.length, 5, `${id}: all 5 enemies stand in the S3 range`);
    assert.equal(inRange.filter((e) => e.isFlying).length, 1, `${id}: one of them is a flyer`);

    const rows = [];
    h.b.on('beforeAttack', (ctx) => {
      if (ctx.attacker !== u) return;
      const t = (ctx.targets || []).filter((e) => e.alive);
      rows.push({ n: t.length, gnd: t.filter((e) => !e.isFlying).length, fly: t.filter((e) => e.isFlying).length });
    });
    h.runUntil(() => h.b.time > 12, 20);
    assert.ok(rows.length >= 5, `${id}: S3 attacked (${rows.length} attacks)`);
    assert.ok(rows.every((r) => r.gnd <= 3), `${id}: ground targets ≤ 3 per attack (${JSON.stringify(rows.map((r) => r.gnd))})`);
    assert.ok(rows.every((r) => r.fly <= 1), `${id}: flyer targets ≤ 1 per attack (${JSON.stringify(rows.map((r) => r.fly))})`);
    assert.ok(rows.every((r) => r.n <= 4), `${id}: ≤ 4 targets in total`);
    assert.deepEqual([...new Set(rows.map((r) => r.gnd))], [3], `${id}: all 4 ground enemies are in range, so she really hits 3`);
    assert.deepEqual([...new Set(rows.map((r) => r.fly))], [1], `${id}: the extra flyer is really hit`);
    done(h);
  }
});

test('予愿安洁莉娜 S3: a ground-only crowd is capped at 3 (attack@max_walk_target, not attack@max_target)', () => {
  const defs = { g1: dummy('g1'), g2: dummy('g2'), g3: dummy('g3'), g4: dummy('g4'), g5: dummy('g5'), g6: dummy('g6') };
  const { h, u } = castS3(AG_B, [
    { key: 'g1', pos: [10, 5] }, { key: 'g2', pos: [10, 6] }, { key: 'g3', pos: [10, 7] },
    { key: 'g4', pos: [10, 8] }, { key: 'g5', pos: [9, 6] }, { key: 'g6', pos: [11, 6] },
  ], defs);
  assert.equal(h.b.enemiesInKeys(u.rangeKeys, u, { ...u.profile, canHitFly: true }).length, 6, '6 ground enemies in range');
  const counts = [];
  h.b.on('beforeAttack', (ctx) => { if (ctx.attacker === u) counts.push((ctx.targets || []).filter((e) => e.alive).length); });
  h.runUntil(() => h.b.time > 8, 20);
  assert.ok(counts.length >= 3, `S3 attacked (${counts.length} attacks)`);
  assert.deepEqual([...new Set(counts)], [3], `every attack hits exactly 3 ground enemies (${JSON.stringify(counts)})`);
  done(h);
});

test('予愿安洁莉娜 S3: the extra flyer is hit even when the walk targets are already full of ground enemies', () => {
  const defs = { g1: dummy('g1'), g2: dummy('g2'), g3: dummy('g3'), g4: dummy('g4'), fly: dummy('fly', { motion: 'FLY' }) };
  const { h, u } = castS3(AG_B, [
    { key: 'g1', pos: [10, 5] }, { key: 'g2', pos: [10, 6] }, { key: 'g3', pos: [10, 7] },
    { key: 'g4', pos: [10, 8] }, { key: 'fly', pos: [8, 6] },
  ], defs);
  const rows = [];
  h.b.on('beforeAttack', (ctx) => {
    if (ctx.attacker !== u) return;
    const t = (ctx.targets || []).filter((e) => e.alive);
    rows.push({ gnd: t.filter((e) => !e.isFlying).length, fly: t.filter((e) => e.isFlying).length });
  });
  h.runUntil(() => h.b.time > 8, 20);
  assert.ok(rows.length >= 3, `S3 attacked (${rows.length} attacks)`);
  assert.deepEqual([...new Set(rows.map((r) => `${r.gnd}G${r.fly}F`))], ['3G1F'], `3 ground + the flyer (${JSON.stringify(rows)})`);
  done(h);
});

test('予愿安洁莉娜 S3: two flyers in range — only ONE of them is attacked', () => {
  const defs = { g1: dummy('g1'), g2: dummy('g2'), g3: dummy('g3'), fly: dummy('fly', { motion: 'FLY' }), fly2: dummy('fly2', { motion: 'FLY' }) };
  const { h, u } = castS3(AG_B, [
    { key: 'g1', pos: [10, 5] }, { key: 'g2', pos: [10, 6] }, { key: 'g3', pos: [10, 7] },
    { key: 'fly', pos: [9, 6] }, { key: 'fly2', pos: [8, 6] },
  ], defs);
  const rows = [];
  h.b.on('beforeAttack', (ctx) => {
    if (ctx.attacker !== u) return;
    const t = (ctx.targets || []).filter((e) => e.alive);
    rows.push({ gnd: t.filter((e) => !e.isFlying).length, fly: t.filter((e) => e.isFlying).length });
  });
  h.runUntil(() => h.b.time > 8, 20);
  assert.ok(rows.length >= 3, `S3 attacked (${rows.length} attacks)`);
  assert.deepEqual([...new Set(rows.map((r) => `${r.gnd}G${r.fly}F`))], ['3G1F'], `3 ground + exactly 1 of the 2 flyers (${JSON.stringify(rows)})`);
  done(h);
});

// ---------------------------------------------------------------------------------------------------------------
// C) 不回归: S1 3-6 (9 格) / S2 3-10 (15 格) / S3 19 格 of its own record — the fix touched S3 only

test('予愿安洁莉娜 S1/S2/S3: the skill grids are 3-6 (9), 3-10 (15) and 3-9 ∪ 周围8格 (22) — S1/S2 unchanged', () => {
  const NINE_GRID = 9, FIFTEEN = 15;
  for (const id of [AG, AG_B]) {
    const s1 = kitOf(id, 'skchr_aglna2_1');
    const s2 = kitOf(id, 'skchr_aglna2_2');
    const s3 = kitOf(id, S3);
    const g1 = specOf(s1.kit, 'skchr_aglna2_1').targeting.rangeGrid;
    const g2 = specOf(s2.kit, 'skchr_aglna2_2').targeting.rangeGrid;
    const g3 = specOf(s3.kit, S3).targeting.rangeGrid;
    // S1 极速送达: rangeId 3-6, the 3×3 block ahead of her
    assert.equal(s1.def.raw.skill.rangeId, '3-6', `${id}: S1 rangeId`);
    assert.equal(g1.length, NINE_GRID, `${id}: S1 3-6 = 9 格`);
    assert.equal(absoluteRangeKeys(g1, ROW, COL, DIR, 0).length, NINE_GRID, `${id}: S1 9 absolute 格`);
    assert.equal(g2.length, FIFTEEN, `${id}: S2 3-10 = 15 格`);
    assert.equal(absoluteRangeKeys(g2, ROW, COL, DIR, 0).length, FIFTEEN, `${id}: S2 15 absolute 格`);
    assert.equal(s2.def.raw.skill.rangeId, '3-10', `${id}: S2 rangeId`);
    // S3: her own record is still 3-9 (19); only the SPEC merges 周围8格
    assert.equal(s3.def.skill.rangeGrid.length, 19, `${id}: S3's own record is 3-9 (19 格)`);
    assert.equal(g3.length, 22, `${id}: S3 spec = 19 格 + the 8 surrounding tiles minus 5 shared`);
    // ... and the numbers each spec carries are unchanged
    const atk = (kit, sk) => specOf(kit, sk).attack?.atkScale;
    assert.equal(atk(s1.kit, 'skchr_aglna2_1'), undefined, `${id}: S1 has no attack override (plain attack)`);
    assert.equal(specOf(s1.kit, 'skchr_aglna2_1').targeting.maxTargets, 2, `${id}: S1 targets 2`);
    assert.equal(specOf(s2.kit, 'skchr_aglna2_2').targeting.maxTargets, Number(s2.def.skill.bb['attack@max_target']), `${id}: S2 targets attack@max_target`);
    assert.equal(specOf(s3.kit, S3).targeting.maxTargets, 3, `${id}: S3 walk targets = attack@max_walk_target`);
    assert.equal(atk(s3.kit, S3), Number(s3.def.skill.bb['attack@atk_scale']), `${id}: S3 damage scale = attack@atk_scale`);
    assert.equal(specOf(s1.kit, 'skchr_aglna2_1').mods.atkPct, Number(s1.def.skill.bb.atk), `${id}: S1 ATK +atk`);
    assert.equal(specOf(s2.kit, 'skchr_aglna2_2').mods.atkPct, Number(s2.def.skill.bb.atk), `${id}: S2 ATK +atk`);
    assert.equal(specOf(s3.kit, S3).mods.atkPct, Number(s3.def.skill.bb.atk), `${id}: S3 ATK +atk`);
    // S1 / S2 really fight with those grids in a battle (no content error, live rangeKeys match)
    for (const [sk, n] of [['skchr_aglna2_1', NINE_GRID], ['skchr_aglna2_2', FIFTEEN]]) {
      const h = makeBattle({
        seed: 3, autoFinish: false, timeLimit: 60,
        units: [{ chessId: id, row: ROW, col: COL, dir: DIR, skillIndex: IDX(id, sk), carryState: { sp: 999 } }],
        enemies: [{ key: 'e_dummy', pos: [10, 7] }], defs: { enemies: { e_dummy: dummy('e_dummy') } },
        hooks: [], captureNoisy: true,
      });
      h.step(1);
      const u = h.unit(id);
      if (!u.skill.active) { u.skill.charges = 1; u.skill.sp = u.skill.spCost; u.skill.activate('test', { free: true }); }
      h.step();
      assert.equal(u.rangeKeys.length, n, `${id} ${sk}: live rangeKeys = ${n} 格`);
      done(h);
    }
  }
});
