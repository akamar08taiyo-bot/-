#!/usr/bin/env python3
"""絵コンテ（制作の正本）。scenes.json と 絵コンテ.md を書き出す。

各シーン:
  id, part, dur(次のシーン開始までの秒), jp(内容), prompt(画像生成), refs(登場人物),
  move(カメラ), fx(重ねる効果), amb(環境音), sfx(単発の音 [名前, 開始秒, 音量dB]),
  line(セリフID), text(画面の文字), overlay(コードで描く小物), bgm(区間)
"""
import json, os

ERA_1997 = ("Setting: a small seaside town in Japan, summer 1997. Everything must be period-accurate for 1997 Japan: "
            "bulky CRT televisions, no smartphones, no flat screens, no modern cars, no modern signage.")
ERA_2026 = "Setting: Japan, autumn 2026 (present day)."
STYLE = ("Style: Japanese anime feature-film background art with hand-painted detail and soft cel-shaded characters, "
         "warm natural light, gentle haze, nostalgic atmosphere, cinematic 16:9 composition, subtle film grain. "
         "Original artwork, not imitating any specific studio or existing anime. "
         "Absolutely no text, letters, numbers, readable signs, logos, brand names, watermark or signature anywhere.")
REF_TEXT = {
    "haruto": "HARUTO is the boy in the attached reference sheet with the sky-blue striped T-shirt (keep his face, cowlick hair, clothes and the egg-shaped toy on his belt exactly)",
    "yusuke": "YUSUKE is the buzz-cut boy in the attached reference sheet with red raglan sleeves and a bandage on his cheek (keep his face, hair and clothes exactly)",
    "adult": "the man is ADULT HARUTO from the attached reference sheet (39 years old, charcoal sweater; keep his face and cowlick)",
}
TOY_RULES = ("Toy race cars are small generic motorized 4WD plastic model cars of original design with small side guide rollers, no logos or stickers with text. "
             "The virtual pet is a small white egg-shaped keychain toy with three round buttons and a small rectangular LCD screen, no logo.")

S = []
def sc(id, part, dur, jp, prompt, refs=(), move="in", fx=(), amb=(), sfx=(), line=None, text=None,
       overlay=None, bgm=None, era="1997", xfade=1.6):
    S.append(dict(id=id, part=part, dur=dur, jp=jp, prompt=prompt, refs=list(refs), move=move, fx=list(fx),
                  amb=list(amb), sfx=[list(x) for x in sfx], line=line, text=text, overlay=overlay,
                  bgm=bgm, era=era, xfade=xfade))

# ───────── プロローグ（2026年 秋） ─────────
sc("P01", "プロローグ", 7.5, "2026年秋。取り壊し前の実家。玄関に段ボール。",
   "An old two-story wooden Japanese family house with a grey tiled roof in a quiet seaside town on an autumn afternoon; its sliding front door is open and several cardboard moving boxes are stacked by the entrance; a small white kei truck with no markings is parked in front; a persimmon tree with orange fruit, long soft golden shadows. No people. Quiet and melancholic.",
   move="in", fx=["dust"], amb=["autumn_day"], bgm="M0", era="2026", xfade=2.5)
sc("P02", "プロローグ", 8.0, "空になった子ども部屋。大人になったハルトが、古いお菓子の缶を開ける。",
   "Inside an emptied child's bedroom of an old Japanese house, afternoon light through a window with lace curtains, pale rectangles on the wall where posters used to hang, cardboard boxes; the man kneels on the tatami floor seen from a three-quarter back angle, lifting the lid of a dusty faded blue square metal cookie tin with a generic flower pattern.",
   refs=["adult"], move="in", fx=["dust"], amb=["room_2026"], sfx=[["tin_lid", 2.6, -12]], bgm="M0", era="2026")
sc("P03", "プロローグ", 8.0, "缶の中身：穴だらけの青いレーサー、卵型の電子ペット、電池、ビー玉、手描きのコース図、写真。",
   "Close-up top-down view into an open old blue metal cookie tin on tatami: childhood treasures from the 1990s — a small toy 4WD race car with a translucent blue body and a black chassis full of small drilled holes, a white egg-shaped keychain virtual pet toy with three buttons and a small blank screen, three old AA batteries, a few glass marbles, a folded hand-drawn race course map on notebook paper, and a faded photo print face down. Soft window light, floating dust, shallow depth of field.",
   move="pan_r", fx=["dust"], amb=["room_2026"], bgm="M0", era="2026")
sc("P04", "プロローグ", 8.0, "写真のアップ。模型店のコースの前で笑う二人。右下にオレンジの日付。",
   "Close-up of an old faded color photo print held between a man's fingers, the print fills most of the frame: the photo shows two 10-year-old Japanese boys, HARUTO and YUSUKE, grinning side by side and holding small toy race cars in front of a white plastic three-lane toy race track inside a small hobby shop; slightly overexposed on-camera flash look with a warm color cast, like a disposable camera snapshot from summer 1997. The bottom-right corner of the photo is plain and empty.",
   refs=["haruto", "yusuke"], move="in", fx=["dust"], amb=["room_2026"], overlay="datestamp", bgm="M0", era="2026", xfade=1.6)

# ───────── タイトル ─────────
sc("S01", "朝", 10.0, "1997年夏。入道雲と町。タイトル「電池の夏」。",
   "A breathtaking vast deep-blue summer sky with towering white cumulonimbus clouds above a small Japanese seaside town of grey tiled roofs, bright green rice fields and a sparkling sea in the distance, utility poles and wires in the foreground, morning light. No people.",
   move="up", fx=["rays", "dust"], amb=["morning"], text="title", bgm="M1", xfade=2.8)

# ───────── 朝 ─────────
sc("S02", "朝", 8.0, "朝。枕元で電子ペットが鳴る。タオルケット、扇風機。",
   "Early morning in a 1990s Japanese boy's tatami bedroom: HARUTO sleeps under a thin striped towel blanket on a futon; on the pillow beside his face lies the white egg-shaped virtual pet toy; an electric fan by the window, a low wooden desk with a red school backpack (randoseru) and a summer workbook, soft morning sun through the window, a glass wind chime hanging outside.",
   refs=["haruto"], move="in", fx=["rays", "dust"], amb=["morning", "fan"], sfx=[["pet_alarm", 1.2, -14]], bgm="M1")
sc("S03", "朝", 8.0, "電子ペットのアップ。ボタンを押してごはん。",
   "Extreme close-up of a 10-year-old boy's fingertips holding a white egg-shaped keychain virtual pet toy and pressing one of its three small round buttons; the small rectangular LCD screen faces the camera directly and is completely blank, plain pale grey-green with nothing on it; soft morning light, shallow depth of field, futon blurred behind.",
   move="in", fx=["dust"], amb=["morning", "fan"], sfx=[["pet_btn", 1.6, -16], ["pet_btn", 2.4, -16], ["pet_eat", 3.2, -18]], overlay="pet_eat", bgm="M1")
sc("S04", "朝", 8.0, "ベランダの朝顔と観察日記。",
   "A small veranda of a Japanese house on a summer morning: blue and purple morning glory flowers blooming on a bamboo trellis in a green plastic school planter pot, a child's observation diary notebook lying open beside a small yellow watering can, dew drops sparkling, morning sunlight, a cat sleeping nearby.",
   move="pan_r", fx=["rays", "dust"], amb=["morning"], bgm="M1")
sc("S05", "朝", 8.0, "玄関でスニーカーをはく。腰に電子ペット、横にレーサーのケース。",
   "At the genkan entrance of a 1990s Japanese house: HARUTO sits on the wooden step tying his sneakers, beside him a clear plastic carrying case holding a small toy race car, the egg-shaped virtual pet hanging from his belt loop on a short chain; the sliding front door is open to bright summer light and a green garden.",
   refs=["haruto"], move="in", fx=["rays"], amb=["morning"], bgm="M1")
sc("S06", "朝", 8.5, "二人で自転車。田んぼの坂を下る。前かごにレーサー。",
   "HARUTO and YUSUKE ride their bicycles side by side down a gentle sloping country road between bright green rice fields toward a small seaside town, huge blue sky with cumulonimbus clouds, small plastic cases holding toy race cars in their front bicycle baskets, summer morning wind in their hair, seen from a low angle in front.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["day", "bike"], sfx=[["bike_bell", 1.0, -18]], bgm="M1")
sc("S07", "朝", 8.0, "町の小さな模型店の外観。自転車がとまっている。",
   "Exterior of a small old family-run toy and hobby model shop on a quiet Japanese shopping street in summer 1997: a faded striped awning, display windows with colorful model kit boxes (no readable text), a capsule toy vending machine, several kids' bicycles parked out front, utility poles, bright noon sun and deep shadows. No readable signs.",
   move="pan_l", fx=["rays"], amb=["day"], bgm="M1")
sc("S08", "朝", 8.5, "模型店の中。箱が天井まで。パーツのショーケースをのぞく二人。",
   "Interior of a small 1990s Japanese hobby shop: walls stacked to the ceiling with colorful boxes of toy race car kits (illustrated cars, no readable text, no logos), a glass display case full of tiny spare parts (small motors, wheels, rollers) in blister packs, an elderly shopkeeper sitting behind the counter beside a small electric fan, HARUTO and YUSUKE leaning over the glass case looking at parts, warm light.",
   refs=["haruto", "yusuke"], move="in", fx=["dust"], amb=["shop"], bgm="M1")
sc("S09", "朝", 8.5, "店の3レーンのコース。身を乗り出す子どもたち。",
   "Inside the hobby shop: a white plastic three-lane toy race circuit with a lane-change bridge set on a big table; several excited kids including HARUTO and YUSUKE lean over the side rails; small toy race cars speed along the lanes with motion blur; warm daylight from the shop window.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["dust"], amb=["shop", "track"], bgm="M1")
sc("S10", "朝", 8.0, "スタート直前。白赤のハルト号と、青いユウスケ号。",
   "Low-angle close-up at the start line of a white plastic toy race track: two small toy 4WD race cars side by side, one with a white and red body and one with a translucent blue body, held by two boys' fingertips, wheels about to spin; shallow depth of field, the two boys' excited faces blurred in the background.",
   move="in", fx=["dust"], amb=["shop"], sfx=[["motor_rev", 2.0, -14], ["motor_pass", 5.6, -14]], bgm="M1")
sc("S11", "朝", 8.0, "駄菓子屋の軒先。ラムネ、10円ゲーム、寝ている犬。",
   "Outside a tiny old dagashiya penny candy shop in a Japanese back alley on a hot summer afternoon: HARUTO and YUSUKE sit on a wooden bench in the shade drinking from glass ramune bottles with marbles inside, a small old coin-operated arcade game cabinet next to the bench, an ice cream freezer chest, hanging snack bags with no readable text, a dog sleeping in the shade.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["day"], sfx=[["ramune", 1.4, -12]], bgm="M1")
sc("S12", "朝", 8.0, "駄菓子屋の中。手のひらに10円玉と100円玉。電子ペットが「おなかすいた」。",
   "Inside a cozy cluttered dagashiya: rows of small colorful cheap snacks and candies in boxes and jars with no readable text or logos, a kind elderly woman shopkeeper sitting on a raised tatami platform, a boy's open palm holding a few small coins over the counter, the white egg-shaped virtual pet hanging from his belt, warm afternoon light.",
   refs=["haruto"], move="in", fx=["dust"], amb=["shop_quiet"], sfx=[["coins", 1.6, -14], ["pet_alarm", 4.8, -18]], bgm="M1", xfade=2.2)

# ───────── 午後 ─────────
sc("S13", "午後", 9.0, "縁側で改造。新聞紙、ピンバイス、蚊取り線香、風鈴。",
   "On the wooden engawa veranda of an old Japanese house on a summer afternoon: HARUTO and YUSUKE sit cross-legged on spread newspaper, carefully modifying small toy race cars with tiny screwdrivers and a hand pin-vise drill; plastic parts runners, tiny motors, AA batteries and a parts tray around them; an electric fan, a glass wind chime, a pig-shaped mosquito coil holder with rising smoke, bright green garden, dappled sunlight.",
   refs=["haruto", "yusuke"], move="in", fx=["rays", "dust"], amb=["engawa"], bgm="M2", xfade=2.2)
sc("S14", "午後", 8.0, "手のアップ。電池を手でこすって温める／肉抜きした穴だらけのシャーシ。",
   "Close-up of two boys' hands on the engawa: one boy rubs two AA batteries between his palms to warm them up, the other holds a black toy race car chassis with many small drilled holes for lightness; tiny plastic shavings on the newspaper; bright afternoon sun and soft shadows.",
   move="in", fx=["dust"], amb=["engawa"], bgm="M2")
sc("S15", "午後", 8.0, "家の前のアスファルト。陽炎の中、まっすぐ走るレーサーを追いかける。",
   "A sun-baked asphalt residential street in a quiet 1990s Japanese town with heat haze: a small toy race car with a white and red body speeds along the curb, HARUTO runs after it laughing, YUSUKE watching from the side, concrete block walls, utility poles, blue sky with cumulonimbus clouds.",
   refs=["haruto", "yusuke"], move="pan_l", fx=["rays"], amb=["day"], sfx=[["motor_pass", 0.8, -12]], bgm="M2")
sc("S16", "午後", 8.0, "小石でひっくり返ったレーサー。笑うユウスケ。",
   "On the same hot asphalt street: the small white and red toy race car lies flipped upside down after hitting a pebble, its wheels still spinning; HARUTO crouches to pick it up while YUSUKE laughs, bending over; long afternoon shadows.",
   refs=["haruto", "yusuke"], move="in", fx=[], amb=["day"], sfx=[["flip", 0.6, -14]], bgm="M2")
sc("S17", "午後", 8.0, "田んぼの上に、急に黒い雲。",
   "Late afternoon over vast green rice fields in the Japanese countryside: dark heavy storm clouds rapidly gathering, wind bending the rice plants in waves, the light turning dramatic; two small boys with bicycles on a farm road look up at the sky, seen from far away.",
   refs=["haruto", "yusuke"], move="up", fx=[], amb=["storm"], sfx=[["thunder_far", 3.0, -16]], bgm="M2")
sc("S18", "午後", 8.5, "夕立。店の軒下で雨やどり。アスファルトから湯気。",
   "A sudden heavy summer downpour: HARUTO and YUSUKE stand sheltering under the narrow eaves of a closed old shop with their bicycles, rain pouring in sheets, splashes on the asphalt, steam rising from the hot road, grey light.",
   refs=["haruto", "yusuke"], move="in", fx=["rain"], amb=["rain_heavy"], sfx=[["thunder", 2.0, -12]], bgm="M2")
sc("S19", "午後", 8.5, "雨の軒下。通信ケーブルでつないだ携帯ゲーム機。",
   "Under the eaves during the rain: the two boys sit side by side on an old wooden bench, each holding a small plain grey handheld game device with no logo, the two devices connected by a thin link cable, their faces softly lit by the small screens, rain falling behind them, cozy and quiet.",
   refs=["haruto", "yusuke"], move="in", fx=["rain"], amb=["rain_soft"], sfx=[["bleeps", 2.5, -22], ["bleeps", 5.5, -22]], bgm="M2")
sc("S20", "午後", 8.0, "雨上がり。水たまりに夕空、うっすら虹。",
   "After the rain: puddles on a country road reflect a glowing orange and pink evening sky, a faint rainbow over the small town and rice fields, wet utility poles and wires sparkling, HARUTO and YUSUKE ride their bicycles through the puddles, splashing water.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["rays"], amb=["after_rain"], bgm="M2")
sc("S21", "午後", 8.0, "夕方の公園。ヨーヨーの技、ブランコのハルト。",
   "A small neighborhood park at sunset in 1990s Japan: YUSUKE performs a trick with a simple plastic yo-yo while HARUTO watches sitting on a swing, long shadows, a slide and a jungle gym, warm orange light, a few dragonflies in the air.",
   refs=["haruto", "yusuke"], move="in", fx=["rays", "dust"], amb=["dusk"], sfx=[["swing", 0.5, -20]], bgm="M2", xfade=2.4)
sc("S22", "夕方", 11.0, "高台から町。防災無線のスピーカーから「夕焼け小焼け」の5時のチャイム。",
   "Dusk view of a small Japanese seaside town from a hillside: rooftops, rice fields and the sea glowing in the sunset, a concrete utility pole with an outdoor public-address loudspeaker horn in the foreground, a few tiny children walking home along a road far below, first lights in the windows.",
   move="in", fx=["rays"], amb=["dusk"], sfx=[["chime5", 0.6, -15]], bgm=None, xfade=2.4)
sc("S23", "夕方", 9.0, "堤防を自転車押して帰る。ハルト「なあ、あしたも走らせに行こうぜ」",
   "Dusk: HARUTO and YUSUKE walk home side by side pushing their bicycles along a riverside embankment path, silhouetted against a deep orange and purple sky, the river reflecting the light, YUSUKE turning his head to talk to HARUTO.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["rays"], amb=["dusk", "river"], line="L1", bgm=None)
sc("S24", "夕方", 8.5, "夕飯。ブラウン管でナイター。茶碗の横に電子ペット、母の指が「しまいなさい」。",
   "Evening in a 1990s Japanese family dining room: a low table with dinner (rice, grilled fish, miso soup, cold tofu, sliced watermelon), a bulky CRT television on a wooden stand showing a night baseball game with no readable text, a round ceiling light with a pull string, HARUTO eating and glancing at the white egg-shaped virtual pet beside his rice bowl, his mother's hand pointing at it; warm lamp light, dark blue windows.",
   refs=["haruto"], move="in", fx=[], amb=["dinner"], bgm=None, xfade=2.2)

# ───────── 夜〜晩夏 ─────────
sc("S25", "夜", 8.5, "神社の夏祭り。提灯、水ヨーヨー、綿あめ、甚平。",
   "Night at a small Japanese summer festival at a shrine: rows of glowing red-and-white paper lanterns, food stalls, water balloon yo-yos floating in a little pool, HARUTO and YUSUKE in jinbei summer festival clothes holding cotton candy and water balloons, warm lantern light, crowds softly blurred.",
   refs=["haruto", "yusuke"], move="pan_l", fx=["dust"], amb=["festival"], bgm="M3", xfade=2.4)
sc("S26", "夜", 8.5, "川の花火。土手に座る二人の後ろ姿。",
   "Night: big colorful fireworks bloom over a wide river and are reflected on the water; HARUTO and YUSUKE sit on the grassy embankment seen from behind, their faces lit by the fireworks, a crowd of silhouettes along the riverbank.",
   refs=["haruto", "yusuke"], move="up", fx=["flicker"], amb=["fireworks"], bgm="M3")
sc("S27", "夜", 8.0, "深夜の部屋。月明かり、扇風機、枕元で光る電子ペット。",
   "Late night in HARUTO's tatami bedroom: HARUTO sleeps on his futon in blue moonlight from the open window, the egg-shaped virtual pet beside his pillow with its tiny screen faintly glowing, the electric fan slowly turning, a glass wind chime outside the window.",
   refs=["haruto"], move="in", fx=[], amb=["night", "fan"], bgm="M3")
sc("S28", "夜", 8.5, "朝。電子ペットを両手で見つめるハルト。画面にはおばけ（お世話が間に合わなかった）。",
   "Morning, over-the-shoulder close-up: HARUTO sits on his futon holding the white egg-shaped virtual pet in both hands, looking down at it with a sad quiet expression; the toy's small rectangular LCD screen faces the camera directly and is completely blank, plain pale grey-green; soft grey morning light.",
   refs=["haruto"], move="in", fx=[], amb=["morning_quiet"], sfx=[["pet_flat", 1.0, -20]], overlay="pet_ghost", bgm="M3")
sc("S29", "晩夏", 8.5, "8月末。デパート屋上の大会。大きなコースと人だかり。",
   "Late August: a big toy race car tournament on the rooftop of a 1990s Japanese department store: a large multi-lane white plastic race circuit with lane-change bridges, crowds of kids and parents, colorful plain banners with no text, a white event tent, bright summer sky.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["rays"], amb=["event"], bgm="M3")
sc("S30", "晩夏", 8.0, "レーンチェンジで宙に浮く白赤のレーサー。コースアウト。",
   "Dramatic moment at the tournament: a small white and red toy race car flies off the track in mid-air at a lane-change bridge, frozen moment, kids' surprised faces in the background, sunlight glinting off the plastic.",
   refs=["haruto"], move="in", fx=["rays"], amb=["event"], sfx=[["flip", 1.2, -12]], bgm="M3")
sc("S31", "晩夏", 8.0, "がっかりするハルトの肩に、ユウスケの手。",
   "HARUTO stands holding his small white and red toy race car with a disappointed face at the edge of the race circuit; YUSUKE puts a hand on his shoulder with a warm cheerful grin; crowds and the bright race track behind them.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["event_far"], bgm="M3")
sc("S32", "晩夏", 9.5, "夕暮れの土手、赤とんぼ。うつむくユウスケ（引っ越しを打ち明ける）",
   "Evening: HARUTO and YUSUKE sit on a riverside embankment covered with tall summer grass, red dragonflies flying around them in golden sunset light, YUSUKE looking down quietly with his arms around his knees, HARUTO turning to look at him.",
   refs=["haruto", "yusuke"], move="in", fx=["rays", "dust"], amb=["dusk_late"], line=None, bgm="M3")
sc("S33", "晩夏", 8.0, "8月31日の夜。終わらない宿題、扇風機、机の上の電子ペット。",
   "Night at the end of summer vacation: HARUTO sits at his wooden desk under a desk lamp with an unfinished summer homework workbook and a diary, an electric fan, the white egg-shaped virtual pet lying on the desk, the window open to the dark night.",
   refs=["haruto"], move="in", fx=[], amb=["night"], sfx=[["pencil", 1.0, -22]], bgm="M3", xfade=2.2)
sc("S34", "別れ", 8.0, "引っ越しの朝。小さなトラック、段ボール。自転車を持って立つハルト。",
   "Early morning at the end of summer: a small moving truck with no markings parked in front of a modest Japanese house, cardboard boxes being loaded, YUSUKE standing by the truck with his family; HARUTO stands at the roadside holding his bicycle.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["morning_end", "truck_idle"], bgm="M4", xfade=2.2)
sc("S35", "別れ", 10.0, "青いレーサーを差し出すユウスケ。「これ、あずかっといて。……また、勝負しような」",
   "Close-up by the moving truck: YUSUKE holds out his translucent blue toy race car to HARUTO with both hands, looking down, trying not to cry; HARUTO reaching out to take it; soft morning light.",
   refs=["haruto", "yusuke"], move="in", fx=["dust"], amb=["morning_end"], line="L3", bgm="M4")
sc("S36", "別れ", 9.0, "田んぼの一本道を去るトラック。立ち止まるハルトの後ろ姿。",
   "Wide shot: the small moving truck drives away down a long straight road between golden rice fields; HARUTO has stopped running in the middle of the road, seen from behind, holding the blue toy race car; vast sky.",
   refs=["haruto"], move="out", fx=["rays"], amb=["truck_away", "dusk"], bgm="M4")
sc("S37", "別れ", 8.5, "秋。すすきの土手で青いレーサーを持つハルト。",
   "Early autumn: HARUTO alone on a riverbank covered with silver pampas grass swaying in the wind, holding the blue toy race car, red dragonflies, clear high autumn sky, melancholic but peaceful.",
   refs=["haruto"], move="pan_l", fx=["dust"], amb=["autumn_wind"], bgm="M4")
sc("S38", "別れ", 8.5, "青いレーサー、電子ペット、写真を缶にしまう手。",
   "Close-up: a boy's hands placing a translucent blue toy race car, a white egg-shaped virtual pet toy and a photo print into a blue square metal cookie tin with a flower pattern, on a tatami floor, soft autumn light.",
   move="in", fx=["dust"], amb=["room_1997"], sfx=[["tin_lid", 6.0, -10]], bgm="M4", xfade=2.6)

# ───────── エピローグ（2026年） ─────────
sc("E01", "エピローグ", 8.5, "2026年。青いレーサーを手のひらにのせて微笑むハルト。",
   "The man sits on the tatami floor of the emptied room among cardboard boxes, holding the small translucent blue toy race car in his palm and looking at it with a gentle smile, warm autumn afternoon light through the window.",
   refs=["adult"], move="in", fx=["dust"], amb=["room_2026"], bgm="M4", era="2026")
sc("E02", "エピローグ", 9.5, "新しい単三電池を入れてスイッチ。モーターが回る。「……まだ、走るじゃん」",
   "Close-up of the man's hands inserting two new AA batteries into the black chassis of the small translucent blue toy race car on the tatami, a torn plain battery blister pack nearby, shallow depth of field, warm light.",
   move="in", fx=["dust"], amb=["room_2026"], sfx=[["battery", 1.0, -12], ["battery", 1.7, -12], ["switch", 3.0, -12], ["motor_whir", 3.1, -12]], line="L4", bgm="M4", era="2026")
sc("E03", "エピローグ", 8.5, "電子ペットにも電池。ピッ――画面にたまごが現れる。",
   "Close-up of a man's hand holding the old white egg-shaped virtual pet toy, its small rectangular LCD screen facing the camera directly and completely blank, plain pale grey-green; a small coin battery and a tiny screwdriver lie beside it on the tatami; warm afternoon light.",
   move="in", fx=["dust"], amb=["room_2026"], sfx=[["pet_birth", 2.2, -14]], overlay="pet_egg", bgm="M4", era="2026")
sc("E04", "エピローグ", 8.0, "窓辺に立ち、秋の空を見るハルト（後ろ姿）。",
   "The man stands by the open window of the emptied room looking out at the autumn sky over the seaside town, holding the blue toy race car at his side, curtains moving in the breeze, seen from behind, warm light.",
   refs=["adult"], move="in", fx=["rays", "dust"], amb=["room_2026", "autumn_day"], bgm="M4", era="2026", xfade=2.6)
sc("E05", "エピローグ", 11.0, "1997年の夏へ。入道雲の下、レーサーを追いかけて走る二人。",
   "A summer 1997 memory: HARUTO and YUSUKE run side by side along a long road between bright green rice fields, chasing their two small toy race cars racing ahead of them on the road, under a gigantic white cumulonimbus cloud and a deep blue sky, glowing sunlight, seen from behind.",
   refs=["haruto", "yusuke"], move="in", fx=["rays", "dust"], amb=["day"], sfx=[["motor_pass", 1.5, -16]], bgm="M4", xfade=2.6)
sc("END", "エピローグ", 9.0, "エンドカード「電池の夏 1997」＋「あなたの1997年の夏は、どんな夏でしたか。」",
   None, move="none", amb=["day_far"], text="end", bgm="M4", xfade=3.0)

# ───────── 余韻パート（環境音＋静かなピアノ、人物なし、長回し） ─────────
AG = [
    ("A00", 6.0, "見出し「あの夏の音」", None, [], "none", ["engawa_soft"], "afterglow"),
    ("A01", 30.0, "無人の縁側。風鈴、扇風機、蚊取り線香。",
     "The empty wooden engawa veranda of an old Japanese house at noon in summer 1997: a glass wind chime gently swaying, an electric fan, a pig-shaped mosquito coil holder with a thin line of smoke, newspaper with a few toy car parts left on it, bright green garden, dappled sunlight. No people.",
     ["rays", "dust"], "in_slow", ["engawa"], None),
    ("A02", 30.0, "閉店後の模型店。夕日に照らされたコース。",
     "The empty small hobby shop at dusk after closing: the white three-lane toy race track on a big table bathed in orange sunset light from the window, dust floating in the light beams, kit boxes on shelves with no readable text. No people.",
     ["dust"], "pan_r_slow", ["shop_closed"], None),
    ("A03", 30.0, "雨の木造バス停。田んぼと霞む山。",
     "A small wooden rural bus stop shelter in steady summer rain, rice fields and misty green mountains beyond, rain dripping from the eaves, puddles rippling. No people.",
     ["rain"], "in_slow", ["rain_soft", "thunder_bed"], None),
    ("A04", 30.0, "夕焼けの田んぼと小さな鳥居、ひぐらし。",
     "Golden rice fields at sunset with a small red shrine gate and a line of wooden utility poles, dragonflies in the air, glowing pink and orange clouds. No people.",
     ["rays", "dust"], "pan_l_slow", ["dusk"], None),
    ("A05", 30.0, "夏の夜の町角。自販機の明かり、虫の声。",
     "A summer night street corner in a small 1990s Japanese town: a glowing vending machine with no readable text or logos, moths around a street light, a parked bicycle, a starry sky above the roofs. No people.",
     [], "in_slow", ["night", "distant_train"], None),
    ("A06", 30.0, "祭りのあとの神社。提灯だけが灯る。",
     "A small shrine after the summer festival late at night: paper lanterns still glowing softly, empty food stalls covered with cloth, a forgotten water balloon on the stone path. No people.",
     ["dust"], "pan_r_slow", ["night_wind"], None),
    ("A07", 30.0, "月明かりの子ども部屋。扇風機と、枕元の電子ペット。",
     "An empty 1990s Japanese child's tatami bedroom at night lit by blue moonlight: a futon, an electric fan, the white egg-shaped virtual pet toy on the pillow with a faintly glowing screen, a glass wind chime at the open window. No people.",
     [], "in_slow", ["night", "fan", "chime_soft"], None),
    ("A08", 30.0, "海と町の上の入道雲。",
     "A vast summer afternoon sky with towering cumulonimbus clouds over the sea and a small Japanese seaside town, sunlight glittering on the water. No people.",
     ["rays"], "pan_r_slow", ["day", "sea"], None),
    ("A09", 30.0, "夕暮れの踏切。2両編成の電車が通る。",
     "A countryside railway crossing at dusk with its warning lights, a small two-car local train passing, rice fields, the sky deep orange and violet. No people.",
     ["rays"], "in_slow", ["crossing"], None),
    ("A10", 30.0, "夏の終わりの朝もや。川と土手の道。",
     "Morning mist over a river and a small town at the end of summer, an empty embankment path, dew on the grass, soft pale golden light. No people.",
     ["rays", "dust"], "out_slow", ["morning_end", "river"], None),
]
for (id, dur, jp, prompt, fx, move, amb, text) in AG:
    sc(id, "余韻", dur, jp, prompt, move=move, fx=fx, amb=amb, text=text, bgm="M5", xfade=3.5 if id != "A00" else 3.0)

LINES = {
    "L1": dict(who="ハルト（10歳）", text="なあ、あしたも走らせに行こうぜ。", voice="Puck", at=2.2,
               profile="A 10-year-old Japanese boy.", scene="Summer dusk in 1997, walking home with his best friend, pushing bicycles along a river.",
               notes="Speak softly, casual, warm and a little shy."),
    "L2": dict(who="ユウスケ", text="……おれ、ひっこすんだ。", voice="Puck", at=3.0,
               profile="A 10-year-old Japanese boy.", scene="Sitting on a riverbank at sunset, telling his best friend that his family is moving away.",
               notes="Speak very quietly and slowly, looking down, trying to sound casual but sad."),
    "L3": dict(who="ユウスケ", text="これ、あずかっといて。……また、勝負しような。", voice="Leda", at=2.0,
               profile="A 10-year-old Japanese boy.", scene="The morning he moves away, handing his favorite toy race car to his best friend.",
               notes="Speak slowly and quietly, holding back tears, with a brave small smile at the end. Pause between the two sentences."),
    "L4": dict(who="大人のハルト", text="……まだ、走るじゃん。", voice="Charon", at=4.6,
               profile="A Japanese man around 40 years old.", scene="Alone in his childhood room, he just put new batteries into his old toy race car and the motor started spinning.",
               notes="Speak very quietly to himself, with a small warm laugh before the words."),
}
MOTHER = dict(who="母（声のみ）", text="ハルトー、ごはんよー。", voice="Kore",
              profile="A Japanese mother in her late 30s.", scene="Calling her son for dinner from the kitchen window at dusk in 1997.",
              notes="Call out warmly from a distance, relaxed and natural.")

def build_prompt(s):
    if not s["prompt"]:
        return None
    parts = [s["prompt"]]
    refs = [REF_TEXT[r] for r in s["refs"]]
    if refs:
        parts.append("Characters: " + "; ".join(refs) + ".")
    if "toy" in s["prompt"] or "virtual pet" in s["prompt"]:
        parts.append(TOY_RULES)
    parts.append(ERA_2026 if s["era"] == "2026" else ERA_1997)
    parts.append(STYLE)
    return " ".join(parts)

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    t = 0.0
    for s in S:
        s["start"] = round(t, 3)
        s["full_prompt"] = build_prompt(s)
        t += s["dur"]
    data = dict(fps=30, size=[1920, 1080], total=round(t, 3), scenes=S, lines=LINES, mother=MOTHER)
    json.dump(data, open(os.path.join(root, "scenes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # 人が読む絵コンテ
    def mmss(x): return f"{int(x//60)}:{x%60:04.1f}"
    md = ["# 絵コンテ「電池の夏」", "", f"総尺 {mmss(t)}（{len(S)}カット）", "",
          "| # | 開始 | 秒 | パート | 内容 | 環境音 | 単発音・セリフ | BGM |", "|---|---|---|---|---|---|---|---|"]
    for s in S:
        se = ", ".join(x[0] for x in s["sfx"])
        if s["line"]:
            se = (se + " / " if se else "") + f"「{LINES[s['line']]['text']}」"
        md.append(f"| {s['id']} | {mmss(s['start'])} | {s['dur']:g} | {s['part']} | {s['jp']} | {', '.join(s['amb'])} | {se} | {s['bgm'] or '—'} |")
    open(os.path.join(root, "絵コンテ.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
    print(f"{len(S)} scenes, total {mmss(t)} ({t:.1f}s), images to generate: {sum(1 for s in S if s['prompt'])}")

if __name__ == "__main__":
    main()
