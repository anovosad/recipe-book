import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { en } from './en';
import { cs } from './cs';

export const LANGUAGES = {
  en: { label: 'English', flag: '🇬🇧' },
  cs: { label: 'Čeština', flag: '🇨🇿' }
} as const;

export type Language = keyof typeof LANGUAGES;

/**
 * A phrase whose wording depends on a count. The keys are the categories
 * Intl.PluralRules produces, which is why this is not a naive singular/plural
 * pair: English needs two forms, Czech needs four - 1 recept, 2 recepty,
 * 5 receptů, 1,5 receptu - and hand-rolling that goes wrong immediately.
 */
export interface PluralForms {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

export type Phrase = string | PluralForms;

/** English is the source of truth: every other dictionary must match it. */
export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, Phrase>;

const dictionaries: Record<Language, Dictionary> = { en, cs };

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0];
    if (base in LANGUAGES) return base as Language;
    // Slovak readers are far better served by Czech than by English.
    if (base === 'sk') return 'cs';
  }
  return 'en';
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      setLanguage: (language: Language) => set({ language })
    }),
    {
      name: 'recipe-book-language',
      storage: createJSONStorage(() => localStorage)
    }
  )
);

const pluralRules = new Map<Language, Intl.PluralRules>();

function selectForm(phrase: Phrase, language: Language, count?: number): string {
  if (typeof phrase === 'string') return phrase;
  if (count === undefined) return phrase.other;

  let rules = pluralRules.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }

  const category = rules.select(count) as keyof PluralForms;
  return phrase[category] ?? phrase.other;
}

export type TranslateValues = Record<string, string | number>;

export function translate(
  language: Language,
  key: TranslationKey,
  values?: TranslateValues
): string {
  // Falling back to English rather than to the key itself: a half-finished
  // translation should read as a mixed page, not as "recipes.empty.title".
  // dictionaries[language] can be undefined: the choice is persisted in
  // localStorage, so a value from an older or newer build survives a downgrade
  // and used to take the whole app down on the first string it rendered.
  const phrase = (dictionaries[language] ?? en)[key] ?? en[key];
  if (phrase === undefined) return key;

  let text = selectForm(phrase, language, values?.count as number | undefined);

  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/**
 * The one hook components use. `t` is bound to the current language, so a
 * component only ever asks for a key.
 */
export function useTranslation() {
  const language = useLanguageStore(state => state.language);
  const setLanguage = useLanguageStore(state => state.setLanguage);

  const t = (key: TranslationKey, values?: TranslateValues) =>
    translate(language, key, values);

  return { t, language, setLanguage };
}

/** For the few places that format outside a component. */
export const currentLanguage = () => useLanguageStore.getState().language;

/**
 * Durations and dates, bound to the current language.
 *
 * A hook rather than a plain function so a component re-renders these when the
 * language changes - utils.formatTime used to build the English words itself,
 * and toLocaleDateString was pinned to 'en-US'.
 */
export function useFormatters() {
  const { t, language } = useTranslation();

  const formatDuration = (minutes: number): string => {
    if (!minutes || minutes <= 0) return t('common.notSpecified');

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours === 0) return t('time.minutes', { count: rest });
    if (rest === 0) return t('time.hours', { count: hours });

    return t('time.hoursMinutes', {
      hours: t('time.hours', { count: hours }),
      minutes: t('time.minutes', { count: rest })
    });
  };

  const formatDate = (value: string): string =>
    new Date(value).toLocaleDateString(language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

  /**
   * "4 osoby" rather than "4 people". The unit is stored as a code, and an
   * unknown one - anything written before this list existed - is printed as it
   * comes rather than swallowed.
   */
  const formatServings = (count: number, unit: string): string => {
    const key = `unit.${unit}` as TranslationKey;
    if (key in en) return t(key, { count });
    return `${count} ${unit}`;
  };

  return { formatDuration, formatDate, formatServings };
}
