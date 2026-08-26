# Farangis Bridge

Farangis Bridge is an iPhone-first personal assistant bridge built with Expo/React Native.

## Current version

1.3.0

## What works now

- Contacts access and birthday listing
- Contact search with phone/email/birthday
- Open the Phone dialer for a contact
- Open the Messages composer for a contact
- Photo/video library count and recent-media inspection
- Current location and Apple Maps actions
- Clipboard read/write
- Camera and microphone permission tests
- SecureStore read/write helpers
- Persian text-to-speech responses
- Google search and URL opening
- Native Share sheet
- Calendar event creation UI
- Local notification reminders
- Fast local Persian command router
- AI fallback router for natural/unregistered commands
- OpenAI-compatible AI provider settings stored only in iPhone Secure Store

## AI Router

The app first tries the local router for common commands. If the sentence is not recognized, it can ask an AI model to choose one of the device tools.

AI credentials are **not** stored in this public repository. Enter the API key once inside the `AI Router` section of the app. The key is stored with `expo-secure-store` on the device.

Default provider settings are compatible with Groq:

- URL: `https://api.groq.com/openai/v1/chat/completions`
- Model: `llama-3.3-70b-versatile`

Any OpenAI-compatible Chat Completions endpoint can be used by changing URL/model in the app.

The AI receives the user's command for intent planning. Device data such as contacts and current location are fetched by the selected tool on the phone rather than being embedded in the prompt.

## Example commands

- `چه کسایی تاریخ تولد دارن؟`
- `شماره مستانه رو پیدا کن`
- `زنگ بزن به مستانه`
- `پیام بده به مستانه`
- `لوکیشن فعلیم رو روی نقشه باز کن`
- `نقشه برج میلاد`
- `کلیپ بورد رو بخون`
- `کپی کن سلام دنیا`
- `چندتا عکس و ویدیو دارم؟`
- `یادآوری 10 دقیقه دیگه آب بخورم`
- `تقویم جلسه با علی`
- `ستاره های سربی آبی رو تو گوگل سرچ کن`

With AI Router enabled, colloquial variations of these commands no longer need to match a hard-coded phrase.

## Architecture

`User command -> fast local router -> AI intent planner (fallback) -> device tool -> result -> optional Persian speech`

## Important iOS / Expo Go limits

Expo Go does not provide unrestricted access to iMessage/SMS history, system call history, or a permanent third-party wake word. A true custom `Hey Farangis` wake experience, App Intents, custom speech-recognition integration, and deeper background execution require a Development/Native Build and remain subject to Apple's platform restrictions.

Destructive or irreversible actions should always require explicit confirmation.
