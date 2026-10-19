import { useMemo, useState } from 'react';
import { Search, Smile, X } from 'lucide-react';

const CATEGORIES = [
  { id: 'smileys', name: 'Смайлы', emojis: [['😀', 'улыбка smile'], ['😄', 'радость happy'], ['😂', 'смех joy'], ['🤣', 'ржака laugh'], ['😊', 'милый blush'], ['😍', 'любовь love heart eyes'], ['😘', 'поцелуй kiss'], ['🥰', 'нежность'], ['😎', 'крутой cool'], ['🤔', 'думаю think'], ['🙃', 'перевернутый upside'], ['😉', 'подмигивание wink'], ['😭', 'плачу cry'], ['😢', 'грустно sad'], ['🤯', 'взрыв mind blown'], ['🥳', 'праздник party'], ['😴', 'сплю sleep'], ['🤗', 'обнимаю hug']] },
  { id: 'gestures', name: 'Жесты', emojis: [['👍', 'лайк like ok'], ['👎', 'дизлайк'], ['👌', 'окей okay'], ['✌️', 'победа victory'], ['🤞', 'скрещиваю fingers crossed'], ['👏', 'аплодисменты clap'], ['🙌', 'ура raising hands'], ['👋', 'привет hello wave'], ['🤝', 'рукопожатие deal handshake'], ['💪', 'сила strong'], ['🫶', 'сердце руки heart hands'], ['🖐️', 'ладонь five'], ['☝️', 'указатель'], ['👆', 'вверх up'], ['🤙', 'круто shaka'], ['✊', 'кулак fist']] },
  { id: 'animals', name: 'Животные', emojis: [['🐱', 'кот cat'], ['🐶', 'собака dog'], ['🐻', 'медведь bear'], ['🦊', 'лиса fox'], ['🐼', 'панда panda'], ['🐨', 'коала koala'], ['🦁', 'лев lion'], ['🐯', 'тигр tiger'], ['🐸', 'лягушка frog'], ['🐵', 'обезьяна monkey'], ['🦄', 'единорог unicorn'], ['🐝', 'пчела bee'], ['🦋', 'бабочка butterfly'], ['🐢', 'черепаха turtle'], ['🐙', 'осьминог octopus'], ['🦉', 'сова owl']] },
  { id: 'food', name: 'Еда', emojis: [['🍕', 'пицца pizza'], ['🍔', 'бургер burger'], ['🍟', 'фри fries'], ['🌮', 'тако taco'], ['🍣', 'суши sushi'], ['🍦', 'мороженое ice cream'], ['🎂', 'торт cake'], ['🍰', 'пирожное'], ['☕', 'кофе coffee'], ['🍺', 'пиво beer'], ['🍷', 'вино wine'], ['🍎', 'яблоко apple'], ['🍉', 'арбуз watermelon'], ['🍇', 'виноград grapes'], ['🥑', 'авокадо avocado'], ['🌶️', 'перец chili']] },
  { id: 'activity', name: 'Спорт и активность', emojis: [['⚽', 'футбол football'], ['🏀', 'баскетбол basketball'], ['🏈', 'американский футбол'], ['⚾', 'бейсбол'], ['🎾', 'теннис tennis'], ['🏐', 'волейбол'], ['🏓', 'пингпонг'], ['🏸', 'бадминтон'], ['🥊', 'бокс'], ['🏋️', 'качалка gym'], ['🎮', 'геймер games'], ['🎲', 'кости dice'], ['🎯', 'мишень target'], ['🎱', 'бильярд'], ['🏆', 'кубок trophy'], ['🎪', 'цирк circus']] },
  { id: 'symbols', name: 'Символы', emojis: [['❤️', 'сердце love red heart'], ['💙', 'синее сердце blue'], ['💚', 'зеленое сердце green'], ['💛', 'желтое сердце yellow'], ['💜', 'фиолетовое сердце purple'], ['🔥', 'огонь fire hot'], ['✨', 'блеск sparkles'], ['🎉', 'праздник tada party'], ['🎊', 'конфетти confetti'], ['💯', '100 сто hundred'], ['✅', 'галочка check done'], ['⭐', 'звезда star'], ['🌙', 'луна moon'], ['☀️', 'солнце sun'], ['🌈', 'радуга rainbow'], ['💤', 'сплю zzz'], ['⚡', 'молния zap'], ['🆒', 'круто cool']] },
] as const;

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('smileys');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES.find((c) => c.id === category)?.emojis ?? [];
    return CATEGORIES.flatMap((c) => c.emojis).filter(([, tags]) => tags.toLowerCase().includes(q));
  }, [query, category]);

  return (
    <div className="glass-panel w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl shadow-2xl animate-scale-in" data-emoji-picker>
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
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
        <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-2 py-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] transition-all duration-200 ${category === c.id ? 'bg-accent/20 text-accent' : 'text-t-secondary hover:bg-white/5'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="custom-scrollbar grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {filtered.map(([emoji]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="grid h-9 place-items-center rounded-lg text-xl transition-all duration-200 hover:scale-125 hover:bg-white/5 active:scale-95"
          >
            {emoji}
          </button>
        ))}
        {!filtered.length && <p className="col-span-8 py-4 text-center text-xs text-t-secondary">Ничего не найдено</p>}
      </div>
    </div>
  );
}
