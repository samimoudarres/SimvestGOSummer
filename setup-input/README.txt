DROP YOUR TWO FIREBASE DOWNLOADS HERE
=====================================

After you follow PUSH_SETUP_START_HERE.md, save files into THIS folder with these EXACT names:

1) google-services.json
   (from Firebase when you register the Android app)

2) firebase-service-account.json
   (from Firebase → Project settings → Service accounts → Generate new private key)

3) render-api-key.txt
   (one line only: your Render API key from dashboard.render.com → Account Settings → API Keys)

Then tell Cursor to run:
   node scripts/completePushSetup.mjs

Do not commit these files to GitHub (this folder is gitignored).
