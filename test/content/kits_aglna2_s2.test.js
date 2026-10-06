// test/content/kits_aglna2_s2.test.js — player report (real-machine test) on the MOD chess 予愿安洁莉娜 S2 重力自定义
// (chess_char_1015_aglna2, tier3 kit, server/sim/content/kits/tier3.js): (1) the model froze and she could not attack
// after the cast, (2) the forward glide stopped/landed wrong, (3) GROUND enemies still locked on to her while 起飞,
// (4) the swept ground enemies took no 浮空, (5) she took off, swept forward and STILL got stuck — she never came back
// to her own tile.
//
// Verdicts and the official rules behind them:
//   (1) real, kit bug: the 浮空 capability marker shipped as a skill FLAG (`flags: { ...AIR, levitate: true }`) — skill
//       flags are the caster's own state (skills.js _applyMods → addBuff), and units.js _recalc derives `stun` from
//       `levitate`, so she was 浮空/stunned for the whole duration: canAct false (no attack, no SP gain) and the
//       snapshot's UF.STUNNED froze her model on the client (public/js/render/units.js _baseName → spine._enterStun).
//       The marker is now the SkillSpec field `levitate` (content/garrisons/battle.js levitateCast reads it; the flag
//       route still works for other content).
//   (2)+(5) real, kit bug, fixed by REMOVING the movement (the user's design decision: 掠过 is only an animation, the
//       statuses are applied at the correct position): the glide used to `battle.relocate` her forward. A move during
//       起飞 re-measured her tile range, could land her on a wall (`unit.ground` false — the inRect/isObstacle test of
//       the first fix, then grid.groundPassable) and, when it could not put her back, left the player with an operator
//       stuck on the swept tile. 掠过 is now PURE VFX (`glideFx`: a 'takeoff' lift plus one 'aoe' burst per lane tile,
//       at most GLIDE_STEPS = 2 ahead) and her tile is invariant for the whole skill — asserted here tick by tick, so
//       no future change re-introduces the move silently. The statuses land where she STANDS: the skill range
//       (data 3-10, ROTATED by her facing) joined with the straight lane ahead.
//   (3) real, engine bug (ai.js): an existing `blockedBy` link let a ground enemy keep her as its attack target while
//       airborne — `enemyAttack` handed the blocker over unconditionally (`a === bl || canTargetAlly(...)` /
//       `targets = [bl]`) and `updateEnemy` never unblocked for 对地规避. Measured before the fix: 22 ground-enemy
//       attacks with her as the target at `u.s.flags.liftoff === true` (damage itself was refused downstream; the
//       lock-on, the attack animation and the enemy being pinned by an airborne operator were not).
//   (4) the sweep does levitate the ground enemies of the swept grid (measured: 4-5 applications per cast over real
//       waves) — asserted here so it stays true; the user-visible "no 浮空" follows from (1)+(2): her own model showed
//       the 浮空/stun state and a blocked glide sweeps a smaller area than the skill text promises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import KITS from '../../server/sim/content/kits/tier3.js';
import { canTargetAlly, evadesGround } from '../../server/sim/targeting.js';

const ds = getDefaultSource();
const AG = 'chess_char_1015_aglna2_a';
const AG_B = 'chess_char_1015_aglna2_b';
const BAIT = 'chess_char_1_02_a';
const B = (layers = 0, active = true) => ({ count: active ? 3 : 0, active, tier: active ? 1 : 0, layers });
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 0, def: 0, res: 0, ...o });
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };

// ---------------------------------------------------------------------------------------------------------------
// (1) the skill spec must NOT put 浮空 on the caster: she stays able to attack for the whole duration

test('予愿安洁莉娜 S2: the 浮空 marker is a spec field, not a skill flag — she is not 浮空/stunned and keeps attacking', () => {
  const def = ds.getChess(AG);
  const kit = KITS['chess_char_1015_aglna2'](def.skill.bb, def.raw, def);
  assert.equal(kit.skill.levitate, true, 'the S2 spec declares the 浮空 capability (field `levitate`)');
  assert.equal(kit.skill.flags.levitate, undefined, 'a `levitate` skill FLAG would land on the caster as her own state');
  assert.equal(kit.skill.flags.liftoff, true, 'S2 is still 起飞 (its own flag)');
  assert.equal(kit.skill.flags.blockFly, true, '起飞 blocks flyers');
  assert.equal(kit.skills.skchr_aglna2_1.flags.levitate, undefined, 'S1 is not a 浮空 skill');

  for (const id of [AG, AG_B]) {
    const h = makeBattle({
      seed: 3, autoFinish: false, timeLimit: 120,
      defs: { enemies: { e_dummy: dummy('e_dummy') } },
      units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT' }],
      enemies: [{ key: 'e_dummy', pos: [10, 6] }],
      hooks: ['skillStart', 'skillEnd'], captureNoisy: true,
    });
    const u = h.unit(id);
    assert.ok(h.runUntil(() => u.skill.active, 60), `${id}: S2 cast`);
    assert.equal(u.skill.id, 'skchr_aglna2_2', `${id}: the default skill is S2`);
    assert.equal(u.s.flags.liftoff, true, `${id}: airborne`);
    assert.equal(u.s.flags.levitate, undefined, `${id}: her own state is not 浮空`);
    assert.equal(u.s.flags.stun, false, `${id}: not stunned by her own skill`);
    assert.equal(u.canAct, true, `${id}: she can act (no attack lock)`);
    const a0 = u.stats.attacks;
    h.run(3);
    assert.ok(u.skill.active, `${id}: the skill is still running`);
    assert.ok(u.stats.attacks - a0 >= 3, `${id}: she attacked ${u.stats.attacks - a0} times in 3 s while the skill runs`);
    // the skill ends on time and lands her (no stuck state)
    assert.ok(h.runUntil(() => !u.skill.active, 30), `${id}: the skill ends`);
    assert.ok(h.b.time - (u.skill.lastStart) <= 23, `${id}: within its 22 s duration (${(h.b.time - u.skill.lastStart).toFixed(2)} s)`);
    assert.equal(u.s.flags.liftoff, undefined, `${id}: landed`);
    done(h);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// (2) 掠过 is a VISUAL sweep: the unit keeps its tile for the whole skill (no relocate, so there is no landing tile
//     and nothing to get stuck on) while the sweep VFX still marches forward along her facing

test('予愿安洁莉娜 S2: 掠过 is VFX only — the tile is invariant for the whole skill and the sweep burns forward', () => {
  const row = (walls) => '##ErrrrrrrSrrrrrrrS##'.split('').map((ch, i) => (walls.includes(i) ? '#' : ch)).join('');
  for (const walls of [[], [6], [6, 7]]) {
    const h = makeBattle({
      seed: 3, autoFinish: false, timeLimit: 60,
      units: [{ chessId: AG, row: 9, col: 5, dir: 'RIGHT' }], enemies: [],
      hooks: ['fx'], captureNoisy: false, flat: { rows: { 9: row(walls) } },
    });
    h.step(1);
    const u = h.unit(AG);
    const tag = `walls at ${walls.join(',') || '(none)'}`;
    const before = [u.tileR, u.tileC, u.x, u.y];
    u.skill.charges = 1; u.skill.sp = u.skill.spCost;
    assert.ok(u.skill.activate('test', { free: true }), `${tag}: S2 cast`);
    h.step();
    assert.deepEqual([u.tileR, u.tileC, u.x, u.y], before, `${tag}: the cast does not move her`);
    // the property the old relocate broke: her tile is one a ground unit may stand on, and it stays hers
    assert.equal(h.b.grid.groundPassable(u.tileR, u.tileC), true, `${tag}: she stands on a tile a ground unit may stand on`);
    assert.equal(h.b.grid.isLow(u.tileR, u.tileC), true, `${tag}: low ground (行动方式 stays ground)`);
    assert.equal(u.ground, true, `${tag}: unit.ground`);
    // ... for every tick of the whole skill, obstacles ahead or not
    const seen = new Set();
    h.b.on('tick', () => { if (u.skill.active) seen.add(`${u.tileR},${u.tileC},${u.x},${u.y}`); });
    h.runUntil(() => !u.skill.active, 40);
    assert.deepEqual([...seen], [`${before[0]},${before[1]},${before[2]},${before[3]}`], `${tag}: one single position on every tick of the skill`);
    assert.deepEqual([u.tileR, u.tileC], [9, 5], `${tag}: still on her own tile`);
    // the forward sweep is drawn: a lift plus one 'aoe' burst per lane tile ahead (10,5) is at row 9 col 5 -> (9,6),(9,7)
    const fx = h.eventsOf('fx').filter((e) => e[4]?.skill === 'aglna2Sweep' || e[1] === 'takeoff');
    assert.equal(fx.filter((e) => e[1] === 'takeoff').length, 1, `${tag}: one takeoff fx`);
    const bursts = fx.filter((e) => e[1] === 'aoe').map((e) => [e[3], e[2]]);
    assert.deepEqual(bursts, [[9, 6], [9, 7]], `${tag}: the sweep VFX marches forward (${JSON.stringify(bursts)})`);
    done(h);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// (3) 起飞: a GROUND enemy cannot select her (not even the one she was blocking); a flyer still can

test('予愿安洁莉娜 S2: while 起飞 no ground enemy selects her — a flyer still does', () => {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120,
    defs: {
      enemies: {
        e_ground: dummy('e_ground', { atk: 300, range: 2, bat: 1 }),
        e_fly: dummy('e_fly', { atk: 300, range: 2, bat: 1, motion: 'FLY' }),
      },
    },
    units: [{ chessId: AG, row: 9, col: 5, dir: 'RIGHT' }],
    // both stand OUTSIDE the swept grid (rows 8-10): a swept ground enemy becomes 浮空 — and a 浮空 unit counts as a
    // flyer, which the 对地规避 rule does not stop (it is stunned for those 10 s, so it cannot shoot her either)
    enemies: [{ key: 'e_ground', pos: [12, 4] }, { key: 'e_fly', pos: [12, 6] }],
    hooks: ['damaged'], captureNoisy: true,
  });
  h.step(1);
  const u = h.unit(AG);
  u.skill.charges = 1; u.skill.sp = u.skill.spCost;
  assert.ok(u.skill.activate('test', { free: true }), 'S2 cast');
  const g = h.b.enemies.find((e) => !e.isFlying);
  const f = h.b.enemies.find((e) => e.isFlying);
  assert.ok(g && f, 'both enemies spawned');
  assert.equal(g.isFlying, false, 'the source enemy is a ground enemy');
  assert.equal(f.isFlying, true, 'the control enemy is a flyer');
  assert.equal(u.s.flags.liftoff, true, 'airborne');
  assert.equal(evadesGround(g, u), true, '对地规避 against the ground enemy');
  assert.equal(evadesGround(f, u), false, 'a flyer ignores 对地规避 (she stays a ground unit)');
  assert.equal(canTargetAlly(g, u, true), false, 'the ground enemy cannot select her');
  assert.equal(canTargetAlly(f, u, true), true, 'the flyer can');
  assert.equal(h.b.dealDamage(g, u, { amount: 500, type: 'phys', isAttack: true }), 0, 'a ground attack does not land');
  assert.equal(h.b.applyStatus(u, 'stun', { duration: 2, source: g }), false, "a ground enemy's status does not land");
  assert.equal(h.b.dealDamage(f, u, { amount: 500, type: 'phys', isAttack: true }) > 0, true, 'the flyer hits her');
  done(h);
});

test('予愿安洁莉娜 S2: a ground enemy she was blocking stops attacking her the moment she takes off', () => {
  // The regression: `blockedBy` handed the attacker its blocker without any selection test, and nothing dropped the
  // link for 对地规避 (the take-off now always releases it directly — there is no glide that could fail to happen).
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 200,
    defs: { enemies: { e_melee: dummy('e_melee', { hp: 1e7, speed: 1, atk: 250, bat: 1, immunities: { levitate: true } }) } },
    units: [{ chessId: AG, row: 9, col: 5, dir: 'RIGHT' }, { chessId: BAIT, uid: 90, row: 9, col: 6 }],
    enemies: [{ key: 'e_melee', pos: [9, 9] }],
    hooks: [], captureNoisy: false,
  });
  h.step(1);
  const u = h.unit(AG);
  const e = h.b.enemies[0];
  const onHerWhileAirborne = [];
  const airBlocks = [];
  h.b.on('attack', (c) => {
    if (c.attacker === e && (c.targets || []).includes(u) && u.s.flags.liftoff) onHerWhileAirborne.push(h.b.time);
  });
  const bait = h.unit(90);
  h.b._remove(bait, 'killed');                 // its body lies on (9,6): an obstacle of the sweep lane
  bait.hp = 0;                                 // (the harness invariant: a killed operator has hp 0)
  u.skill.sp = 0; u.skill.charges = 0;
  let blockedAtCast = null;
  const airPos = new Set();
  for (let i = 0; i < 60 * 60; i++) {
    h.step();
    if (blockedAtCast == null && u.blocking.length > 0) {
      blockedAtCast = u.blocking.length;
      u.skill.charges = 1; u.skill.sp = u.skill.spCost;
      assert.ok(u.skill.activate('test', { free: true }), 'S2 cast');
    }
    if (u.skill.active && u.s.flags.liftoff) {
      airBlocks.push(u.blocking.length);
      airPos.add(`${u.tileR},${u.tileC}`);
    }
    if (blockedAtCast != null && !u.skill.active) break;
  }
  assert.equal(blockedAtCast, 1, 'she really was blocking the ground enemy when she took off');
  assert.ok(airBlocks.length > 0, 'she was airborne for a while');
  assert.deepEqual(onHerWhileAirborne, [], 'no ground enemy attack ever has her as its target while 起飞');
  assert.deepEqual([...new Set(airBlocks)], [0], 'she blocks nothing while airborne (不阻挡地面敌人)');
  assert.deepEqual([...airPos], ['9,5'], 'her tile is unchanged while airborne (no glide that could be stuck)');
  assert.notEqual(e.blockedBy, u, 'the ground enemy is released by the take-off');
  assert.equal(u.alive, true, 'she survives');
  done(h);
});

// ---------------------------------------------------------------------------------------------------------------
// (4) the swept ground enemies are 浮空 (10 s) and the swept flyers are 缚地 (20 s); the S2 cast still counts as a
//     浮空 cast for MOD_TRIGGER_levitate_skill_cast (visiShip +1), which is what the spec field carries

test('予愿安洁莉娜 S2: the swept ground enemies get 浮空, the swept flyers 缚地, and the cast still pays the garrison', () => {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120,
    defs: { enemies: { e_g: dummy('e_g'), e_g_out: dummy('e_g_out'), e_f: dummy('e_f', { motion: 'FLY' }), e_f_out: dummy('e_f_out', { motion: 'FLY' }) } },
    units: [{ chessId: AG, row: 10, col: 4, dir: 'RIGHT' }],
    // the sweep = the skill range (dc 0..+4, dr -1..+1 of (10,4): rows 9-11, cols 4-8) ∪ the lane (10,5),(10,6);
    // the two `_out` dummies stand outside both (row 12 / row 8, col 9) and must keep their state
    enemies: [{ key: 'e_g', pos: [10, 5] }, { key: 'e_f', pos: [10, 7] },
      { key: 'e_g_out', pos: [12, 9] }, { key: 'e_f_out', pos: [8, 9] }],
    bonds: { siracusaShip: B(0), swiftShip: B(0), miraShip: B(0) },
    hooks: ['statusApplied', 'skillStart'], captureNoisy: true,
  });
  const u = h.unit(AG);
  h.step(1);
  const g = h.b.enemies.find((e) => e.defId === 'enemy_e_g');
  const f = h.b.enemies.find((e) => e.defId === 'enemy_e_f');
  const gout = h.b.enemies.find((e) => e.defId === 'enemy_e_g_out');
  const fout = h.b.enemies.find((e) => e.defId === 'enemy_e_f_out');
  u.skill.charges = 1; u.skill.sp = u.skill.spCost;
  assert.ok(u.skill.activate('test', { free: true }), 'S2 cast');
  h.step();
  assert.deepEqual([u.tileR, u.tileC], [10, 4], 'she stays on her own tile (掠过 is VFX only)');
  const gl = g.findBuff('levitate');
  assert.ok(gl, 'the swept ground enemy is 浮空');
  assert.ok(gl.timeLeft > 9 && gl.timeLeft <= 10.01, `浮空 lasts 10 s (${gl.timeLeft.toFixed(2)})`);
  assert.equal(g.s.flags.levitate, true, 'the 浮空 flag is on the enemy');
  assert.equal(g.isFlying, true, 'a 浮空 enemy counts as an air unit');
  const bd = f.findBuff('bind');
  assert.ok(bd, 'the swept flyer is 缚地');
  assert.ok(bd.timeLeft > 19 && bd.timeLeft <= 20.01, `缚地 lasts 20 s (${bd.timeLeft.toFixed(2)})`);
  assert.equal(f.findBuff('levitate'), null, 'a flyer is never 浮空');
  assert.equal(gout.s.flags.levitate, undefined, 'a ground enemy OUTSIDE the sweep keeps its own state');
  assert.equal(fout.findBuff('bind'), null, 'a flyer OUTSIDE the sweep keeps its own state');
  const gains = h.result().perPlayer.p1.layerGains;
  assert.ok(gains.siracusaShip >= 1 && gains.swiftShip >= 1, `起飞 paid siracusaShip/swiftShip (${JSON.stringify(gains)})`);
  assert.ok(gains.miraShip >= 1, `the 浮空 cast paid miraShip (${JSON.stringify(gains)})`);
  done(h);
});
