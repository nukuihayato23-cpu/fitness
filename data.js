// 種目・食品などの静的データ
// equip: g=ジム(マシン/バーベル), d=ダンベル(自宅), b=自重
// lv: 必要な経験レベル(0=未経験OK, 1=初心者以上, 2=中級以上), maxLv: これ以下のレベルの人だけに出す
// c: 多関節種目(コンパウンド)かどうか, timed: 秒数で行う種目

const PARTS = {
  chest: '胸',
  back: '背中',
  legs: '脚・お尻',
  shoulders: '肩',
  biceps: '腕(力こぶ)',
  triceps: '腕(二の腕)',
  abs: '腹',
};

const EXERCISES = [
  // 胸
  { id: 'bench', name: 'ベンチプレス', part: 'chest', equip: ['g'], c: true, lv: 1, tip: '肩甲骨を寄せて胸を張り、バーをみぞおち付近に下ろす。' },
  { id: 'chest_press', name: 'チェストプレス(マシン)', part: 'chest', equip: ['g'], c: true, lv: 0, tip: 'グリップは胸の高さ。肩をすくめずに押す。' },
  { id: 'db_press', name: 'ダンベルプレス', part: 'chest', equip: ['g', 'd'], c: true, lv: 0, tip: '肘は体から45度ほど開き、胸のストレッチを感じるまで下ろす。' },
  { id: 'incline_db_press', name: 'インクラインダンベルプレス', part: 'chest', equip: ['g', 'd'], c: true, lv: 1, tip: 'ベンチ角度は30度前後。胸の上部を狙う。' },
  { id: 'pushup', name: '腕立て伏せ', part: 'chest', equip: ['b', 'd', 'g'], c: true, lv: 1, tip: '頭からかかとまで一直線。胸が床につく直前まで下ろす。' },
  { id: 'knee_pushup', name: '膝つき腕立て伏せ', part: 'chest', equip: ['b', 'd'], c: true, lv: 0, maxLv: 0, tip: '膝から頭まで一直線を保つ。慣れたら通常の腕立てへ。' },
  { id: 'db_fly', name: 'ダンベルフライ', part: 'chest', equip: ['g', 'd'], c: false, lv: 1, tip: '肘を軽く曲げたまま弧を描くように開閉する。' },
  { id: 'pec_fly', name: 'ペックフライ(マシン)', part: 'chest', equip: ['g'], c: false, lv: 0, tip: '胸を張ったまま腕を閉じ、胸の収縮を意識。' },
  { id: 'dips', name: 'ディップス', part: 'chest', equip: ['g'], c: true, lv: 2, tip: '上体をやや前傾させると胸に効く。' },
  { id: 'wide_pushup', name: 'ワイドプッシュアップ', part: 'chest', equip: ['b'], c: false, lv: 1, tip: '手幅を肩幅の1.5倍に広げて胸のストレッチを強める。' },

  // 背中
  { id: 'lat_pull', name: 'ラットプルダウン', part: 'back', equip: ['g'], c: true, lv: 0, tip: '胸を張り、肘を下に引く意識で鎖骨付近まで引く。' },
  { id: 'deadlift', name: 'デッドリフト', part: 'back', equip: ['g'], c: true, lv: 2, tip: '背中を丸めない。バーはすねに沿わせて引き上げる。' },
  { id: 'pullup', name: '懸垂(チンニング)', part: 'back', equip: ['g', 'b'], c: true, lv: 2, tip: '反動を使わず、胸をバーに近づける。' },
  { id: 'seated_row', name: 'シーテッドロウ(マシン)', part: 'back', equip: ['g'], c: true, lv: 0, tip: '上体を起こしたまま肩甲骨を寄せて引く。' },
  { id: 'one_arm_row', name: 'ワンハンドダンベルロウ', part: 'back', equip: ['g', 'd'], c: true, lv: 0, tip: '背中をまっすぐ保ち、肘を腰の方へ引く。' },
  { id: 'bent_row', name: 'ベントオーバーロウ', part: 'back', equip: ['g', 'd'], c: true, lv: 2, tip: '上体45度前傾、腰を丸めずにおへそに向かって引く。' },
  { id: 'inverted_row', name: '斜め懸垂(テーブルロウ)', part: 'back', equip: ['b'], c: true, lv: 0, tip: '丈夫な机や低い鉄棒で。体を一直線に保ち胸を引き寄せる。' },
  { id: 'back_ext', name: 'バックエクステンション', part: 'back', equip: ['g', 'b', 'd'], c: false, lv: 0, tip: 'うつ伏せで上体を反らす。反りすぎに注意。' },
  { id: 'db_pullover', name: 'ダンベルプルオーバー', part: 'back', equip: ['g', 'd'], c: false, lv: 1, tip: '肘を軽く曲げ、頭の後ろから胸の上まで弧を描く。' },

  // 脚・お尻
  { id: 'squat', name: 'バーベルスクワット', part: 'legs', equip: ['g'], c: true, lv: 1, tip: '膝とつま先の向きをそろえ、太ももが床と平行まで下げる。' },
  { id: 'leg_press', name: 'レッグプレス', part: 'legs', equip: ['g'], c: true, lv: 0, tip: '膝を伸ばし切らない。腰がシートから浮かない範囲で下ろす。' },
  { id: 'goblet_squat', name: 'ゴブレットスクワット', part: 'legs', equip: ['g', 'd'], c: true, lv: 0, tip: 'ダンベルを胸の前で持ち、上体を起こしたまましゃがむ。' },
  { id: 'bw_squat', name: '自重スクワット', part: 'legs', equip: ['b'], c: true, lv: 0, tip: 'お尻を後ろに引くように。慣れたらゆっくり下ろして負荷UP。' },
  { id: 'rdl', name: 'ルーマニアンデッドリフト', part: 'legs', equip: ['g', 'd'], c: true, lv: 1, tip: '膝は軽く曲げたまま股関節から前傾。もも裏のストレッチを感じる。' },
  { id: 'bulgarian', name: 'ブルガリアンスクワット', part: 'legs', equip: ['g', 'd', 'b'], c: true, lv: 1, tip: '後ろ足を台に乗せ、前脚で沈み込む。お尻に効く。' },
  { id: 'lunge', name: 'ランジ', part: 'legs', equip: ['g', 'd', 'b'], c: true, lv: 0, tip: '一歩踏み出して両膝90度まで沈む。上体はまっすぐ。' },
  { id: 'leg_ext', name: 'レッグエクステンション', part: 'legs', equip: ['g'], c: false, lv: 0, tip: '太もも前を意識してゆっくり上げ下げ。' },
  { id: 'leg_curl', name: 'レッグカール', part: 'legs', equip: ['g'], c: false, lv: 0, tip: 'もも裏を意識し、戻す時もゆっくり。' },
  { id: 'hip_lift', name: 'ヒップリフト', part: 'legs', equip: ['b', 'd', 'g'], c: false, lv: 0, tip: '仰向けで膝を立て、お尻を締めながら持ち上げる。' },
  { id: 'calf_raise', name: 'カーフレイズ', part: 'legs', equip: ['b', 'd', 'g'], c: false, lv: 0, tip: 'かかとを最大まで上げ、ゆっくり下ろす。' },

  // 肩
  { id: 'db_sp', name: 'ダンベルショルダープレス', part: 'shoulders', equip: ['g', 'd'], c: true, lv: 0, tip: '耳の横から真上に押し上げる。腰を反らしすぎない。' },
  { id: 'machine_sp', name: 'ショルダープレス(マシン)', part: 'shoulders', equip: ['g'], c: true, lv: 0, tip: '肩をすくめずに押す。' },
  { id: 'bb_sp', name: 'バーベルショルダープレス', part: 'shoulders', equip: ['g'], c: true, lv: 2, tip: 'お腹に力を入れ、体幹を固めて頭上へ押す。' },
  { id: 'pike_pushup', name: 'パイクプッシュアップ', part: 'shoulders', equip: ['b'], c: true, lv: 1, tip: 'お尻を高く上げた「く」の字で、頭を床に近づける。' },
  { id: 'side_raise', name: 'サイドレイズ', part: 'shoulders', equip: ['g', 'd'], c: false, lv: 0, tip: '軽い重さで、肘から上げるイメージ。肩の高さまで。' },
  { id: 'rear_raise', name: 'リアレイズ', part: 'shoulders', equip: ['g', 'd'], c: false, lv: 0, tip: '前傾姿勢で腕を横に開く。肩の後ろを狙う。' },
  { id: 'face_pull', name: 'フェイスプル', part: 'shoulders', equip: ['g'], c: false, lv: 1, tip: 'ロープを顔に向かって引き、肘を高く保つ。' },
  { id: 'wall_handstand', name: '壁倒立キープ', part: 'shoulders', equip: ['b'], c: false, lv: 2, timed: true, tip: '壁に足をつけて倒立姿勢をキープ。' },
  { id: 'y_raise', name: 'うつ伏せYレイズ', part: 'shoulders', equip: ['b'], c: false, lv: 0, tip: 'うつ伏せで腕をY字に伸ばし、床から浮かせる。' },

  // 腕(力こぶ)
  { id: 'bb_curl', name: 'バーベルカール', part: 'biceps', equip: ['g'], c: false, lv: 1, tip: '肘の位置を固定し、反動を使わない。' },
  { id: 'db_curl', name: 'ダンベルカール', part: 'biceps', equip: ['g', 'd'], c: false, lv: 0, tip: '小指側から巻き上げるように。下ろす時もゆっくり。' },
  { id: 'hammer_curl', name: 'ハンマーカール', part: 'biceps', equip: ['g', 'd'], c: false, lv: 0, tip: '縦持ちで巻き上げる。前腕も鍛えられる。' },
  { id: 'cable_curl', name: 'ケーブルカール', part: 'biceps', equip: ['g'], c: false, lv: 0, tip: '常に負荷がかかるのでゆっくり丁寧に。' },
  { id: 'chinup_rev', name: '逆手の斜め懸垂', part: 'biceps', equip: ['b'], c: true, lv: 0, tip: '手のひらを自分に向けて握り、腕で引き寄せる。' },
  { id: 'towel_curl', name: 'タオルカール(片足押さえ)', part: 'biceps', equip: ['b'], c: false, lv: 0, tip: 'タオルを足に引っかけ、足で抵抗をかけながら腕を曲げる。' },

  // 腕(二の腕)
  { id: 'pushdown', name: 'トライセプスプッシュダウン', part: 'triceps', equip: ['g'], c: false, lv: 0, tip: '肘を体の横に固定し、下まで押し切る。' },
  { id: 'french_press', name: 'オーバーヘッドエクステンション', part: 'triceps', equip: ['g', 'd'], c: false, lv: 0, tip: '頭の後ろにダンベルを下ろし、肘を開かず伸ばす。' },
  { id: 'kickback', name: 'キックバック', part: 'triceps', equip: ['g', 'd'], c: false, lv: 0, tip: '前傾して肘を固定、後ろへ腕を伸ばす。' },
  { id: 'narrow_pushup', name: 'ナロープッシュアップ', part: 'triceps', equip: ['b', 'd', 'g'], c: true, lv: 1, tip: '手幅を狭くして、脇を締めたまま腕立て。' },
  { id: 'bench_dips', name: 'ベンチディップス', part: 'triceps', equip: ['b', 'd', 'g'], c: false, lv: 0, tip: '椅子に手をついて体を上下。肩が痛む場合は浅めに。' },

  // 腹
  { id: 'plank', name: 'プランク', part: 'abs', equip: ['b', 'd', 'g'], c: false, lv: 0, timed: true, tip: '頭からかかとまで一直線。お尻が上がり下がりしないように。' },
  { id: 'crunch', name: 'クランチ', part: 'abs', equip: ['b', 'd', 'g'], c: false, lv: 0, tip: 'おへそを覗き込むように背中を丸める。首で引っ張らない。' },
  { id: 'leg_raise', name: 'レッグレイズ', part: 'abs', equip: ['b', 'd', 'g'], c: false, lv: 1, tip: '腰が床から浮かないように脚をゆっくり上げ下げ。' },
  { id: 'ab_roller', name: 'アブローラー', part: 'abs', equip: ['g', 'd'], c: false, lv: 1, tip: '膝つきから。腰を反らさない範囲で転がす。' },
  { id: 'cable_crunch', name: 'ケーブルクランチ', part: 'abs', equip: ['g'], c: false, lv: 1, tip: '腹筋で背中を丸める。腕は固定。' },
  { id: 'russian_twist', name: 'ロシアンツイスト', part: 'abs', equip: ['b', 'd', 'g'], c: false, lv: 0, tip: '上体を後ろに倒し、左右にひねる。' },
  { id: 'side_plank', name: 'サイドプランク', part: 'abs', equip: ['b', 'd', 'g'], c: false, lv: 0, timed: true, tip: '横向きで体を一直線にキープ。左右それぞれ行う。' },
];

const GOALS = {
  hypertrophy: { label: '筋肉を大きくしたい', sub: '筋肥大・バルクアップ', icon: '💪' },
  diet: { label: '体脂肪を落としたい', sub: 'ダイエット・減量', icon: '🔥' },
  tone: { label: '引き締まった体にしたい', sub: 'ボディメイク・シェイプアップ', icon: '✨' },
  strength: { label: '力を強くしたい', sub: '筋力向上・挙上重量UP', icon: '🏋️' },
  health: { label: '健康・体力づくり', sub: '運動不足解消・姿勢改善', icon: '🌱' },
};

const EXPERIENCE = {
  0: { label: 'ほぼ未経験', sub: '運動習慣がほとんどない' },
  1: { label: '初心者', sub: '運動はするが、筋トレは始めたばかり/ブランクあり' },
  2: { label: '中級者', sub: '筋トレ経験 半年〜2年程度' },
  3: { label: '上級者', sub: '筋トレ経験 2年以上、フォームに自信あり' },
};

const EQUIPMENT = {
  g: { label: 'ジム', sub: 'マシン・バーベル・ダンベルが使える' },
  d: { label: '自宅(ダンベルあり)', sub: 'ダンベル・ベンチ代わりの台がある' },
  b: { label: '自宅(自重のみ)', sub: '器具なし' },
};

// 食品の目安値(1単位あたり)。数値は日本食品標準成分表などを参考にした概算です。
const FOODS = [
  { name: 'ご飯', unit: '茶碗1杯(150g)', kcal: 234, p: 3.8, f: 0.5, c: 55.7 },
  { name: 'ご飯(大盛り)', unit: '茶碗1杯(250g)', kcal: 390, p: 6.3, f: 0.8, c: 92.8 },
  { name: '食パン', unit: '6枚切1枚', kcal: 149, p: 5.3, f: 2.5, c: 26.6 },
  { name: 'オートミール', unit: '30g', kcal: 105, p: 4.1, f: 1.7, c: 20.7 },
  { name: 'パスタ(乾麺)', unit: '100g', kcal: 347, p: 12.9, f: 1.8, c: 73.1 },
  { name: 'うどん(ゆで)', unit: '1玉(230g)', kcal: 219, p: 6.0, f: 0.9, c: 49.7 },
  { name: 'そば(ゆで)', unit: '1玉(180g)', kcal: 234, p: 8.6, f: 1.8, c: 46.8 },
  { name: 'おにぎり(鮭)', unit: '1個', kcal: 180, p: 5.0, f: 1.0, c: 38.0 },
  { name: '鶏むね肉(皮なし)', unit: '100g', kcal: 105, p: 23.3, f: 1.9, c: 0 },
  { name: '鶏もも肉(皮つき)', unit: '100g', kcal: 190, p: 16.6, f: 14.2, c: 0 },
  { name: 'ささみ', unit: '1本(50g)', kcal: 49, p: 12.0, f: 0.4, c: 0 },
  { name: 'サラダチキン', unit: '1個(110g)', kcal: 120, p: 26.0, f: 1.5, c: 0.5 },
  { name: '豚ロース', unit: '100g', kcal: 248, p: 19.3, f: 19.2, c: 0.2 },
  { name: '豚ヒレ', unit: '100g', kcal: 118, p: 22.2, f: 3.7, c: 0.3 },
  { name: '牛もも', unit: '100g', kcal: 196, p: 21.2, f: 13.3, c: 0.4 },
  { name: '鮭', unit: '1切れ(80g)', kcal: 106, p: 17.8, f: 3.3, c: 0.1 },
  { name: 'サバ水煮缶', unit: '1/2缶(95g)', kcal: 166, p: 19.9, f: 10.1, c: 0.2 },
  { name: 'ツナ缶(ノンオイル)', unit: '1缶(70g)', kcal: 50, p: 11.3, f: 0.5, c: 0.1 },
  { name: '卵', unit: '1個(50g)', kcal: 71, p: 6.1, f: 5.1, c: 0.2 },
  { name: '納豆', unit: '1パック(45g)', kcal: 86, p: 7.4, f: 4.5, c: 5.4 },
  { name: '豆腐(木綿)', unit: '1/2丁(150g)', kcal: 110, p: 10.5, f: 7.4, c: 2.3 },
  { name: '牛乳', unit: '200ml', kcal: 126, p: 6.6, f: 7.6, c: 9.6 },
  { name: 'ギリシャヨーグルト(無糖)', unit: '1個(100g)', kcal: 59, p: 10.0, f: 0, c: 4.0 },
  { name: 'プロテイン(ホエイ)', unit: '1杯(30g)', kcal: 120, p: 24.0, f: 1.5, c: 3.0 },
  { name: 'バナナ', unit: '1本(100g)', kcal: 93, p: 1.1, f: 0.2, c: 22.5 },
  { name: 'りんご', unit: '1/2個(150g)', kcal: 80, p: 0.2, f: 0.3, c: 23.0 },
  { name: 'ブロッコリー', unit: '100g', kcal: 37, p: 5.4, f: 0.6, c: 6.6 },
  { name: 'サラダ(野菜のみ)', unit: '1皿', kcal: 30, p: 1.5, f: 0.2, c: 6.0 },
  { name: '味噌汁', unit: '1杯', kcal: 40, p: 2.5, f: 1.2, c: 4.5 },
  { name: 'アボカド', unit: '1/2個(70g)', kcal: 125, p: 1.8, f: 12.3, c: 5.0 },
  { name: 'アーモンド', unit: '25g(約20粒)', kcal: 152, p: 5.0, f: 13.0, c: 5.2 },
  { name: 'プロテインバー', unit: '1本', kcal: 200, p: 15.0, f: 9.0, c: 15.0 },
];

const MEAL_CATS = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };
