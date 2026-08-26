# Farangis Bridge

Farangis Bridge is an iPhone-first personal assistant bridge built with Expo/React Native.

## Current version

1.2.0

## Works in the current Expo Go prototype

- Contacts access and birthday listing
- Contact search with phone/email/birthday
- Open the Phone dialer for a contact
- Open the Messages composer for a contact
- Photo/video library count and recent-media inspection
- Current location and open current location in Apple Maps
- Apple Maps search
- Clipboard read/write
- Camera and microphone permission tests
- SecureStore read/write helpers
- Persian text-to-speech responses
- Google search and URL opening
- Native Share sheet
- Calendar event creation UI
- Local notification reminders
- Persian/English local command router

## Example commands

- `چه کسایی تاریخ تولد دارن؟`
- `چندتا مخاطب دارم؟`
- `شماره مستانه`
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
- `ذخیره امن کد: 1234`
- `حافظه امن کد`

## Current architecture

`User command -> local intent router -> device tool -> result -> optional Persian speech`

The local router intentionally works without placing an AI API secret in the public client app.

## Important iOS / Expo Go limits

Expo Go is a prototype environment. It does not provide unrestricted access to iMessage/SMS history, system call history, or a permanent third-party wake word. True custom speech recognition, App Intents, deeper background execution, and a dedicated `Hey Farangis` native experience require a development/native build and remain subject to iOS permissions and platform restrictions.

Sensitive destructive actions should always require explicit confirmation in a future native agent layer.
