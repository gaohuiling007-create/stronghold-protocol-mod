// test/content/kits_aglna2_s3_dash.test.js — 予愿安洁莉娜 S3 酸橙的心事 (chess_char_1015_aglna2, tier3 kit,
// server/sim/content/kits/tier3.js): the DISPLACEMENT the skill text gives and the spec never implemented —
// "原技能范围内有未被阻挡的可阻挡飞行敌人，且自身未阻挡时，移动至该敌人所在格" (Lv7 / 精锐 bb skchr_aglna2_3).
//
// The kit had the take-off (`toAir`) but no move at all: `grep relocate tier3.js` found two comments and nothing else,
// so the skill range never followed her and the official dash simply did not happen. The spec now:
//   onStart = toAir (releaseBlocked + 'takeoff') → skyDash: the nearest free (`e.blockedBy` null), blockable
//             (`(e.blockWeight ?? 1) > 0`) FLYING enemy of the range she took off with (`unit.rangeKeySet`, already the
//             skill range — SkillRuntime._applyMods runs before onStart), and `battle.relocate` to its tile. The tile
//             must pass `grid.canStand(r, c, { ranged: true })` — 高台 and 洞 are fine, a wall (`#`, build NONE) is not
//             ("如果是高台和洞可以，如果是完全不可部署，比如是一堵墙，就不动"). A refused move leaves everything as it was.
//   onEnd   = toGround (releaseBlocked, so an enemy she was blocking cannot hold her home tile) → skyReturn: back to
//             `unit.mem.aglna2Home`, once, never retrying, never throwing. A refused return leaves her where she is:
//             the user's hard requirement is "保证不会中途卡住…技能结束可以回到原来的部署位置".
// Notes for a spec reader: `unit.mem.aglna2Home` holds `{ r, c }` ONLY after a real dash; it is cleared on the way out
// of either path. The S2 glide (`GLIDE_STEPS` / `glideFx`) is untouched — that one is pure VFX by the user's own
// decision and moves nothing (`grep relocate` on the S2 code stays empty).
//
// Measured grids at (10,4,RIGHT): the spec's 3-9 ∪ 周围8格 is 22 格 = rows 8..12 × cols 3..8 minus the 8 corners of
// that rectangle (3-9 is the official |Δrow| + |Δcol| ≤ 3 diamond, 19 格, widened by the 8 neighbours minus the 5 the
// diamond already carries). At (10,6,RIGHT) the same 22 格 move 2 columns right, so the union of the two positions is
// 32 — the three tiles (9,3)/(10,3)/(11,3) only the OLD position reaches and the six (9,7)/(10,7)/(11,7)/(9,8)/(10,8)-
// adjacent ones only the NEW one does. That is the instrument this file uses to prove the range follows the dash.
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
const specOf = (kit, sk) => (Object.keys(kit.skills ?? {}).includes(sk) ? kit.skills[sk] : kit.skill);

const ROW = 10, COL = 4, DASH_C = 6, DIR = 'RIGHT';
const key = (r, c) => r * 21 + c;
const cells = (keys) => [...new Set(keys)].sort((a, b) => a - b).map((k) => `${Math.floor(k / 21)},${k % 21}`).join(' ');
/** The 22 absolute tiles of S3 measured from (r, c) in the spec's own grid (no battle needed). */
const rangeAt = (spec, r, c) => [...new Set(absoluteRangeKeys(spec.targeting.rangeGrid, r, c, DIR, 0))].sort((a, b) => a - b);
const dummy = (k, o = {}) => enemyRec({ key: k, hp: 1e7, speed: 0, def: 0, res: 0, ...o });
const flyer = (k, o = {}) => dummy(k, { motion: 'FLY', ...o });
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };
/** No dash was recorded: `mem` is free scratch space that only S3's own paths ever write, and only on a success. */
const noDash = (u) => assert.ok(!u.mem.aglna2Home, `no dash was recorded (aglna2Home = ${JSON.stringify(u.mem.aglna2Home)})`);
/** Stage row 10 of the flat stage with `walls` (columns) turned into the impassable `#` of the flat legend. */
const row10 = (walls = []) => '##hrrrrrrrfrrrrrrrf##'.split('').map((ch, i) => (walls.includes(i) ? '#' : ch)).join('');
/** A flat battle with `id` at (10,4,RIGHT) and S3 selected (`sp` defaults to a full bar, i.e. an immediate cast). */
const battleOf = (id, { spawns = [], defs = {}, walls = [], hooks = [], sp = 999, autoFinish = false } = {}) => makeBattle({
  seed: 3, autoFinish, timeLimit: 120, defs: { enemies: defs },
  units: [{ chessId: id, row: ROW, col: COL, dir: DIR, skillIndex: IDX(id, S3), carryState: { sp } }],
  enemies: spawns, hooks, captureNoisy: true, flat: { rows: { 10: row10(walls) } },
});

// ---------------------------------------------------------------------------------------------------------------
// A) 移动至该敌人所在格: a free, blockable flyer 2 tiles ahead — she takes its tile, and the skill range follows

test('予愿安洁莉娜 S3: a free blockable flyer in range — she moves onto its tile and the range follows her', () => {
  for (const id of [AG, AG_B]) {
    const { kit } = kitOf(id, S3);
    const spec = specOf(kit, S3);
    const before = rangeAt(spec, ROW, COL);
    const after = rangeAt(spec, ROW, DASH_C);
    assert.equal(before.length, 22, `${id}: 3-9 ∪ 周围8格 = 22 格 at (10,4,RIGHT)`);
    assert.equal(after.length, 22, `${id}: the same 22 格 re-measured at (10,6)`);
    assert.equal(cells(before), '8,4 8,5 8,6 9,3 9,4 9,5 9,6 9,7 10,3 10,4 10,5 10,6 10,7 10,8 11,3 11,4 11,5 11,6 11,7 12,4 12,5 12,6',
      `${id}: the 22 tiles of the cast position`);
    assert.equal(cells(after), '8,6 8,7 8,8 9,5 9,6 9,7 9,8 9,9 10,5 10,6 10,7 10,8 10,9 10,10 11,5 11,6 11,7 11,8 11,9 12,6 12,7 12,8',
      `${id}: the 22 tiles of the flyer's tile — the range really moved 2 columns`);
    // the tiles that only ever exist in ONE of the two positions (the instrument of every range assertion below)
    const onlyBefore = before.filter((k) => !after.includes(k)).map((k) => `${Math.floor(k / 21)},${k % 21}`);
    const onlyAfter = after.filter((k) => !before.includes(k)).map((k) => `${Math.floor(k / 21)},${k % 21}`);
    assert.equal(onlyBefore.join(' '), '8,4 8,5 9,3 9,4 10,3 10,4 11,3 11,4 12,4 12,5', `${id}: reachable only from (10,4)`);
    assert.equal(onlyAfter.join(' '), '8,7 8,8 9,8 9,9 10,9 10,10 11,8 11,9 12,7 12,8', `${id}: reachable only from (10,6)`);

    const h = battleOf(id, { spawns: [{ key: 'fly', pos: [ROW, DASH_C] }], defs: { fly: flyer('fly') }, hooks: ['fx'] });
    h.step(1);
    const u = h.unit(id);
    assert.equal(u.skill.id, S3, `${id}: S3 is the selected skill`);
    assert.equal(u.skill.kind, 'ammo', `${id}: S3 is an ammo skill`);
    assert.ok(u.skill.active, `${id}: S3 auto-cast at once (sp 999)`);
    assert.deepEqual([u.tileR, u.tileC], [ROW, DASH_C], `${id}: she stands on the flyer's tile (10,6)`);
    assert.deepEqual([u.y, u.x], [ROW, DASH_C], `${id}: y / x follow the tile`);
    assert.deepEqual(u.mem.aglna2Home, { r: ROW, c: COL }, `${id}: the tile of the cast is remembered for the return`);
    assert.equal(u.s.flags.liftoff, true, `${id}: she is 起飞`);
    assert.equal(u.rangeKeys.length, 22, `${id}: the live range is re-measured on the new tile (22 格)`);
    assert.deepEqual(u.rangeKeys.slice().sort((a, b) => a - b), after, `${id}: live rangeKeys = the range of (10,6) — it followed the dash`);
    for (const k of after.filter((x) => !before.includes(x))) assert.ok(u.rangeKeys.includes(k), `${id}: ${k} is in the NEW range`);
    for (const k of before.filter((x) => !after.includes(x))) assert.ok(!u.rangeKeys.includes(k), `${id}: ${k} is NOT in the new range`);
    assert.ok(u.rangeKeys.includes(key(10, 8)), `${id}: (10,8) is reachable from (10,6) (it is in both sets)`);
    // the displacement is drawn: a 'teleport' fx (render/fx.js FX_KINDS: a blink between the two points)
    const tp = h.eventsOf('fx').filter((e) => e[1] === 'teleport' && e[4]?.dash === 'aglna2');
    assert.equal(tp.length, 1, `${id}: exactly one dash fx (${JSON.stringify(h.eventsOf('fx').map((e) => e[1]))})`);
    assert.deepEqual([tp[0][3], tp[0][2]], [ROW, DASH_C], `${id}: the dash fx is drawn on the destination tile`);
    assert.deepEqual(tp[0][4].from, { x: COL, y: ROW }, `${id}: the dash fx carries the source tile`);
    // she really blocks the flyer whose tile she took (the official point of the move)
    h.step(2);
    assert.equal(h.b.enemies[0].blockedBy, u, `${id}: the flyer is blocked by her on (10,6)`);
    assert.deepEqual(u.blocking.map((e) => [e.tileR, e.tileC]), [[ROW, DASH_C]], `${id}: and she carries it in unit.blocking`);
    done(h);
  }
});

test('予愿安洁莉娜 S3: the NEAREST free blockable flyer of the range wins (a blocked / unblockable one loses)', () => {
  // three flyers in the cast range: (10,6) free, (9,7) held by the bait, (12,5) 不可阻挡 (blockWeight 0) — the dash
  // must take (10,6). Without the `blockedBy` / `blockWeight` filters a dumber pick (the first in scan order) could
  // take (9,7) or (12,5).
  const defs = { fly: flyer('fly'), held: flyer('held'), zero: flyer('zero') };
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120, defs: { enemies: defs },
    units: [
      { chessId: AG, row: ROW, col: COL, dir: DIR, skillIndex: IDX(AG, S3), carryState: { sp: 999 } },
      { chessId: 'chess_char_1_02_a', uid: 91, row: 9, col: 7 },
    ],
    enemies: [
      { key: 'fly', pos: [ROW, DASH_C] }, { key: 'held', pos: [9, 7] }, { key: 'zero', pos: [12, 5] },
    ],
    hooks: [], captureNoisy: true,
  });
  // the two rejections are the real fields the engine itself uses: `blockedBy` (Battle._checkBlock) and `blockWeight`
  h.step(1);
  const u = h.unit(AG);
  const bait = h.unit(91);
  const held = h.b.enemies.find((e) => e.defId === 'enemy_held');
  const zero = h.b.enemies.find((e) => e.defId === 'enemy_zero');
  held.blockedBy = bait;                 // already blocked: not 未被阻挡
  bait.blocking.push(held);
  // 不可阻挡 = blockWeight 0 (the field Battle._checkBlock reads). An AIR unit's block weight comes from its own
  // ability (`setEchoForm` / blockWeight content), so this one is set the way the content does it.
  zero.blockWeight = 0;
  assert.equal(zero.blockWeight, 0, 'the 不可阻挡 flyer carries blockWeight 0');
  assert.equal(held.blockWeight ?? 1, 1, 'the held flyer is blockable (blockWeight defaults to 1)');
  assert.ok(u.skill.active, 'S3 auto-cast at once');
  assert.deepEqual([u.tileR, u.tileC], [ROW, DASH_C], 'the nearest FREE, blockable flyer wins (10,6)');
  assert.deepEqual(u.mem.aglna2Home, { r: ROW, c: COL }, 'the cast tile is remembered');
  assert.equal(held.blockedBy, bait, 'the held flyer stays where it was');
  // the two rejected candidates really stand in the range she took off with (so the FILTER, not the range, kept her off
  // them). Measured on the cast tile by the spec grid: the live range already moved with her, so it cannot be read here.
  const castRange = rangeAt(specOf(kitOf(AG, S3).kit, S3), ROW, COL);
  assert.ok(castRange.includes(key(9, 7)), 'the held flyer stands in the cast range');
  assert.ok(castRange.includes(key(12, 5)), 'the unblockable flyer stands in the cast range');
  done(h);
});

// ---------------------------------------------------------------------------------------------------------------
// B) 技能结束回到原来的部署位置

test('予愿安洁莉娜 S3: the skill ends — she returns to her own deployment tile and forgets the dash', () => {
  for (const id of [AG, AG_B]) {
    const h = battleOf(id, { spawns: [{ key: 'fly', pos: [ROW, DASH_C] }], defs: { fly: flyer('fly') } });
    h.step(1);
    const u = h.unit(id);
    assert.deepEqual([u.tileR, u.tileC], [ROW, DASH_C], `${id}: dashed onto (10,6)`);
    const end = [];
    h.b.on('skillEnd', () => end.push([u.tileR, u.tileC, u.mem.aglna2Home]));
    assert.ok(h.runUntil(() => !u.skill.active, 60), `${id}: the skill ends (31 bullets)`);
    assert.deepEqual([u.tileR, u.tileC], [ROW, COL], `${id}: she is back on her deployment tile (10,4)`);
    assert.deepEqual([u.y, u.x], [ROW, COL], `${id}: y / x are the deployment tile again`);
    noDash(u);
    assert.equal(u.s.flags.liftoff, undefined, `${id}: landed`);
    assert.equal(u.canAct, true, `${id}: able to act after the skill`);
    // onEnd already ran to the end when skillEnd fires (skills.js end(): _call('onEnd') then emit('skillEnd')): the
    // recorded state is "home, memory cleared" — proof the return happened BEFORE the player saw the skill end
    assert.deepEqual(end, [[ROW, COL, null]], `${id}: skillEnd sees her already home with the memory cleared`);
    assert.equal(h.b._occ[ROW * 21 + COL], u, `${id}: the occupancy map says her home tile is hers`);
    assert.equal(h.b._occ[ROW * 21 + DASH_C], null, `${id}: the dashed tile is free again`);
    assert.equal(h.b.grid.groundPassable(u.tileR, u.tileC), true, `${id}: she stands on a tile a ground unit may stand on`);
    assert.equal(h.b.grid.isLow(u.tileR, u.tileC), true, `${id}: low ground (行动方式 stays ground)`);
    assert.equal(u.ground, true, `${id}: unit.ground`);
    done(h);
  }
});

test('予愿安洁莉娜 S3: a return the field refuses does NOT strand her — she stays and the battle runs on', () => {
  // the home tile is hard-blocked (a 射击台 switched on mid-skill) while she is away: `relocate` refuses the way back,
  // she keeps the tile she dashed to, no error, no retry, and she still attacks there
  const h = battleOf(AG, { spawns: [{ key: 'fly', pos: [ROW, DASH_C] }], defs: { fly: flyer('fly') } });
  h.step(1);
  const u = h.unit(AG);
  assert.deepEqual([u.tileR, u.tileC], [ROW, DASH_C], 'dashed onto (10,6)');
  h.b.setObstacle(ROW, COL, true);
  assert.equal(h.b.grid.groundPassable(ROW, COL), false, 'the home tile is impassable now');
  assert.ok(h.runUntil(() => !u.skill.active, 60), 'the skill ends');
  assert.deepEqual([u.tileR, u.tileC], [ROW, DASH_C], 'the refused return leaves her on the dashed tile (not stuck, not thrown)');
  noDash(u);
  assert.equal(u.canAct, true, 'she can act');
  assert.equal(u.alive, true, 'she is alive');
  assert.equal(h.b.errors.length, 0, `no error was raised (${JSON.stringify(h.b.errors.map((e) => e.message))})`);
  const a0 = u.stats.attacks;
  h.run(4);
  assert.ok(u.stats.attacks - a0 >= 2, `she still attacks on the tile she dashed to (${u.stats.attacks - a0} in 4 s)`);
  done(h);
});

// ---------------------------------------------------------------------------------------------------------------
// C) 一堵墙 → 不动, and she is NOT stuck: the skill keeps running and she keeps attacking

test('予愿安洁莉娜 S3: a flyer on an impassable tile (a wall) — she does NOT move, and she is not stuck', () => {
  const wallCol = 6;
  const h = battleOf(AG, {
    walls: [wallCol],
    spawns: [{ key: 'wallfly', pos: [ROW, wallCol] }, { key: 'ground', pos: [ROW, 8] }],
    defs: { wallfly: flyer('wallfly'), ground: dummy('ground') },
  });
  h.step(1);
  const u = h.unit(AG);
  assert.equal(h.b.grid.tile(ROW, wallCol).build, 'NONE', `the flyer's tile really is 不可部署 (# at (10,${wallCol}))`);
  assert.equal(h.b.grid.canStand(ROW, wallCol, { ranged: true }), false, 'grid.canStand refuses it even for a ranged unit');
  assert.deepEqual([u.tileR, u.tileC], [ROW, COL], 'she did NOT move ("如果是一堵墙，就不动")');
  noDash(u);
  assert.equal(u.skill.active, true, 'the skill is still running (the flyer did not cost her the skill)');
  assert.equal(u.canAct, true, 'she can act right after the cast');
  assert.equal(u.s.flags.liftoff, true, 'she did take off — only the move was refused');
  const acts = [];
  const a0 = u.stats.attacks;
  const a0t = h.b.time;
  for (let i = 0; i < 120 && !h.b.finished; i++) {
    h.step();
    acts.push([u.tileR, u.tileC, u.canAct, u.skill.active, u.blocking.length, h.b.time]);
    if (h.b.time - a0t >= 5) break;
  }
  assert.deepEqual([...new Set(acts.map((a) => `${a[0]},${a[1]}`))], [`${ROW},${COL}`],
    `her tile never changes over ${acts.length} ticks (${acts[0][5].toFixed(2)}–${acts[acts.length - 1][5].toFixed(2)} s)`);
  assert.deepEqual([...new Set(acts.map((a) => a[2]))], [true], `canAct is true on every tick (${JSON.stringify(acts.map((a) => a[2]))})`);
  assert.deepEqual([...new Set(acts.map((a) => a[3]))], [true], 'the skill stays up on every tick');
  assert.deepEqual([...new Set(acts.map((a) => a[4]))], [0], 'she blocks nothing while 起飞 (不阻挡地面敌人)');
  assert.ok(u.stats.attacks - a0 >= 2,
    `she keeps attacking the ground enemy in range (${u.stats.attacks - a0} attacks over ${(h.b.time - a0t).toFixed(2)} s of the skill)`);
  assert.equal(h.b.enemies.find((e) => e.defId === 'enemy_wallfly').blockedBy, null, 'the wall flyer is never blocked by her (she never moved)');
  assert.ok(h.runUntil(() => !u.skill.active, 60), 'the skill ends normally');
  assert.deepEqual([u.tileR, u.tileC], [ROW, COL], 'still on her own tile (there was nothing to return from)');
  noDash(u);
  done(h);
});

test('予愿安洁莉娜 S3: both guards are her OWN deploy form — 高台 RANGED (h) is refused, a deployable tile takes her', () => {
  // The legend (grid.js DEFAULT_LEGEND): 'h' = HIGH / build RANGED (a 高台 — deployable, but only for a RANGED
  // operator), 'b' = LOW / build ALL (the 围墙 / 围栏 — deployable, passable to flyers only). This operator is
  // `position: 'MELEE'` (a long MELEE range), so `grid.canStand(..., { ranged: false })` is exactly the test the match's
  // deploy map applies to her: the 高台 is NOT a tile she may be deployed on, the 围墙 is.
  // Row strings are per column: '##hrrhrrrfrrrrrrrf##' has 'h' at col 5, '##hrrrbrrrfrrrrrrrf##' has 'b' at col 6.
  const { def } = kitOf(AG, S3);
  assert.equal(def.raw.position, 'MELEE', 'the operator is a MELEE-position operator (her range is long, her tiles are not)');
  const hWall = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120, defs: { enemies: { fly: flyer('fly') } },
    units: [{ chessId: AG, row: ROW, col: COL, dir: DIR, skillIndex: IDX(AG, S3), carryState: { sp: 999 } }],
    enemies: [{ key: 'fly', pos: [ROW, 5] }], hooks: [], captureNoisy: true,
    flat: { rows: { 10: '##hrrhrrrfrrrrrrrf##' } },
  });
  hWall.step(1);
  const uWall = hWall.unit(AG);
  assert.equal(hWall.b.grid.tile(ROW, 5).glyph, 'h', '(10,5) is the 高台 glyph of the row we built');
  assert.equal(hWall.b.grid.tile(ROW, 5).height, 'HIGH', '(10,5) really is 高台 (h)');
  assert.equal(hWall.b.grid.canStand(ROW, 5, { ranged: false }), false, 'and a MELEE-position operator may not be deployed there');
  assert.equal(hWall.b.grid.canStand(ROW, 5, { ranged: true }), true, 'a RANGED operator could (the tile itself is deployable)');
  assert.deepEqual([uWall.tileR, uWall.tileC], [ROW, COL], 'so the dash refuses it and she stays');
  noDash(uWall);

  // the same flyer tile as a deployable 围墙 (b): she may stand there, so she dashes
  const hFence = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120, defs: { enemies: { fly: flyer('fly') } },
    units: [{ chessId: AG, row: ROW, col: COL, dir: DIR, skillIndex: IDX(AG, S3), carryState: { sp: 999 } }],
    enemies: [{ key: 'fly', pos: [ROW, DASH_C] }], hooks: [], captureNoisy: true,
    flat: { rows: { 10: '##hrrrbrrrfrrrrrrrf##' } },
  });
  hFence.step(1);
  const u = hFence.unit(AG);
  assert.equal(hFence.b.grid.tile(ROW, DASH_C).glyph, 'b', 'the destination is the 围墙 tile of the flat legend');
  assert.equal(hFence.b.grid.canStand(ROW, DASH_C, { ranged: false }), true, 'which is deployable for her form');
  assert.deepEqual([u.tileR, u.tileC], [ROW, DASH_C], 'she takes the deployable tile of the flyer');
  assert.equal(u.ground, true, 'the fence is LOW: she stays a ground unit (it only blocks ground ENEMIES)');
  assert.equal(u.skill.active, true, 'the skill runs on');
  assert.equal(u.canAct, true, 'she can act');
  assert.ok(hFence.runUntil(() => !u.skill.active, 60), 'the skill ends');
  assert.deepEqual([u.tileR, u.tileC], [ROW, COL], 'and she comes back home');
  done(hFence);
  done(hWall);
});

// ---------------------------------------------------------------------------------------------------------------
// D) 自身未阻挡时: while she is blocking, the dash does not happen

test('予愿安洁莉娜 S3: 自身未阻挡 — blocking a ground enemy, she does NOT dash', () => {
  const defs = { melee: dummy('melee', { speed: 1, atk: 10, bat: 2 }), fly: flyer('fly') };
  // sp 0: the cast is OURS, so the state at the moment of the cast is exactly the state asserted below
  const h = battleOf(AG, { spawns: [{ key: 'melee', pos: [ROW, 5] }, { key: 'fly', pos: [ROW, 8] }], defs, sp: 0 });
  const u = h.unit(AG);
  assert.ok(h.runUntil(() => u.blocking.length > 0, 20), 'she picks the ground enemy up (it walks into her)');
  const melee = u.blocking[0];
  assert.equal(melee.blockedBy, u, 'the enemy carries the mirror field the dash reads');
  assert.equal(u.skill.active, false, 'S3 has not been cast yet');
  assert.ok(u.rangeKeys.includes(key(ROW, 5)), 'the flyer stands in the range she took off with (the dash would fire but for her own block)');
  assert.equal(h.b.enemies.find((e) => e.defId === 'enemy_fly').blockedBy, null, 'the flyer is free (未被阻挡) — only HER own block stops the dash');
  u.skill.charges = 1; u.skill.sp = u.skill.spCost;
  assert.ok(u.skill.activate('test', { free: true }), 'S3 cast');
  h.step();
  assert.deepEqual([u.tileR, u.tileC], [ROW, COL], 'no dash while she is blocking ("且自身未阻挡时")');
  noDash(u);
  assert.equal(u.s.flags.liftoff, true, 'she still took off');
  assert.equal(u.blocking.length, 0, '起飞 drops the ground block (不阻挡地面敌人)');
  assert.equal(melee.blockedBy, null, 'and the enemy is released');
  assert.equal(u.rangeKeys.length, 22, 'her range is the plain cast range (22 格 at her own tile)');
  assert.ok(h.eventsOf('fx').every((e) => e[1] !== 'teleport'), 'no displacement fx was drawn');
  done(h);
});

// ---------------------------------------------------------------------------------------------------------------
// E) 不回归: S1 9 / S2 15 / S3 22, no spec of the kit lost its own callbacks, S2's glide stays VFX-only

test('予愿安洁莉娜: the kit is unchanged where it must be — S1 9 / S2 15 / S3 22 格 and no enemy-state leak', () => {
  const NINE = 9, FIFTEEN = 15;
  for (const id of [AG, AG_B]) {
    const s1 = kitOf(id, 'skchr_aglna2_1'), s2 = kitOf(id, 'skchr_aglna2_2'), s3 = kitOf(id, S3);
    assert.equal(s1.def.raw.skill.rangeId, '3-6', `${id}: S1 rangeId`);
    assert.equal(s2.def.raw.skill.rangeId, '3-10', `${id}: S2 rangeId`);
    assert.equal(s3.def.raw.skill.rangeId, '3-9', `${id}: S3 rangeId`);
    assert.equal(absoluteRangeKeys(specOf(s1.kit, 'skchr_aglna2_1').targeting.rangeGrid, ROW, COL, DIR, 0).length, NINE, `${id}: S1 9 格`);
    assert.equal(absoluteRangeKeys(specOf(s2.kit, 'skchr_aglna2_2').targeting.rangeGrid, ROW, COL, DIR, 0).length, FIFTEEN, `${id}: S2 15 格`);
    assert.equal(specOf(s3.kit, S3).targeting.rangeGrid.length, 22, `${id}: S3 spec grid = 19 ∪ 周围8格`);
    assert.equal(typeof specOf(s3.kit, S3).onStart, 'function', `${id}: S3 has its own onStart (take-off + dash)`);
    assert.equal(typeof specOf(s3.kit, S3).onEnd, 'function', `${id}: S3 has its own onEnd (land + return)`);
    assert.equal(typeof specOf(s1.kit, 'skchr_aglna2_1').onStart, 'function', `${id}: S1 keeps the plain toAir`);
    assert.equal(specOf(s1.kit, 'skchr_aglna2_1').targeting.maxTargets, 2, `${id}: S1 targets 2`);
    assert.equal(specOf(s2.kit, 'skchr_aglna2_2').targeting.maxTargets, Number(s2.def.skill.bb['attack@max_target']), `${id}: S2 targets attack@max_target`);
    assert.equal(specOf(s3.kit, S3).targeting.maxTargets, 3, `${id}: S3 walk targets = 3`);
    assert.equal(specOf(s3.kit, S3).attack.atkScale, Number(s3.def.skill.bb['attack@atk_scale']), `${id}: S3 damage scale`);
    assert.equal(s3.kit.skill.levitate, true, `${id}: the S2 浮空 capability marker is still a spec FIELD`);
    assert.equal(s3.kit.skill.flags.levitate, undefined, `${id}: and never a skill flag`);
    // the live numbers in a battle: S1 9 / S2 15 / S3 22 — and a GROUND enemy never triggers the dash
    for (const [sk, n] of [['skchr_aglna2_1', NINE], ['skchr_aglna2_2', FIFTEEN], [S3, 22]]) {
      const h = makeBattle({
        seed: 3, autoFinish: false, timeLimit: 60,
        units: [{ chessId: id, row: ROW, col: COL, dir: DIR, skillIndex: IDX(id, sk), carryState: { sp: 999 } }],
        enemies: [{ key: 'e_dummy', pos: [ROW, 7] }], defs: { enemies: { e_dummy: dummy('e_dummy') } },
        hooks: [], captureNoisy: true,
      });
      h.step(1);
      const u = h.unit(id);
      if (!u.skill.active) { u.skill.charges = 1; u.skill.sp = u.skill.spCost; u.skill.activate('test', { free: true }); }
      h.step();
      assert.equal(u.rangeKeys.length, n, `${id} ${sk}: live rangeKeys = ${n} 格`);
      assert.deepEqual([u.tileR, u.tileC], [ROW, COL], `${id} ${sk}: no flyer → no dash, she stays put`);
      noDash(u);
      done(h);
    }
  }
});

test('予愿安洁莉娜 S2: the glide stays VFX-only (the dash must not have touched GLIDE_STEPS / glideFx)', () => {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 60,
    units: [{ chessId: AG, row: 9, col: 5, dir: DIR, skillIndex: IDX(AG, 'skchr_aglna2_2'), carryState: { sp: 999 } }],
    enemies: [], hooks: ['fx'], captureNoisy: false,
  });
  h.step(1);
  const u = h.unit(AG);
  if (!u.skill.active) { u.skill.charges = 1; u.skill.sp = u.skill.spCost; u.skill.activate('test', { free: true }); }
  const before = [u.tileR, u.tileC, u.x, u.y];
  h.step();
  assert.deepEqual([u.tileR, u.tileC, u.x, u.y], before, 'S2 moves nothing');
  const bursts = h.eventsOf('fx').filter((e) => e[4]?.skill === 'aglna2Sweep').map((e) => [e[3], e[2]]);
  assert.deepEqual(bursts, [[9, 6], [9, 7]], 'S2 still streaks GLIDE_STEPS = 2 tiles ahead');
  h.runUntil(() => !u.skill.active, 40);
  assert.deepEqual([u.tileR, u.tileC], [9, 5], 'S2 leaves her on her own tile');
  noDash(u);
  done(h);
});
