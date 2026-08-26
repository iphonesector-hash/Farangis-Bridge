# Farangis Bridge

Farangis Bridge is an iPhone-first personal assistant bridge built with Expo/React Native.

## Current version

1.5.0

## What works now

- Natural Persian AI Router with persistent local conversation memory
- Live device context such as iPhone model and iOS version
- Live Internet Agent using Groq Compound web search for current prices, weather, news and other fresh public information
- Contacts access, birthday listing, contact search, phone dialer and Messages composer
- Photo/video library count and recent-media inspection
- Current location and Apple Maps actions
- Clipboard read/write
- Files document picker
- Read selected text files locally (up to the current safety/size limit)
- Search text inside the currently selected file
- Open/share the selected file through the iOS share sheet
- Known-app launcher through supported URL schemes
- Shortcuts URL bridge for running user-created Apple Shortcuts
- Open Apple Notes when its URL scheme is available
- Camera and microphone permission tests
- SecureStore memory/settings
- Persian text-to-speech
- Google search and URL opening
- Calendar event creation UI
- Local notification reminders

## Internet Agent

Questions that need live information are routed to `groq/compound`, which can use Groq's built-in web search/website tools. Example:

- `قیمت دلار امروز چنده؟`
- `آخرین خبرهای اپل چیه؟`
- `هوا امروز چطوره؟`

The Groq API key is stored only in iPhone Secure Store and is not committed to this repository.

## Files

iOS does not let third-party apps silently crawl the entire Files/iCloud Drive tree. Farangis therefore opens Apple's system document picker. After the user selects a file, Farangis can read/search supported text content and open/share that selected file.

## Apps and Notes

iOS does not expose a public API containing the full list of installed apps. Farangis can still open known applications that expose URL schemes.

Apple Notes does not provide a public API for arbitrary full-database search by a third-party app. Farangis can open Notes and includes a bridge to Apple Shortcuts so richer Notes workflows can be added through user-created shortcuts.

## Example commands

- `قیمت دلار امروز چنده؟`
- `فایل‌هام رو باز کن`
- `فایل انتخاب‌شده رو بخون`
- `داخل فایل انتخاب‌شده محمد رو پیدا کن`
- `برنامه تلگرام رو باز کن`
- `شورتکات My Shortcut رو اجرا کن`
- `چه کسایی تاریخ تولد دارن؟`
- `شماره مستانه رو پیدا کن`
- `لوکیشن فعلیم رو روی نقشه باز کن`

## Important iOS limits

Even a native iOS build cannot obtain unrestricted access to everything on the phone. In particular, Apple does not expose unrestricted APIs for the complete installed-app list, arbitrary Apple Notes database access, iMessage/SMS history, system call history, or a permanent third-party wake word. Native/App Intents/Shortcuts integrations can expand the bridge substantially while still respecting those platform boundaries.
