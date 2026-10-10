#!/usr/bin/env python3
"""v2 絵コンテ（写実・フィルム写真風）。scenes.json と 絵コンテ.md を書き出す。

v1 からの主な変更：
  ・画像を 90年代の35mmカラーネガ風の写実に
  ・冒頭と章の入口に「プリント写真が色づいて動き出す」演出（reveal）＋小さな日英キャプション
  ・追加：居間のブラウン管テレビと外の柴犬／おばあちゃんのお小遣い／公園で野球／同い年の女の子への告白
  ・ブラウン管テレビは室内の指定場面だけ（v1 で全場面に出た反省）
  ・Veo で動かしたカット：S01・S07（初版）、S12・S26・S35（写真が動き出すカット。控えめな動き＋「物を増やさない・カメラ固定」）。
    P02 は手の中のおもちゃが0.6秒で増え、S30 は群衆が崩れてカメラも動いたため、静止画のまま（試した指示は work/veo2_prompts.json）
  ・S05 はおばあちゃんの髪が茶色だったため作り直し（白髪・眼鏡を明記）。P02 は棚の実在メーカー風ロゴを fixes.json でぼかし
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

META = dict(
    title="電池の夏", subtitle="1997",
    end_question="あなたの1997年の夏は、どんな夏でしたか。",
    afterglow_title="あの夏の音", afterglow_sub="環境音とピアノだけの、ゆっくりした時間",
    out_name="電池の夏_1997_v2",
    look="photo", past_era="1997", present_era="2026",
    setting="a small seaside town in Japan in summer 1997",
    stamp_text="'97 7 26",
    music_gain={"M0": -1.0, "M2": -1.5, "M5": -6.0},
    music_preroll={"M1": 1.2},
    music_fade_in={"M1": 4.0, "M5": 4.0},
    afterglow_part="余韻",
    sfx_captions={"chime5": "♪（夕方5時のチャイム「夕焼け小焼け」）"},
    chapters={"プロローグ": "プロローグ（2026年・実家の片付け）",
              "朝": "1997年 夏・朝（ブラウン管テレビと柴犬、おばあちゃんのお小遣い、駄菓子屋、模型店）",
              "午後": "午後（縁側で改造、公園で野球、夕立、虹）", "夕方": "夕方（5時のチャイム、告白、夕飯のナイター）",
              "夜": "夜（夏祭り、花火）", "晩夏": "晩夏（大会、赤とんぼ、8月31日）", "別れ": "別れ",
              "エピローグ": "エピローグ（2026年）", "余韻": "あの夏の音（環境音とピアノ・約5分）"},
    motion_style="Realistic 1990s 35mm color film look, natural subtle motion, no text, no subtitles, no logos.",
    thumbs=[dict(scene="P02", name="サムネA_写真が動き出す", stamp=True),
            dict(scene="S23", name="サムネB_告白の夕暮れ", text="1997年、夏。", sub="電池の夏"),
            dict(scene="S25", name="サムネC_ブラウン管と柴犬", text="あの夏の夕飯", sub="1997")],
)

ERA_1997 = ("Setting: a small seaside town in Japan, summer 1997. Everything must be period-accurate for 1997 Japan "
            "(no smartphones, no flat-screen TVs, no modern cars, no modern signage).")
ERA_2026 = "Setting: Japan, autumn 2026 (present day)."
STYLE_1997 = ("Photorealistic candid snapshot taken in Japan in 1997 on 35mm color negative film: natural light, soft warm colors, "
              "mild film grain, slight lens vignetting, realistic skin, hair and fabric textures, authentic everyday details. "
              "It must look like a real photograph from a family album — not an illustration, not anime, not a 3D render, not a glossy modern photo. "
              "Ordinary-looking people, no celebrities. Absolutely no text, letters, numbers, readable signs, logos, brand names or watermark anywhere.")
STYLE_2026 = ("Photorealistic modern digital photograph, natural window light, slightly cool and calm tones, shallow depth of field. "
              "Not an illustration. Absolutely no text, letters, numbers, logos, brand names or watermark anywhere.")

CHARS = {
    "haruto": dict(file="assets/chars/haruto.png", ref="HARUTO is the boy in the attached reference photos with the faded sky-blue T-shirt with one thin white stripe (keep his face, cowlick hair and clothes exactly)",
                   desc="HARUTO: a 10-year-old Japanese boy with short slightly messy black hair and a small cowlick on top, round friendly face, sun-tanned skin; wearing a faded sky-blue T-shirt with one thin white horizontal stripe across the chest, navy blue knee-length shorts, white socks and white-and-blue sneakers; a small white egg-shaped keychain virtual pet toy hangs from his belt loop on a short ball chain."),
    "yusuke": dict(file="assets/chars/yusuke.png", ref="YUSUKE is the buzz-cut boy in the attached reference photos with the white T-shirt with red raglan sleeves and a bandage on his left cheek (keep his face, hair and clothes exactly)",
                   desc="YUSUKE: a 10-year-old Japanese boy, slightly taller and lanky, very short buzz-cut black hair, tanned skin, a small adhesive bandage on his left cheek, mischievous cheerful grin; wearing a white T-shirt with red raglan sleeves, khaki cargo shorts and black sneakers."),
    "natsumi": dict(file="assets/chars/natsumi.png", ref="NATSUMI is the girl in the attached reference photos with the yellow hair clip and light yellow T-shirt (keep her face, hair and clothes exactly)",
                    desc="NATSUMI: a 10-year-old Japanese girl with shoulder-length straight black hair with bangs held by a small yellow hair clip, light tan, gentle shy smile; wearing a light yellow short-sleeve T-shirt, light blue denim culottes and white sneakers; a small pink egg-shaped keychain virtual pet toy hangs from her bag strap."),
    "grandma": dict(file="assets/chars/grandma.png", ref="GRANDMA is the elderly woman in the attached reference photos (keep her face, grey permed hair, glasses and apron exactly)",
                    desc="GRANDMA: a kind Japanese grandmother in her early 70s, short grey permed hair, round thin-framed glasses, small and slightly stooped, wearing a light beige blouse under a white kappogi apron."),
    "adult": dict(file="assets/chars/adult.png", ref="the man is ADULT HARUTO from the attached reference photos (39 years old, charcoal sweater; keep his face and cowlick)",
                  desc="ADULT HARUTO in 2026: a 39-year-old Japanese man, the grown-up HARUTO with the same small cowlick; short black hair with a few grey strands, gentle eyes, light stubble, slim; wearing a plain charcoal-grey knit sweater over a white T-shirt and dark blue jeans."),
    "shiba": dict(file="assets/chars/shiba.png", ref="the dog is the red Shiba Inu from the attached reference photo (same face, coat and red collar with a small brass bell)",
                  desc="SHIBA: the family's red (aka) Shiba Inu dog, medium size, curled tail, cream cheeks, wearing a red collar with a small brass bell."),
}
TOY_RULES = ("Toy race cars are small generic motorized 4WD plastic model cars of original design with small side guide rollers, no logos or stickers with text. "
             "The virtual pet is a small egg-shaped keychain toy with three round buttons and a small rectangular LCD screen, no logo.")

MOTION = {'P01': "The man's hands slowly lift the tin lid fully open, dust drifts in the window light, steady close-up.", 'P02': 'The two boys laugh and proudly raise their toy race cars toward the camera, small natural movements, a toy car speeds by on the track behind them.', 'S01': 'Clouds drift slowly across the summer sky, a gentle breeze moves the trees, the sea sparkles, very slow steady camera.', 'S02': 'The boy stirs in his sleep and slowly opens his eyes, the electric fan turns, the curtain sways gently in the morning breeze.', 'S04': 'The boy eats breakfast while watching TV, the lace curtain moves in the breeze, the Shiba Inu outside lifts its head and wags its tail.', 'S05': "The grandmother gently drops two coins into the boy's cupped hands and smiles, the boy bows happily, the dog wags its tail.", 'S06': 'The boy finishes tying his sneaker laces and picks up the toy car case, summer light from the open door.', 'S07': 'The two boys ride their bicycles down the gentle slope toward the camera, wind in their hair, natural subtle motion, steady camera.', 'S08': 'The two boys drink ramune from glass bottles and laugh, the cat in the shade flicks its tail, heat shimmer.', 'S09': 'The boy points at candies and shows his coin to the shopkeeper, his friend leans in, gentle natural motion.', 'S10': 'Small toy race cars speed around the lanes of the track, the kids lean over and cheer, natural motion.', 'S11': "The boys' fingers release the two toy cars, the wheels spin and the cars start to move forward on the track.", 'S12': "The two boys keep working on their toy cars with small careful hand movements, one glances up and smiles, the wind chime sways gently, thin smoke rises from the mosquito coil, the dog breathes slowly while sleeping. Keep every person and object exactly as in the photo; do not add, remove or duplicate any objects. Very subtle, natural, slow motion. The camera does not move.", 'S13': 'One boy rubs the two AA batteries between his palms, the other turns the drilled chassis in his fingers.', 'S14': 'The toy race car speeds along the curb and the boy runs after it laughing, heat haze shimmers above the asphalt.', 'S15': "The flipped toy car's wheels keep spinning, the boy reaches to pick it up, his friend laughs.", 'S16': 'The buzz-cut boy throws the rubber ball, the batter gets ready to swing, the girl swings gently on the swing in the background.', 'S17': 'The ball flies up into the blue sky, the boys turn their heads to follow it, the girl claps.', 'S18': 'Dark storm clouds roll in over the rice fields, wind makes waves in the green rice, the kids look up.', 'S19': 'Heavy rain pours down, splashes on the asphalt, steam rises, the kids huddle under the eaves.', 'S20': 'The boys press buttons on their handheld games, the girl watches her virtual pet, rain falls softly behind them.', 'S21': 'The boys ride their bicycles through the puddles, water splashes, the evening sky glows.', 'S22': 'The sunset light slowly shifts over the town, a few children walk home far below, gentle breeze.', 'S23': 'The boy shyly rubs the back of his neck and looks down, the girl smiles and looks away embarrassed, their friend peeks from behind the slide, gentle natural motion.', 'S24': 'The two boys walk slowly pushing their bicycles along the embankment, one turns to talk to the other, the river shimmers.', 'S25': "The family eats dinner, the TV flickers with the baseball game, the mother's hand points at the virtual pet, the dog outside lies by the doghouse.", 'S26': "The kids walk slowly through the festival smiling and looking at the stalls, paper lanterns sway gently, people move softly in the background. Keep every person and object exactly as in the photo; do not add, remove or duplicate any objects. Very subtle, natural, slow motion. The camera does not move.", 'S27': "Fireworks bloom and fade over the river, light flickers on the kids' faces as they watch.", 'S28': 'The boy sleeps peacefully, the fan slowly turns, the curtain moves, the tiny screen glows faintly.', 'S30': 'Toy race cars speed around the big circuit, kids and parents cheer, banners flutter in the wind.', 'S31': 'The toy car flies off the track in slow motion and tumbles through the air, the kids gasp.', 'S32': 'The disappointed boy looks at his toy car, his friend pats his shoulder and grins, the crowd moves behind them.', 'S33': 'Red dragonflies fly around, the tall grass sways in the evening breeze, the buzz-cut boy looks down quietly.', 'S34': 'The boy writes in his workbook, then stops and rests his chin on his hand, the fan turns.', 'S35': "Two movers carry a cardboard box toward the truck, the adults talk quietly, the boy stands still holding his bicycle and looks down, a gentle breeze moves the trees. Keep every person and object exactly as in the photo; do not add, remove or duplicate any objects. Very subtle, natural, slow motion. The camera does not move.", 'S36': 'The buzz-cut boy holds out the blue toy car, the other boy slowly takes it, both look down holding back tears.', 'S37': 'The moving truck drives away down the long road, the boy stands still watching it go, the rice sways in the wind.', 'S38': 'The silver pampas grass sways in the wind, the dog leans against the boy, red dragonflies drift by.', 'S39': "The boy's hands gently place the toy car, the virtual pet and the photos into the tin.", 'E00': 'Autumn leaves fall slowly, the persimmon tree sways gently, long soft shadows, steady camera.', 'E01': 'The man turns the small blue toy car in his palm and smiles gently, dust drifts in the window light.', 'E02': "The man's fingers press two new AA batteries into the toy car chassis and flip the switch, the wheels begin to spin.", 'E04': 'The man looks out of the window, the curtain moves in the breeze, the autumn light glows.', 'E05': 'The two boys and the dog run along the road chasing the toy cars, under the huge summer cloud, joyful natural motion.'}


# ───────── 仕上げ（クレジット補充後）：人物カットを Veo で動かすための控えめな指示 ─────────
# P02（手の中の車が増えた）・S30（群衆が崩れた）の失敗から：動きを1〜2個に絞り、「物を増やさない・カメラ固定」を必ず付ける
KEEP = (" Keep every person and object exactly as in the photo; do not add, remove or duplicate any objects. "
        "Very subtle, natural, slow motion. The camera does not move.")
KEEP_MOVE = (" Keep every person and object as in the photo; do not add, remove or duplicate any objects. "
             "Natural motion. The camera does not move.")
MOTION.update({k: v + KEEP for k, v in {
    "P02": "Only the two boys' faces move: they blink, their smiles widen and they laugh softly. Their hands and the two toy cars they hold stay completely still and unchanged.",
    "S02": "The boy stirs in his sleep and slowly opens his eyes; the electric fan turns; the curtain sways gently in the morning breeze.",
    "S04": "The boy keeps eating his breakfast and glances at the TV; the lace curtain moves gently in the breeze; outside, the Shiba Inu slowly lifts its head and wags its tail.",
    "S05": "The grandmother smiles warmly and gently places the coins into the boy's cupped hands; the boy looks down at the coins and smiles; the Shiba Inu slowly wags its tail.",
    "S08": "The two boys sip ramune from their glass bottles and laugh softly; the cat in the shade flicks its tail.",
    "S09": "The boy points at the candies and smiles; his friend leans in to look; the elderly shopkeeper smiles and nods.",
    "S10": "Small toy race cars run around the white track; the kids lean over the rail, smile and cheer.",
    "S15": "The boy crouches and reaches for the flipped toy car whose wheels keep spinning; his friend laughs.",
    "S16": "The buzz-cut boy slowly winds up to throw the rubber ball; the boy with the bat gets ready; in the background the girl swings gently on the swing.",
    "S17": "The boys look up, following the ball high in the sky; the girl claps her hands; leaves sway in the breeze.",
    "S18": "Dark storm clouds roll in over the rice fields; the wind makes waves in the green rice; the kids look up at the sky.",
    "S19": "Heavy rain pours down and splashes on the street; the three kids huddle under the shop eaves and look out at the rain.",
    "S23": "The boy shyly rubs the back of his neck and looks down; the girl smiles softly and glances away, embarrassed; far behind, the friend peeks out from behind the slide and grins.",
    "S24": "The two boys stand with their bicycles on the riverbank and talk with small natural gestures; the river shimmers in the sunset light; clouds drift slowly.",
    "S25": "The boy and his grandmother keep eating dinner and smile; the TV screen flickers softly with the night baseball game; the Shiba Inu sleeps by its doghouse, breathing slowly.",
    "S27": "Fireworks bloom and slowly fade over the river; their light flickers on the three kids sitting on the bank, seen from behind.",
    "S28": "The boy sleeps peacefully, breathing slowly; the electric fan slowly turns; the curtain moves softly in the moonlight.",
    "S32": "The disappointed boy looks down at his toy car; his friend pats his shoulder and grins; the people in the background stay mostly still.",
    "S33": "Red dragonflies fly around; the tall grass sways in the evening breeze; the two boys sit quietly on the bank.",
    "S34": "The boy rests his chin on his hand and gazes out of the window; the electric fan turns; the desk lamp glows.",
    "S36": "The buzz-cut boy holds out the blue toy car and the other boy slowly reaches out and takes it; both look down, holding back tears.",
    "S37": "The truck in the distance stays parked; the boy stands still holding the toy car; the golden rice sways in the wind; clouds drift slowly.",
    "S38": "The silver pampas grass sways in the wind; the Shiba Inu leans against the boy; red dragonflies drift by.",
    "E01": "The man slowly turns the small blue toy car in his palm and smiles gently; dust drifts in the window light.",
    "E04": "The man gazes out of the window; the curtain moves softly in the breeze; the autumn light glows.",
}.items()})
MOTION.update({k: v + KEEP_MOVE for k, v in {
    "S14": "The toy race car runs along the street and the boy runs after it, laughing; heat haze shimmers above the asphalt; his friend watches.",
    "S21": "The two boys ride their bicycles slowly through the puddles; water splashes softly; the evening sky glows.",
    "S31": "The toy race car tumbles slowly through the air above the track; the kids watch with open mouths.",
    "E05": "The two boys and the Shiba Inu run along the road away from the camera toward the huge summer clouds.",
}.items()})

S = []
def sc(id, part, dur, jp, prompt, refs=(), move="in", fx=(), amb=(), sfx=(), line=None, text=None, overlay=None,
       bgm=None, era="1997", xfade=1.6, reveal=None, caption=None, img=None):
    S.append(dict(id=id, part=part, dur=dur, jp=jp, prompt=prompt, refs=list(refs), move=move, fx=list(fx), amb=list(amb),
                  sfx=[list(x) for x in sfx], line=line, text=text, overlay=overlay, bgm=bgm, era=era, xfade=xfade,
                  reveal=reveal, caption=caption, motion=MOTION.get(id), img=img))

# ───────── 冒頭（2026 → 写真が動き出す） ─────────
sc("P01", "プロローグ", 5.5, "2026年。古いお菓子の缶を開ける手。中に写真とおもちゃ。",
   "Close-up of a man's hands lifting the lid of an old faded blue square metal cookie tin with a flower pattern on a tatami floor in an emptied room; inside: a small toy 4WD race car with a translucent blue body and a black chassis full of drilled holes, a white egg-shaped keychain virtual pet, old AA batteries, glass marbles and a small stack of faded color photo prints lying face down. Afternoon window light, dust in the air, shallow depth of field.",
   refs=["adult"], move="in", fx=["dust"], amb=["room_2026"], sfx=[["tin_lid", 0.8, -14]], bgm="M0", era="2026", xfade=1.2)
sc("P02", "プロローグ", 10.0, "【写真が動き出す】'97 7 26 模型店のコースの前で笑うハルトとユウスケ。",
   "Inside a small 1990s Japanese hobby shop: HARUTO and YUSUKE stand side by side grinning at the camera, each holding up a small toy race car, in front of a white plastic three-lane toy race track on a table; shelves of colorful model kit boxes behind them; snapshot taken with a compact film camera with on-camera flash, slightly overexposed foreground.",
   refs=["haruto", "yusuke"], move="in", fx=["dust"], amb=["shop_quiet"], bgm="M0", xfade=1.8,
   reveal=dict(date="'97 7 26", hold=2.6, trans=2.2))

# ───────── タイトル ─────────
sc("S01", "朝", 9.0, "入道雲と海辺の町。タイトル「電池の夏」。",
   "A vast deep-blue summer sky with towering white cumulonimbus clouds above a small Japanese seaside town of grey tiled roofs, bright green rice fields and a sparkling sea, utility poles and wires in the foreground, morning light. No people.",
   move="up", fx=["rays", "dust"], amb=["morning"], text="title", bgm="M1", xfade=2.6)

# ───────── 朝 ─────────
sc("S02", "朝", 8.0, "朝。枕元で電子ペットが鳴る。",
   "Early morning in a 1990s Japanese boy's tatami bedroom: HARUTO sleeps under a thin striped towel blanket on a futon; on the pillow beside his face lies the white egg-shaped virtual pet toy; an electric fan by the window, a low wooden desk with a red school backpack and a summer homework workbook, soft morning sun through the window, a glass wind chime hanging outside.",
   refs=["haruto"], move="in", fx=["rays", "dust"], amb=["morning", "fan"], sfx=[["pet_alarm", 1.2, -14]], bgm="M1")
sc("S03", "朝", 8.0, "電子ペットのアップ。ボタンを押してごはん。",
   "Extreme close-up photo of a 10-year-old boy's fingertips holding a white egg-shaped keychain virtual pet toy and pressing one of its three small round buttons; the small rectangular LCD screen faces the camera directly and is completely blank, plain pale grey-green with nothing on it; soft morning window light, shallow depth of field, futon blurred behind.",
   move="in", fx=["dust"], amb=["morning", "fan"], sfx=[["pet_btn", 1.6, -16], ["pet_btn", 2.4, -16], ["pet_eat", 3.2, -18]], overlay="pet_eat", bgm="M1")
sc("S04", "朝", 9.0, "居間のブラウン管テレビ。開けた縁側の外には柴犬。",
   "A 1990s Japanese living room in the morning: a bulky CRT television on a low wooden TV stand showing a blurry morning program, a low table with breakfast (rice, miso soup, grilled fish); HARUTO sits at the table eating and watching TV; the sliding glass doors are open to the sunny garden where the family's red Shiba Inu with a red collar lies on the stepping stone looking in; summer morning light, lace curtain moving.",
   refs=["haruto", "shiba"], move="pan_r", fx=["rays"], amb=["tv_morning", "morning"], sfx=[["dog_bell", 5.0, -18]], bgm="M1")
sc("S05", "朝", 9.0, "縁側で、おばあちゃんが がま口から100円玉。「はい、お小遣い。むだづかいしちゃだめよ」",
   "On the wooden engawa veranda of an old Japanese house: GRANDMA kneels and smiles as she takes two shiny 100-yen coins out of a small old-fashioned clasp coin purse (gamaguchi) and places them in HARUTO's open cupped hands; HARUTO bows his head happily; the red Shiba Inu sits beside them wagging its tail; morning glories and green garden behind, warm summer light.",
   refs=["grandma", "haruto", "shiba"], move="in", fx=["rays", "dust"], amb=["engawa_soft"], sfx=[["gamaguchi", 1.0, -16], ["coins", 1.8, -16]], line="G1", bgm="M1")
sc("S06", "朝", 8.0, "玄関でスニーカー。レーサーのケース、腰に電子ペット。",
   "At the genkan entrance of a 1990s Japanese house: HARUTO sits on the wooden step tying his sneakers, beside him a clear plastic carrying case holding a small toy race car, the egg-shaped virtual pet hanging from his belt loop; the sliding front door is open to bright summer light.",
   refs=["haruto"], move="in", fx=["rays"], amb=["morning"], bgm="M1")
sc("S07", "朝", 8.5, "ふたりで自転車。田んぼの坂を下る。",
   "HARUTO and YUSUKE ride their bicycles side by side down a gentle sloping country road between bright green rice fields toward a small seaside town, huge blue sky with cumulonimbus clouds, small plastic cases holding toy race cars in their front baskets, summer morning wind in their hair, seen from a low angle in front.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["day", "bike"], sfx=[["bike_bell", 1.0, -18]], bgm="M1")
sc("S08", "朝", 8.5, "駄菓子屋の軒先。お小遣いでラムネ、10円ゲーム。",
   "Outside a tiny old dagashiya penny candy shop on a quiet Japanese back street on a hot summer day: HARUTO and YUSUKE sit on a wooden bench in the shade drinking from glass ramune soda bottles with marbles inside, a small old coin-operated arcade game cabinet next to the bench, an ice cream freezer chest, hanging snack bags with no readable text, a cat sleeping in the shade.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["day"], sfx=[["ramune", 1.4, -12]], bgm="M1")
sc("S09", "朝", 8.0, "駄菓子屋の中。100円玉で、どれにしようか。",
   "Inside a cozy cluttered dagashiya: rows of small colorful cheap snacks and candies in boxes and glass jars with no readable text or logos, an elderly woman shopkeeper sitting on a raised tatami platform, HARUTO pointing at candies while holding a 100-yen coin, YUSUKE beside him, warm afternoon light.",
   refs=["haruto", "yusuke"], move="in", fx=["dust"], amb=["shop_quiet"], sfx=[["coins", 2.0, -16]], bgm="M1")
sc("S10", "朝", 8.5, "模型店の3レーンのコース。身を乗り出す子どもたち。",
   "Inside a small 1990s hobby shop: a white plastic three-lane toy race circuit with a lane-change bridge set on a big table; several excited kids including HARUTO and YUSUKE lean over the side rails; small toy race cars speed along the lanes with motion blur; daylight from the shop window; shelves of plain kit boxes.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["dust"], amb=["shop", "track"], bgm="M1")
sc("S11", "朝", 8.0, "スタート直前。白赤のハルト号と青いユウスケ号。",
   "Low-angle close-up photo at the start line of a white plastic toy race track: two small toy 4WD race cars side by side, one with a white and red body and one with a translucent blue body, held by two boys' fingertips, wheels about to spin; shallow depth of field, the boys' faces out of focus in the background.",
   move="in", fx=["dust"], amb=["shop"], sfx=[["motor_rev", 2.0, -14], ["motor_pass", 5.6, -14]], bgm="M1", xfade=2.2)

# ───────── 午後 ─────────
sc("S12", "午後", 10.5, "【写真が動き出す】'97 8 2 縁側で改造。柴犬が踏み石で寝ている。",
   "On the wooden engawa veranda of an old Japanese house on a summer afternoon: HARUTO and YUSUKE sit cross-legged on spread newspaper, carefully modifying small toy race cars with tiny screwdrivers and a hand pin-vise drill; plastic parts runners, tiny motors, AA batteries and a parts tray around them; an electric fan, a glass wind chime, a pig-shaped ceramic mosquito coil holder with rising smoke; the red Shiba Inu sleeps on the stepping stone below; green garden, dappled sunlight.",
   refs=["haruto", "yusuke", "shiba"], move="in", fx=["rays", "dust"], amb=["engawa"], bgm="M2", xfade=2.2,
   reveal=dict(date="'97 8 2", hold=2.4, trans=2.0), caption=("1997年8月　縁側", "August 1997, on the veranda"))
sc("S13", "午後", 8.0, "手のアップ。電池をこすって温める／穴だらけのシャーシ。",
   "Close-up photo of two boys' hands on the veranda: one boy rubs two AA batteries between his palms to warm them up, the other holds a black toy race car chassis with many small drilled holes for lightness; tiny plastic shavings on the newspaper; bright afternoon sun and soft shadows.",
   move="in", fx=["dust"], amb=["engawa"], bgm="M2")
sc("S14", "午後", 8.0, "家の前の道。陽炎の中を走るレーサーを追いかける。",
   "A sun-baked asphalt residential street in a quiet 1990s Japanese town with heat haze: a small toy race car with a white and red body speeds along the curb, HARUTO runs after it laughing, YUSUKE watching from the side, concrete block walls, utility poles, blue sky with cumulonimbus clouds.",
   refs=["haruto", "yusuke"], move="pan_l", fx=["rays"], amb=["day"], sfx=[["motor_pass", 0.8, -12]], bgm="M2")
sc("S15", "午後", 8.0, "小石でひっくり返ったレーサー。笑うユウスケ。",
   "On the same hot asphalt street: the small white and red toy race car lies flipped upside down after hitting a pebble, its wheels still spinning; HARUTO crouches to pick it up while YUSUKE laughs, bending over; long afternoon shadows.",
   refs=["haruto", "yusuke"], move="in", amb=["day"], sfx=[["flip", 0.6, -14]], bgm="M2")
sc("S16", "午後", 9.0, "近所の公園で野球。ブランコのナツミが見ている。",
   "A small neighborhood park in 1990s Japan on a summer afternoon: YUSUKE winds up to pitch a white rubber baseball while HARUTO stands ready with a dented aluminum bat; a few trees, a slide and a sandbox; NATSUMI sits on a swing in the background watching them; long grass shadows, cicada-filled summer air.",
   refs=["haruto", "yusuke", "natsumi"], move="pan_r", fx=["rays", "dust"], amb=["park"], sfx=[["glove", 2.4, -16]], bgm="M2")
sc("S17", "午後", 8.0, "カキーン。打球を見上げるふたり。拍手するナツミ。",
   "Action snapshot in the park: HARUTO has just hit the rubber ball with the aluminum bat, the ball flying high against the blue summer sky, YUSUKE turning to watch it with his mouth open, NATSUMI clapping on the swing in the background; slight motion blur.",
   refs=["haruto", "yusuke", "natsumi"], move="up", fx=["rays"], amb=["park"], sfx=[["bat_hit", 0.5, -12]], bgm="M2")
sc("S18", "午後", 8.0, "田んぼの上に急に黒い雲。",
   "Late afternoon over vast green rice fields in the Japanese countryside: dark heavy storm clouds rapidly gathering, wind bending the rice plants in waves, dramatic light; three small kids with bicycles on a farm road look up at the sky, seen from far away.",
   refs=["haruto", "yusuke", "natsumi"], move="up", amb=["storm"], sfx=[["thunder_far", 3.0, -16]], bgm="M2")
sc("S19", "午後", 10.5, "夕立。店の軒下で3人雨やどり。",
   "A sudden heavy summer downpour: HARUTO, YUSUKE and NATSUMI shelter under the narrow eaves of a closed old shop with their bicycles, rain pouring in sheets, splashes on the asphalt, steam rising from the hot road, grey light.",
   refs=["haruto", "yusuke", "natsumi"], move="in", fx=["rain"], amb=["rain_heavy"], sfx=[["thunder", 2.0, -12]], bgm="M2")
sc("S21", "午後", 8.0, "雨上がり。水たまりに夕空、うっすら虹。",
   "After the rain: puddles on a country road reflect a glowing orange and pink evening sky, a faint rainbow over the small town and rice fields, wet utility poles and wires sparkling, HARUTO and YUSUKE ride their bicycles through the puddles splashing water.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["rays"], amb=["after_rain"], bgm="M2", xfade=2.4)

# ───────── 夕方（5時のチャイム・告白） ─────────
sc("S22", "夕方", 10.0, "高台から町。防災スピーカーから5時のチャイム「夕焼け小焼け」。",
   "Dusk view of a small Japanese seaside town from a hillside: rooftops, rice fields and the sea glowing in the sunset, a concrete utility pole with an outdoor public-address loudspeaker horn in the foreground, a few tiny children walking home along a road far below, first lights in the windows.",
   move="in", fx=["rays"], amb=["dusk"], sfx=[["chime5", 0.6, -15]], xfade=2.4)
sc("S23", "夕方", 11.0, "夕暮れの公園。照れながら告白するハルト。「あのさ……おれ、なつみのこと……すき、かも」「……しってたよ」",
   "Dusk in the small neighborhood park: HARUTO stands facing NATSUMI by the swings, looking down shyly and rubbing the back of his neck, his cheeks red; NATSUMI holds her bag strap with both hands, surprised and smiling softly; long orange sunset shadows; in the far background YUSUKE peeks out from behind the slide, grinning.",
   refs=["haruto", "natsumi", "yusuke"], move="in", fx=["rays", "dust"], amb=["dusk"], line=["C1", "C2"])
sc("S24", "夕方", 9.0, "堤防を自転車を押して帰る。ユウスケ「なあ、あしたも走らせに行こうぜ」",
   "Dusk: HARUTO and YUSUKE walk home side by side pushing their bicycles along a riverside embankment path, silhouetted against a deep orange and purple sky, the river reflecting the light, YUSUKE turning his head to talk to HARUTO.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["rays"], amb=["dusk", "river"], line="L1")
sc("S25", "夕方", 9.0, "夕飯。ブラウン管でナイター。窓の外の犬小屋に柴犬。",
   "Evening in a 1990s Japanese family dining room: a low table with dinner (rice, grilled fish, miso soup, cold tofu, sliced watermelon), a bulky CRT television on a wooden stand showing a night baseball game, a round ceiling light with a pull string; HARUTO eating with GRANDMA beside him, the white egg-shaped virtual pet next to his rice bowl, his mother's hand pointing at it; through the window the red Shiba Inu lies by its wooden doghouse in the dark garden; warm lamp light.",
   refs=["haruto", "grandma", "shiba"], move="in", amb=["dinner"], line=["M1"], xfade=2.2)

# ───────── 夜 ─────────
sc("S26", "夜", 10.5, "【写真が動き出す】'97 8 15 神社の夏祭り。浴衣のナツミも。",
   "Night at a small Japanese summer festival at a shrine: rows of glowing red-and-white paper lanterns, food stalls, water balloon yo-yos floating in a little pool; HARUTO and YUSUKE in jinbei and NATSUMI in a light blue yukata holding cotton candy and water balloons, warm lantern light, crowds softly blurred.",
   refs=["haruto", "yusuke", "natsumi"], move="pan_l", fx=["dust"], amb=["festival"], bgm="M3", xfade=2.4,
   reveal=dict(date="'97 8 15", hold=2.4, trans=2.0), caption=("1997年8月　夏祭り", "Summer festival, August 1997"))
sc("S27", "夜", 9.0, "川の花火。土手に並んで座る3人の後ろ姿。",
   "Night: big colorful fireworks bloom over a wide river and are reflected on the water; HARUTO, NATSUMI and YUSUKE sit side by side on the grassy embankment seen from behind, their faces lit by the fireworks, silhouettes of other people along the riverbank.",
   refs=["haruto", "natsumi", "yusuke"], move="up", fx=["flicker"], amb=["fireworks"], bgm="M3")
sc("S28", "夜", 8.0, "深夜の部屋。月明かり、扇風機、枕元で光る電子ペット。",
   "Late night in HARUTO's tatami bedroom: HARUTO sleeps on his futon in blue moonlight from the open window, the egg-shaped virtual pet beside his pillow with its tiny screen faintly glowing, an electric fan slowly turning, a glass wind chime at the window.",
   refs=["haruto"], move="in", amb=["night", "fan"], bgm="M3")
sc("S29", "夜", 8.5, "朝。電子ペットが“おばけ”に。",
   "Morning, close-up: HARUTO sits on his futon holding the white egg-shaped virtual pet in both hands, looking at it with a sad quiet expression; the toy's small rectangular LCD screen faces the camera directly and is completely blank, plain pale grey-green; soft grey morning light.",
   refs=["haruto"], move="in", amb=["morning_quiet"], bgm="M3")
sc("S29b", "夜", 5.5, "（差し込み）電子ペットの画面には“おばけ”。",
   "INSERT", move="in", fx=["dust"], amb=["morning_quiet"], sfx=[["pet_flat", 0.8, -20]], overlay="pet_ghost", bgm="M3", xfade=1.0, img="S03")

# ───────── 晩夏 ─────────
sc("S30", "晩夏", 10.5, "【写真が動き出す】'97 8 24 デパート屋上の大会。",
   "Late August: a big toy race car tournament on the rooftop of a 1990s Japanese department store: a large multi-lane white plastic race circuit with lane-change bridges, crowds of kids and parents, plain colorful banners with no text, a white event tent, bright summer sky; HARUTO and YUSUKE at the edge of the track.",
   refs=["haruto", "yusuke"], move="pan_r", fx=["rays"], amb=["event"], bgm="M3",
   reveal=dict(date="'97 8 24", hold=2.4, trans=2.0), caption=("1997年8月　屋上の大会", "Rooftop race, August 1997"))
sc("S31", "晩夏", 8.0, "レーンチェンジで宙に浮く白赤のレーサー。",
   "Dramatic snapshot at the rooftop tournament: a small white and red toy race car flies off the track in mid-air at a lane-change bridge, frozen moment, kids' surprised faces in the background, sunlight glinting off the plastic.",
   refs=["haruto"], move="in", fx=["rays"], amb=["event"], sfx=[["flip", 1.2, -12]], bgm="M3")
sc("S32", "晩夏", 8.0, "がっかりするハルトの肩に、ユウスケの手。",
   "HARUTO stands holding his small white and red toy race car with a disappointed face at the edge of the rooftop race circuit; YUSUKE puts a hand on his shoulder with a warm cheerful grin; crowds and the bright track behind them.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["event_far"], bgm="M3")
sc("S33", "晩夏", 9.5, "夕暮れの土手、赤とんぼ。ユウスケ「……おれ、ひっこすんだ」",
   "Evening: HARUTO and YUSUKE sit on a riverside embankment covered with tall summer grass, red dragonflies flying around them in golden sunset light, YUSUKE looking down quietly with his arms around his knees, HARUTO turning to look at him.",
   refs=["haruto", "yusuke"], move="in", fx=["rays", "dust"], amb=["dusk_late"], line="L2", bgm="M3")
sc("S34", "晩夏", 8.0, "8月31日の夜。終わらない宿題。",
   "Night at the end of summer vacation: HARUTO sits at his wooden desk under a desk lamp with an unfinished summer homework workbook and a diary, an electric fan, the white egg-shaped virtual pet lying on the desk, the window open to the dark night.",
   refs=["haruto"], move="in", amb=["night"], sfx=[["pencil", 1.0, -22]], bgm="M3", xfade=2.2)

# ───────── 別れ ─────────
sc("S35", "別れ", 10.5, "【写真が動き出す】'97 8 30 引っ越しの朝。",
   "Early morning at the end of summer: a small moving truck with no markings parked in front of a modest Japanese house, cardboard boxes being loaded, YUSUKE standing by the truck with his family; HARUTO stands at the roadside holding his bicycle.",
   refs=["haruto", "yusuke"], move="in", fx=["rays"], amb=["morning_end", "truck_idle"], bgm="M4", xfade=2.2,
   reveal=dict(date="'97 8 30", hold=2.4, trans=2.0), caption=("1997年8月30日", "August 30, 1997"))
sc("S36", "別れ", 10.0, "青いレーサーを差し出すユウスケ。「これ、あずかっといて。……また、勝負しような」",
   "Close-up by the moving truck: YUSUKE holds out his translucent blue toy race car to HARUTO with both hands, looking down, trying not to cry; HARUTO reaching out to take it; soft morning light.",
   refs=["haruto", "yusuke"], move="in", fx=["dust"], amb=["morning_end"], line="L3", bgm="M4")
sc("S37", "別れ", 9.0, "田んぼの一本道を去るトラック。立ち止まるハルトの後ろ姿。",
   "Wide shot: the small moving truck drives away down a long straight road between golden rice fields; HARUTO has stopped running in the middle of the road, seen from behind, holding the blue toy race car; vast sky.",
   refs=["haruto"], move="out", fx=["rays"], amb=["truck_away", "dusk"], bgm="M4")
sc("S38", "別れ", 8.5, "秋。すすきの土手。青いレーサーと、寄りそう柴犬。",
   "Early autumn: HARUTO sits alone on a riverbank covered with silver pampas grass swaying in the wind, holding the blue toy race car, the red Shiba Inu sitting close beside him leaning on his arm, red dragonflies, clear high autumn sky, melancholic but peaceful.",
   refs=["haruto", "shiba"], move="pan_l", fx=["dust"], amb=["autumn_wind"], sfx=[["dog_bell", 3.0, -20]], bgm="M4")
sc("S39", "別れ", 8.5, "青いレーサー、電子ペット、写真を缶にしまう手。",
   "Close-up photo: a boy's hands placing a translucent blue toy race car, a white egg-shaped virtual pet toy and a few photo prints into a blue square metal cookie tin with a flower pattern, on a tatami floor, soft autumn light.",
   move="in", fx=["dust"], amb=["room_1997"], sfx=[["tin_lid", 6.0, -12]], bgm="M4", xfade=2.6)

# ───────── エピローグ（2026年） ─────────
sc("E00", "エピローグ", 7.0, "2026年秋。片付け中の実家の外観。",
   "An old two-story wooden Japanese family house with a grey tiled roof in a quiet seaside town on an autumn afternoon; its sliding front door is open and several cardboard moving boxes are stacked by the entrance; a small white kei truck with no markings parked in front; a persimmon tree with orange fruit; long soft golden shadows. No people.",
   move="in", fx=["dust"], amb=["autumn_day"], bgm="M4", era="2026", xfade=2.6)
sc("E01", "エピローグ", 8.5, "青いレーサーを手のひらにのせて微笑むハルト（39歳）。",
   "The man sits on the tatami floor of an emptied room among cardboard boxes, holding the small translucent blue toy race car in his palm and looking at it with a gentle smile, warm autumn afternoon light through the window.",
   refs=["adult"], move="in", fx=["dust"], amb=["room_2026"], bgm="M4", era="2026")
sc("E02", "エピローグ", 9.5, "新しい単三電池でモーターが回る。「……まだ、走るじゃん」",
   "Close-up photo of the man's hands inserting two new AA batteries into the black chassis of the small translucent blue toy race car on the tatami, a torn plain battery blister pack nearby, shallow depth of field, warm light.",
   move="in", fx=["dust"], amb=["room_2026"], sfx=[["battery", 1.0, -12], ["battery", 1.7, -12], ["switch", 3.0, -12], ["motor_whir", 3.1, -12]], line="L4", bgm="M4", era="2026")
sc("E03", "エピローグ", 8.5, "電子ペットにも電池。ピッ――たまごが現れる。",
   "Close-up photo of a man's hand holding the old white egg-shaped virtual pet toy, its small rectangular LCD screen facing the camera directly and completely blank, plain pale grey-green; a small coin battery and a tiny screwdriver beside it on the tatami; warm afternoon light.",
   move="in", fx=["dust"], amb=["room_2026"], sfx=[["pet_birth", 2.2, -14]], overlay="pet_egg", bgm="M4", era="2026")
sc("E04", "エピローグ", 8.0, "窓辺で秋の空を見るハルト。窓辺に1997年の3人の写真。",
   "The man stands by the open window of the emptied room looking out at the autumn sky over the seaside town, holding the blue toy race car; on the windowsill an old photo print leans against the glass; curtains moving in the breeze; seen from behind, warm light.",
   refs=["adult"], move="in", fx=["rays", "dust"], amb=["room_2026", "autumn_day"], bgm="M4", era="2026", xfade=2.6)
sc("E05", "エピローグ", 11.0, "1997年の夏へ。入道雲の下、レーサーを追いかけて走るふたり。",
   "A summer 1997 memory: HARUTO and YUSUKE run side by side along a long road between bright green rice fields, chasing their two small toy race cars racing ahead of them on the road, the red Shiba Inu running with them, under a gigantic white cumulonimbus cloud and deep blue sky, glowing sunlight, seen from behind.",
   refs=["haruto", "yusuke", "shiba"], move="in", fx=["rays", "dust"], amb=["day"], sfx=[["motor_pass", 1.5, -16]], bgm="M4", xfade=2.6)
sc("END", "エピローグ", 9.0, "エンドカード", None, move="none", amb=["day_far"], text="end", bgm="M4", xfade=3.0)

# ───────── 余韻（環境音＋静かなピアノ。人物なし、長回し） ─────────
AG = [
    ("A00", 6.0, "見出し「あの夏の音」", None, [], "none", ["engawa_soft"], "afterglow", []),
    ("A01", 30.0, "無人の縁側。風鈴、扇風機、蚊取り線香、踏み石の上の柴犬。",
     "The quiet wooden engawa veranda of an old Japanese house at noon in summer 1997: a glass wind chime gently swaying, an electric fan, a pig-shaped mosquito coil holder with a thin line of smoke, a few toy car parts left on newspaper, the red Shiba Inu asleep on the stepping stone, bright green garden, dappled sunlight. No people.",
     ["rays", "dust"], "in_slow", ["engawa"], None, ["shiba"]),
    ("A02", 30.0, "閉店後の模型店。夕日のコース。",
     "The empty small hobby shop at dusk after closing: the white three-lane toy race track on a big table bathed in orange sunset light from the window, dust floating in the light beams, plain kit boxes on shelves. No people.",
     ["dust"], "pan_r_slow", ["shop_closed"], None, []),
    ("A03", 30.0, "雨の木造バス停。",
     "A small wooden rural bus stop shelter in steady summer rain, a wooden bench inside, rice fields and misty green mountains beyond, rain dripping from the eaves, puddles rippling. No people.",
     ["rain"], "in_slow", ["rain_soft", "thunder_bed"], None, []),
    ("A04", 30.0, "夕焼けの田んぼと小さな鳥居。",
     "Golden rice fields at sunset with a small red shrine gate and a line of wooden utility poles, dragonflies in the air, glowing pink and orange clouds. No people.",
     ["rays", "dust"], "pan_l_slow", ["dusk"], None, []),
    ("A05", 30.0, "夏の夜の町角。自販機の明かり。",
     "A summer night street corner in a small 1990s Japanese town: a glowing drink vending machine with no readable text or logos, moths around a street light, a parked bicycle, a starry sky above the roofs. No people.",
     [], "in_slow", ["night", "distant_train"], None, []),
    ("A06", 30.0, "祭りのあとの神社。",
     "A small shrine after the summer festival late at night: paper lanterns still glowing softly, empty food stalls covered with cloth, a forgotten water balloon on the stone path. No people.",
     ["dust"], "pan_r_slow", ["night_wind"], None, []),
    ("A07", 30.0, "居間のブラウン管テレビ（消えている）と、網戸の外の夜の庭。",
     "A dark 1990s Japanese living room late at night: a bulky CRT television switched off on a low wooden stand reflecting a little moonlight, a low table, an electric fan, the screen door open to the night garden where a wooden doghouse stands under the moon, fireflies of light from distant houses. No people.",
     [], "in_slow", ["night", "fan"], None, []),
    ("A08", 30.0, "海と町の上の入道雲。",
     "A vast summer afternoon sky with towering cumulonimbus clouds over the sea and a small Japanese seaside town, sunlight glittering on the water. No people.",
     ["rays"], "pan_r_slow", ["day", "sea"], None, []),
    ("A09", 30.0, "夕暮れの踏切と2両の電車。",
     "A countryside railway crossing at dusk with its warning lights, a small two-car local train passing, rice fields, the sky deep orange and violet. No people.",
     ["rays"], "in_slow", ["crossing"], None, []),
    ("A10", 30.0, "夏の終わりの朝もや。川と土手の道。",
     "Morning mist over a river and a small town at the end of summer, an empty embankment path, dew on the grass, soft pale golden light. No people.",
     ["rays", "dust"], "out_slow", ["morning_end", "river"], None, []),
]
for (id, dur, jp, prompt, fx, move, amb, text, refs) in AG:
    sc(id, "余韻", dur, jp, prompt, refs=refs, move=move, fx=fx, amb=amb, text=text, bgm="M5", xfade=3.5 if id != "A00" else 3.0)

LINES = {
    "G1": dict(who="おばあちゃん", text="はい、お小遣い。むだづかいしちゃ、だめよ。", voice="Vindemiatrix", at=2.2,
               profile="A very old Japanese grandmother in her late 70s with a thin, slightly hoarse and gentle elderly voice.", scene="On the veranda on a summer morning, giving her grandson two 100-yen coins of pocket money.",
               notes="Speak slowly and softly like an elderly woman, warm, with a little tremble of age."),
    "C1": dict(who="ハルト（10歳）", text="あのさ……おれ、なつみのこと……すき、かも。", voice="Puck", at=1.2,
               profile="A 10-year-old Japanese boy with a light, high, childlike voice.", scene="At dusk in a small park, shyly confessing to a girl in his class.",
               notes="He is shy and nervous: a soft voice (not whispering), small hesitant pauses at each ellipsis, a tiny embarrassed breath before the word suki, trailing off at the end. Natural like a real elementary school kid talking, not theatrical, not like an anime voice actor, not like a teenager or an adult. Keep the voice high, light and young throughout, even when quiet, shy or sad: a child's voice before puberty."),
    "C2": dict(who="ナツミ（10歳）", text="……しってたよ。", voice="Leda", at=8.8,
               profile="A 10-year-old Japanese girl with a light, high, childlike voice.", scene="A boy just shyly confessed that he likes her, at dusk in a park.",
               notes="After a short pause, soft and a little shy, with a gentle small smile in the voice. Natural like a real elementary school kid talking, not theatrical, not like an anime voice actor, not like a teenager or an adult."),
    "L1": dict(who="ユウスケ", text="なあ、あしたも走らせに行こうぜ。", voice="Fenrir", at=2.2,
               profile="A 10-year-old Japanese boy with a light, high, childlike voice.", scene="Summer dusk in 1997, walking home with his best friend, pushing bicycles along a river.",
               notes="Speak casually and cheerfully, a little teasing, warm. Natural like a real elementary school kid talking, not theatrical, not like an anime voice actor, not like a teenager or an adult."),
    "L2": dict(who="ユウスケ", text="……おれ、ひっこすんだ。", voice="Fenrir", at=3.0,
               profile="A 10-year-old Japanese boy with a light, high, childlike voice.", scene="Sitting on a riverbank at sunset, telling his best friend that his family is moving away.",
               notes="Quiet and slow, looking down; he tries to sound casual, but he is sad. Natural like a real elementary school kid talking, not theatrical, not like an anime voice actor, not like a teenager or an adult. Keep the voice high, light and young throughout, even when quiet, shy or sad: a child's voice before puberty."),
    "L3": dict(who="ユウスケ", text="これ、あずかっといて。……また、勝負しような。", voice="Fenrir", at=2.0,
               profile="A 10-year-old Japanese boy with a light, high, childlike voice.", scene="The morning he moves away, handing his favorite toy race car to his best friend.",
               notes="Slow and quiet, holding back tears, with a brave small smile at the end. Pause between the two sentences. Say the last word exactly as written: shiyou-na. Natural like a real elementary school kid talking, not theatrical, not like an anime voice actor, not like a teenager or an adult. Keep the voice high, light and young throughout, even when quiet, shy or sad: a child's voice before puberty."),
    "L4": dict(who="大人のハルト", text="……まだ、走るじゃん。", voice="Charon", at=4.6, room=[0.6, 0.12],
               profile="A Japanese man around 40 years old.", scene="Alone in his childhood room, he just put new batteries into his old toy race car and the motor started spinning.",
               notes="Speak very quietly to himself, with a small warm laugh before the words."),
    "M1": dict(who="母（声のみ）", text="ハルトー、ごはんよー。", voice="Kore", at=-1.6, far=True,
               profile="A Japanese mother in her late 30s.", scene="Calling her son for dinner from the kitchen window at dusk in 1997.",
               notes="Call out warmly from a distance, relaxed and natural."),
}
MUSIC = {
    "M0": ("lyria-3-clip-preview", "existing"), "M1": ("lyria-3.5", "existing"), "M3": ("lyria-3.5", "existing"), "M4": ("lyria-3.5", "existing"),
    "M2": ("lyria-3.5", "Instrumental only, no vocals, no drums. Light, warm and playful but calm Japanese film score for kids spending a lazy summer afternoon tinkering with toy race cars and playing baseball in a park in the 1990s: acoustic piano, pizzicato strings, soft nylon guitar, a little celesta, 88 BPM, G major, cozy, never loud, smooth ending."),
    "M5a": ("lyria-3.5", "Instrumental only, no vocals, no drums, no percussion. Very calm ambient piano for relaxing, studying and sleeping, evoking a quiet summer evening in rural Japan in the 1990s: soft felt piano with long pauses, a faint warm string pad, slow 60 BPM, F major, minimal, peaceful and steady with no sudden changes."),
    "M5b": ("lyria-3.5", "Instrumental only, no vocals, no drums, no percussion. Very calm ambient piano for relaxing and studying, evoking a quiet late-summer night in a small Japanese seaside town in the 1990s: soft felt piano, sparse gentle melody, a faint warm pad, slow 58 BPM, D major, peaceful and steady with no sudden changes."),
}


# 環境音に混ぜる「言葉が聞こえる音」（TTS。gen_sfx_voices.py → assets/sfx/<名前>.wav）
# 登場人物の声（Puck・Fenrir・Leda・Vindemiatrix・Charon・Kore）はざわめきに使わない（同じ声＝同じ人物に聞こえるため）
KID = dict(profile="A Japanese child around 10 years old.", scene="Excitedly watching small toy race cars run around a track in Japan in the 1990s, in a crowd of kids.",
           notes="Say it naturally and briefly like a real kid in a crowd, lively but not shouting into the microphone.")
FES = dict(profile="A Japanese person at a summer festival.", scene="A crowded night summer festival with food stalls at a small shrine in a Japanese town in the 1990s.",
           notes="Say it naturally and casually like a passerby in a crowd, not too loud.")
SFX_VOICES = {
    "tv_morning_voice": dict(voice="Aoede", profile="A cheerful Japanese female TV announcer in her late 20s on a 1990s morning news show.",
                             scene="A live morning broadcast on a Saturday in late July 1997, reading the weather forecast.",
                             notes="Speak brightly and clearly at a natural broadcast pace, friendly and warm.",
                             text="おはようございます。七月二十六日、土曜日の朝です。今日も全国的に晴れて、厳しい暑さになりそうです。お出かけの際は、帽子をかぶって、こまめに水分をとってくださいね。それでは、各地のお天気です。"),
    "tv_baseball_voice": dict(voice="Orus", profile="An experienced Japanese male baseball play-by-play announcer on 1990s TV.",
                              scene="A night professional baseball game, bottom of the ninth inning, bases loaded, broadcast live on television.",
                              notes="Start calm and tense, then get excited with the hit and shout with joy at the home run, like a real live sports broadcast.",
                              text="さあ、九回の裏、ツーアウト満塁。カウントは、スリーボール、ツーストライク。ピッチャー、セットポジションから、投げました！打った！大きい、大きい！入るか、入るか、入ったー！サヨナラ満塁ホームラン！"),
}
for k, (v, t) in enumerate([("Zephyr", "はやーい！"), ("Achird", "いけいけー！"), ("Sadachbia", "抜いた、抜いた！"), ("Laomedeia", "あー、コースアウトだ！"),
                            ("Zephyr", "次、おれの番な！"), ("Achird", "すげー、速いじゃん！"), ("Laomedeia", "がんばれー！"), ("Sadachbia", "もう一回やろうぜ！"),
                            ("Despina", "わあ、すごーい！"), ("Umbriel", "よっしゃー！")], 1):
    SFX_VOICES[f"crowd_kids_{k:02d}"] = dict(voice=v, text=t, **KID)
for k, (v, t) in enumerate([("Callirrhoe", "わたあめ、買おうよ！"), ("Rasalgethi", "いらっしゃい、いらっしゃい！"), ("Despina", "金魚すくい、やってく？"),
                            ("Iapetus", "おいしいよー、焼きそば！"), ("Laomedeia", "見て見て、あれ！"), ("Achird", "ヨーヨー、取れた！"),
                            ("Erinome", "はぐれないでね。"), ("Algenib", "はい、まいど！")], 1):
    SFX_VOICES[f"crowd_fest_{k:02d}"] = dict(voice=v, text=t, **FES)

def build_prompt(s):
    if not s["prompt"] or s.get("img"):
        return None
    parts = [s["prompt"]]
    if s["refs"]:
        parts.append("Characters: " + "; ".join(CHARS[r]["ref"] for r in s["refs"]) + ".")
    if "toy" in s["prompt"] or "virtual pet" in s["prompt"]:
        parts.append(TOY_RULES)
    parts.append(ERA_2026 if s["era"] == "2026" else ERA_1997)
    parts.append(STYLE_2026 if s["era"] == "2026" else STYLE_1997)
    return " ".join(parts)

def main():
    t = 0.0
    for s in S:
        s["start"] = round(t, 3)
        s["full_prompt"] = build_prompt(s)
        t += s["dur"]
    data = dict(fps=30, size=[1920, 1080], total=round(t, 3), meta=META, chars={k: {kk: vv for kk, vv in v.items() if kk != "ref"} for k, v in CHARS.items()},
                scenes=S, lines=LINES, music={k: dict(model=m, prompt=p) for k, (m, p) in MUSIC.items()}, sfx_voices=SFX_VOICES,
                style=dict(y1997=STYLE_1997, y2026=STYLE_2026))
    json.dump(data, open(os.path.join(HERE, "scenes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    def mmss(x): return f"{int(x//60)}:{x%60:04.1f}"
    md = ["# 絵コンテ v2「電池の夏」（写実・フィルム写真風）", "", f"総尺 {mmss(t)}（{len(S)}カット）　【写真が動き出す】= プリント写真から色づいて動き出す演出", "",
          "| # | 開始 | 秒 | パート | 内容 | 環境音 | 単発音・セリフ | BGM |", "|---|---|---|---|---|---|---|---|"]
    for s in S:
        se = ", ".join(x[0] for x in s["sfx"])
        for lid in (s["line"] if isinstance(s["line"], list) else ([s["line"]] if s["line"] else [])):
            ln = LINES[lid]
            se = (se + " / " if se else "") + f"{ln['who']}「{ln['text']}」"
        md.append(f"| {s['id']} | {mmss(s['start'])} | {s['dur']:g} | {s['part']} | {s['jp']} | {', '.join(s['amb'])} | {se} | {s['bgm'] or '—'} |")
    open(os.path.join(HERE, "絵コンテ.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
    print(f"{len(S)} scenes, total {mmss(t)} ({t:.1f}s), images: {sum(1 for s in S if s['prompt'])}")

if __name__ == "__main__":
    main()
