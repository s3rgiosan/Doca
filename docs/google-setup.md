> Developer setup for sync work that is not in Doca 1.0.0. The shipped extension does not use these credentials and has no sign-in or sync screen. You do not need this page to build, load or use Doca.

# Set up Google Drive sync

Doca will sync your workspaces through a hidden folder in your own Google Drive in a later release. To use sync, you create a free Google Cloud project and an OAuth client. You do this one time. Put the values in `.env.local` as `WXT_GOOGLE_CLIENT_ID` and `WXT_GOOGLE_CLIENT_SECRET`, as `.env.example` shows.

You need:

- A Google account.
- The Doca source code.

The project belongs to you. Doca gets access only to its own hidden folder in your Drive (the `drive.appdata` scope). It cannot read your other Drive files.

## Values to copy

Use these values in the steps below.

| Field | Value |
|---|---|
| App name | `Doca` |
| Scope | `https://www.googleapis.com/auth/drive.appdata` |
| Authorized redirect URI | `https://amgfiklccheliknilepbhfihobjniiim.chromiumapp.org/` |

The redirect URI comes from the Doca extension ID, `amgfiklccheliknilepbhfihobjniiim`. The ID is fixed by the `key` in `wxt.config.ts` and is the same in every Chromium-based browser.

## 1. Create the project

1. Open [Create a project](https://console.cloud.google.com/projectcreate).
2. In **Project name**, enter `Doca`.
3. Click **Create**.
4. Make sure that the project picker at the top of the console shows `Doca`. All the next steps apply to the project that the picker shows.

## 2. Enable the Google Drive API

1. Open [Enable the Google Drive API](https://console.cloud.google.com/apis/enableflow;apiid=drive.googleapis.com).
2. Click **Enable**.

## 3. Configure the consent screen

1. Open [Branding](https://console.developers.google.com/auth/branding).
2. If the page says "Google Auth platform not configured yet", click **Get Started**.
3. Under **App Information**:
   - In **App name**, enter `Doca`.
   - In **User support email**, select your email address.
   - Click **Next**.
4. Under **Audience**, select **External**. Click **Next**.
5. Under **Contact Information**, enter your email address. Click **Next**.
6. Under **Finish**, read the Google API Services User Data Policy. If you agree, select the check box. Click **Continue**.
7. Click **Create**.

If you use a Google Workspace account and select **Internal**, only accounts in your organization can sign in.

## 4. Add the Drive scope

1. Open [Data Access](https://console.developers.google.com/auth/scopes).
2. Click **Add or Remove Scopes**.
3. Select the scope `https://www.googleapis.com/auth/drive.appdata`. It is in the non-sensitive scopes section.
4. Click **Save**.

Google lists this scope as non-sensitive. Your app does not need Google verification.

## 5. Publish the app

1. Open [Audience](https://console.developers.google.com/auth/audience).
2. Click **Publish app**. If the console asks you to confirm, confirm.

Do not skip this step. If the app stays in Testing, Google stops your sign-in after 7 days and you must sign in again.

## 6. Create the OAuth client

1. Open [Clients](https://console.developers.google.com/auth/clients).
2. Click **Create Client**.
3. In **Application type**, select **Web application**.
4. In **Name**, enter `Doca`.
5. Under **Authorized redirect URIs**, click **Add URI**. Paste the redirect URI from [Values to copy](#values-to-copy).
6. Click **Create**.
7. Copy the **Client ID** and the **Client secret**.

The redirect URI must match exactly, including the `https://` and the `/` at the end.

## 7. Give the client to Doca

1. In the Doca folder, copy the environment file:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and paste your values:

   ```
   WXT_GOOGLE_CLIENT_ID=<your client ID>
   WXT_GOOGLE_CLIENT_SECRET=<your client secret>
   ```

No code of Doca 1.0.0 reads these values yet. The sync code in `lib/auth` and `lib/storage` takes the client settings as arguments.

Keep the client secret private. Do not commit `.env.local`, and do not share a build that you made with it.

To sync between two computers, use the same client ID and secret on both computers.

## Problems

| Error | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | The redirect URI in the client is not the same as the one Doca will send. | Compare the redirect URI in the client with the one in [Values to copy](#values-to-copy). Fix the scheme, the case and the `/` at the end. |
| `invalid_client` | The client ID or the client secret is wrong. | Copy both values again from [Clients](https://console.developers.google.com/auth/clients). Build Doca again and reload it. |
| `org_internal` | The audience is **Internal**, and your account is not in that organization. | In [Audience](https://console.developers.google.com/auth/audience), change the user type to **External**. |
| `access_denied` | You cancelled the sign-in, or you did not allow access. | Start the sign-in again and allow access. |
| `admin_policy_enforced` | Your Google Workspace administrator blocks the app. | Ask your administrator, or use a personal Google account. |
| Sign-in stops after 7 days | The app is still in Testing. | Do [step 5](#5-publish-the-app), then sign in again. |
