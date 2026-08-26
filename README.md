# Farangis Bridge

Farangis Bridge is a personal iPhone bridge built with Expo/React Native. The current prototype runs in Expo Go and exposes device capabilities to a local command router.

## Working now in Expo Go

- Contacts permission and contact count
- List contacts with saved birthdays
- Find a contact by name and show phone/email/birthday
- Photo/video library count
- Foreground location
- Camera permission
- Microphone permission
- Clipboard reading
- Secure Store test
- Persian text command box
- Local Tool Router for common Persian commands
- Google search/open URL action
- Persian text-to-speech responses with an on/off toggle

## Example commands

- `چه کسایی تاریخ تولد دارن؟`
- `چندتا مخاطب دارم؟`
- `شماره مستانه`
- `لوکیشن فعلیم رو بگو`
- `کلیپ بورد رو بخون`
- `چندتا عکس و ویدیو دارم؟`
- `ستاره های سربی آبی رو تو گوگل سرچ کن`

## Current architecture

`User command -> local intent router -> device tool -> result -> optional Persian speech`

The local router is intentional: it lets the bridge work without putting an AI API key in a public client app.

## Next native phase

Some iOS capabilities cannot be implemented fully inside Expo Go. The next Development Build / Native Bridge phase should add:

- Speech-to-text / conversational voice input
- App Intents and Shortcuts
- Vocal Shortcut / wake phrase integration such as “Hey Farangis”
- Calendar and Reminders native access
- Background-capable native services where iOS permits them
- Share Sheet extension
- Notifications
- A secure backend AI agent and tool-calling API

## Security rule

Never hard-code AI, Google, GitHub, Supabase, or other private API secrets in this repository or the mobile bundle. Secrets should live on a backend and the app should authenticate to that backend.
