import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import deTranslation from "./locales/de/translation.json"
import enTranslation from "./locales/en/translation.json"
import esTranslation from "./locales/es/translation.json"
import ruTranslation from "./locales/ru/translation.json"
import taTranslation from "./locales/ta/translation.json"
import zhCNTranslation from "./locales/zh-CN/translation.json"
import zhTWTranslation from "./locales/zh-TW/translation.json"

const resources = {
  "en-US": {
    translation: enTranslation,
  },
  "zh-CN": {
    translation: zhCNTranslation,
  },
  "zh-TW": {
    translation: zhTWTranslation,
  },
  "de-DE": {
    translation: deTranslation,
  },
  "es-ES": {
    translation: esTranslation,
  },
  "ru-RU": {
    translation: ruTranslation,
  },
  "ta-IN": {
    translation: taTranslation,
  },
}

const getStoredLanguage = () => {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("language")
    if (saved && saved in resources) return saved
  }
  return "zh-CN"
}

i18n.use(initReactI18next).init({
  resources,
  lng: getStoredLanguage(),
  fallbackLng: "en-US",
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
