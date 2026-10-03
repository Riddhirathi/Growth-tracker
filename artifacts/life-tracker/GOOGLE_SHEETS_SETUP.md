# Connecting Personal Tracker to Google Sheets

Personal Tracker stores your data in the browser by default. Connecting Google Sheets adds a
private backup/sync target you own — no third-party server involved. This takes about
10 minutes, done once.

## 1. Create the Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it whatever you like (e.g. "Personal Tracker Data"). You don't need to create any tabs —
   the script creates `Tasks`, `Expenses`, `Foods`, `FoodDatabase`, `Weight`, and `Settings`
   tabs automatically on first use.
3. It also creates a `Summary <year>` tab per year you have expenses in (e.g. `Summary 2026`) —
   a read-only recap with one column per month and one row per category, regenerated from the
   `Expenses` tab on every sync. Edits made directly to a `Summary` tab are not read back by the
   app and will be overwritten on the next sync; log expenses through the app or the `Expenses`
   tab itself.

## 2. Add the script

1. In the Sheet, go to **Extensions > Apps Script**.
2. Delete the placeholder `Code.gs` contents and paste in the contents of
   [`google-apps-script/Code.gs`](./google-apps-script/Code.gs) from this repo.
3. Click the disk icon (or Ctrl/Cmd+S) to save. Give the project a name if prompted
   (e.g. "Personal Tracker Sync").

## 3. Set your secret token

1. Still in the Apps Script editor, click the gear icon **Project Settings** on the left.
2. Scroll to **Script Properties** and click **Add script property**.
3. Property name: `SYNC_TOKEN`
   Value: any long random string you make up (this is your password — treat it like one).
   A quick way to generate one: run `openssl rand -hex 24` in a terminal, or just mash
   the keyboard for 30+ characters.
4. Save.

## 4. Deploy as a Web App

1. Back in the editor, click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure:
   - **Execute as:** Me (your account)
   - **Who has access:** Anyone
     (This does *not* make your data public — every request still requires your
     `SYNC_TOKEN`. "Anyone" here just means Google won't force a Google-account login
     on the request, which the app can't do from a browser fetch anyway.)
4. Click **Deploy**. The first time, Google will ask you to authorize the script —
   approve it (you'll see an "unverified app" warning since it's your own script;
   click **Advanced > Go to [project name] (unsafe)** to proceed — this is expected
   for personal Apps Script projects).
5. Copy the **Web app URL** shown after deployment. It looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

## 5. Connect it in Personal Tracker

1. Open Personal Tracker, go to **Settings**.
2. Under **Google Sheets sync**, click **Connect**.
3. Paste the Web app URL and your `SYNC_TOKEN` value, then click **Test & connect**.
4. You'll be asked whether to import existing sheet data (if any) or push your current
   local data to the sheet. Pick whichever makes sense for a first-time connection —
   usually "push local data" if this is a fresh sheet.

Once connected, Personal Tracker pushes changes to the sheet automatically a couple of seconds
after you make them, and you can pull the latest data manually from Settings (useful if
you edited the sheet directly, or you're syncing from a second device/browser).

## Notes

- If you ever want to rotate your token, change the `SYNC_TOKEN` script property and
  redeploy (**Deploy > Manage deployments > Edit > New version**), then update it in
  Personal Tracker's Settings too.
- You can inspect or edit your data directly in the Sheet at any time — Personal Tracker will
  pick up manual edits next time you hit "Pull latest."
- Nothing about this setup makes your data public. The Web app URL is unguessable and
  every request is checked against your token; still, don't share the URL/token pair.
