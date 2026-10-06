# 盟约叠层机制（MOD 记录）

> 本文记录《卫戍协议：盟约》的盟约「叠层」机制，以及本 MOD 对它的改动。
> 数据源：`data/bonds.json`（单行 JSON，用 Node 读）、`data/garrisons.json`、`data/config.json`。
> 权威依据：官方数据表与 PRTS；本 MOD 的偏离处均单独标注。

---

## 一、两类盟约

`data/bonds.json` 的顶层是 `{ [bondId]: bondRecord }`，共 **23 个**盟约，用 **`isCore`** 区分两类：

| | 核心盟约 | 副盟约 |
|---|---|---|
| 个数 | **8** | **15** |
| 判据 | `isCore: true` | `isCore: false` |
| 类型 | `bondType: "SEASON"` | `bondType: "REGULAR"` |
| 激活人数 | **`activeCount: 3`**（全部 8 个一致） | **`activeCount: 2`**（多数；投资人 3、调和 1、独行 1） |
| 成员 | 炎 / 萨尔贡 / 维多利亚 / 谢拉格 / 拉特兰 / 阿戈尔 / 叙拉古 / 卡西米尔 | 精准 / 迅捷 / 灵巧 / 奥术 / 坚守 / 助力 / 远见 / 奇迹 / 投资人 / 突袭 / 不屈 / 调和 / 协防干员 / 独行 / 绝技 |

**成员表**：每个盟约有 `members: [chessId…]`，由各棋子的 `bonds: []` 字段派生（本 MOD 在 `data/chess.json` 里改 `bonds` 后，成员表同步重建）。

**计数口径 `countMode`**：

| 取值 | 含义 | 使用者 |
|---|---|---|
| `BOARD` | 只数**场上**成员 | 大多数核心盟约与副盟约 |
| `BOARD_AND_DECK` | 场上 + **整备区** | 远见、奇迹、投资人 |
| `BOARD_ALL_CHESS` | 场上全部棋子 | 绝技 |

相关字段：`countsHand`（是否计入备战/手牌）、`countsGoldenOnly`（是否只数精锐）、`isActiveInDeck`。

**激活阈值 `thresholds`**：数组，如 `[2]`、`[3,6]`、`[3,6,9]`。达到第 N 档解锁第 N 级的加成。`activeCount` 是**最低激活人数**（达到即可激活盟约本身），`thresholds` 是**加成档位**。

---

## 二、叠层（layer）机制

叠层是独立于「激活」的另一条线：盟约激活后，**层数**可以继续累积，带来额外收益。上限 **`BOND_LAYER_CAP = 999`**（`shared/constants.js`），达到上限时再加层返回 0 且不派发事件。

### 2.1 层数从哪来

层数由**驻防（garrison）触发**产生，走同一条链路：

```
驻防触发 → battle.js 的 bond_add_type 分派 → 取加层数 n
        → S.gainLayers(battle, { playerId, bonds, n, requireActive, source })
        → battle.addLayers(playerId, bondId, n, reason, …)        （战斗内，受 BOND_LAYER_CAP 限制）
        → PlayerState.addLayers(bondId, n, …)                     （备战侧）
```

**加层数 `n` 的来源**（`server/sim/content/garrisons/battle.js:178-180`）：

| `bond_add_type` | 加层数 `n` |
|---|---|
| `by_charcount_samerow` | `同行干员数 × bb.bond_add_count_multi`（缺省 `bb.bond_add_count`） |
| `by_charlevel` | `干员阶 × bb.bond_add_count` |
| **默认（其余，含本 MOD）** | **`bb.bond_add_count`** |

⚠️ 注意**两个不同的字段名**，别混：

| 字段 | 使用者 | 例 |
|---|---|---|
| `bb.count` | 官方一批驻防（`garrisons/meta.js:99/106` 的 `addAll(..., num(bb.count), …)`） | `garrison_25_a: {count: 2}` |
| **`bb.bond_add_count`** | 另一批（含**本 MOD 的全部 5 条**） | `garrison_makoto_switch_a: {bond_add_count: 1}` |

### 2.2 每层加成的数值

`perStackParams` 声明该盟约**每个层数单位**加成哪些参数，具体值在该盟约的 `bb` 里：

| 盟约 | `perStackParams` |
|---|---|
| 炎 / 精准 / 突袭 | `atk_per_stack` |
| 萨尔贡 | `time_per_stack` |
| 维多利亚 / 奥术 | `damage_scale_per_stack` |
| 拉特兰 | `ammo_percent_per_stack` |
| 阿戈尔 | `max_hp_per_stack` |
| 叙拉古 | `attack_speed_per_stack`、`duration_per_stack`、`damage_per_stack` |
| 卡西米尔 | `max_atk_when_born_per_stack` |
| 迅捷 | `prob_per_stack` |
| 灵巧 | `attack_speed_per_stack` |
| 坚守 | `max_hp_per_stack`、`damage_value_per_stack` |
| 助力 | `def_per_stack` |
| **奇迹** | `prob`（`baseParams: ["baseprob"]`） |
| 不屈 | `prob_per_stack` |

### 2.3 层数里程碑 `layerMilestones`

每个盟约可声明若干里程碑，`{ layer, mode, effect }`：

| `mode` | 语义 | 例 |
|---|---|---|
| `every` | 层数**每**跨过 `layer` 的整数倍就触发一次 | 远见 `10:every` → 每 10 层给 2 资金 |
| `first` | **首次**达到 `layer` 时触发一次 | 远见 `80:first` → 远见干员购买价永久 −1 |
| `reach` | 达到 `layer` 后持续/单次生效 | 迅捷 `40:reach` |

| 盟约 | 里程碑（层:模式） |
|---|---|
| 远见 `visiShip` | 10:every、80:first、150:first |
| 奇迹 `miraShip` | 100:every（每 100 层给 20 资金） |
| 迅捷 / 灵巧 | 40:reach |
| 突袭 | 50:reach |
| 投资人 | 100:reach |
| 其余 | 无 |

---

## 三、本 MOD 的改动

### 3.1 予愿安洁莉娜：盟约【远见】→【奇迹】

`data/chess.json` 的 `chess_char_1015_aglna2_a/_b`：

```diff
- "bonds": ["siracusaShip", "swiftShip", "visiShip"]
+ "bonds": ["siracusaShip", "swiftShip", "miraShip"]
```

成员表同步：`visiShip.members` 去掉 `chess_char_1015_aglna2_a`，`miraShip.members` 加入。

**叠层方式是否改变**：两个盟约的 `activeCount`(2) / `countMode`(`BOARD_AND_DECK`) / `noStack`(false) / `thresholds`(`[2]`) **完全一致**，所以**激活与叠层方式不变**。唯一的差异是**里程碑**：

| | 远见（换之前） | 奇迹（换之后） |
|---|---|---|
| 里程碑 | 每 10 层给 2 资金；80 层远见干员 −1；150 层全体 −1 | **每 100 层给 20 资金** |
| 算术 | 100 层 = 20 资金（10×2） | 100 层 = 20 资金 ✅ 等价 |

### 3.2 本数调整（`tier` 字段）

| 干员 | tier | price |
|---|---|---|
| 结城理 | 3 → **4** | 3（tier 4 规范价） |
| 予愿安洁莉娜 | 3 → **5** | 3 → **4**（tier 5 规范价） |

「本数」即 `data/chess.json` 的 **`tier`** 字段（1–6）。连带影响：商店池的 tier 分布与抽取份额（见 `data/config.json` 的 `economy.poolCopies`）。

### 3.3 叠层数量 1 → 2

本 MOD 的 **5 条驻防**（`data/garrisons.json`）的 `bb.bond_add_count` 从 **1 改为 2**：

| 驻防 id | 触发条件 | 加成盟约 | `bond_add_count` |
|---|---|---|---|
| `garrison_makoto_switch_a` | 结城理被击倒或替身⇄本体切换 | 拉特兰 | 1 → **2** |
| `garrison_makoto_kill_a` | 结城理每击倒 1 名单位 | 精准 | 1 → **2** |
| `garrison_makoto_heal_a` | 俄耳甫斯治疗时 | 灵巧 | 1 → **2** |
| `garrison_aglna2_float_a` | 每次释放可施加浮空的技能 | 远见（`visiShip`，**待随盟约切换复核**） | 1 → **2** |
| `garrison_aglna2_takeoff_a` | 己方任意干员起飞（含自身） | 叙拉古 + 迅捷 | 1 → **2** |

**影响面**：仅这 5 条（`bond_add_count` 共 63 条，另 58 条为官方，未改动）。`desc` / `descRaw` 文本里的 `+1` 已同步为 `+2`。

> ⚠️ 注意 `garrison_aglna2_float_a` 加成的盟约仍是 **`visiShip`（远见）**，而予愿安洁莉娜已换成 `miraShip`（奇迹）。该驻防是**独立的驻防记录**，不随干员的 `bonds` 自动改变 —— 如需跟着换成奇迹，必须单独改它的 `bbStr.bond_id`。

---

## 四、验收断言（可复现）

```powershell
cd "D:\龙穴\Maple的代码库\deepseek H\scratch\stronghold-protocol"
node --test        # 全量：tests 3642 / pass 3638 / fail 0 / skipped 4
node --test test/data.test.js test/match/pool.test.js test/content/bonds.test.js
```

数值口径（与 `data/bonds.json` + `data/config.json` 一致）：

- 盟约总数 **23** = 核心 **8** + 副 **15**
- 核心盟约 `activeCount` 全为 **3**；副盟约多数为 **2**
- visible 棋子 **114**（含 MOD 2 条 `_a`），总记录 **270**
- visible per tier = `{1:16, 2:17, 3:19, 4:23, 5:20, 6:19}`
- L6 抽取份额 ≈ `{1:0.1377, 2:0.1707, 3:0.2453, 4:0.2640, 5:0.1148, 6:0.0674}`
  （由 `config.economy.poolCopies` = `{1:12, 2:14, 3:18, 4:16, 5:8, 6:5}` 与各 tier 棋数算出）
