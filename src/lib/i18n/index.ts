import { getLocales } from 'expo-localization';
import * as Updates from 'expo-updates';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import en from './en.json';
import he from './he.json';

export type Language = 'he' | 'en';

const deviceLanguage: Language = getLocales()[0]?.languageCode === 'en' ? 'en' : 'he';

i18n.use(initReactI18next).init({
  resources: { he: { translation: he }, en: { translation: en } },
  lng: deviceLanguage,
  fallbackLng: 'he',
  interpolation: { escapeValue: false },
});

I18nManager.allowRTL(true);

/**
 * Switch to the apartment's language (spec §3: each apartment chooses he/en).
 * React Native only applies an RTL/LTR change after a reload, so we reload when the direction flips.
 */
export async function applyLanguage(language: Language) {
  await i18n.changeLanguage(language);
  const rtl = language === 'he';
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    await Updates.reloadAsync();
  }
}

export default i18n;
