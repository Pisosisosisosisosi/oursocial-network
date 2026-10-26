import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

type EmojiEntry = [emoji: string, tags: string];
type EmojiCategory = { id: string; name: string; emojis: EmojiEntry[] };

const BASE_CATEGORIES: EmojiCategory[] = [
  { id: 'smileys', name: 'Смайлы', emojis: [['😀', 'улыбка smile'], ['😄', 'радость happy'], ['😂', 'смех joy'], ['🤣', 'ржака laugh'], ['😊', 'милый blush'], ['😍', 'любовь love heart eyes'], ['😘', 'поцелуй kiss'], ['🥰', 'нежность'], ['😎', 'крутой cool'], ['🤔', 'думаю think'], ['🙃', 'перевернутый upside'], ['😉', 'подмигивание wink'], ['😭', 'плачу cry'], ['😢', 'грустно sad'], ['🤯', 'взрыв mind blown'], ['🥳', 'праздник party'], ['😴', 'сплю sleep'], ['🤗', 'обнимаю hug']] },
  { id: 'gestures', name: 'Жесты', emojis: [['👍', 'лайк like ok'], ['👎', 'дизлайк'], ['👌', 'окей okay'], ['✌️', 'победа victory'], ['🤞', 'скрещиваю fingers crossed'], ['👏', 'аплодисменты clap'], ['🙌', 'ура raising hands'], ['👋', 'привет hello wave'], ['🤝', 'рукопожатие deal handshake'], ['💪', 'сила strong'], ['🫶', 'сердце руки heart hands'], ['🖐️', 'ладонь five'], ['☝️', 'указатель'], ['👆', 'вверх up'], ['🤙', 'круто shaka'], ['✊', 'кулак fist']] },
  { id: 'animals', name: 'Животные', emojis: [['🐱', 'кот cat'], ['🐶', 'собака dog'], ['🐻', 'медведь bear'], ['🦊', 'лиса fox'], ['🐼', 'панда panda'], ['🐨', 'коала koala'], ['🦁', 'лев lion'], ['🐯', 'тигр tiger'], ['🐸', 'лягушка frog'], ['🐵', 'обезьяна monkey'], ['🦄', 'единорог unicorn'], ['🐝', 'пчела bee'], ['🦋', 'бабочка butterfly'], ['🐢', 'черепаха turtle'], ['🐙', 'осьминог octopus'], ['🦉', 'сова owl']] },
  { id: 'food', name: 'Еда', emojis: [['🍕', 'пицца pizza'], ['🍔', 'бургер burger'], ['🍟', 'фри fries'], ['🌮', 'тако taco'], ['🍣', 'суши sushi'], ['🍦', 'мороженое ice cream'], ['🎂', 'торт cake'], ['🍰', 'пирожное'], ['☕', 'кофе coffee'], ['🍺', 'пиво beer'], ['🍷', 'вино wine'], ['🍎', 'яблоко apple'], ['🍉', 'арбуз watermelon'], ['🍇', 'виноград grapes'], ['🥑', 'авокадо avocado'], ['🌶️', 'перец chili']] },
  { id: 'activity', name: 'Спорт и активность', emojis: [['⚽', 'футбол football'], ['🏀', 'баскетбол basketball'], ['🏈', 'американский футбол'], ['⚾', 'бейсбол'], ['🎾', 'теннис tennis'], ['🏐', 'волейбол'], ['🏓', 'пингпонг'], ['🏸', 'бадминтон'], ['🥊', 'бокс'], ['🏋️', 'качалка gym'], ['🎮', 'геймер games'], ['🎲', 'кости dice'], ['🎯', 'мишень target'], ['🎱', 'бильярд'], ['🏆', 'кубок trophy'], ['🎪', 'цирк circus']] },
  { id: 'symbols', name: 'Символы', emojis: [['❤️', 'сердце love red heart'], ['💙', 'синее сердце blue'], ['💚', 'зеленое сердце green'], ['💛', 'желтое сердце yellow'], ['💜', 'фиолетовое сердце purple'], ['🔥', 'огонь fire hot'], ['✨', 'блеск sparkles'], ['🎉', 'праздник tada party'], ['🎊', 'конфетти confetti'], ['💯', '100 сто hundred'], ['✅', 'галочка check done'], ['⭐', 'звезда star'], ['🌙', 'луна moon'], ['☀️', 'солнце sun'], ['🌈', 'радуга rainbow'], ['💤', 'сплю zzz'], ['⚡', 'молния zap'], ['🆒', 'круто cool']] },
];

const isEmojiPresentation = /\p{Emoji_Presentation}/u;
const isEmojiModifierBase = /\p{Emoji_Modifier_Base}/u;
const SKIN_TONES = ['🏻', '🏼', '🏽', '🏾', '🏿'];
const categoryForCodePoint = (cp: number): string => {
  if ((cp >= 0x1F600 && cp <= 0x1F64F) || (cp >= 0x1F910 && cp <= 0x1F92F) || (cp >= 0x1F970 && cp <= 0x1F97A) || (cp >= 0x1FAE0 && cp <= 0x1FAE8)) return 'smileys';
  if ((cp >= 0x1F440 && cp <= 0x1F450) || (cp >= 0x1F90C && cp <= 0x1F9FF) || (cp >= 0x1FAF0 && cp <= 0x1FAF8)) return 'gestures';
  if ((cp >= 0x1F400 && cp <= 0x1F43F) || (cp >= 0x1F980 && cp <= 0x1F9AE) || (cp >= 0x1FAB0 && cp <= 0x1FABB) || (cp >= 0x1FABC && cp <= 0x1FABD)) return 'animals';
  if ((cp >= 0x1F330 && cp <= 0x1F37F) || (cp >= 0x1F950 && cp <= 0x1F96F) || (cp >= 0x1F9C0 && cp <= 0x1F9CB)) return 'food';
  if ((cp >= 0x1F3A0 && cp <= 0x1F3FF) || (cp >= 0x1F680 && cp <= 0x1F6FF) || (cp >= 0x1F947 && cp <= 0x1F94F)) return 'activity';
  if ((cp >= 0x1F1E6 && cp <= 0x1F1FF)) return 'flags';
  return 'symbols';
};

const generatedEntries = new Map<string, EmojiEntry[]>();
const addGeneratedEmoji = (emoji: string, categoryId: string, tags = 'emoji symbol'): void => {
  const list = generatedEntries.get(categoryId) ?? [];
  if (!list.some(([existing]) => existing === emoji)) list.push([emoji, tags]);
  generatedEntries.set(categoryId, list);
};

// Build the full Unicode emoji set supported by the browser's Unicode tables,
// including skin-tone variants, keycaps, and regional-indicator flags.
for (let cp = 0x2300; cp <= 0x1FAFF; cp += 1) {
  const emoji = String.fromCodePoint(cp);
  if (!isEmojiPresentation.test(emoji)) continue;
  const categoryId = categoryForCodePoint(cp);
  addGeneratedEmoji(emoji, categoryId, `emoji ${cp.toString(16)}`);
  if (isEmojiModifierBase.test(emoji)) {
    for (const tone of SKIN_TONES) addGeneratedEmoji(emoji + tone, 'gestures', `emoji skin tone ${cp.toString(16)}`);
  }
}
// Only create real ISO 3166-1 country/territory flags. Generating every
// possible regional-indicator pair creates unsupported combinations that
// appear as two plain letters on many systems.
const FLAG_CODES = (
  'AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CP CR CU CV CW CX CY CZ ' +
  'DE DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET EU FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
  'HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY ' +
  'MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM ' +
  'PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK ' +
  'SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN ' +
  'TO TR TT TV TW TZ UA UG UM UN US UY UZ VA VC VE VG VI VN VU WF WS ' +
  'XK YE YT ZA ZM ZW'
).split(/\\s+/);
for (const code of FLAG_CODES) {
  const points = [...code].map((letter) => 0x1F1E6 + letter.charCodeAt(0) - 65);
  addGeneratedEmoji(String.fromCodePoint(...points), 'flags', `flag ${code.toLowerCase()} country region`);
}

const emojiAssetCode = (emoji: string): string =>
  Array.from(emoji, (character) => character.codePointAt(0)!)
    .filter((codePoint) => codePoint !== 0xFE0F)
    .map((codePoint) => codePoint.toString(16))
    .join('-');
for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '#', '*']) {
  addGeneratedEmoji(key + '\uFE0F\u20E3', 'symbols', `keycap ${key}`);
}
const CATEGORIES: EmojiCategory[] = [
  ...BASE_CATEGORIES.map((category) => ({
    ...category,
    emojis: Array.from(new Map([
      ...category.emojis,
      ...(generatedEntries.get(category.id) ?? []),
    ].map((entry) => [entry[0], entry] as const)).values()),
  })),
  { id: 'flags', name: 'Флаги', emojis: generatedEntries.get('flags') ?? [] },
];

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('smileys');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selected = CATEGORIES.find((c) => c.id === category)?.emojis ?? [];
    if (!q) return selected;
    return CATEGORIES.flatMap((c) => c.emojis).filter(([emoji, tags]) => emoji.includes(q) || tags.toLowerCase().includes(q));
  }, [query, category]);

  return (
    <div className="glass-panel w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-2xl animate-scale-in" data-emoji-picker>
      <div className="flex items-center gap-2 border-b border-white/[0.08] bg-white/[0.025] px-3 py-3">
        <Search size={14} className="shrink-0 text-t-secondary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск эмодзи"
          className="min-w-0 flex-1 bg-transparent text-sm text-t-primary placeholder-slate-500 focus:outline-none"
        />
        <button type="button" onClick={onClose} aria-label="Закрыть" className="grid h-8 w-8 place-items-center rounded-lg text-t-secondary transition hover:bg-white/10">
          <X size={14} />
        </button>
      </div>
      {!query && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-white/[0.08] bg-white/[0.02] px-2.5 py-2 custom-scrollbar">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] transition-all duration-200 ${category === c.id ? 'bg-accent/15 text-accent ring-1 ring-accent/20' : 'text-t-secondary hover:bg-white/[0.06] hover:text-t-primary'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="custom-scrollbar grid max-h-[min(24rem,55vh)] grid-cols-8 gap-1 overflow-y-auto p-2.5">
        {filtered.map(([emoji]: [string, string]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={emoji}
            title={emoji}
            className="grid aspect-square min-w-0 place-items-center rounded-xl text-[1.45rem] leading-none transition-colors duration-150 hover:bg-white/[0.09] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <img
              src={`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${emojiAssetCode(emoji)}.svg`}
              alt={emoji}
              draggable={false}
              loading="lazy"
              className="h-[1.45rem] w-[1.45rem] object-contain"
            />
          </button>
        ))}
        {!filtered.length && <p className="col-span-8 py-4 text-center text-xs text-t-secondary">Ничего не найдено</p>}
      </div>
    </div>
  );
}